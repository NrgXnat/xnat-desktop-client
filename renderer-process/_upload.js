const electron = require('electron');
const { ipcRenderer: ipc, remote } = electron;
const fs = require('fs');
const fx = require('mkdir-recursive');
const path = require('path');
const axios = require('axios');
const httpAdapter = require('axios/lib/adapters/http');
const https = require('https');
const isRetryAllowed = require('is-retry-allowed');
require('promise.prototype.finally').shim();

const ElectronStore = require('electron-store');
const settings = new ElectronStore();

const archiver = require('archiver');
const tempDir = require('temp-dir');
const lodashCloneDeep = require('lodash/cloneDeep')

const auth = require('../services/auth');

const mizer = remote.require('./mizer');
const XNATAPI = require('../services/xnat-api')

const db_uploads = remote.require('./services/db/uploads')

const { console_red } = require('../services/logger');

const electron_log = remote.require('./services/electron_log');

const user_settings = require('../services/user_settings');

const nedb_logger = remote.require('./services/db/nedb_logger')

const { copy_anonymize_zip } = require('../services/upload/copy_anonymize_zip');
// const { copy_anonymize_stream } = require('../services/upload/copy_anonymize_stream');
const { file_checksum, uuidv4, isEmptyObject, promiseSerial } = require('../services/app_utils')
const { MizerError } = require('../services/errors');



let summary_log = {};
let transfer_progress = [];
let userAgentString = remote.getCurrentWindow().webContents.getUserAgent();

const appMetaData = require('../package.json');
electron.crashReporter.start({
    companyName: appMetaData.author,
    productName: appMetaData.name,
    productVersion: appMetaData.version,
    submitURL: appMetaData.extraMetadata.submitUrl,
    uploadToServer: settings.get('send_crash_reports', false)
});

function summary_log_update(transfer_id, prop, val) {
    summary_log[transfer_id] = summary_log[transfer_id] || {}
    summary_log[transfer_id][prop] = summary_log[transfer_id][prop] || []

    summary_log[transfer_id][prop].push(val)

    //console_red('summary_log_update', summary_log)

    // TODO remove comment and add promise
    //db_uploads.updateProperty(transfer_id, 'summary', summary_log[transfer_id])
}



ipc.on('start_upload',function(e, item){
    console_red('ipc.on :: start_upload');
    setTimeout(do_transfer, 200);
});

ipc.on('cancel_upload',function(e, transfer_id){
    console_red('ipc.on :: cancel_upload', transfer_id);
    execute_cancel_token(transfer_id)
});

/**
 * // array
 * cancel_tokens = [
 *      {
 *          transfer_id: ... , // int
 *          series_id: ... , // string
 *          cancel: ... // function
 *      },
 *      
 *      ...
 * ]
 */

let cancel_tokens = [];

const remove_cancel_token = (transfer_id, series_id = false) => {
    console_red('remove_cancel_token::BEFORE', {cancel_tokens})
    cancel_tokens = cancel_tokens.filter(ct => {
        if (series_id === false) {
            return ct.transfer_id !== transfer_id
        } else {
            return ct.transfer_id !== transfer_id || ct.series_id !== series_id
        }
    });

    console_red('remove_cancel_token::AFTER', {cancel_tokens})
}

const execute_cancel_token = (transfer_id) => {
    console_red('execute_cancel_token', {transfer_id, cancel_tokens})

    cancel_tokens = cancel_tokens.filter(ct => {
        // execute cancel token if it matches transfer_id
        if (ct.transfer_id === transfer_id) {
            ct.cancel('cancel_many');
        }

        // and remove it
        return ct.transfer_id !== transfer_id
    });

    console_red('execute_cancel_token :: AFTER', {transfer_id, cancel_tokens})

}




/*
const { isDevEnv } = remote.require('./services/app_utils');

if (isDevEnv()) {
    (async function() {
        try {
            let jsession_cookie = await auth.get_jsession_cookie()
            electron_log.info(jsession_cookie)
        } catch (err) {
            electron_log.error(err)
        }

        electron_log.warn('ovo se izvrsava')
    })()
} else {
    electron_log.info('Not Dev ENV')
}
*/
/*
(async function(){

    //let url_fragment = '/data/prearchive/projects/DARKO_1/20190319_160010026/DARKO_01_MR_1?action=commit&SOURCE=uploader&XNAT_CSRF=';
    let url_fragment = '/data/prearchive/projects/DARKO_1/20190325_173114775/DARKO_01_MR_2?action=commit&SOURCE=uploader&XNAT_CSRF=';
    let xnat_server = 'http://xnat1.local';
    let user_auth = auth.get_user_auth()
    let csrfToken = await auth.get_csrf_token(xnat_server, user_auth);
    let commit_url = xnat_server + url_fragment + csrfToken;

    let jsession_cookie;
    try {
        jsession_cookie = await auth.get_jsession_cookie(xnat_server)
    } catch (err) {
        electron_log.error(err)
    }
    

    let request_settings = {
        headers: {
            'Cookie': jsession_cookie
        }
    }

    if (auth.allow_insecure_ssl()) {
        // insecure SSL at request level
        // request_settings.httpsAgent = new https.Agent({
        //     rejectUnauthorized: false
        // });
    }
    

    electron_log.info('data', {
        csrfToken,
        commit_url,
        request_settings
    })
    

    
	// axios.post(commit_url, {
	// 	//auth: user_auth
    // })
    axios.post(commit_url, request_settings)
	.then(commit_res => {
		console_red('XCOMMIT_SUCCESS', {commit_res});
	})
	.catch(err => {
		console_red('XCOMMIT_ERR', {
            err_response: err.response
        });
    })
    
})()
*/

const checksum_index = {
    items: [],
    add: function(source, upload_id, anon_checksum) {
        this.items.push({source, upload_id, anon_checksum});
    },
    remove_series: function(upload_id) {
        this.items = this.items.filter(items => items.upload_id !== upload_id)
    },
    filter_series: function(upload_id) {
        return this.items.filter(items => items.upload_id === upload_id)
    }
}

