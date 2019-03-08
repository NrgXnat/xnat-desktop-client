const fs = require('fs');
const fx = require('mkdir-recursive');
const path = require('path');
const axios = require('axios');
const httpAdapter = require('axios/lib/adapters/http');
const https = require('https');
require('promise.prototype.finally').shim();
const settings = require('electron-settings');
const ipc = require('electron').ipcRenderer;

const auth = require('../services/auth');

const mizer = require('../mizer');

const archiver = require('archiver');

const tempDir = require('temp-dir');

const db_uploads = require('electron').remote.require('./services/db/uploads')

const { console_red } = require('../services/logger');
//function console_red() {}

let summary_log = {};

function summary_log_update(transfer_id, prop, val) {
    summary_log[transfer_id] = summary_log[transfer_id] || {}
    summary_log[transfer_id][prop] = summary_log[transfer_id][prop] || []

    summary_log[transfer_id][prop].push(val)

    //console_red('summary_log_update', summary_log)

    // TODO remove comment and add promise
    //db_uploads.updateProperty(transfer_id, 'summary', summary_log[transfer_id])
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
        if (this.items.length < this.max_items) {
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

setInterval(do_transfer, 300000000);


function console_log(...log_this) {
    //console.log(...log_this);
    //console.trace('<<<<== UPLOAD TRACE ==>>>>');
    ipc.send('log', ...log_this);
}

ipc.on('start_upload',function(e, item){
    setTimeout(do_transfer, 200);
});


function do_transfer(source_series_id = 'initial', source_upload_success = true) {
    let xnat_server = settings.get('xnat_server');

    let current_user_auth = auth.get_user_auth();
    let user_auth = settings.get('user_auth');

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
    if (!transfer.summary || emptyObject(transfer.summary)) {

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

    let updated_summary = await set_transfer_totals_summary(transfer)
    

    let selected_series = transfer.series.find(ss => series_id == ss[0].seriesInstanceUid);

    if (!selected_series) {
        //TODO - add logic if series doesn't exist
        // prob - remove from queue and return
    }

    let _files = selected_series.map(item => item.filepath);

    let contexts, variables;
    mizer.get_mizer_scripts(xnat_server, user_auth, project_id)
    .then(scripts => {
        console_log(scripts);

        contexts = mizer.getScriptContexts(scripts);

        // Convert the JS map anonValues into a Java Properties object.
        variables = mizer.getVariables(transfer.anon_variables);
        console_log(variables);

        copy_and_anonymize(transfer, series_id, _files, contexts, variables, csrfToken)
    }).catch(function(error) {
        console_log(error); // Test with throwing random errors (and rejecting promises)
    });
}




let upload_counter = 0;
async function copy_and_anonymize(transfer, series_id, filePaths, contexts, variables, csrfToken) {
    console_red('copy_and_anonymize')
    let _timer = performance.now();


    let xnat_server = transfer.xnat_server, 
        user_auth = auth.get_user_auth(),
        table_row = transfer.table_rows.find(tbl_row => tbl_row.series_id == series_id);

    let dicom_temp_folder_path = path.resolve(tempDir, '_xdc_temp');
    let new_dirname = 'dir_' + new Date() / 1; // eg. dir_1522274921704
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
    archive.on('entry', function (entry_data) {
        //console.log(entry_data)
        update_progress_details(transfer, table_row, entry_data.stats.size);
        fs.unlink(entry_data.sourcePath, (err) => {
            if (err) {
                //throw err;
            } else {
                //console_red(`-- ZIP file "${entry_data.sourcePath}" was deleted.`);
            }
        });
    })

    /**************************************************** */
    /**************************************************** */

    const {project_id, subject_id, expt_label} = transfer.url_data;

    let upload_timer = performance.now();

    let CancelToken = axios.CancelToken;
    let request_settings = {
        method: 'post',
        url: xnat_server + `/data/services/import?import-handler=DICOM-zip&PROJECT_ID=${project_id}&SUBJECT_ID=${subject_id}&EXPT_LABEL=${expt_label}&rename=true&prevent_anon=true&prevent_auto_commit=true&SOURCE=uploader&autoArchive=AutoArchive` + '&XNAT_CSRF=' + csrfToken,
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
            'Content-Type': 'application/zip'
        },
        cancelToken: new CancelToken(function executor(c) {
            // An executor function receives a cancel function as a parameter
            cancelCurrentUpload = c;
        }),
        // transformRequest: [(data, headers) => {
        //     // Do whatever you want to transform the data
        //     console_red('transformRequest')
        //     console.log(data)
        //     return data;
        // }],
        data: archive
    };

    if (auth.allow_insecure_ssl()) {
        // insecure SSL at request level
        request_settings.httpsAgent = new https.Agent({
            rejectUnauthorized: false
        });
    }

    console_red('request_settings', {request_settings})

    axios(request_settings)
    .then(async (res) => {
        console_red('zip upload done - res')
        //console.log(res)

        let data = {
            res: res
        };
        try {
            data.transfer = await mark_uploaded(transfer.id, series_id);
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
            
            let commit_timer = performance.now();

            // have to make this call again if too much time has passed (large upload)
            let csrfToken = await auth.get_csrf_token(xnat_server, user_auth);


            let commit_url = xnat_server + $.trim(res.data) + '?action=commit&SOURCE=uploader&XNAT_CSRF=' + csrfToken;
        
            console_log('-------- XCOMMIT_url ----------')
            console_log(`++++ Session commited. URL: ${commit_url}`);
            
            axios.post(commit_url, {
                auth: user_auth
            })
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
                    
                    db_uploads.updateProperty(transfer.id, 'session_link', session_link)
                }
                
            })
            .catch(err => {
                console_log('-------- XCOMMIT_ERR ----------')
                console_log(err.response.data);

                if (err.response.status != 301) {
                    update_transfer_summary(transfer.id, 'commit_errors', `Session upload failed (with status code: ${err.response.status} - "${err.response.statusText}").`);
                } else {
                    console_log(`+++ SESSION ARCHIVED +++`);
                    
                    session_link = `${xnat_server}/data/archive/projects/${project_id}/subjects/${subject_id}/experiments/${expt_label}?format=html`
                    
                    db_uploads.updateProperty(transfer.id, 'session_link', session_link)
                }
            })
            .finally(() => {
                // let _time_took = ((performance.now() - commit_timer) / 1000).toFixed(2);
                // update_transfer_summary(transfer.id, 'timer_commit', _time_took);

                // TODO - remove this from here
                Helper.notify(`Upload is finished. Session: ${transfer.url_data.expt_label}`); // session label
            });
        }

        return true;
    })
    .then(() => {
        respawn_transfer(transfer.id, series_id, true)
    })
    .catch(err => {
        if (axios.isCancel(err)) {
            console_red('upload canceled error: cancelCurrentUpload', err);
        } else {
            console_red('upload error 2', {err});
        }
        
        _queue_.remove(transfer.id, series_id);

        update_transfer_summary(transfer.id, 'upload_errors', Helper.errorMessage(err), function() {
            respawn_transfer(transfer.id, series_id, false)
        });
    });

    function respawn_transfer(transfer_id, series_id, success) {
        console_red('respawn_transfer', {transfer_id, series_id})

        do_transfer(series_id, success);

        // let _time_took = ((performance.now() - upload_timer) / 1000).toFixed(2);
        // update_transfer_summary(transfer_id, 'timer_upload', _time_took, function() {
        //     //_queue_.remove(transfer_id, series_id);
        //     do_transfer(series_id, success);
        // });
    }

    /**************************************************** */
    /**************************************************** */

    const funcs = filePaths.map(copyAnonArchive);


    function copyAnonArchive(source) {
        return function() {
            return new Promise((resolve, reject) => {
                const target = path.join(new_dirpath, path.basename(source));
                
                // TODO check if source path exists
        
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
        
                writeStream.on('finish', () => {
                    try {
                        // if file wasn't copied for whatever reason
                        if (!fs.existsSync(target)) {
                            console_red('COPY ERROR', {source, target})
                            fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
                        }
        
                        mizer.anonymize(target, contexts, variables);
                        console.count('anonymized')
                        
                        archive.file(target, { name: path.basename(target) });
                        resolve(false)
        
                    } catch (error) {
                        console_red('copy/anonymization ERROR', {source, target})
                        
    
                        resolve(source)
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
        //archive.finalize(); // TODO REMOVE THIS LINE
        archive.abort() // removing any pending queue tasks, ends both sides of the Transform stream
        // todo ... axios thinks everything is OK ... thinks the stream ended without a problem so we cancel it
        cancelCurrentUpload();
    }

    // execute Promises in serial
    Helper.promiseSerial(funcs)
    .then((copy_errors) => {
        console_red('anon finished 1', {copy_errors})

        if (copy_errors.length) {
            // ===== Attempt 2
            const funcs2 = copy_errors.map(copyAnonArchive);

            Helper.promiseSerial(funcs2)
            .then((copy_errors2) => {
                console_red('anon finished 2', {copy_errors2})

                if (copy_errors2.length) {
                    // ===== Attempt 3
                    const funcs3 = copy_errors2.map(copyAnonArchive);

                    Helper.promiseSerial(funcs3)
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


function mark_uploaded(transfer_id, series_id) {
    console.count('mark_uploaded')
    console.count('mark_uploaded__' + series_id)
    
    return new Promise((resolve, reject) => {
        db_uploads.getById(transfer_id, (err, db_transfer) => {
            // copy the response
            let transfer = Helper.copy_obj(db_transfer);

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
            let new_status = finished == total ? 'finished' : finished / total * 100
    
            transfer.status = new_status;
    
            ipc.send('progress_cell', {
                table: '#upload_monitor_table',
                id: transfer_id,
                field: "status",
                value: new_status
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
    let transfer = Helper.copy_obj(db_transfer);

    transfer.summary = transfer.summary || {}
    transfer.summary[property] = transfer.summary[property] || []
    transfer.summary[property].push(new_value)

    await db_uploads._replaceDoc(transfer_id, transfer);

    if (callback) {
        callback()
    }
}

async function update_transfer_summary__OLD(transfer_id, property, new_value, callback = false) {
    summary_log_update(transfer_id, property, new_value)
    //let db_transfer = await db_uploads._getById(transfer_id)
    //let transfer = JSON.parse(JSON.stringify(db_transfer));


    // transfer.summary = transfer.summary || {}
    // transfer.summary[property] = transfer.summary[property] || []
    // transfer.summary[property].push(new_value)

    // await db_uploads._replaceDoc(transfer_id, transfer);

    if (callback) {
        callback()
    }
}

let transfer_progress = [
    
];

function init_update_progress(transfer) {
    let my_transfer = transfer_progress.filter(tr => tr.transfer_id != transfer.id);
    
    my_transfer = {
        transfer_id: transfer.id,
        rows: []
    };

    transfer.table_rows.forEach(tr => {
        my_transfer.rows.push({
            id: tr.id,
            progress: tr.progress,
            size: tr.size
        })
    });

    transfer_progress.push(my_transfer)
}

async function update_progress_details(transfer, table_row, filesize, reset = false) {
    console.count('update_progress_details')


    let my_transfer = transfer_progress.find(tr => tr.transfer_id == transfer.id);

    // if no transfer progress stored create it
    if (my_transfer === undefined) {
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

        transfer_progress.push(my_transfer)
    }

    let selected_row = my_transfer.rows.find(row => row.id == table_row.id)

    selected_row.progress += (filesize / selected_row.size * 100)
    selected_row.count++

    // workaround - disable duplicate upload progress error
    if (selected_row.progress <= 100.5) {
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
    
        let transfer_copy = Helper.copy_obj(db_transfer);
        let tbl_row = transfer_copy.table_rows.find(t_row => t_row.id === table_row.id);

        if (tbl_row) {
            tbl_row.progress = 100;
            await db_uploads._replaceDoc(transfer.id, transfer_copy);
            selected_row.db = 1
        }
    }

    // console_red('transfer_progress', transfer_progress)

    /*
    return;

    

    */
}

async function update_progress_details_OLD(transfer_id, table_row, filesize) {
    console.count('update_progress_details')

    let db_transfer = await db_uploads._getById(transfer_id);
    
    let transfer = Helper.copy_obj(db_transfer);
    let tbl_row = transfer.table_rows.find(t_row => t_row.id === table_row.id);

    new_progress = filesize / tbl_row.size * 100

    if (tbl_row) {
        tbl_row.progress += new_progress;
        //summary_log_update(transfer_id, 'tbl_row', new_progress)

        await db_uploads._replaceDoc(transfer_id, transfer);

        ipc.send('progress_cell', {
            table: '#upload-details-table',
            id: tbl_row.id,
            field: "progress",
            value: tbl_row.progress
        });
    }
}

async function update_upload_table(transfer_id, table_row_id, new_progress) {
    console.count('update_upload_table')

    ipc.send('progress_cell', {
        table: '#upload-details-table',
        id: table_row_id,
        field: "progress",
        value: new_progress
    });

    let db_transfer = await db_uploads._getById(transfer_id);
    let transfer = Helper.copy_obj(db_transfer);
    let tbl_row = transfer.table_rows.find(t_row => t_row.id === table_row_id);

    if (tbl_row) {
        tbl_row.progress = new_progress;
        //summary_log_update(transfer_id, 'tbl_row', new_progress)

        await db_uploads._replaceDoc(transfer_id, transfer);
    }
}



window.onerror = function (errorMsg, url, lineNumber) {
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


function emptyObject(myObj) {
    return JSON.stringify(myObj) === '{}'
}




function _time_offset(start_time) {
    return ((performance.now() - start_time) / 1000).toFixed(2);
}




