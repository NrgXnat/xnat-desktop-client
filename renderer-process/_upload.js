const fs = require('fs');
const fx = require('mkdir-recursive');
const path = require('path');
const axios = require('axios');
require('promise.prototype.finally').shim();
const settings = require('electron-settings');
const ipc = require('electron').ipcRenderer;

const filesize = require('filesize');

const remote = require('electron').remote;
const mainProcess = remote.require('./main.js');

const archiver = require('archiver');




if (!store.has('transfers.uploads')) {
    store.set('transfers.uploads', []);
}


let global_anon_script = '(0008,0070) := "Electron changed this"', project_anon_script;

let transfering = false;

console_log(__filename);
//ipc.send('log', store.getAll())


function console_log(log_this) {
    console.log(log_this);
    ipc.send('log', log_this);
}

ipc.on('start_upload',function(e, item){
    do_transfer();

});


function do_transfer() {
    if (transfering) {
        return;
    }
    //transfering = true;

    let my_transfers = store.get('transfers.uploads');

    console_log(my_transfers); return;

    let xnat_server, user_auth, manifest_urls, transfer_id;
    my_transfers.forEach(function(transfer) {
        console_log(transfer);
        transfer_id = transfer.id;
        xnat_server = transfer.server;
        user_auth = transfer.user_auth;
        manifest_urls = new Map();

        transfer.sessions.forEach(function(session){
            session.files.forEach(function(file){
                if (file.status === 0) {
                    manifest_urls.set(file.name, file.uri)
                }
            });
        });

        console_log(manifest_urls);
        console_log('===================');

        // start upload
        
    });  
}



function getUserHome() {
    return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

function copy_and_anonymize(filePaths) {
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
    
    
            console_log(source, target, targetDir);
            
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
                console_log(source, 'readStream:END event')
            });
    
            let writeStream = fs.createWriteStream(target);
    
            writeStream.on('finish', () => {
                files_processed++;

                console_log(target)
                console_log('writeStream:END event')
                console_log(`Copied ${source} to ${targetDir}`);
    
                try {
                    console_log('BEFORE ANON');
                    mainProcess.anonymize(target, global_anon_script);
                    console_log('AFTER ANON');
                    
                    response.copy_success.push(target);

                    if (files_processed === filePaths.length) {
                        
                        let _time_took = ((performance.now() - _timer) / 1000).toFixed(2);
                        // summary_add(`${_time_took}sec`, 'Anonymization time');

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



function zip_and_upload(dirname, _files, url_data) {
    let _timer = performance.now();

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
        let _time_took = ((performance.now() - _timer) / 1000).toFixed(2);
        //summary_add(`${_time_took}sec`, 'ZIP time');
        _timer = performance.now();

        console.log(archive.pointer() + ' total bytes');
        console.log('archiver has been finalized and the output file descriptor has closed.');

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
                    NProgress.set(progressEvent.loaded/progressEvent.total);
                },
                headers: {
                    'Content-Type': 'application/zip'
                },
                data: zip_content
            })
            .then(res => {
                fs.unlink(zip_path, (err) => {
                    if (err) throw err;
                    console.log(`-- ZIP file "${zip_path}" was deleted.`);
                });

                console.log('---' + res.data + '---', res);
                //let msg = `${_files.length} files were successfully uploaded.`;

                let commit_url = xnat_server + $.trim(res.data) + '?action=commit&SOURCE=uploader' + '&XNAT_CSRF=' + csrfToken;
                
                axios.post(commit_url, {
                    auth: user_auth
                })
                .then(commit_res => {
                    console.log(commit_res)
                    // let msg = `Session commited.`;

                    let _time_took = ((performance.now() - _timer) / 1000).toFixed(2);
                    //summary_add(`${_time_took}sec`, 'UPLOAD time');

                    // dies with 301 // go to summary page
                    // SHOW SUCCESS MESSAGE
                })
                .catch(err => {
                    let _time_took = ((performance.now() - _timer) / 1000).toFixed(2);
                    //summary_add(`${_time_took}sec`, 'UPLOAD time');

                    console_log(err);

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

                    // dies with 301
                    // swal(opt);
                });
                
            })
            .catch(err => {
                console_log(err)
            });
        });


    });

    // This event is fired when the data source is drained no matter what was the data source.
    // It is not part of this library but rather from the NodeJS Stream API.
    // @see: https://nodejs.org/api/stream.html#stream_event_end
    output.on('end', function () {
        console.log('Data has been drained');
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
            console_log(`-- File ${entry_data.name} was deleted.`);
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

function doUpload(url_data, session_id, series_ids) {
    let project_id = url_data.project_id;
    let subject_id = url_data.subject_id;
    let expt_label = url_data.expt_label;

    let _files = [];
    

    let total_size = 0;
    for (let i = 0; i < series_ids.length; i++) {
        let scan_series = session_map.get(session_id).scans.get(series_ids[i]);
        
        total_size = scan_series.reduce(function(prevVal, item) {
            return prevVal + item.filesize;
        }, total_size);

        let files = scan_series.map(function(item){
            return item.filepath;
        });
        _files = _files.concat(files);
    }

    summary_add(project_id, 'PROJECT_ID');
    summary_add(subject_id, 'SUBJECT_ID');
    summary_add(expt_label, 'EXPT_LABEL');
    summary_add(session_id, 'STUDY_ID');
    summary_add(series_ids.length, 'SCANS');
    summary_add(_files.length, 'FILES');
    summary_add(`${(total_size / 1024 / 1024).toFixed(2)}MB`, 'FILESIZE');

    console.log(_files);
    

    //swal(project_id + "\n" + subject_id + "\nFiles: " + _files.length);

    copy_and_anonymize(_files)
        .then((res) => {
            summary_add(res.directory, 'Anonymization dir');
            summary_add(res.copy_success.length, 'Anonymized files');
            summary_add(res.copy_error.length, 'Anonymization errors');

            // todo add additional logic for errors
            if (res.copy_error.length == 0) {
                zip_and_upload(res.directory, res.copy_success, url_data);
            } else {
                let error_file_list = '';
                for(let i = 0; i < res.copy_error.length; i++) {
                    error_file_list += res.copy_error[i].file + "\n * " + res.copy_error[i].error + "\n\n";
                }

                swal({
                    title: `Anonymization Error`,
                    text: `An error occured during anonymization of the folowing files: \n${error_file_list}`,
                    icon: "error",
                    dangerMode: true
                })
            }
        })
    
}

function mark_uploaded(transfer_id, uri) {
    let my_transfers = store.get('transfers.uploads');

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

    console_log(session_id, current_progress);

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

// ================================================================================
// ================================================================================
// ================================================================================

/*
get_global_anon_script().then(resp => {
    global_anon_script = resp.data.ResultSet.Result[0].contents;
    console_log(resp.data.ResultSet.Result[0].contents);
}).catch(handle_error);
*/

// global anon script
function get_global_anon_script(xnat_server) {
    return axios.get(xnat_server + '/data/config/anon/script?format=json', {
        auth: user_auth
    });
}

// TODO - doesn't work
function get_project_anon_script(xnat_server, project_id) {
    return axios.get(xnat_server + '/data/config/projects/'+project_id+'/anon/script?format=json', {
        auth: user_auth
    });
}


window.onerror = function (errorMsg, url, lineNumber) {
    console_log(__filename + ':: ' +  errorMsg);
    return false;
}