let csrfToken;

if (!settings.has('global_pause')) {
    settings.set('global_pause', false);
}

let items_uploaded = []

let _queue_ = {
    items: [],
    max_items: 4,
    add: function(transfer_id, series_id) {
        if (this.items.length < _queue_.get_max_items()) {
            let transfer_label = transfer_id + '::' + series_id;
            if (this.items.indexOf(transfer_label) == -1) {
                console_log('Added to queue ' + transfer_label);
                
                this.items.push(transfer_label);
                console_red('_queue_items_ADD', this.items)
                return true;
            } else {
                
                console_log('Already in queue ' + transfer_label);
                return false;
            }
        } else {
            console_log('Queue FULL');
            
            return false;
        }
    },
    remove: function(transfer_id, series_id) {
        var index = this.items.indexOf(transfer_id + '::' + series_id);
      
        if (index > -1) {
            this.items.splice(index, 1);
        }
        console_red('_queue_items_REMOVE', this.items)
    },
    remove_many: function(transfer_id) {
        console_red('_queue_.remove_many()', this.items);
        this.items = this.items.filter(single => single.indexOf(`${transfer_id}::`) !== 0)
    },
    get_max_items: function() {
        return user_settings.get('zip_upload_mode') === true ? 1 : this.max_items
    }
}


console_log(__filename);


do_transfer();

// try {
//     do_transfer()
// } catch(err) {
//     console_log(err)
//     ipc.send('custom_error', 'Upload Error', err.message);
// }

setInterval(do_transfer, 60000);


function console_log(...log_this) {
    electron_log.info(...log_this);
    //console.log(...log_this);
    //console.trace('<<<<== UPLOAD TRACE ==>>>>');
    ipc.send('log', ...log_this);
}


function do_transfer(source_series_id = 'initial', source_upload_success = true) {
    let xnat_server = settings.get('xnat_server');

    let current_username = auth.get_current_user();

    // db_uploads.listAll((err, my_transfers) => {
    //     console_red('db_uploads.listAll', {my_transfers})
    // });

    if (settings.get('global_pause')) {
        return;
    }

    let _list_all_timer = performance.now();

    db_uploads.listAll((err, my_transfers) => {
        let _list_all_took = ((performance.now() - _list_all_timer) / 1000).toFixed(2);
        console_red('_list_all_took', _list_all_took)

        my_transfers.forEach((transfer) => {
            // validate current user/server
            if (transfer.xnat_server === xnat_server 
                && transfer.user === current_username 
                && transfer.canceled !== true
                && typeof transfer.status === 'number'
                && transfer.series_ids.length
            ) {
                transfer.series_ids.forEach((series_id) => {
                    // if (source_upload_success && source_series_id === series_id) {
                    
                    //     return
                    // }
                    if (_queue_.add(transfer.id, series_id)) {
                        console_red('double_snapshot', {
                            source_series_id,
                            target_series_id: series_id,
                            _queue_items_: _queue_.items,
                            status: transfer.status,
                            series_ids: transfer.series_ids,
                            done_series_ids: transfer.done_series_ids || []
                        })
                        doUpload(transfer, series_id);
                    }
                })
            }
            
        });
    })
    
}

function set_transfer_totals_summary(transfer) {
    if (!transfer.summary || isEmptyObject(transfer.summary)) {

        let total_files = transfer.series.reduce((total, ss) => {
            return ss.length + total
        }, 0);
    
        let total_size = transfer.series.reduce((total, ss) => {
            let series_size = ss.reduce((tt, item) => {
                return tt + item.filesize;
            }, 0);
            return series_size + total
        }, 0);

        return db_uploads._updateProperty(transfer.id, 'summary', {
            total_files: [total_files],
            total_size: [total_size]
        })
    } else {
        return Promise.resolve(0)
    }
    
}

async function doUpload(transfer, series_id) {
    console_red('uploading series_id', series_id);

    let xnat_server = transfer.xnat_server, 
        project_id = transfer.url_data.project_id,
        user_auth = auth.get_user_auth();

    csrfToken = await auth.get_csrf_token(xnat_server, user_auth);

    if (csrfToken === false) {
        _queue_.remove_many(transfer.id);
        execute_cancel_token(transfer.id);
        
        ipc.send('force_reauthenticate', auth.current_login_data());
        return;
    }

    let updated_summary = await set_transfer_totals_summary(transfer)
    

    let selected_series = transfer.series.find(ss => series_id == ss[0].seriesInstanceUid);

    if (!selected_series) {
        //TODO - add logic if series doesn't exist
        // prob - remove from queue and return
    }

    let _files = selected_series.map(item => item.filepath);

    let contexts, variables;
    
    //mizer.get_mizer_scripts(xnat_server, user_auth, project_id)
    const xnat_api = new XNATAPI(xnat_server, user_auth);
    xnat_api.anon_scripts(project_id)
    .then(scripts => {
        console_log(scripts);

        let pixel_anon_series = transfer.pixel_anon ? transfer.pixel_anon.find(sd => series_id === sd.series_id) : false
        if (pixel_anon_series) {
            let series_script = mizer.generateAlterPixelCode(pixel_anon_series.rectangles);
            if (series_script.length) {
                scripts.push(series_script)
                console.log('************** AFTER ======');
                scripts.forEach(scr => {
                    console.log(scr);
                })
                
            }
        }

        contexts = mizer.getScriptContexts(scripts);

        // Convert the JS map anonValues into a Java Properties object.
        variables = mizer.getVariables(transfer.anon_variables);
        console_log(variables);

        if (user_settings.get('zip_upload_mode') === true) {
            copy_and_anonymize_zip(transfer, series_id, _files, contexts, variables, csrfToken)
        } else {
            copy_and_anonymize(transfer, series_id, _files, contexts, variables, csrfToken)
        }

        
    })
    .catch(function(error) {
        electron_log.error(error);
        nedb_logger.error(transfer.id, 'upload', error.message, error);
        console_log(error); // Test with throwing random errors (and rejecting promises)
    });
}

