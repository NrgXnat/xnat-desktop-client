const fs = require('fs');
const fx = require('mkdir-recursive');
const path = require('path');
const axios = require('axios');
require('promise.prototype.finally').shim();
const settings = require('electron-settings');
const ipc = require('electron').ipcRenderer;

const filesize = require('filesize');

const remote = require('electron').remote;
const auth = require('../services/auth');

const mizer = require('../mizer');

const archiver = require('archiver');

const tempDir = require('temp-dir');

const { console_red } = require('../services/logger');

const db_uploads = require('electron').remote.require('./services/db/uploads')


let summary_log = {};

function summary_log_update(id, prop, val) {
    summary_log[id] = summary_log[id] || {}
    summary_log[id][prop] = summary_log[id][prop] || []

    summary_log[id][prop].push(val)

    console_red('summary_log_update', summary_log)

    db_uploads.updateProperty(id, 'summary', summary_log[id])
}

function ini_summary_log() {

}

function emptyObject(myObj) {
    return JSON.stringify(myObj) === '{}'
}


let summary_all = {};
let csrfToken;

if (!settings.has('global_pause')) {
    settings.set('global_pause', false);
}

let items_uploaded = []

let _queue_ = {
    items: [],
    max_items: 15,
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


let transfering = false;

console_log(__filename);


do_transfer();

// try {
//     do_transfer()
// } catch(err) {
//     console_log(err)
//     ipc.send('custom_error', 'Upload Error', err.message);
// }

setInterval(do_transfer, 1000000);


function console_log(...log_this) {
    //console.log(...log_this);
    //console.trace('<<<<== UPLOAD TRACE ==>>>>');
    ipc.send('log', ...log_this);
}


ipc.on('start_upload',function(e, item){
    setTimeout(do_transfer, 200);
});



function do_transfer() {
    let xnat_server = settings.get('xnat_server');

    let current_user_auth = auth.get_user_auth();
    let user_auth = settings.get('user_auth');

    let current_username = auth.get_current_user();

    db_uploads.listAll((err, my_transfers) => {
        console_red('db_uploads.listAll', {my_transfers})
    });

    if (settings.get('global_pause')) {
        return;
    }

    if (transfering) {
        return;
    }

    //let my_transfers = store.get('transfers.uploads'); 
    db_uploads.listAll((err, my_transfers) => {
        //console_red('REAL db_uploads.listAll', {my_transfers})

        my_transfers.forEach((transfer) => {
            // validate current user/server
            if (transfer.xnat_server === xnat_server 
                && transfer.user === current_username 
                && transfer.canceled !== true
            ) {
    
                if (typeof transfer.status == 'number') {
                    if (transfer.series_ids.length) {
                        transfer.series_ids.forEach((series_id) => {
                            if (_queue_.add(transfer.id, series_id)) {
                                doUpload(transfer, series_id);
                            }
                        })
                    }
                }
            }
            
        });
    })
    
    

}


async function doUpload(transfer, series_id) {
    let xnat_server = transfer.xnat_server, 
        user_auth = auth.get_user_auth();

    csrfToken = await auth.get_csrf_token(xnat_server, user_auth);
    

    let url_data = transfer.url_data;

    
    let project_id = url_data.project_id;
    let subject_id = url_data.subject_id;
    let expt_label = url_data.expt_label;

    let session_id = transfer.session_id; //STUDY_ID
    let series_ids = transfer.series_ids;
    

    let series_index = -1;
    for (let i = 0; i < transfer.series.length; i++) {
        if (series_id === transfer.series[i][0].seriesInstanceUid) {
            series_index = i;
            break;
        }
    }

    let _files = [];
    let total_size = 0;
    if (series_index > -1) {
        transfer.series.forEach(function(series, index){
            _files = transfer.series[series_index].map(function(item){
                return item.filepath;
            });

            total_size = transfer.series[series_index].reduce(function(prevVal, item) {
                return prevVal + item.filesize;
            }, 0);
        })
    }

    console_red('uploading series index', series_index);
    
    update_transfer_summary(transfer.id, 'total_files', _files.length);
    update_transfer_summary(transfer.id, 'total_size', total_size);

    let contexts, variables;
    mizer.get_mizer_scripts(xnat_server, user_auth, project_id).then(scripts => {
        console_log(scripts);

        contexts = mizer.getScriptContexts(scripts);

        // Convert the JS map anonValues into a Java Properties object.
        variables = mizer.getVariables(transfer.anon_variables);
        console_log(variables);

        copy_and_anonymize(transfer.id, _files, contexts, variables).then((res) => {
            return;

            update_transfer_summary(transfer.id, 'anon_files', res.copy_success.length);
            if (res.copy_error.length) {
                update_transfer_summary(transfer.id, 'anon_errors', res.copy_error);
            }
    
            // todo add additional logic for errors
            if (res.copy_error.length == 0) {
                zip_and_upload(res.directory, res.copy_success, transfer, series_id, csrfToken);
            } else {
                _queue_.remove(transfer.id, series_id);
    
                let error_file_list = '';
                for(let i = 0; i < res.copy_error.length; i++) {
                    error_file_list += res.copy_error[i].file + "\n * " + res.copy_error[i].error + "\n\n";
                }

                console_log(`---- error_file_list: ${error_file_list}`);
    
                // swal({
                //     title: `Anonymization Error`,
                //     text: `An error occured during anonymization of the folowing files: \n${error_file_list}`,
                //     icon: "error",
                //     dangerMode: true
                // })
            }
        })
    }).catch(function(error) {
        console_log(error);
    });
    
    
}




function getUserHome() {
    return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}


function copy_and_anonymize(transfer_id, filePaths, contexts, variables) {
    console_red('copy_and_anonymize')
    let _timer = performance.now();

    return new Promise(function(resolve, reject){
        //let dicom_temp_folder_path = path.join(getUserHome(), 'DICOM_TEMP');
        let dicom_temp_folder_path = path.resolve(tempDir, '_xdc_temp');

        if (!fs.existsSync(dicom_temp_folder_path)) {
            fs.mkdirSync(dicom_temp_folder_path);
        }
        

        let new_dirname = 'dir_' + new Date() / 1; // eg. dir_1522274921704
        let new_dirpath = path.join(dicom_temp_folder_path, new_dirname);
    
        fs.mkdirSync(new_dirpath);
    
        let response = {
                directory: new_dirpath,
                copy_success: [],
                copy_error: []
        }, 
        files_processed = 0, 
        copy_errors = [];


        // ============================================
        // ============================================
        // group paths in batches which are sequetially parsed
        if (false) {
            const filePathsBatches = Helper.arrayBatch(filePaths, 4);

            const funcs_batch = filePathsBatches.map(filePathsBatch => () => {
                const promise_batch = filePathsBatch.map(filePath => new Promise((resolve, reject) => {
                    const source = filePath;
                    const target = path.join(new_dirpath, path.basename(filePath));
                    const targetDir = path.parse(target)['dir'];
            
                    let readStream = fs.createReadStream(source);
                    
                    /*
                    // TODO: REFACTOR
                    // Make sure the target directory exists.
                    if (!fs.existsSync(targetDir)) {
                        console_log("An error occurred trying to create the directory " + targetDir);
                        return;
                    }
                    
                    readStream.once('error', (error) => {
                        console_log(`An error occurred trying to copy the file ${source} to ${targetDir}`);
                        console_log(error);
                    });
            
                    readStream.once('end', () => {
                        //console.log(source, 'readStream:END event')
                    });
                    */
            
                    let writeStream = fs.createWriteStream(target);
            
                    writeStream.on('finish', () => {
                        try {
                            mizer.anonymize(target, contexts, variables);
                            console.count('anonymized')
                            
                            response.copy_success.push(target);
                            resolve(true);
                            
                        } catch (error) {
                            console.count('anonymization ERROR')
        
                            response.copy_success.push(target);
                            copy_errors.push({
                                file: source,
                                error: error
                            })
                            /*
                            response.copy_error.push({
                                file: source,
                                error: error
                            });
                            */
        
                            resolve(false);
                        }
                    });
            
                    readStream.pipe(writeStream);
                }));
                
                return Promise.all(promise_batch).then(function(values) {
                    return values;
                });
            });


            // execute Promises in serial
            Helper.promiseSerial(funcs_batch).then((resp) => {
                console_red('anon finished', {response, copy_errors})
                resolve(response)
            });
        }
        

        if (true) {
            const funcs = filePaths.map(filePath => () => new Promise((resolve, reject) => {
                const source = filePath;
                const target = path.join(new_dirpath, path.basename(filePath));
                const targetDir = path.parse(target)['dir'];
        
                let readStream = fs.createReadStream(source);
                
                /*
                // TODO: REFACTOR
                // Make sure the target directory exists.
                if (!fs.existsSync(targetDir)) {
                    console_log("An error occurred trying to create the directory " + targetDir);
                    return;
                }
                
                readStream.once('error', (error) => {
                    console_log(`An error occurred trying to copy the file ${source} to ${targetDir}`);
                    console_log(error);
                });
        
                readStream.once('end', () => {
                    //console.log(source, 'readStream:END event')
                });
                */
        
                let writeStream = fs.createWriteStream(target);
        
                writeStream.on('finish', () => {
                    try {
                        mizer.anonymize(target, contexts, variables);
                        console.count('anonymized')
                        
                        response.copy_success.push(target);
                        resolve(true);
                        
                    } catch (error) {
                        console.count('anonymization ERROR')
    
                        response.copy_success.push(target);
                        copy_errors.push({
                            file: source,
                            error: error
                        })
                        /*
                        response.copy_error.push({
                            file: source,
                            error: error
                        });
                        */
    
                        resolve(false);
                    }
                });
        
                readStream.pipe(writeStream);
            }));
    
            // execute Promises in serial
            Helper.promiseSerial(funcs).then((resp) => {
                console_red('anon finished', {response, copy_errors})
                resolve(response)
            });
        }
    
    });
    
}

function _time_offset(start_time) {
    return ((performance.now() - start_time) / 1000).toFixed(2);
}



function zip_and_upload(dirname, _files, transfer, series_id, csrfToken) {
    console.count('zip_and_upload')
    let zip_timer = performance.now();

    let url_data = transfer.url_data, 
        xnat_server = transfer.xnat_server, 
        user_auth = auth.get_user_auth(), 
        transfer_id = transfer.id;

    let table_row_id = '0';
    transfer.table_rows.forEach(function(tbl_row) {
        if (tbl_row.series_id == series_id) {
            table_row_id = tbl_row.id;
        }
    });

    console_log('************** table_row_id ****************************');
    console_log(table_row_id);
    console_log('******************************************');

    let zipped_count = 0;

    let project_id = url_data.project_id;
    let subject_id = url_data.subject_id;
    let expt_label = url_data.expt_label;
    
    // **********************************************************
    // create a file to stream archive data to.
    let zip_path = path.join(dirname, 'file_' + Math.random() + '.zip');
    
    var output = fs.createWriteStream(zip_path);
    var archive = archiver('zip', {
        zlib: { level: 9 } // Sets the compression level.
    });

    // listen for all archive data to be written
    // 'close' event is fired only when a file descriptor is involved
    output.on('close', function () {
        let _time_took = ((performance.now() - zip_timer) / 1000).toFixed(2);
        //summary_add(`${_time_took}sec`, 'ZIP time');
        update_transfer_summary(transfer.id, 'timer_zip', _time_took);


        let upload_timer = performance.now();

        console_log(archive.pointer() + ' total bytes');
        console_log('archiver has been finalized and the output file descriptor was closed.');

        fs.readFile(zip_path, (err, zip_content) => {
            if (err) throw err;
            console_red('Commit url 1', xnat_server + `/data/services/import?import-handler=DICOM-zip&PROJECT_ID=${project_id}&SUBJECT_ID=${subject_id}&EXPT_LABEL=${expt_label}&rename=true&prevent_anon=true&prevent_auto_commit=true&SOURCE=uploader&autoArchive=AutoArchive` + '&XNAT_CSRF=' + csrfToken);
            
            // console_log('**************************** ZIP CONTENT '+zip_content.length+' ***************************');


            axios({
                method: 'POST',
                url: xnat_server + `/data/services/import?import-handler=DICOM-zip&PROJECT_ID=${project_id}&SUBJECT_ID=${subject_id}&EXPT_LABEL=${expt_label}&rename=true&prevent_anon=true&prevent_auto_commit=true&SOURCE=uploader&autoArchive=AutoArchive` + '&XNAT_CSRF=' + csrfToken,
                auth: user_auth,
                onUploadProgress: function (progressEvent) {
                    // Do whatever you want with the native progress event
                    //console_log('=======', progressEvent, '===========');
                    //console_log(progressEvent.loaded, progressEvent.total);

                    let new_progress = progressEvent.loaded / progressEvent.total * 100;

                    update_upload_table(transfer_id, table_row_id, new_progress);

                },
                headers: {
                    'Content-Type': 'application/zip'
                },
                data: zip_content
            })
            .then(res => {
                fs.unlink(zip_path, (err) => {
                    if (err) throw err;
                    //console_log(`-- ZIP file "${zip_path}" was deleted.`);
                });


                mark_uploaded(transfer_id, series_id)
                .then(transfer => {
                    console_red('mark_uploaded.then()', {series_id, transfer})

                    if (transfer.series_ids.length === 0) {
                        console_log(`**** COMMITING UPLOAD ${transfer_id} :: ${series_id}`);
                        console_log(`***** res.statusText  = '${res.statusText }' ******`);
                        console_log(`***** res.data = '${res.data}' ******`);
                        console_log('***** res.status = ' + res.status + ' ****** (' + (typeof res.status) + ')');
    
                        let session_link;
                        let reference_str = '/data/prearchive/projects/';
                        
                        let commit_timer = performance.now();
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
                                
                                //update_transfer_data(transfer.id, 'session_link', session_link);
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
                                
                                //update_transfer_data(transfer.id, 'session_link', session_link);
                                db_uploads.updateProperty(transfer.id, 'session_link', session_link)
                            }
                        })
                        .finally(() => {
                            let _time_took = ((performance.now() - commit_timer) / 1000).toFixed(2);
                            update_transfer_summary(transfer.id, 'timer_commit', _time_took);
                        });
                    }
                })
                .finally(() => {
                    remove_from_queue_and_respawn(transfer_id, series_id)
                });

                (function() {
                /*
                if (left_to_upload === 0) {
                    console_log(`**** COMMITING UPLOAD ${transfer_id} :: ${series_id}`);
                    console_log(`***** res.statusText  = '${res.statusText }' ******`);
                    console_log(`***** res.data = '${res.data}' ******`);
                    console_log('***** res.status = ' + res.status + ' ****** (' + (typeof res.status) + ')');

                    let session_link;
                    let reference_str = '/data/prearchive/projects/';
                    
                    
                    let commit_timer = performance.now();
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
                            update_transfer_data(transfer.id, 'session_link', session_link);
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
                            update_transfer_data(transfer.id, 'session_link', session_link);
                        }
                    })
                    .finally(() => {
                        let _time_took = ((performance.now() - commit_timer) / 1000).toFixed(2);
                        //summary_add(`${_time_took}sec`, 'COMMIT time');
                        update_transfer_summary(transfer.id, 'timer_commit', _time_took);
                    });
                }
                */

                })

            })
            .catch(err => {
                console_red('upload error', err);
                update_transfer_summary(transfer.id, 'upload_errors', Helper.errorMessage(err), function() {
                    remove_from_queue_and_respawn(transfer_id, series_id)
                });

            });

            function remove_from_queue_and_respawn(transfer_id, series_id) {
                console_red('remove_from_queue_and_respawn', {transfer_id, series_id})
                let _time_took = ((performance.now() - upload_timer) / 1000).toFixed(2);

                update_transfer_summary(transfer_id, 'timer_upload', _time_took, function() {
                    _queue_.remove(transfer_id, series_id);
                    do_transfer();
                });
            }
            
        });

    });

    // This event is fired when the data source is drained no matter what was the data source.
    // It is not part of this library but rather from the NodeJS Stream API.
    // @see: https://nodejs.org/api/stream.html#stream_event_end
    output.on('end', function () {
        console_log('Data has been drained');
    });

    // good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive.on('warning', function (err) {
        if (err.code === 'ENOENT') {
            // log warning
        } else {
            // throw error
            throw err;
        }
    });

    // good practice to catch this error explicitly
    archive.on('error', function (err) {
        _queue_.remove(transfer_id, series_id);
        throw err;
    });

    archive.on('entry', function (entry_data){
        zipped_count++;

        if (zipped_count == _files.length) {
            //NProgress.done();
        } else {
            //NProgress.set(zipped_count/_files.length);
        }

        fs.unlink(entry_data.sourcePath, (err) => {
            if (err) throw err;
            //console_log(`-- File ${entry_data.name} was deleted.`);
        });
        
    })

    // pipe archive data to the file
    archive.pipe(output);


    for (let i = 0; i < _files.length; i++) {
        archive.file(_files[i], { name: path.basename(_files[i]) });
    }

    // finalize the archive (ie we are done appending files but streams have to finish yet)
    // 'close', 'end' or 'finish' may be fired right after calling this method so register to them beforehand
    archive.finalize();
    // **********************************************************
}



