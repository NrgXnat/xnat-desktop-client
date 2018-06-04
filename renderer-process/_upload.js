const fs = require('fs');
const fx = require('mkdir-recursive');
const path = require('path');
const axios = require('axios');
require('promise.prototype.finally').shim();
const settings = require('electron-settings');
const ipc = require('electron').ipcRenderer;

const filesize = require('filesize');

const remote = require('electron').remote;

const mizer = require('../mizer');

const archiver = require('archiver');

let summary_all = {};


let _queue_ = {
    items: [],
    max_items: 2,
    add: function(transfer_id, series_id) {
        if (this.items.length < this.max_items) {
            let transfer_label = transfer_id + '::' + series_id;
            if (this.items.indexOf(transfer_label) == -1) {
                console_log('Added to queue ' + transfer_label);
                this.items.push(transfer_label);
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
    }
}

if (!store.has('transfers.uploads')) {
    store.set('transfers.uploads', []);
}


let transfering = false;

console_log(__filename);
//ipc.send('log', store.getAll())
do_transfer()

function console_log(log_this) {
    console.log(log_this);
    ipc.send('log', log_this);
}


ipc.on('start_upload',function(e, item){
    setTimeout(do_transfer, 200);
    //do_transfer();
});


function do_transfer() {
    if (transfering) {
        return;
    }
    //transfering = true;

    let my_transfers = store.get('transfers.uploads');

    console_log(my_transfers); 
    
    my_transfers.forEach(function(transfer) {
        console_log(transfer);
        
        if (typeof transfer.status == 'number') {
            if (transfer.series_ids.length) {
                transfer.series_ids.forEach(function(series_id){
                    if (_queue_.add(transfer.id, series_id)) {
                        doUpload(transfer, series_id);
                    }
                })
            }
        }
    });

}


function doUpload(transfer, series_id) {
    let xnat_server = transfer.xnat_server, 
        user_auth = transfer.user_auth, 
        csrfToken = transfer.csrfToken;

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
    
    update_transfer_summary(transfer.id, 'total_files', _files.length);
    update_transfer_summary(transfer.id, 'total_size', total_size);

    let contexts, variables;
    mizer.get_mizer_scripts(xnat_server, user_auth, project_id).then(scripts => {
        console_log(scripts);

        contexts = mizer.getScriptContexts(scripts);
        console_log('******************************************');
        console_log(contexts);
        console_log('******************************************');

        
        // Get all of the user-entered values from the UI.
        // let anonValues = {
        //     session: '1DARKO2',
        //     subject: '2DARKO',
        //     foo: 'my-fooDARKO',
        //     project: 'project-Darko',
        //     mile: 'mile-DARKO'
        // };
        // console_log(anonValues);
        console_log(transfer.anon_variables);

        // Convert the JS map anonValues into a Java Properties object.
        variables = mizer.getVariables(transfer.anon_variables);
        //console_log('variables', variables);


        copy_and_anonymize(transfer.id, _files, contexts, variables).then((res) => {
            //summary_add(transfer.id, series_id, res.directory, 'Anonymization dir');
            //summary_add(transfer.id, series_id, res.copy_success.length, 'Anonymized files');
            //summary_add(transfer.id, series_id, res.copy_error.length, 'Anonymization errors');

            update_transfer_summary(transfer.id, 'anon_files', res.copy_success.length);
            if (res.copy_error.length) {
                update_transfer_summary(transfer.id, 'anon_errors', res.copy_error);
            }
    
            // todo add additional logic for errors
            if (res.copy_error.length == 0) {
                zip_and_upload(res.directory, res.copy_success, transfer, series_id);
            } else {
                _queue_.remove(transfer.id, series_id);
    
                let error_file_list = '';
                for(let i = 0; i < res.copy_error.length; i++) {
                    error_file_list += res.copy_error[i].file + "\n * " + res.copy_error[i].error + "\n\n";
                }
    
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
    let _timer = performance.now();

    return new Promise(function(resolve, reject){
        let dicom_temp_folder_path = path.join(getUserHome(), 'DICOM_TEMP');

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
            }, files_processed = 0;
    
        filePaths.forEach(filePath => {
            const source = filePath;
            const target = path.join(new_dirpath, path.basename(filePath));
            const targetDir = path.parse(target)['dir'];
    
            
            // Make sure the target directory exists.
            if (!fs.existsSync(targetDir)) {
                console_log("An error occurred trying to create the directory " + targetDir);
                return;
            }
    
            let readStream = fs.createReadStream(source);
    
            readStream.once('error', (error) => {
                console_log(`An error occurred trying to copy the file ${source} to ${targetDir}`);
                console_log(error);
            });
    
            readStream.once('end', () => {
                //console.log(source, 'readStream:END event')
            });
    
            let writeStream = fs.createWriteStream(target);
    
            writeStream.on('finish', () => {
                files_processed++;

                //console_log(target)
                //console_log('writeStream:END event')
                //console_log(`Copied ${source} to ${targetDir}`);
    
                try {
                    //console_log('BEFORE ANON');
                    mizer.anonymize(target, contexts, variables);
                    //console_log('AFTER ANON');
                    
                    response.copy_success.push(target);

                    if (files_processed === filePaths.length) {
                        
                        let _time_took = ((performance.now() - _timer) / 1000).toFixed(2);
                        // summary_add(`${_time_took}sec`, 'Anonymization time');
                        update_transfer_summary(transfer_id, 'timer_cp_anon', _time_took);

                        resolve(response);
                    }
                } catch (error) {
                    console_log("An error occurred during anonymization: ");
                    console_log(error)

                    response.copy_error.push({
                        file: source,
                        error: error
                    });

                    if (files_processed === filePaths.length) {

                        let _time_took = ((performance.now() - _timer) / 1000).toFixed(2);
                        //summary_add(`${_time_took}sec`, 'Anonymization time');

                        resolve(response);
                    }
                }
            });
    
            readStream.pipe(writeStream);
        });
    
    });
    
}

function _time_offset(start_time) {
    return ((performance.now() - start_time) / 1000).toFixed(2);
}



function zip_and_upload(dirname, _files, transfer, series_id) {
    let zip_timer = performance.now();

    let url_data = transfer.url_data, 
        xnat_server = transfer.xnat_server, 
        user_auth = transfer.user_auth, 
        csrfToken = transfer.csrfToken, 
        transfer_id = transfer.id;


    let table_row_id = '0';
    transfer.table_rows.forEach(function(tbl_row) {
        if (tbl_row.series_id == series_id) {
            table_row_id = tbl_row.id;
        }
    })

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

            axios({
                method: 'post',
                url: xnat_server + `/data/services/import?import-handler=DICOM-zip&PROJECT_ID=${project_id}&SUBJECT_ID=${subject_id}&EXPT_LABEL=${expt_label}&rename=true&prevent_anon=true&prevent_auto_commit=true&SOURCE=uploader&autoArchive=AutoArchive` + '&XNAT_CSRF=' + csrfToken,
                auth: user_auth,
                onUploadProgress: function (progressEvent) {
                    // Do whatever you want with the native progress event
                    console.log('=======', progressEvent, '===========');
                    console.log(progressEvent.loaded, progressEvent.total);
                    //NProgress.set(progressEvent.loaded/progressEvent.total);

                    let new_progress = progressEvent.loaded / progressEvent.total * 100;
                    ipc.send('upload_progress', {
                        table: '#upload-details-table',
                        data: {
                            id: table_row_id,
                            row: {
                                progress: new_progress
                            }
                        }
                    });

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

                //console_log('---' + res.data + '---', res);
                
                let left_to_upload = mark_uploaded(transfer_id, series_id);


                if (left_to_upload === 0) {
                    console_log('COMMITING UPLOAD')

                    let commit_timer = performance.now();
                    let commit_url = xnat_server + $.trim(res.data) + '?action=commit&SOURCE=uploader' + '&XNAT_CSRF=' + csrfToken;
                
                    axios.post(commit_url, {
                        auth: user_auth
                    })
                    .then(commit_res => {
                        console_log(commit_res)
                        // let msg = `Session commited.`;
    
                        // dies with 301 // go to summary page
                        // SHOW SUCCESS MESSAGE
                    })
                    .catch(err => {
                        console_log(err);

                        /*
                        let opt = {
                            title: "Error",
                            text: `Session upload failed (with status code: ${err.response.status} - "${err.response.statusText}").`,
                            icon: "error"
                        };
    
                        if (err.response.status == 301) {
                            opt = {
                                title: "Success",
                                text: `Session commited (with status code: ${err.response.status} - "${err.response.statusText}").`,
                                icon: "success"
                            }
                        }
                        console_log(opt);
                        */

                        if (err.response.status != 301) {
                            update_transfer_summary(transfer.id, 'commit_errors', `Session upload failed (with status code: ${err.response.status} - "${err.response.statusText}").`);
                        }
                    })
                    .finally(() => {
                        let _time_took = ((performance.now() - commit_timer) / 1000).toFixed(2);
                        //summary_add(`${_time_took}sec`, 'COMMIT time');
                        update_transfer_summary(transfer.id, 'timer_commit', _time_took);
                    });
                }

            })
            .catch(err => {
                console_log(err);
                update_transfer_summary(transfer.id, 'upload_errors', Helper.errorMsg(err));
            })
            .finally(() => {
                let _time_took = ((performance.now() - upload_timer) / 1000).toFixed(2);
                //summary_add(transfer.id, series_id, `${_time_took}sec`, 'UPLOAD time');
                update_transfer_summary(transfer.id, 'timer_upload', _time_took);

                _queue_.remove(transfer_id, series_id);
                do_transfer();
            });
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
    let my_transfers = store.get('transfers.uploads');

    let left_to_upload = -1;

    // could be oprimized with for loop + continue
    my_transfers.forEach(function(transfer) {
        if (transfer.id === transfer_id) {
            let series_index = transfer.series_ids.indexOf(series_id);

            if (series_index >= 0) {
                transfer.series_ids.splice(series_index, 1);
            }

            let finished = transfer.table_rows.length - transfer.series_ids.length;
            let total = transfer.table_rows.length;
            let new_status = finished == total ? 'finished' : finished / total * 100

            transfer.status = new_status;

            if (transfer.status == 'finished') {
                Helper.notify(`Upload is finished. Session: ${transfer.session_data.studyDescription}`);
            }

            // progress UI
            ipc.send('upload_progress', {
                table: '#upload_monitor_table',
                data: {
                    id: transfer_id,
                    row: {
                        status: new_status
                    }
                }
            });

            left_to_upload = transfer.series_ids.length;
        }
    });

    store.set('transfers.uploads', my_transfers);

    return left_to_upload;
}

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

function update_transfer_summary(transfer_id, property, new_value) {
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

function update_upload_table(transfer_id, table_row_id, new_progress) {
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

    ipc.send('upload_progress', {
        table: '#upload-details-table',
        data: {
            id: session_id,
            row: {
                progress: current_progress
            }
        }
    });

}




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






