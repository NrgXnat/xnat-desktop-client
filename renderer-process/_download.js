const fs = require('fs');
const fx = require('mkdir-recursive');
const path = require('path');
const axios = require('axios');
require('promise.prototype.finally').shim();
const httpAdapter = require('axios/lib/adapters/http');
const https = require('https');

const electron = require('electron')
const settings = require('electron-settings');
const ipc = electron.ipcRenderer;

const remote = electron.remote;
const auth = require('../services/auth');

const sha1 = require('sha1');
const unzipper = require('unzipper');
const shell = electron.shell;

const filesize = require('filesize');

const tempDir = require('temp-dir');

const isOnline = require('is-online');

const electron_log = require('electron-log');
const prettyBytes = require('pretty-bytes');
const humanizeDuration = require('humanize-duration')

const appMetaData = require('../package.json');

electron.crashReporter.start({
    companyName: appMetaData.author,
    productName: appMetaData.name,
    productVersion: appMetaData.version,
    submitURL: appMetaData.extraMetadata.submitUrl,
    uploadToServer: true
});

if (!settings.has('global_pause')) {
    settings.set('global_pause', false);
}

// always set to false when initializing the page
settings.set('transfering_download', false);


function get_jsession_cookie(xnat_url) {
	return new Promise((resolve, reject) => {
		let slash_url = xnat_url + '/';
		
		let jsession = {
			id: null,
			expiration: null
		}
		
		// Query cookies associated with a specific url.
		remote.session.defaultSession.cookies.get({url: slash_url}, (error, cookies) => {
			if (cookies.length) {
				cookies.forEach(item => {
					if (item.name === 'JSESSIONID') {
						jsession.id = item.value
					}

					if (item.name === 'SESSION_EXPIRATION_TIME') {
						jsession.expiration = item.value;
					}
				});
				
				if (jsession.id && jsession.expiration) {
					resolve(`JSESSIONID=${jsession.id}; SESSION_EXPIRATION_TIME=${jsession.expiration};`);
				} else {
					reject(xnat_url + ' [No JSESSIONID Cookie]')
				}
				
			} else {
				reject(xnat_url + ' [No Cookies]')
			}
			
		})
	});
}


console_log(__filename);

function console_log(...log_this) {
    electron_log.info(...log_this);
    //console.log(...log_this);
    //console.trace('<<<<== DOWNLOAD TRACE ==>>>>');
    //ipc.send('log', ...log_this);
}

ipc.on('start_download',function(e, item){
    do_transfer();
});

do_transfer();

setInterval(do_transfer, 10000);

// setInterval(function() {
//     console_log('transfering_download ===> ', new Date().toLocaleString(), settings.get('transfering_download'));
// }, 1000);

function do_transfer() {
    start_transfer();

    return;

    isOnline().then(online => {
        //=> onlineStatus = false
        if (online) {
            start_transfer();
        } else {
            return;
        }
    });
}

function start_transfer() {
    console_log('transfering_state :: ', settings.get('transfering_download'))
    if (settings.get('transfering_download')) {
        //console_log('Download in progress. Aborting download reinit.')
        return;
    } else {
        //console_log('transfering_ NOT TRANSFERING ... INITIALIZING');
    }
    

    let my_transfers = store.get('transfers.downloads');
    
    let current_xnat_server = settings.get('xnat_server');
    let current_username = auth.get_current_user();

    let user_auth = auth.get_user_auth();
    let manifest_urls;

    my_transfers.forEach(function(transfer) {
        // validate current user/server
        if (transfer.server === current_xnat_server 
            && transfer.user === current_username
            && transfer.canceled !== true
        ) {
            manifest_urls = new Map();
    
            transfer.sessions.forEach(function(session){
                session.files.forEach(function(file){
                    if (file.status === 0) {
                        manifest_urls.set(file.name, file.uri)
                    }
                });
            });
    
            //console_log('manifest_urls.size ==> ' + manifest_urls.size);
    
            if (manifest_urls.size) {
                try {
                    // start download
                    download_items(transfer.server, user_auth, transfer, manifest_urls, true);
                } catch(err) {
                    //console_log(err.message)
                    ipc.send('custom_error', 'Download Error', err.message);
                }
            }
            
        }
        
    });

}