function get_temp_upload_path() {
    return user_settings.get('temp_folder_alternative') ?
        user_settings.get('temp_folder_alternative') : path.join(tempDir, '_xdc_temp');
}

let upload_counter = 0;
async function copy_and_anonymize(transfer, series_id, filePaths, contexts, variables, csrfToken) {
    const upload_id = uuidv4()
    console_red('copy_and_anonymize')
    let _timer = performance.now();


    let xnat_server = transfer.xnat_server, 
        user_auth = auth.get_user_auth(),
        table_row = transfer.table_rows.find(tbl_row => tbl_row.series_id == series_id);

    let dicom_temp_folder_path = get_temp_upload_path();
    let new_dirname = 'dir_' + Date.now(); // eg. dir_1522274921704
    let new_dirpath = path.join(dicom_temp_folder_path, new_dirname);

    fx.mkdirSync(new_dirpath, function (err) {
        if (err) throw err;
    });

    
    let cancelCurrentUpload;

    /**************************************************** */
    /**************************************************** */
    var archive = archiver('zip', {
        zlib: { level: 6 } // Sets the compression level.
    });
    
    
    // good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive.on('warning', function (err) {
        throw err;
    });
    
    // good practice to catch this error explicitly
    archive.on('error', function (err) {
        console_red('anon archiver error', err)
        throw err;
    });
    
    // Fires when the entry's input has been processed and appended to the archive.
    archive.on('entry', async (entry_data) => {
        //console.log(entry_data)
        await update_progress_details(transfer, table_row, entry_data.stats.size);
        
        fs.unlink(entry_data.sourcePath, (err) => {
            if (err) {
                electron_log.error(err)
                nedb_logger.error(transfer.id, 'upload', err.message, err);
                //throw err;
            } else {
                //console_red(`-- ZIP file "${entry_data.sourcePath}" was deleted.`);
            }
        });
    })

    /**************************************************** */
    /**************************************************** */

    let { project_id, subject_id, expt_label, visit_id, subtype, overwrite } = transfer.url_data;
    let qs = '';
    if (visit_id) {
        qs += '&VISIT=' + visit_id;
    }
    if (subtype) {
        qs += '&SUBTYPE=' + subtype;
    }

    // if overwrite is undefined
    overwrite = overwrite || 'none'
    
    let upload_timer = performance.now();

    let jsession_cookie = await auth.get_jsession_cookie()

    let CancelToken = axios.CancelToken;
    let request_settings = {
        method: 'post',
        url: xnat_server + `/data/services/import?import-handler=DICOM-zip&PROJECT_ID=${project_id}&SUBJECT_ID=${subject_id}&EXPT_LABEL=${expt_label}${qs}&overwrite=${overwrite}&rename=true&prevent_anon=true&prevent_auto_commit=true&SOURCE=uploader&autoArchive=AutoArchive` + '&XNAT_CSRF=' + csrfToken,
        //url: 'http://localhost:3007',
        adapter: httpAdapter,
        auth: user_auth,
        maxContentLength: (1024 * 1024 * 1024 * 1024), // default 10MB - must be increased ~ 1TB
        maxRedirects: 0, // default 5, has to be 0 to avoid back pressure (RAM filling)
        onUploadProgress: function (progressEvent) {
            // Do whatever you want with the native progress event
            console_red('progressEvent', {progressEvent});
            //console_log('=======', progressEvent, '===========');
            //console_log(progressEvent.loaded, progressEvent.total);

            //let new_progress = progressEvent.loaded / progressEvent.total * 100;
            
            // TODO uncomment
            //update_upload_table(transfer.id, table_row.id, new_progress);
        },
        headers: {
            'User-Agent': userAgentString,
            'Content-Type': 'application/zip',
            'Cookie': jsession_cookie
        },
        cancelToken: new CancelToken(function executor(c) {
            // An executor function receives a cancel function as a parameter
            cancelCurrentUpload = c;

            cancel_tokens.push({
                transfer_id: transfer.id,
                series_id: series_id,
                cancel: c
            })
        }),
        // transformRequest: [(data, headers) => {
        //     // Do whatever you want to transform the data
        //     console_red('transformRequest')
        //     console.log(data)
        //     return data;
        // }],
        data: archive
    };

    let https_agent_options = { keepAlive: true };
    if (auth.allow_insecure_ssl()) {
        https_agent_options.rejectUnauthorized = false // insecure SSL at request level
    }
    request_settings.httpsAgent = new https.Agent(https_agent_options);

    console_red('request_settings', {request_settings})

    // plug in test to see if upload is not canceled in the meantime
    var current_transfer = await db_uploads._getById(transfer.id);

    if (current_transfer.canceled === true) {
        _queue_.remove_many(transfer.id);
        respawn_transfer(transfer.id, series_id, false)
        return;
    }

    async function store_checksums(transfer_id, series_id, upload_id) {
        let _current_transfer = await db_uploads._getById(transfer_id);
        let current_transfer = lodashCloneDeep(_current_transfer)
        
        let selected_series = current_transfer.series.find(ss => series_id == ss[0].seriesInstanceUid);
        let st_item = checksum_index.filter_series(upload_id)

        for (let i = 0; i < st_item.length; i++) {
            let sfile = st_item[i]
            let selected_item = selected_series.find(item => item.filepath == sfile.source)
            selected_item['anon_checksum'] = sfile.anon_checksum;
        }
        
        const _transfer_copy_ = await replace_transfer_doc(current_transfer)
        console.log({_transfer_copy_});

        checksum_index.remove_series(upload_id)
        console_red('store_checksums DONE');
    }

    axios(request_settings)
    .then(async (res) => {
        console_red('zip upload done - res')

        await store_checksums(transfer.id, series_id, upload_id)

        remove_cancel_token(transfer.id, series_id)
        //console.log(res)

        let data = {
            res: res
        };
        try {
            data.transfer = await mark_uploaded(transfer.id, series_id);

            nedb_logger.success(transfer.id, 'upload', `Series uploaded ${series_id}.`);
            
            _queue_.remove(transfer.id, series_id);

            return data;

        } catch (err) {
            throw err;
        }
    })
    .then(async data => {
        console_red('zip upload done - then 1')
        let {transfer, res} = data;

        let transfer_series_ids = transfer.series_ids;
        let items_in_queue = _queue_.items;

        console_red('mark_uploaded.then()', {series_id, transfer_series_ids, items_in_queue})

        
        if (transfer.series_ids.length === 0) {
            console_log(`**** COMMITING UPLOAD ${transfer.id} :: ${series_id}`);
            console_log(`***** res.statusText  = '${res.statusText }' ******`);
            console_log(`***** res.data = '${res.data}' ******`);
            console_log('***** res.status = ' + res.status + ' ****** (' + (typeof res.status) + ')');

            let session_link;
            let reference_str = '/data/prearchive/projects/';
            
            let commit_timer = performance.now();

            // have to make this call again if too much time has passed (large upload)
            let csrfToken = await auth.get_csrf_token(xnat_server, user_auth);


            let commit_url = xnat_server + $.trim(res.data) + '?action=commit&SOURCE=uploader&XNAT_CSRF=' + csrfToken;
        
            console_log('-------- XCOMMIT_url ----------')
            console_log(`++++ Session commited. URL: ${commit_url}`);


            let jsession_cookie = await auth.get_jsession_cookie()
            let commit_request_settings = {
                auth: user_auth,
                headers: {
                    'User-Agent': userAgentString,
                    'Cookie': jsession_cookie
                }
            }

            let https_agent_options = { keepAlive: true };
            if (auth.allow_insecure_ssl()) {
                https_agent_options.rejectUnauthorized = false // insecure SSL at request level
            }
            commit_request_settings.httpsAgent = new https.Agent(https_agent_options);


            let commit_data = {};

            console.log({transfer_XXX: transfer});

            if (transfer.anon_variables.hasOwnProperty('tracer')) {
                let label = transfer.session_data.modality.indexOf('MR') >=0 ? 'xnat:petMrSessionData/tracer/name' : 'xnat:petSessionData/tracer/name';                

                commit_data[label] = transfer.anon_variables.tracer;
            }

            console.log({commit_data});
            
            axios.post(commit_url, commit_data, commit_request_settings)
            .then(commit_res => {
                console_red('-------- XCOMMIT_SUCCESS ----------')
                console_log('-------- XCOMMIT_SUCCESS ----------')
                console_log(commit_res);

                if (commit_res.data.indexOf(reference_str) >= 0) {
                    console_log(`+++ SESSION PREARCHIVED +++`);
                    let str_start = commit_res.data.indexOf(reference_str) + reference_str.length;
                    let session_str = commit_res.data.substr(str_start);

                    let res_arr = session_str.split('/');
                    // let res_project_id = res_arr[0];
                    // let res_timestamp = res_arr[1];
                    // let res_session_label = res_arr[2];
                    
                    session_link = xnat_server + '/app/action/LoadImageData/project/' + res_arr[0] + '/timestamp/' + res_arr[1] + '/folder/' + res_arr[2];
                    
                    return db_uploads._updateProperty(transfer.id, 'session_link', session_link)
                } else {
                    return false;
                }
                
            })
            .then(num_updated => {
                console_red('num_updated 1', {num_updated})
                if (num_updated) {
                    Helper.notify(`Upload is finished. Session: ${transfer.url_data.expt_label}`); // session label
                    nedb_logger.success(transfer.id, 'upload', `Session ${transfer.url_data.expt_label} uploaded successfully.`, transfer.url_data);
                    
                    // have to split this out bc a 301 indicates archival and goes into the catch block, whereas 200 means prearchived so we are in fact finished
                    db_uploads.updateProperty(transfer.id, 'status', 'finished', function() {
                        ipc.send('progress_cell', {
                            table: '#upload_monitor_table',
                            id: transfer.id,
                            field: 'status',
                            value: 'finished'
                        });
                        ipc.send('upload_finished', transfer.id);
                    });
                }
            })
            .catch(err => {
                console_log('-------- XCOMMIT_ERR ----------')
                console_log(err.response.data);

                if (err.response.status != 301) {
                    electron_log.error('commit_error', commit_url, JSON.stringify(err.response))
                    let error_message = `Session upload failed (with status code: ${err.response.status} - "${err.response.statusText}").`;
                    
                    nedb_logger.error(transfer.id, 'upload', error_message, err.response);

                    db_uploads.updateProperty(transfer.id, 'status', 'xnat_error', function() {
                        update_transfer_summary(transfer.id, 'commit_errors', error_message);
                    
                        ipc.send('progress_cell', {
                            table: '#upload_monitor_table',
                            id: transfer.id,
                            field: 'status',
                            value: 'xnat_error'
                        });
                        
                        ipc.send('upload_finished', transfer.id);
                    });
                } else {
                    console_log(`+++ SESSION ARCHIVED +++`);
                    
                    session_link = `${xnat_server}/data/archive/projects/${project_id}/subjects/${subject_id}/experiments/${expt_label}?format=html`
                    
                    db_uploads().update(
                        { id: transfer.id }, 
                        { 
                            $set: { 
                                status: 'finished',
                                session_link: session_link
                            }
                        }, 
                        function() {
                            Helper.notify(`Upload is finished. Session: ${transfer.url_data.expt_label}`); // session label
                            nedb_logger.success(transfer.id, 'upload', `Session ${transfer.url_data.expt_label} uploaded successfully.`, transfer.url_data);
                            
                            ipc.send('progress_cell', {
                                table: '#upload_monitor_table',
                                id: transfer.id,
                                field: 'status',
                                value: 'finished'
                            });
                            
                            ipc.send('upload_finished', transfer.id);
                        }
                    );
                }
            })
            .finally(() => {
                console_red(`+++ FINALLY +++`);
                console_log(`+++ FINALLY +++`);
                // let _time_took = ((performance.now() - commit_timer) / 1000).toFixed(2);
                // update_transfer_summary(transfer.id, 'timer_commit', _time_took);

                // TODO - remove this from here
                // Helper.notify(`Upload is finished. Session: ${transfer.url_data.expt_label}`); // session label
            });
        }

        return true;
    })
    .then(() => {
        respawn_transfer(transfer.id, series_id, true)
    })
    .catch(err => {
        handleUploadError(transfer, series_id, err)
    });

    /**************************************************** */
    /**************************************************** */

    const funcs = filePaths.map(copyAnonArchive);


    function copyAnonArchive(source) {
        return function() {
            return new Promise((resolve, reject) => {
                let target = path.join(new_dirpath, uuidv4());

                while (fs.existsSync(target)) {
                    target = path.join(new_dirpath, uuidv4());
                }

                let readStream = fs.createReadStream(source);
                
                
                // TODO - handle source read error
                readStream.once('error', (error) => {
                    console_red(`Read error:`, {source, target, targetDir, error});
                });
                
        
                let writeStream = fs.createWriteStream(target);
                writeStream.on('drain', () => {
                    //console_red('writeStream__drain')
                })
        
                writeStream.on('error', (err) => {
                    console_red('writeStream ERROR', err)
                    reject(`Anonimization failed XXX. File: ${source}`)
                })
        
                writeStream.on('finish', async () => {
                    try {
                        // if file wasn't copied for whatever reason
                        if (!fs.existsSync(target)) {
                            console_red('COPY ERROR', {source, target})
                            //fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
                            fs.writeFileSync(target, fs.readFileSync(source), 'wx')
                        }
        
                        mizer.anonymize(target, contexts, variables);
                        console.count('anonymized')
                        
                        const anon_checksum = await file_checksum(target)
                        checksum_index.add(source, upload_id, anon_checksum)

                        archive.file(target, { name: path.basename(target) });

                        resolve(false)
        
                    } catch (error) {
                        console_red('copy/anonymization ERROR', {source, target})
                        console.log({error});
                        console.log(error.message);
                        electron_log.error(error)
                        electron_log.error(error.message)
    
                        if (mizer.isMizerError(error.message)) {
                            console_red('MizerError')
                            reject(new MizerError(error.message, source));
                        } else {
                            resolve(source)
                        }
                        /*
                        response.copy_error.push({
                            file: source,
                            error: error
                        });
                        */
                    }
        
                });
        
                readStream.pipe(writeStream);
            })
        }
    }

    function promiseSerialErrorHandler(err) {
        console_red('anon failed', err)
        electron_log.error('anon failed', err)

        //archive.finalize(); // TODO REMOVE THIS LINE
        archive.abort() // removing any pending queue tasks, ends both sides of the Transform stream
        // todo ... axios thinks everything is OK ... thinks the stream ended without a problem so we cancel it

        if (err instanceof MizerError) {
            cancelCurrentUpload(err);
        } else {
            cancelCurrentUpload('cancel_single');
        }
    }

    // execute Promises in serial
    promiseSerial(funcs)
    .then((copy_errors) => {
        console_red('anon finished 1', {copy_errors})

        if (copy_errors.length) {
            // ===== Attempt 2
            const funcs2 = copy_errors.map(copyAnonArchive);

            promiseSerial(funcs2)
            .then((copy_errors2) => {
                console_red('anon finished 2', {copy_errors2})

                if (copy_errors2.length) {
                    // ===== Attempt 3
                    const funcs3 = copy_errors2.map(copyAnonArchive);

                    promiseSerial(funcs3)
                    .then((copy_errors3) => {
                        console_red('anon finished 3', {copy_errors3})

                        if (copy_errors3.length) {
                            // Fail
                            promiseSerialErrorHandler(copy_errors3)
                        } else {
                            archive.finalize();
                        }
                    })
                    .catch(promiseSerialErrorHandler)
                    
                } else {
                    archive.finalize();
                }
            })
            .catch(promiseSerialErrorHandler)
        } else {
            // finalize the archive (ie we are done appending files but streams have to finish yet)
            // 'close', 'end' or 'finish' may be fired right after calling this method so register to them beforehand
            archive.finalize();
        }

    }).catch(promiseSerialErrorHandler);

}