function mark_uploaded(transfer_id, series_id) {
    console.count('mark_uploaded')
    console.count('mark_uploaded__' + series_id)
    return new Promise((resolve, reject) => {
        db_uploads.getById(transfer_id, (err, db_transfer) => {
            // copy the response
            var transfer = JSON.parse(JSON.stringify(db_transfer));

            let series_index = transfer.series_ids.indexOf(series_id);

            if (series_index >= 0) {
                transfer.series_ids.splice(series_index, 1);
            }
    
            let finished = transfer.table_rows.length - transfer.series_ids.length;
            let total = transfer.table_rows.length;
            let new_status = finished == total ? 'finished' : finished / total * 100
    
            transfer.status = new_status;
    
            if (transfer.status == 'finished') {
                Helper.notify(`Upload is finished. Session: ${transfer.url_data.expt_label}`); // session label
            }
    
            ipc.send('progress_cell', {
                table: '#upload_monitor_table',
                id: transfer_id,
                field: "status",
                value: new_status
            });
    
            db_uploads.replaceDoc(transfer_id, transfer, (err, nume) => {
                resolve(transfer);
            });
    
            // left_to_upload = transfer.series_ids.length;
            
        })
    })
}

/*
function summary_commit(transfer_id, series_id) {
    let my_transfers = store.get('transfers.uploads');

    let left_to_upload = -1;

    // could be oprimized with for loop + continue
    my_transfers.forEach(function(transfer) {
        if (transfer.id === transfer_id) {
            if (transfer.summary === undefined) {
                transfer.summary = [];
            }

            transfer.summary[series_id] = summary_all[transfer_id][series_id];
        }
    });

    store.set('transfers.uploads', my_transfers);
}
*/
/*
function update_transfer_data(transfer_id, property, new_value) {
    let my_transfers = store.get('transfers.uploads');

    for (let i = 0; i < my_transfers.length; i++) {
        if (my_transfers[i].id === transfer_id) {
            my_transfers[i][property] = new_value;
            break;
        }
    }

    store.set('transfers.uploads', my_transfers);
}
*/