function download_items(xnat_server, user_auth, transfer, manifest_urls, create_dir_structure = false) {
    settings.set('transfering_download', false);

    if (settings.get('global_pause')) return; 

    let transfer_id = transfer.id;

    let temp_zip_path = path.resolve(tempDir, '_xdc_temp');
    let real_path = path.resolve(transfer.destination, xnat_server.split('//')[1]);

    let transfer_info = get_transfer_info(transfer_id);

    // console_log('------ PROGRESS --------');
    // console_log(transfer_info);
    // console_log('//////// PROGRESS /////////');
    
    if (manifest_urls.size == 0) {
        let final_status = transfer_info.error_count ? 'complete_with_errors' : 'finished';

        // all done
        update_tranfer_data(transfer_id, {
            status: final_status
        });

        ipc.send('progress_cell', {
            table: '#download_monitor_table',
            id: transfer_id,
            field: "download_status",
            value: final_status
        });

        return;
    }

    settings.set('transfering_download', transfer_id);

    if (create_dir_structure) {
        fx.mkdirSync(temp_zip_path, function (err) {
            if (err) throw err;
            console_log('-- _xdc_temp created--');
        });
    }


    ipc.send('progress_cell', {
        table: '#download_monitor_table',
        id: transfer_id,
        field: "download_status",
        value: transfer_info.progress_percent
    });
    

    let dir = manifest_urls.keys().next().value;
    let uri = manifest_urls.get(dir);

    let timer_start = new Date() / 1000;
    let bytes_total = 0;
    let stream_timer;

    // fix multliple session creation with token login
    // let user_auth_fix = user_auth.username === auth.get_current_user() ? user_auth : undefined;    

    get_jsession_cookie(xnat_server).then(jsession_cookie => {
        let request_settings = {
            //auth: user_auth_fix,
            responseType: 'stream',
            adapter: httpAdapter,
            headers: {
                'Cookie': jsession_cookie
            }
        }
    
        if (auth.allow_insecure_ssl()) {
            // insecure SSL at request level
            request_settings.httpsAgent = new https.Agent({  
                rejectUnauthorized: false
            });
        }

        //console.log('********* request_settings *********')
        //console.log(request_settings);
    
        axios.get(xnat_server + uri, request_settings)
        .then(resp => {
            let zip_path = path.resolve(temp_zip_path, sha1(xnat_server + uri) + '__YYY__' + Math.random() + '.zip');
    
            let stream = resp.data;
            stream.on('data', (chunk /* chunk is an ArrayBuffer */) => {
                let bytes_chunk = chunk.byteLength;
    
                bytes_total += bytes_chunk;
    
                if (!stream_timer) {
                    stream_timer = setTimeout(function() {
                        console_log(prettyBytes(bytes_total));
    
                        let timer_now = new Date() / 1000;
                        let download_speed = bytes_total / (timer_now - timer_start);
        
                        ipc.send('download_progress', {
                            selector: `#download-details [data-id="${transfer_id}"] #download_rate`,
                            html: filesize(download_speed) + '/sec'
                        });
    
                        stream_timer = null;
                    }, 500);
                }
              
    
                fs.appendFileSync(zip_path, Buffer(chunk));
            });
    
            stream.on('end', () => {
                //console_log('stream on.end', bytes_total);
                let timer_now = new Date() / 1000;
                let total_time_ms = (timer_now - timer_start) * 1000;
    
                ipc.send('download_progress', {
                    selector: `#download-details [data-id="${transfer_id}"] #download_size`,
                    html: prettyBytes(bytes_total)
                });
    
                ipc.send('download_progress', {
                    selector: `#download-details [data-id="${transfer_id}"] #download_time`,
                    html: humanizeDuration(total_time_ms, { round: true })
                });
                
    
                fs.createReadStream(zip_path)
                    .pipe(unzipper.Parse())
                    .on('entry', function (entry) {
                        
                        if (entry.type === 'File') {
                            // file basename
                            let basename = path.basename(entry.path);
    
                            // extract path where file will end up
                            let extract_path = path.resolve(real_path, dir);
    
                            // create directory structure recursively
                            fx.mkdirSync(extract_path, function (err) {
                                if (err) throw err;
                            });
    
                            // write file to path
                            entry.pipe(fs.createWriteStream(path.resolve(extract_path, basename)));
                        } else {
                            entry.autodrain();
                        }
                    })
                    .on('finish', () => {
                        // TODO - files are sometimes locked ... make unlock explicit          
                        fs.unlink(zip_path, (err) => {
                            if (err) throw err;
                            console_log('----' + zip_path + ' was DELETED');
                        });
                    });
    
                // delete item from url map
                manifest_urls.delete(dir);
                mark_downloaded(transfer_id, uri);
    
                update_modal_ui(transfer_id, uri);
    
                download_items(xnat_server, user_auth, transfer, manifest_urls);
            });
    
    
        })
        .catch(err => {
            console_log(err.response, err)
    
            if (err.response && err.response.status === 404) {
                // =============================================
                // SOFT FAIL
                // =============================================
                // delete item from url map
                manifest_urls.delete(dir);
                mark_error_file(transfer_id, uri); // set file status (-1)
    
                update_modal_ui(transfer_id, uri);
    
                download_items(xnat_server, user_auth, transfer, manifest_urls);
                // =============================================
            } else {
                update_tranfer_data(transfer_id, {
                    status: 'xnat_error',
                    error: Helper.errorMessage(err)
                });
    
                ipc.send('progress_cell', {
                    table: '#download_monitor_table',
                    id: transfer_id,
                    field: "download_status",
                    value: "xnat_error"
                });
                
                settings.set('transfering_download', false);
            }
    
        })
        .finally(() => {      
            // console_log('TRANSFER_DONE :: ', xnat_server + uri);
        });
    }).catch(err => {
        console_log(err)
    });

    
}