function handleUploadError(transfer, series_id, err) {
    let log_and_respawn = true;
    let stream_upload_error = false;
    let authentication_error = false;
    let mizer_error = false;
    let non_retriable_error = false;

    if (err instanceof MizerError) {
        log_and_respawn = false;
        mizer_error = err;
    } else if (axios.isCancel(err)) {
        console_red('upload canceled error: cancelCurrentUpload', err);

        if (err.message === 'cancel_many') {
            log_and_respawn = false;
        } else if (err.message instanceof MizerError) {
            log_and_respawn = false;
            mizer_error = err.message;
        }
    } else {
        console_red('upload error 2', {err});

        // critical error message 
        let err_msg_search = 'File posts must include the file directly as the body of the message';
        if (err.response && err.response.status === 400 && err.response.data.indexOf(err_msg_search) > 0) {
            log_and_respawn = false;
            stream_upload_error = true;
        } else if (err.response && err.response.status === 401) {
            log_and_respawn = false;
            authentication_error = true;
        } else if (!isRetryAllowed(err)) {
            log_and_respawn = false;
            non_retriable_error = true;
        }
    }
    
    remove_cancel_token(transfer.id, series_id)
    _queue_.remove(transfer.id, series_id);

    if (log_and_respawn) {
        update_transfer_summary(transfer.id, 'upload_errors', Helper.errorMessage(err), function() {
            respawn_transfer(transfer.id, series_id, false)
        });
    } else {
        _queue_.remove_many(transfer.id);
        execute_cancel_token(transfer.id);

        if (stream_upload_error) {
            ipc.send('global_pause_status', true);
            ipc.send('xnat_cant_handle_stream_upload');
        } else if (authentication_error) {
            ipc.send('force_reauthenticate', auth.current_login_data());
        } else if (mizer_error) {
            db_uploads().update(
                { id: transfer.id }, 
                {
                    $set: {
                        canceled: true, 
                        status: 'xnat_error',
                        last_error: mizer_error.message
                    }
                }, 
                function(nedb_err, num) {
                    if (nedb_err) throw nedb_err;

                    nedb_logger.error(transfer.id, 'upload', `Anonymization error: ${mizer_error.file}`, {data: mizer_error.message});

                    let subtitle = `An error occured while trying to anonymize a file:\n${mizer_error.file}.\nSession: ${transfer.url_data.expt_label}\n\nTransfer was canceled.`
                    ipc.send('custom_error_with_details', 'Anonymization Error', subtitle, mizer_error.message)

                    ipc.send('upload_finished', transfer.id);
                    ipc.send('refresh_progress_tables');
                }
            );
        } else if (non_retriable_error) {
            db_uploads().update(
                { id: transfer.id }, 
                {
                    $set: {
                        canceled: true, 
                        status: 'xnat_error',
                        last_error: `${err.code}: ${err.message}`
                    }
                }, 
                function(nedb_err, num) {
                    if (nedb_err) throw nedb_err;

                    nedb_logger.error(transfer.id, 'upload', `Non retriable request error`, {
                        data: `${err.code}: [URL: ${err.config.url}] ${err.message}`
                    });

                    let subtitle = `Request error occurred.\nURL:${err.config.url}\nError code: ${err.code}\nSession: ${transfer.url_data.expt_label}\n\nTransfer was canceled.`

                    ipc.send('custom_error_with_details', 'API Request Error', subtitle, err.message)
                    ipc.send('upload_finished', transfer.id);
                }
            );
        }
    }
}