async function update_transfer_summary__OLD(transfer_id, property, new_value, callback = false) {
    await db_uploads.getById(transfer_id, (err, db_transfer) => {
        summary_log_update(transfer_id, property, new_value)
        var transfer = JSON.parse(JSON.stringify(db_transfer));

        transfer.summary = transfer.summary || {}
        transfer.summary[property] = transfer.summary[property] || []

        console_red('update_transfer_summary BEFORE', {transfer})
        transfer.summary[property].push(new_value)
        console_red('update_transfer_summary AFTER', {transfer})

        db_uploads.replaceDoc(transfer_id, transfer);
    })

    if (callback) {
        callback()
    }
}


async function update_transfer_summary(transfer_id, property, new_value, callback = false) {
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

/*
function update_transfer_summary__old(transfer_id, property, new_value) {
    let my_transfers = store.get('transfers.uploads');

    for (let i = 0; i < my_transfers.length; i++) {
        if (my_transfers[i].id === transfer_id) {
            if (my_transfers[i].summary === undefined) {
                my_transfers[i].summary = {};
            }

            if (my_transfers[i].summary[property] === undefined) {
                my_transfers[i].summary[property] = [];
            }

            my_transfers[i].summary[property].push(new_value);
            break;
        }
    }

    store.set('transfers.uploads', my_transfers);
}
*/

function update_upload_table__OLD(transfer_id, table_row_id, new_progress) {
    console.count('update_upload_table')

    ipc.send('progress_cell', {
        table: '#upload-details-table',
        id: table_row_id,
        field: "progress",
        value: new_progress
    });

    db_uploads.getById(transfer_id, (err, transfer) => {
        let tbl_row = transfer.table_rows.find(t_row => t_row.id === table_row_id);

        if (tbl_row) {
            tbl_row.progress = new_progress;
            db_uploads.replaceDoc(transfer_id, transfer);
        }
    })
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
    let transfer = JSON.parse(JSON.stringify(db_transfer));
    let tbl_row = transfer.table_rows.find(t_row => t_row.id === table_row_id);

    if (tbl_row) {
        tbl_row.progress = new_progress;
        //summary_log_update(transfer_id, 'tbl_row', new_progress)

        await db_uploads._replaceDoc(transfer_id, transfer);
    }
}

/*
function update_upload_table__old(transfer_id, table_row_id, new_progress) {
    let my_transfers = store.get('transfers.uploads');

    // could be oprimized with for loop + continue
    my_transfers.forEach(function(transfer) {
        if (transfer.id === transfer_id) {
            transfer.table_rows.forEach(function(tbl_row){
                if (tbl_row.id === table_row_id) {
                    tbl_row.progress = new_progress;
                }
            });
        }
    });

    store.set('transfers.uploads', my_transfers);
}
*/

/*
function update_modal_ui(transfer_id, uri) {
    let my_transfers = store.get('transfers.uploads');

    let transfer_index, session_index;
    for (let i = 0; i < my_transfers.length; i++) {
        if (my_transfers[i].id === transfer_id) {
            transfer_index = i;

            for (let j = 0; j < my_transfers[i].sessions.length; j++) {
                for (let k = 0; k < my_transfers[i].sessions[j].files.length; k++) {
                    if (my_transfers[i].sessions[j].files[k].uri === uri) {
                        session_index = j;
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

    let current_progress = 0;
    my_transfers[transfer_index].sessions[session_index].files.forEach(function(file){
        current_progress += file.status;
    });

    let session_id = my_transfers[transfer_index].sessions[session_index].id;

    // console.log(session_id, current_progress);

    // ipc.send('upload_progress', {
    //     table: '#upload-details-table',
    //     data: {
    //         id: session_id,
    //         row: {
    //             progress: current_progress
    //         }
    //     }
    // });

    ipc.send('progress_cell', {
        table: '#upload-details-table',
        id: session_id,
        field: "progress",
        value: current_progress
    });

}
*/



window.onerror = function (errorMsg, url, lineNumber) {
    console_log('[ERRORRR]:: ' +__filename + ':: ' +  errorMsg);
    return false;
}

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






