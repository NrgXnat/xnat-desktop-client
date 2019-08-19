const fs = require('fs');
const fx = require('mkdir-recursive');
const path = require('path');
const axios = require('axios');
require('promise.prototype.finally').shim();
const httpAdapter = require('axios/lib/adapters/http');
const https = require('https');

const settings = require('electron-settings');
const ipc = require('electron').ipcRenderer;

const remote = require('electron').remote;
const auth = require('../services/auth');

const sha1 = require('sha1');
const unzipper = require('unzipper');
const shell = require('electron').shell;

const filesize = require('filesize');

const tempDir = require('temp-dir');

const isOnline = require('is-online');

const electron_log = remote.require('./services/electron_log');

const prettyBytes = require('pretty-bytes');
const humanizeDuration = require('humanize-duration');

const { console_red } = require('../services/logger');

const db_downloads = remote.require('./services/db/downloads');

let userAgentString = remote.getCurrentWindow().webContents.getUserAgent()


if (!settings.has('global_pause')) {
    settings.set('global_pause', false);
}

// always set to false when initializing the page
settings.set('transfering_download', false);

/**
 * // array
 * cancel_tokens = [
 *      {
 *          transfer_id: ... , // int
 *          uri: ... , // string
 *          cancel: ... // function
 *      },
 *      
 *      ...
 * ]
 */
let cancel_tokens = [];

const remove_cancel_token = (transfer_id, uri = false) => {
    //console_red('remove_cancel_token::BEFORE', {cancel_tokens})
    cancel_tokens = cancel_tokens.filter(ct => {
        if (uri === false) {
            return ct.transfer_id !== transfer_id
        } else {
            return ct.transfer_id !== transfer_id || ct.uri !== uri
        }
    });

    //console_red('remove_cancel_token::AFTER', {cancel_tokens})
}

const execute_cancel_token = (transfer_id) => {
    console_red('execute_cancel_token', {transfer_id, cancel_tokens})

    cancel_tokens = cancel_tokens.filter(ct => {
        // execute cancel token if it matches transfer_id
        if (ct.transfer_id === transfer_id) {
            console_red('execute_cancel_token', transfer_id)
            ct.cancel('Operation canceled by the user - CANCEL TOKEN.');
        }

        // and remove it
        return ct.transfer_id !== transfer_id
    });

}



console_log(__filename);

function console_log(...log_this) {
    electron_log.info(...log_this);
    console.log(...log_this);
    //console.trace('<<<<== DOWNLOAD TRACE ==>>>>');
    //ipc.send('log', ...log_this);
}

ipc.on('start_download',function(e, item){
    do_transfer();
});

ipc.on('cancel_download',function(e, transfer_id){
    console.log(transfer_id);
    execute_cancel_token(transfer_id)
});

do_transfer();

setInterval(do_transfer, 10000);

for(let i = 0; i < 100000000000; i++) {
    // do nothing
    if (i % 1000000 == 0) {
        console.log(i / 1000000)
    }
}

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
    
    let current_xnat_server = settings.get('xnat_server');
    let current_username = auth.get_current_user();

    let user_auth = auth.get_user_auth();
    let manifest_urls;


    db_downloads.listAll((err, my_transfers) => {
        let transfer = my_transfers.find(transfer => 
            transfer.server === current_xnat_server && 
            transfer.user === current_username &&
            transfer.canceled !== true &&
            transfer.sessions.find(session => 
                session.files.find(file => 
                    file.status === 0))
        )

        if (transfer) {
            manifest_urls = new Map();
        
            transfer.sessions.forEach((session) => {
                session.files.forEach((file) => {
                    if (file.status === 0) {
                        manifest_urls.set(file.name, file.uri)
                    }
                });
            });
    
            //console_log('manifest_urls.size ==> ' + manifest_urls.size);
    
            if (manifest_urls.size) {
                try {
                    // start download
                    download_items(transfer, manifest_urls, true);
                } catch(err) {
                    //console_log(err.message)
                    electron_log.error('Download Error', err);
                    ipc.send('custom_error', 'Download Error', err.message);
                }
            }
        }

    });

}