async function copy_and_anonymize_zip(transfer, series_id, _files, contexts, variables, csrfToken) {
    let dicom_temp_folder_path = get_temp_upload_path();
    let new_dirname = 'dir_' + Date.now(); // eg. dir_1522274921704
    let new_dirpath = path.join(dicom_temp_folder_path, new_dirname);

    fx.mkdirSync(new_dirpath, function (err) {
        if (err) throw err;
    });

    copy_anonymize_zip(_files, new_dirpath, contexts, variables)
        .then(async result => {
            console.log({anon_checksums: result.checksums});

            let selected_series = transfer.series.find(ss => series_id == ss[0].seriesInstanceUid);

            result.checksums.forEach(sfile => {
                let selected_item = selected_series.find(item => item.filepath == sfile.source)
                selected_item['anon_checksum'] = sfile.anon_checksum;
            })

            const _transfer_copy_ = await replace_transfer_doc(transfer)
            console.log({_transfer_copy_});

            upload_zip(result.path, transfer, series_id, csrfToken)
        })
        .catch(err => {
            console.log('FINAL', err)
            handleUploadError(transfer, series_id, err)
        })
    
}

async function upload_zip(zip_path, transfer, series_id, csrfToken) {
    /**************************************************** */
    /**************************************************** */
    let xnat_server = transfer.xnat_server, 
        user_auth = auth.get_user_auth(),
        table_row = transfer.table_rows.find(tbl_row => tbl_row.series_id == series_id);

        
    let cancelCurrentUpload;
    let CancelToken = axios.CancelToken;


    let {project_id, subject_id, expt_label, visit_id, subtype, overwrite} = transfer.url_data;
    let qs = '';
    if (visit_id) {
        qs += '&VISIT=' + visit_id;
    }
    if (subtype) {
        qs += '&SUBTYPE=' + subtype;
    }
    // if overwrite is undefined
    overwrite = overwrite || 'none'

    let jsession_cookie = await auth.get_jsession_cookie()

    let request_settings = {
        method: 'post',
        url: xnat_server + `/data/services/import?import-handler=DICOM-zip&PROJECT_ID=${project_id}&SUBJECT_ID=${subject_id}&EXPT_LABEL=${expt_label}${qs}&overwrite=${overwrite}&rename=true&prevent_anon=true&prevent_auto_commit=true&SOURCE=uploader&autoArchive=AutoArchive` + '&XNAT_CSRF=' + csrfToken,
        auth: user_auth,
        onUploadProgress: function (progressEvent) {
            // Do whatever you want with the native progress event
            console.log('=======', progressEvent, '===========');
            console.log(progressEvent.loaded, progressEvent.total);

            let new_progress = progressEvent.loaded / progressEvent.total * 100;

            update_progress_details_zip(transfer, table_row, new_progress)
            
        },
        headers: {
            'User-Agent': userAgentString,
            'Content-Type': 'application/zip',
            'Cookie': jsession_cookie
        },
        cancelToken: new CancelToken(function executor(c) {
            // An executor function receives a cancel function as a parameter
            cancelCurrentUpload = c;

            cancel_tokens.push({
                transfer_id: transfer.id,
                series_id: series_id,
                cancel: c
            })
        })
    };

    let https_agent_options = { keepAlive: true };
    if (auth.allow_insecure_ssl()) {
        https_agent_options.rejectUnauthorized = false // insecure SSL at request level
    }
    request_settings.httpsAgent = new https.Agent(https_agent_options);

    console_red('request_settings', {request_settings})

    // plug in test to see if upload is not canceled in the meantime
    var current_transfer = await db_uploads._getById(transfer.id);

    if (current_transfer.canceled === true) {
        _queue_.remove_many(transfer.id);
        respawn_transfer(transfer.id, series_id, false)
        return;
    }


    fs.readFile(zip_path, (err, zip_content) => {
        if (err) throw err;

        request_settings.data = zip_content;
        axios(request_settings)
        .then(async res => {
            fs.unlink(zip_path, (err) => {
                if (err) throw err;
                //console_log(`-- ZIP file "${zip_path}" was deleted.`);
            });

            remove_cancel_token(transfer.id, series_id)
    
            let data = {
                res: res
            };
            try {
                data.transfer = await mark_uploaded(transfer.id, series_id);
    
                nedb_logger.success(transfer.id, 'upload', `Series uploaded ${series_id}.`);
                
                _queue_.remove(transfer.id, series_id);
    
                return data;
    
            } catch (err) {
                throw err;
            }
        })
        .then(async data => {
            let {transfer, res} = data;
    
            let transfer_series_ids = transfer.series_ids;
            let items_in_queue = _queue_.items;
    
            console_red('mark_uploaded.then()', {series_id, transfer_series_ids, items_in_queue})
            
            if (transfer.series_ids.length === 0) {
                console_log(`**** COMMITING UPLOAD ${transfer.id} :: ${series_id}`);
                console_log(`***** res.statusText  = '${res.statusText }' ******`);
                console_log(`***** res.data = '${res.data}' ******`);
                console_log('***** res.status = ' + res.status + ' ****** (' + (typeof res.status) + ')');
    
                let session_link;
                let reference_str = '/data/prearchive/projects/';
                
                // have to make this call again if too much time has passed (large upload)
                let csrfToken = await auth.get_csrf_token(xnat_server, user_auth);
    
                let commit_url = xnat_server + $.trim(res.data) + '?action=commit&SOURCE=uploader&XNAT_CSRF=' + csrfToken;
            
                console_log('-------- XCOMMIT_url ----------')
                console_log(`++++ Session commited. URL: ${commit_url}`);
    
    
                let jsession_cookie = await auth.get_jsession_cookie()
                let commit_request_settings = {
                    auth: user_auth,
                    headers: {
                        'User-Agent': userAgentString,
                        'Cookie': jsession_cookie
                    }
                }
    
                let https_agent_options = { keepAlive: true };
                if (auth.allow_insecure_ssl()) {
                    https_agent_options.rejectUnauthorized = false // insecure SSL at request level
                }
                commit_request_settings.httpsAgent = new https.Agent(https_agent_options);
    
    
                let commit_data = {};
    
                console.log({transfer_XXX: transfer});
    
                if (transfer.anon_variables.hasOwnProperty('tracer')) {
                    let label = transfer.session_data.modality.indexOf('MR') >=0 ? 'xnat:petMrSessionData/tracer/name' : 'xnat:petSessionData/tracer/name';                
    
                    commit_data[label] = transfer.anon_variables.tracer;
                }
    
                console.log({commit_data});
                
                axios.post(commit_url, commit_data, commit_request_settings)
                .then(commit_res => {
                    console_log('-------- XCOMMIT_SUCCESS ----------')
                    console_log(commit_res);
    
                    if (commit_res.data.indexOf(reference_str) >= 0) {
                        console_log(`+++ SESSION PREARCHIVED +++`);
                        let str_start = commit_res.data.indexOf(reference_str) + reference_str.length;
                        let session_str = commit_res.data.substr(str_start);
    
                        let res_arr = session_str.split('/');
                        // let res_project_id = res_arr[0];
                        // let res_timestamp = res_arr[1];
                        // let res_session_label = res_arr[2];
                        
                        session_link = xnat_server + '/app/action/LoadImageData/project/' + res_arr[0] + '/timestamp/' + res_arr[1] + '/folder/' + res_arr[2];
                        
                        return db_uploads._updateProperty(transfer.id, 'session_link', session_link)
                    } else {
                        return false;
                    }
                    
                })
                .then(num_updated => {
                    console_red('num_updated 1', {num_updated})
                    if (num_updated) {
                        Helper.notify(`Upload is finished. Session: ${transfer.url_data.expt_label}`); // session label
                        nedb_logger.success(transfer.id, 'upload', `Session ${transfer.url_data.expt_label} uploaded successfully.`, transfer.url_data);
                        
                        ipc.send('progress_cell', {
                            table: '#upload_monitor_table',
                            id: transfer.id,
                            field: 'status',
                            value: 'finished'
                        });
                        
                        ipc.send('upload_finished', transfer.id);
                    }
                })
                .catch(err => {
                    console_log('-------- XCOMMIT_ERR ----------')
                    console_log(err.response.data);
    
                    if (err.response.status != 301) {
                        electron_log.error('commit_error', commit_url, JSON.stringify(err.response))
                        let error_message = `Session archival failed (with status code: ${err.response.status} - "${err.response.statusText}").`;
                        
                        nedb_logger.error(transfer.id, 'upload', error_message, err.response);
    
                        update_transfer_summary(transfer.id, 'commit_errors', error_message);
                    } else {
                        console_log(`+++ SESSION ARCHIVED +++`);
                        
                        session_link = `${xnat_server}/data/archive/projects/${project_id}/subjects/${subject_id}/experiments/${expt_label}?format=html`
                        
                        db_uploads._updateProperty(transfer.id, 'session_link', session_link)
                            .then(num_updated => {
                                console_red('num_updated 2', {num_updated})
                                if (num_updated) {
                                    Helper.notify(`Upload is finished. Session: ${transfer.url_data.expt_label}`); // session label
                                    nedb_logger.success(transfer.id, 'upload', `Session ${transfer.url_data.expt_label} uploaded successfully.`, transfer.url_data);
                                    
                                    ipc.send('progress_cell', {
                                        table: '#upload_monitor_table',
                                        id: transfer.id,
                                        field: 'status',
                                        value: 'finished'
                                    });
    
                                    ipc.send('upload_finished', transfer.id);
                                }
                            });
                    }
                })
                .finally(() => {
                    console_log(`+++ FINALLY +++`);
                    // let _time_took = ((performance.now() - commit_timer) / 1000).toFixed(2);
                    // update_transfer_summary(transfer.id, 'timer_commit', _time_took);
    
                    // TODO - remove this from here
                    // Helper.notify(`Upload is finished. Session: ${transfer.url_data.expt_label}`); // session label
                });
            }
    
            return true;
        })
        .then(() => {
            respawn_transfer(transfer.id, series_id, true)
        })
        .catch(err => {
            handleUploadError(transfer, series_id, err)
        });
    
        /**************************************************** */
        /**************************************************** */
    });
}