function mark_downloaded(transfer_id, uri) {
    let my_transfers = store.get('transfers.downloads');

    // could be oprimized with for loop + continue
    my_transfers.forEach(function(transfer) {
        if (transfer.id === transfer_id) {
            transfer.sessions.forEach(function(session){
                session.files.forEach(function(file){
                    if (file.uri === uri) {
                        file.status = 1;
                    }
                });
            });
        }
    });

    store.set('transfers.downloads', my_transfers);
}

function get_transfer_info(transfer_id) {
    let my_transfers = store.get('transfers.downloads');

    let progress_counter = 0, success_files = 0, error_files = 0, file_counter = 0, progress = 0;

    let transfer_index = get_transfer_index(my_transfers, transfer_id);

    if (transfer_index !== undefined) {
        my_transfers[transfer_index].sessions.forEach(function(session){
            session.files.forEach(function(file){
                // if file.status not zero
                if (file.status) {
                    progress_counter++
                }

                if (file.status === 1) {
                    success_files++;
                } else if (file.status === -1) {
                    error_files++
                }
                
            });

            file_counter += session.files.length;
        });

        progress = file_counter > 0 ? progress_counter / file_counter * 100 : 100;
    }

    return {
        total_files: file_counter,
        success_count: success_files,
        error_count: error_files,
        progress_percent: progress
    }

}



function update_tranfer_data(transfer_id, data) {
    let my_transfers = store.get('transfers.downloads');

    let transfer_index = get_transfer_index(my_transfers, transfer_id);

    if (transfer_index !== undefined) {
        Object.keys(data).forEach(function(key,index) {
            // key: the name of the object key
            // index: the ordinal position of the key within the object 
            my_transfers[transfer_index][key] = data[key];
        });

        store.set('transfers.downloads', my_transfers);
    }
}

function get_transfer_index(my_transfers, transfer_id) {
    let transfer_index;

    for (let i = 0; i < my_transfers.length; i++) {
        if (my_transfers[i].id === transfer_id) {
            transfer_index = i;
            break;
        }
    }

    return transfer_index;
}

function get_transfer_and_session_index(my_transfers, transfer_id, uri) {
    let transfer_index, session_index, file_index;
    for (let i = 0; i < my_transfers.length; i++) {
        if (my_transfers[i].id === transfer_id) {
            transfer_index = i;

            for (let j = 0; j < my_transfers[i].sessions.length; j++) {
                for (let k = 0; k < my_transfers[i].sessions[j].files.length; k++) {
                    if (my_transfers[i].sessions[j].files[k].uri === uri) {
                        session_index = j;
                        file_index = k;
                        break;
                    }
                }

                if (session_index !== undefined) {
                    break;
                }
            }
        }

        if (transfer_index !== undefined) {
            break;
        }
    }

    return {
        transfer: transfer_index,
        session: session_index,
        file: file_index
    }
}

function mark_error_file(transfer_id, uri) {
    let my_transfers = store.get('transfers.downloads');

    let index = get_transfer_and_session_index(my_transfers, transfer_id, uri);

    my_transfers[index.transfer].sessions[index.session].files[index.file].status = -1;
    my_transfers[index.transfer].sessions[index.session].files[index.file].error = 'Error Message';

    store.set('transfers.downloads', my_transfers);
}

function update_modal_ui(transfer_id, uri) {
    let my_transfers = store.get('transfers.downloads');

    let index = get_transfer_and_session_index(my_transfers, transfer_id, uri);

    let current_progress = 0;
    my_transfers[index.transfer].sessions[index.session].files.forEach(function(file){
        let increment = file.status === 0 ? 0 : 1;
        current_progress += increment;
    });

    let session_id = my_transfers[index.transfer].sessions[index.session].id;

    ipc.send('progress_cell', {
        table: '#download-details-table',
        id: session_id,
        field: "progress",
        value: current_progress
    });

}

function move_to_archive(transfer_id) {
    let my_transfers = store.get('transfers.downloads');

    if (!store.has('transfers.downloads_archive')) {
        store.set('transfers.downloads_archive', []);
    }
    let my_archive = store.get('transfers.downloads_archive');

    let index;
    for (let i = 0; i < my_transfers.length; i++) {
        if (my_transfers[i].id === transfer_id) {
            index = i;
            break;
        }
    }

    my_archive.push(my_transfers[index]);
    my_transfers.splice(index, 1);

    
    store.set('transfers.downloads_archive', my_archive);
    store.set('transfers.downloads', my_transfers);
}

window.onerror = function (errorMsg, url, lineNumber) {
    console_log(__filename + ':: ' +  errorMsg);
    return false;
}