async function download_items(transfer, manifest_urls, create_dir_structure = false) {
    settings.set('transfering_download', false);

    if (settings.get('global_pause')) return; 

    let xnat_server = transfer.server;
    let user_auth = auth.get_user_auth();

    let transfer_id = transfer.id;
    let transfer_info = await get_transfer_info(transfer_id);

    // console_log('------ PROGRESS --------');
    // console_log(transfer_info);
    // console_log('//////// PROGRESS /////////');
    
    if (manifest_urls.size == 0) {
        let final_status = transfer_info.error_count ? 'complete_with_errors' : 'finished';

        //all done
        let updated_transfer = await update_tranfer_data(transfer_id, {
            status: final_status
        });


        // let transfer_by_id = await db_downloads._getById(transfer_id)

        ipc.send('progress_cell', {
            table: '#download_monitor_table',
            id: transfer_id,
            field: "download_status",
            value: final_status
        });

        return;
    }

    settings.set('transfering_download', transfer_id);

    let temp_zip_path = path.resolve(tempDir, '_xdc_temp');
    let real_path = path.resolve(transfer.destination, xnat_server.split('//')[1]);

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
    let user_auth_fix = user_auth.username === auth.get_current_user() ? user_auth : undefined;    

    let jsession_cookie = await auth.get_jsession_cookie(xnat_server)

    
    let CancelToken = axios.CancelToken;

    // todo - test if we need user auth here
    let request_settings = {
        auth: user_auth_fix,
        responseType: 'stream',
        adapter: httpAdapter,
        headers: {
            'Cookie': jsession_cookie,
            'User-Agent': userAgentString
        },
        cancelToken: new CancelToken(function executor(c) {
            // An executor function receives a cancel function as a parameter
            //cancelCurrentUpload = c;

            cancel_tokens.push({
                transfer_id: transfer_id,
                uri: uri,
                cancel: c
            })
        })
    }

    let https_agent_options = { keepAlive: true };
    if (auth.allow_insecure_ssl()) {
        https_agent_options.rejectUnauthorized = false // insecure SSL at request level
    }
    request_settings.httpsAgent = new https.Agent(https_agent_options);

    /*
    if (auth.allow_insecure_ssl()) {
        // insecure SSL at request level
        request_settings.httpsAgent = new https.Agent({
            rejectUnauthorized: false
        });
    }
    */

    //console.log('********* request_settings *********')
    //console.log(request_settings);

    axios.get(xnat_server + uri, request_settings)
    .then(resp => {
        let zip_path = path.resolve(temp_zip_path, sha1(xnat_server + uri) + '__YYY__' + Math.random() + '.zip');
        // let clean_uri = uri.split('?');
        // let uri_str = clean_uri[0].replace(/\//g, '_');
        // let zip_path = path.resolve(temp_zip_path, uri_str +  '__YYY__' + Math.random() + '.zip');


        let stream = resp.data;
        stream.on('data', (chunk) => {  // chunk is an ArrayBuffer
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

            try {
                fs.appendFileSync(zip_path, Buffer(chunk));
            } catch (err) {
                console_red(`${zip_path} - appended to file!`, {err});
            }
            
        });

        stream.on('end', () => {
            remove_cancel_token(transfer_id, uri);

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

            let skip_finish = false;
            let unzip_promise = new Promise((resolve, reject) => {
                console.log({zip_path});
                fs.createReadStream(zip_path)
                .pipe(unzipper.Parse())
                .on('entry', function (entry) {
                    if (entry.type === 'File') {
                        // file basename
                        let basename = path.basename(entry.path);

                        //console_red(basename, entry)

                        // get directory substructure
                        let entry_dirname = path.dirname(entry.path);
                        let dir_substructure = '';
                        if (entry_dirname.match(/\/files\//)) {
                            let dir_parts = entry_dirname.split('/files/');
                            dir_substructure = dir_parts[dir_parts.length - 1]
                        }

                        // extract path where file will end up
                        let extract_path = path.join(real_path, dir, dir_substructure);

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
                .on('error', (err) => {
                    skip_finish = true;
                    console_red('unzipper error', {err});

                    fs.unlink(zip_path, (unlink_err) => {
                        // if (err) throw err;
                        console_log('----' + zip_path + ' was DELETED');

                        reject(err)
                    });

                    //reject()
                })
                .on('finish', () => {
                    if (!skip_finish) {
                        fs.unlink(zip_path, (err) => {
                            // if (err) throw err;
                            console_log('++++' + zip_path + ' was DELETED');
    
                            resolve()
                        });
                    } else {
                        console_red('skipped finish', 'OK')
                    }
                    
                    //resolve()
                });
            });

            unzip_promise.then(() => {
                //console_red('after unzip_promise', {transfer});

                // delete item from url map
                manifest_urls.delete(dir);

                return mark_downloaded(transfer_id, uri)
            })
            .then(updated_tranfer => {
                //console_red('after mark_downloaded', {updated_tranfer});

                return update_modal_ui(transfer_id, uri);
            })
            .then(() => {
                // check to see if the transfer is canceled in the meantime
                db_downloads._getById(transfer_id)
                .then(transfer => {
                    if (transfer) {
                        if (!transfer.canceled || manifest_urls.size == 0) {
                            console_red('TRANSFER NOT CANCELED', 'Continuing with download_items...')
                            download_items(transfer, manifest_urls)  
                        } else {
                            console_red('DOWNLOAD CANCELED IN THE MEANTIME', transfer)
                            settings.set('transfering_download', false);
                        }
                    } else {
                        throw new Error(`mark_downloaded: No transfer with id: ${transfer_id}`)
                    }
                })
                .catch(err => {
                    console_red('IMMEDIATE ERROR', {err})
                    throw err;
                })
            })
            .catch(err => {
                console_red('unzip_promise FAIL', err)
                settings.set('transfering_download', false);
            })
            
        });

        stream.on('error', (err) => {
            console_log(err);
            console_red('STREAM ERROR', err);
        })

    })
    .catch(err => {
        console_red('AXIOS CATCH ERROR', err)

        remove_cancel_token(transfer_id, uri);

        if (axios.isCancel(err)) {
            settings.set('transfering_download', false);
            console_red('Request canceled', {err});
            electron_log.error('Download error:', xnat_server + uri, JSON.stringify(err));
        } else {
            electron_log.error('Download error:', xnat_server + uri, Helper.errorMessage(err));
    
            if (err.response && err.response.status === 404) {
                // =============================================
                // SOFT FAIL
                // =============================================
                // delete item from url map
                manifest_urls.delete(dir);
    
                mark_error_file(transfer_id, uri, `Resource doesn't exist. (404 response)`)
                .then(updated_tranfer => {
                    console_red('after mark_error_file', {updated_tranfer});
    
                    return update_modal_ui(transfer_id, uri);
                })
                .then(() => {
                    console_red('SOFT_FAIL', 'Continuing with download_items...')
                    download_items(transfer, manifest_urls)
                })
                
                // =============================================
            } else {
                update_tranfer_data(transfer_id, {
                    status: 'xnat_error',
                    error: Helper.errorMessage(err)
                }).then(updated_tranfer => {
                    console_red('after update_tranfer_data', {updated_tranfer});
    
                    ipc.send('progress_cell', {
                        table: '#download_monitor_table',
                        id: transfer_id,
                        field: "download_status",
                        value: "xnat_error"
                    });
                    
                    settings.set('transfering_download', false);
                })
            }
        }

    })
    
}

function mark_downloaded(transfer_id, uri) {

    return new Promise((resolve, reject) => {
        db_downloads._getById(transfer_id)
        .then(transfer => {
            if (transfer) {
                transfer.sessions.forEach((session) => {
                    let file = session.files.find(file => file.uri === uri)
                    if (file) {
                        file.status = 1
                    }
                });
                
                return db_downloads._replaceDoc(transfer_id, Helper.copy_obj(transfer))

            } else {
                throw new Error(`mark_downloaded: No transfer with id: ${transfer_id}`)
            }
        })
        .then(transfer => {
            //console_red('mark_downloaded', transfer, uri)
            resolve(transfer);
        })
        .catch(err => {
            reject(err);
        })
    })

}

function get_transfer_info(transfer_id) {
    let progress_counter = 0, success_files = 0, error_files = 0, file_counter = 0, progress = 0;

    return new Promise((resolve, reject) => {
        db_downloads._getById(transfer_id)
        .then(transfer => {
            if (transfer) {
                transfer.sessions.forEach((session) => {
                    session.files.forEach((file) => {
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
    
                resolve({
                    total_files: file_counter,
                    success_count: success_files,
                    error_count: error_files,
                    progress_percent: progress
                });

            } else {
                throw new Error(`get_transfer_info: No transfer with id: ${transfer_id}`)
            }

        })
        .catch(err => {
            reject(err);
        })
    })

}


function update_tranfer_data(transfer_id, data) {
    return new Promise((resolve, reject) => {
        db_downloads._getById(transfer_id)
        .then(transfer => {
            if (transfer) {
                return Object.assign(transfer, data);
            } else {
                throw new Error(`update_tranfer_data: No transfer with id: ${transfer_id}`)
            }
        })
        .then(transfer => {
            return db_downloads._replaceDoc(transfer_id, Helper.copy_obj(transfer))
        })
        .then(num_replaced => {
            console_red('update_tranfer_data', num_replaced)
            resolve(num_replaced);
        })
        .catch(err => {
            reject(err);
        })
    })

}


function mark_error_file(transfer_id, uri, error_message = 'File Download Error') {
    return new Promise((resolve, reject) => {
        db_downloads._getById(transfer_id)
        .then(transfer => {
            if (transfer) {
                transfer.sessions.forEach((session) => {
                    let file = session.files.find(file => file.uri === uri)
                    if (file) {
                        Object.assign(file, {
                            status: -1, 
                            error: error_message
                        });
                    }
                });
    
                return db_downloads._replaceDoc(transfer_id, Helper.copy_obj(transfer))

            } else {
                throw new Error(`mark_error_file: No transfer with id: ${transfer_id}`)
            }
        })
        .then(transfer => {
            console_red('update_tranfer_data', transfer)
            resolve(transfer);
        })
        .catch(err => {
            reject(err);
        })
    })
}


function update_modal_ui(transfer_id, uri) {
    return new Promise((resolve, reject) => {
        db_downloads._getById(transfer_id)
        .then(transfer => {
            if (transfer) {
                let session = transfer.sessions.find(session => session.files.find(file => file.uri === uri));

                let current_progress = session.files.reduce((accumulator, file) => {
                    let increment = file.status === 0 ? 0 : 1;
                    return accumulator + increment;
                }, 0);
                
                ipc.send('progress_cell', {
                    table: '#download-details-table',
                    id: session.id,
                    field: "progress",
                    value: current_progress
                });

                resolve()

            } else {
                throw new Error(`mark_error_file: No transfer with id: ${transfer_id}`)
            }
        })
        .catch(err => {
            reject(err);
        })
    })

}

window.onerror = function (errorMsg, url, lineNumber) {
    electron_log.error(`[Custom Uncaught Error - Download]:: ${__filename}:: (${url}:${lineNumber}) ${errorMsg}`)
    console_log(__filename + ':: ' +  errorMsg);
    return false;
}