function respawn_transfer(transfer_id, series_id, success) {
    console_red('respawn_transfer', {transfer_id, series_id, success})
    do_transfer(series_id, success);
}

function mark_uploaded(transfer_id, series_id) {
    console.count('mark_uploaded')
    console.count('mark_uploaded__' + series_id)
    
    return new Promise((resolve, reject) => {
        db_uploads.getById(transfer_id, (err, db_transfer) => {
            // copy the response
            let transfer = lodashCloneDeep(db_transfer);

            transfer.done_series_ids = transfer.done_series_ids || [];

            let series_index = transfer.series_ids.indexOf(series_id);

            if (series_index >= 0) {
                transfer.series_ids.splice(series_index, 1);
                transfer.done_series_ids.push(series_id)
            } else {
                console_red('NOT IN SERIES IDS', series_id)
            }
    
            let finished = transfer.table_rows.length - transfer.series_ids.length;
            let total = transfer.table_rows.length;
            let percent_complete = finished / total * 100
            let new_status = finished == total ? 'finished' : percent_complete
    
            transfer.status = new_status;
    
            ipc.send('progress_cell', {
                table: '#upload_monitor_table',
                id: transfer_id,
                field: "status",
                value: percent_complete
            });
            
            db_uploads().update({ id: transfer_id }, {$set: {
                    status: new_status, 
                    series_ids: transfer.series_ids,
                    done_series_ids: transfer.done_series_ids
                }
            }, { multi: false }, function (err, numReplaced) {
                if (err) reject (err);
                resolve(transfer);
            });
    
            /*
            db_uploads.replaceDoc(transfer_id, transfer, (err, nume) => {
                if (err) reject (err);
                _queue_.remove(transfer_id, series_id);
                resolve(transfer);
            });
            */
    
            // left_to_upload = transfer.series_ids.length;
            
        })
    })
}

async function update_transfer_summary(transfer_id, property, new_value, callback = false) {
    summary_log_update(transfer_id, property, new_value)
    let db_transfer = await db_uploads._getById(transfer_id)
    let transfer = lodashCloneDeep(db_transfer);

    transfer.summary = transfer.summary || {}
    transfer.summary[property] = transfer.summary[property] || []
    transfer.summary[property].push(new_value)

    await db_uploads._replaceDoc(transfer_id, transfer);

    if (callback) {
        callback()
    }
}

async function replace_transfer_doc(transfer) {
    let _transfer = lodashCloneDeep(transfer);
    return await db_uploads._replaceDoc(_transfer.id, _transfer);
}

function transfer_tpl(transfer) {
    my_transfer = {
        transfer_id: transfer.id,
        rows: []
    };

    transfer.table_rows.forEach(tr => {
        my_transfer.rows.push({
            id: tr.id,
            progress: tr.progress,
            size: tr.size,
            db: 0,
            count: 0
        })
    });

    return my_transfer;
}

function get_transfer_from_transfer_progress(transfer, transfer_progress) {
    let my_transfer = transfer_progress.find(tr => tr.transfer_id == transfer.id);

    // if no transfer progress stored create it
    if (my_transfer === undefined) {
        my_transfer = transfer_tpl(transfer)

        transfer_progress.push(my_transfer)
    }

    return my_transfer;
}


async function update_progress_details(transfer, table_row, filesize, reset = false) {
    console.count('update_progress_details')

    let my_transfer = get_transfer_from_transfer_progress(transfer, transfer_progress)
    
    let selected_row = my_transfer.rows.find(row => row.id == table_row.id)

    selected_row.progress += (filesize / selected_row.size * 100)
    selected_row.count++

    // workaround - disable duplicate upload progress error
    if (selected_row.progress <= 101.5) {
        ipc.send('progress_cell', {
            table: '#upload-details-table',
            id: selected_row.id,
            field: "progress",
            value: selected_row.progress
        });
    }

    console_red('selected_row.progress: ', selected_row.id, selected_row.progress);

    // real file size is changed after anonymization so we cant be too accurate
    // if (selected_row.progress >= 99.5 && selected_row.db == 0) {
    if (selected_row.count == table_row.count && selected_row.db == 0) {
        console_red('selected_row.progress => NeDB: ', selected_row.id, selected_row.progress);

        let db_transfer = await db_uploads._getById(transfer.id);
        let transfer_copy = lodashCloneDeep(db_transfer);
        
        let tbl_row = transfer_copy.table_rows.find(t_row => t_row.id === table_row.id);
        
        if (tbl_row) {
            tbl_row.progress = 100;
            await db_uploads._replaceDoc(transfer.id, transfer_copy);
            selected_row.db = 1
        }
    }

}

async function update_progress_details_zip(transfer, table_row, progress) {
    console.count('update_progress_details')

    let my_transfer = get_transfer_from_transfer_progress(transfer, transfer_progress)
    let selected_row = my_transfer.rows.find(row => row.id == table_row.id)

    selected_row.progress = progress

    ipc.send('progress_cell', {
        table: '#upload-details-table',
        id: selected_row.id,
        field: "progress",
        value: selected_row.progress
    });

    console_red('selected_row.progress: ', selected_row.id, selected_row.progress);

    if (progress == 100) {
        let db_transfer = await db_uploads._getById(transfer.id);
    
        let transfer_copy = lodashCloneDeep(db_transfer);
        let tbl_row = transfer_copy.table_rows.find(t_row => t_row.id === table_row.id);

        tbl_row.progress = 100;
        await db_uploads._replaceDoc(transfer.id, transfer_copy);
        selected_row.db = 1
    }

}


window.onerror = function (errorMsg, url, lineNumber) {
    electron_log.error(`[Custom Uncaught Error]:: ${__filename}:: (${url}:${lineNumber}) ${errorMsg}`)
    console_log('[ERRORRR]:: ' +__filename + ':: ' +  errorMsg);
    return false;
}


let summary_all = {};
function summary_add(transfer_id, series_id, text, label = '') {
    if (summary_all[transfer_id] === undefined) {
        summary_all[transfer_id] = {};
    }
    if (summary_all[transfer_id][series_id] === undefined) {
        summary_all[transfer_id][series_id] = [];
    }

    summary_all[transfer_id][series_id].push({
        label: label,
        text: text
    });

    console.log('summary_all', summary_all);
}


function _time_offset(start_time) {
    return ((performance.now() - start_time) / 1000).toFixed(2);
}
