const electron = require('electron');
const { ipcRenderer, remote } = electron;
const fs = require('fs');
const fx = require('mkdir-recursive');
const path = require('path');
const axios = require('axios');
const httpAdapter = require('axios/lib/adapters/http');
const https = require('https');
const isRetryAllowed = require('is-retry-allowed');
const progressStream = require('progress-stream');
const { Throttle } = require('stream-throttle')
require('promise.prototype.finally').shim();

// const ElectronStore = require('electron-store');
// const settings = new ElectronStore();

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

// const { copy_anonymize_stream } = require('../services/upload/copy_anonymize_stream');
const { file_checksum, uuidv4, isEmptyObject, promiseSerial, arrayUnique, isDevEnv, currentVersionChannel, getFilesizeInBytes } = require('../services/app_utils')
const { MizerError } = require('../services/errors');

const CONSTANTS = require('../services/constants');
const rimraf = require('rimraf');

let summary_log = {};
let transfer_progress = [];
let userAgentString = remote.getCurrentWindow().webContents.getUserAgent();

// let { _queue_ } = remote.require('./services/_queue_')
let { _queue_ } = remote.getGlobal('shared');
let globalWindows = remote.getGlobal('windows');


const dom_context = '#upload-single';
const { $$, $on } = require('./../services/selector_factory')(dom_context)


let logger_enabled = isDevEnv() || ['alpha', 'beta'].includes(currentVersionChannel())

function console_log(...log_this) {
    if (!logger_enabled) {
        return;
    }

    electron_log.info(...log_this);
    console.log(...log_this);
    //console.trace('<<<<== UPLOAD TRACE ==>>>>');
    ipcRenderer.send('log', ...log_this);
}



console_log({logger_enabled});

let WINDOW_ID = null;

/**
 * // array
 * cancel_tokens = [
 *      {
 *          transfer_id: ... , // int
 *          series_id: ... , // string
 *          segment_index: ..., int
 *          cancel: ... // function
 *      },
 *      
 *      ...
 * ]
 */

let cancel_tokens = [];

const remove_cancel_token = (transfer_id, series_id = false, segment_index = false) => {
    console_red('remove_cancel_token::BEFORE', {cancel_tokens})
    cancel_tokens = cancel_tokens.filter(ct => {
        if (series_id === false) {
            return ct.transfer_id !== transfer_id
        } else if (segment_index === false) {
            return ct.transfer_id !== transfer_id || ct.series_id !== series_id
        } else {
            return ct.transfer_id !== transfer_id || ct.series_id !== series_id || ct.segment_index !== segment_index
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

ipcRenderer.on('set_window_id',function(e, upload_window_id){
    console_red('ipcRenderer.on :: set_window_id');
    WINDOW_ID = upload_window_id

    $$('#window_id').text(WINDOW_ID)
})

let uploadStartTimer;

ipcRenderer.on('single_upload_data', async function(e, transfer, series_id, segment_index) {
    console_red('ipcRenderer.on :: single_upload_data');

    electron_log.info(`FROM SINGLE UPLOAD (window: ${WINDOW_ID})`, `${transfer.id}::${series_id}||${segment_index}`)
    
    console_log({
        transfer_id: transfer.id, series_id, segment_index
    })
    
    let transfer_copy = await db_uploads._getByIdCopy(transfer.id)

    if (transfer_copy !== null) {
        uploadStartTimer = performance.now()
        
        const window = remote.getCurrentWindow()
        globalWindows.add(window.id)

        doUpload(transfer_copy, series_id, segment_index)
    } else {
        electron_log.error(`FROM SINGLE UPLOAD (window: ${WINDOW_ID})`, `transfer_copy IS NULL`)
        closeThisWindow()
    }
})

ipcRenderer.on('cancel_upload', function(e, transfer_id){
    console_red('ipcRenderer.on :: cancel_upload', transfer_id);
    execute_cancel_token(transfer_id)
});

const checksumIndex = []

let csrfToken;

// =========================
async function doUpload(transfer, series_id, segment_index) {
    console_red('uploading_segment_id', `${transfer.id}::${series_id}||${segment_index}`);

    let xnat_server = transfer.xnat_server, 
        project_id = transfer.url_data.project_id,
        user_auth = auth.get_user_auth();

    csrfToken = await auth.get_csrf_token(xnat_server, user_auth);

    // TODO (SINGLE UPLOAD) - FIX THIS
    if (csrfToken === false) {
        _queue_.remove_many(transfer.id);
        execute_cancel_token(transfer.id);
        
        ipcRenderer.send('force_reauthenticate', auth.current_login_data());
        return;
    }

    let updated_summary = await set_transfer_totals_summary(transfer)
    
    const selectedSeriesIndex = transfer.series.findIndex(ss => series_id === ss.seriesInstanceUid);
    const selected_series = transfer.series[selectedSeriesIndex]

    if (!selected_series) {
        //TODO - add logic if series doesn't exist
        // prob - remove from queue and return
    }

    
    let filepath_index = selected_series.dataIndex.indexOf('filepath')
    let _files = selected_series.data.map((fileInfo, dataIndex) => {
        return {
            transfer_id: transfer.id,
            series_index: selectedSeriesIndex,
            data_index: dataIndex,
            source: selected_series.commonPath + fileInfo[filepath_index]
        }
    })


    let fstart = selected_series.segments[segment_index].start
    let fend = fstart + selected_series.segments[segment_index].size
    _files = _files.slice(fstart, fend)

    console_red('FILES FOR UPLOAD:', _files.length)

    let contexts, variables;
    
    //mizer.get_mizer_scripts(xnat_server, user_auth, project_id)
    const xnat_api = new XNATAPI(xnat_server, user_auth);
    xnat_api.anon_scripts(project_id)
    .then(scripts => {
        // console_log(scripts);

        let pixel_anon_series = transfer.pixel_anon ? transfer.pixel_anon.find(sd => series_id === sd.series_id) : false
        if (pixel_anon_series) {
            let series_script = mizer.generateAlterPixelCode(pixel_anon_series.rectangles);
            if (series_script.length) {
                scripts.push(series_script)
                console_log('************** AFTER ======');
                scripts.forEach(scr => {
                    console_log(scr);
                })
                
            }
        }

        contexts = mizer.getScriptContexts(scripts);

        // Convert the JS map anonValues into a Java Properties object.
        variables = mizer.getVariables(transfer.anon_variables);
        // console_log(variables);

        console.log({transfer, series_id, segment_index, _files, contexts, variables, csrfToken});

        copy_and_anonymize(transfer, series_id, segment_index, _files, contexts, variables, csrfToken)
    })
    .catch(function(error) {
        electron_log.error(error);
        nedb_logger.error(transfer.id, 'upload', `[${remote.getCurrentWindow().id}: ]` + error.message, error);
        console_log(error); // Test with throwing random errors (and rejecting promises)
    });
}

function set_transfer_totals_summary(transfer) {
    if (!transfer.summary || isEmptyObject(transfer.summary)) {

        let total_files = transfer.series.reduce((total, ss) => {
            return ss.data.length + total
        }, 0);
    
        let total_size = transfer.series.reduce((total, ss) => {
            let filesize_index = ss.dataIndex.indexOf('filesize')

            let series_size = ss.data.reduce((tt, item) => {
                return tt + item[filesize_index];
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

async function copy_and_anonymize(transfer, series_id, segment_index, filePaths, contexts, variables, csrfToken) {
    const upload_id = uuidv4()
    // console_red('copy_and_anonymize')
    let _timer = performance.now();

    let selected_series = transfer.series.find(ss => series_id === ss.seriesInstanceUid);


    let xnat_server = transfer.xnat_server, 
        user_auth = auth.get_user_auth(),
        table_row = transfer.table_rows.find(tbl_row => tbl_row.series_id == series_id);

    const xnat_api = new XNATAPI(xnat_server, user_auth);

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
        electron_log.error(err)
        // throw err;
    });
    
    // good practice to catch this error explicitly
    archive.on('error', function (err) {
        console_red('anon archiver error', err)
        electron_log.error(err)
        // throw err;
    });
    
    // Fires when the entry's input has been processed and appended to the archive.
    archive.on('entry', async (entry_data) => {
        fs.unlink(entry_data.sourcePath, (err) => {
            if (err) {
                electron_log.error(err)
                nedb_logger.error(transfer.id, 'upload', err.message, err);
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

    const prog = progressStream({
        time: 1000,
        length: selected_series.segments[segment_index].bytes
    });
    // Add a 'progress' event listener to the progress object
    prog.on('progress', async function(progress) {
        let _transfer = await db_uploads._getByIdCopy(transfer.id);

        sendMonitorTableUpdate(_transfer, progress.transferred)
        // sendDetailsTableUpdate(_transfer, series_id, progress.transferred)
        sendDetailsTableUpdate(_transfer, series_id, progress.transferred, progress)

        console_red('Progress transferred:', progress.transferred);
        console_red('Progress speed:', progress.speed);
        console_red('Progress %:', progress.percentage);
        console_red('Progress runtime:', progress.runtime);
    });

    let CancelToken = axios.CancelToken;
    let request_settings = {
        method: 'post',
        url: xnat_server + `/data/services/import?import-handler=DICOM-zip&PROJECT_ID=${project_id}&SUBJECT_ID=${subject_id}&EXPT_LABEL=${expt_label}${qs}&overwrite=${overwrite}&rename=true&prevent_anon=true&prevent_auto_commit=true&SOURCE=uploader&autoArchive=AutoArchive` + '&XNAT_CSRF=' + csrfToken,
        //url: 'http://localhost:3007',
        adapter: httpAdapter,
        auth: user_auth,
        maxContentLength: (1024 * 1024 * 1024 * 1024), // default 10MB - must be increased ~ 1TB
        maxRedirects: 0, // default 5, has to be 0 to avoid back pressure (RAM filling)
        headers: {
            'User-Agent': userAgentString,
            'Content-Type': 'application/zip',
            'Keep-Alive': `timeout=${CONSTANTS.KEEP_ALIVE_TIMEOUT_SEC}, max=1000`,
            'Cookie': jsession_cookie
        },
        cancelToken: new CancelToken(function executor(c) {
            // An executor function receives a cancel function as a parameter
            cancelCurrentUpload = c;

            cancel_tokens.push({
                transfer_id: transfer.id,
                series_id: series_id,
                segment_index: segment_index,
                cancel: c
            })
        }),
        //timeout: 321000,
        // transformRequest: [(data, headers) => {
        //     // Do whatever you want to transform the data
        //     console_red('transformRequest')
        //     console_log(data)
        //     return data;
        // }],
        // data: archive.pipe(new Throttle({rate: 50000})).pipe(prog)
        data: archive.pipe(prog)
    };

    let https_agent_options = { 
        keepAlive: true,
        keepAliveMsecs: 1000,

        // Socket timeout in milliseconds. This will set the timeout after the socket is connected. 
        timeout: CONSTANTS.SOCET_TIMEOUT_SEC * 1000 
    }
    if (auth.allow_insecure_ssl()) {
        https_agent_options.rejectUnauthorized = false // insecure SSL at request level
    }
    request_settings.httpsAgent = new https.Agent(https_agent_options);

    console_red('request_settings', {request_settings})

    // plug in test to see if upload is not canceled in the meantime
    var current_transfer = await db_uploads._getById(transfer.id);

    if (current_transfer.canceled === true) {
        // TODO (SINGLE UPLOAD) - queue
        _queue_.remove_many(transfer.id);
        respawn_transfer(transfer.id, series_id, false)
        return;
    }

    async function storeChecksums(transfer_id) {
        const checksums = checksumIndex.map(fileData => {
            return [fileData.series_index, fileData.data_index, fileData.anon_checksum]
        })

        return await db_uploads._insertChecksums(transfer_id, checksums)
    }

    xnat_api.heartbeat_start();
    axios(request_settings)
    .then(async (res) => {
        console_red('zip upload done - res')
        xnat_api.heartbeat_stop();

        await new Promise(resolve => rimraf(new_dirpath, { disableGlob: true }, resolve))

        const checksums_updated = await storeChecksums(transfer.id)
        console_red('store_checksums DONE', checksums_updated);
        // await store_checksums(transfer.id, series_id, upload_id)

        remove_cancel_token(transfer.id, series_id, segment_index)

        let data = {
            res: res
        };
        try {
            data.transfer = await mark_uploaded(transfer.id, series_id, segment_index);

            nedb_logger.success(transfer.id, 'upload', `[${remote.getCurrentWindow().id}: ]` + `Series uploaded ${series_id}, segment[${segment_index}].`);
            
            // TODO (SINGLE UPLOAD) - queue
            _queue_.remove(transfer.id, series_id, segment_index);

            data.info = transfer.id + '::' + series_id + '||' + segment_index

            console.log({DATA_INFO: data.info});

            return data;

        } catch (err) {
            console.error({xerror: err})
            throw err;
        }
    })
    .then(async data => {
        console_red('zip upload done - then 1: ' + data.info)
        let { transfer, res } = data;

        ipcRenderer.send('scan_segment_done', transfer.id, series_id, segment_index)
        

        let transfer_series_ids = transfer.series_ids;
        let items_in_queue = _queue_.items;

        console_red('mark_uploaded.then()', {series_id, transfer_series_ids, items_in_queue})

        
        if (transfer.series_ids.length === 0) {
            console_log(`**** COMMITING UPLOAD ${transfer.id} :: ${series_id}`);
            console_log(`***** res.statusText  = '${res.statusText }' ******`);
            console_log(`***** res.data = '${res.data}' ******`);
            console_log('***** res.status = ' + res.status + ' ****** (' + (typeof res.status) + ')');

            // TODO (SINGLE UPLOAD) - queue
            _queue_.removeProcessedTransfer(transfer.id)

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
                    'Keep-Alive': `timeout=${CONSTANTS.KEEP_ALIVE_TIMEOUT_SEC}, max=1000`,
                    'Cookie': jsession_cookie
                }
            }

            let https_agent_options = { 
                keepAlive: true,
                keepAliveMsecs: 1000, // default is 1000

                // Socket timeout in milliseconds. This will set the timeout after the socket is connected. 
                timeout: CONSTANTS.SOCET_TIMEOUT_SEC * 1000 
            }
            if (auth.allow_insecure_ssl()) {
                https_agent_options.rejectUnauthorized = false // insecure SSL at request level
            }
            commit_request_settings.httpsAgent = new https.Agent(https_agent_options)
            commit_request_settings.adapter =  httpAdapter


            let commit_data = {};

            console_log({transfer_XXX: transfer});

            if (transfer.anon_variables.hasOwnProperty('tracer')) {
                let label = transfer.session_data.modality.indexOf('MR') >=0 ? 'xnat:petMrSessionData/tracer/name' : 'xnat:petSessionData/tracer/name';                

                commit_data[label] = transfer.anon_variables.tracer;
            }

            console_log({commit_data});
            
            xnat_api.heartbeat_start();

            try {
                const commit_res = await axios.post(commit_url, commit_data, commit_request_settings)

                console_red('-------- XCOMMIT_SUCCESS ----------')
                console_log('-------- XCOMMIT_SUCCESS ----------')
                console_log(commit_res);
                xnat_api.heartbeat_stop();

                let num_updated = false
                if (commit_res.data.indexOf(reference_str) >= 0) {
                    console_log(`+++ SESSION PREARCHIVED +++`);
                    let str_start = commit_res.data.indexOf(reference_str) + reference_str.length;
                    let session_str = commit_res.data.substr(str_start);

                    let res_arr = session_str.split('/');
                    // let res_project_id = res_arr[0];
                    // let res_timestamp = res_arr[1];
                    // let res_session_label = res_arr[2];
                    
                    session_link = xnat_server + '/app/action/LoadImageData/project/' + res_arr[0] + '/timestamp/' + res_arr[1] + '/folder/' + res_arr[2];
                    
                    num_updated = await db_uploads._updateProperty(transfer.id, 'session_link', session_link)
                }

                console_red('num_updated 1', {num_updated})
                if (num_updated) {
                    Helper.notify(`Upload is finished. Session: ${transfer.url_data.expt_label}`); // session label
                    nedb_logger.success(transfer.id, 'upload', `[${remote.getCurrentWindow().id}: ]` + `Session ${transfer.url_data.expt_label} uploaded successfully.`, transfer.url_data);
                    
                    // have to split this out bc a 301 indicates archival and goes into the catch block, whereas 200 means prearchived so we are in fact finished
                    await db_uploads._updateProperty(transfer.id, 'status', 'finished');

                    ipcRenderer.send('progress_cell', {
                        table: '#upload_monitor_table',
                        id: transfer.id,
                        field: 'status',
                        value: 'finished'
                    });
                    ipcRenderer.send('upload_finished', transfer.id);
                }

            } catch (err) {
                console_log('-------- XCOMMIT_ERR ----------')
                console_log(err);
                xnat_api.heartbeat_stop();

                if (err.response.status != 301) {
                    electron_log.error('commit_error', commit_url, JSON.stringify(err.response))
                    let error_message = `[${remote.getCurrentWindow().id}: ]` + `Session upload failed (with status code: ${err.response.status} - "${err.response.statusText}").`;
                    
                    nedb_logger.error(transfer.id, 'upload', error_message, err.response);

                    await db_uploads._updateProperty(transfer.id, 'status', 'xnat_error', function() {
                        update_transfer_summary(transfer.id, 'commit_errors', error_message);
                    
                        ipcRenderer.send('progress_cell', {
                            table: '#upload_monitor_table',
                            id: transfer.id,
                            field: 'status',
                            value: 'xnat_error'
                        });
                        
                        ipcRenderer.send('upload_finished', transfer.id);
                    });
                } else {
                    console_log(`+++ SESSION ARCHIVED +++`);
                    
                    session_link = `${xnat_server}/data/archive/projects/${project_id}/subjects/${subject_id}/experiments/${expt_label}?format=html`

                    try {
                        await db_uploads._updateById(transfer.id, { 
                            status: 'finished',
                            session_link: session_link
                        })

                        Helper.notify(`Upload is finished. Session: ${transfer.url_data.expt_label}`); // session label
                        nedb_logger.success(transfer.id, 'upload', `[${remote.getCurrentWindow().id}: ]` + `Session ${transfer.url_data.expt_label} uploaded successfully.`, transfer.url_data);
                        
                        ipcRenderer.send('progress_cell', {
                            table: '#upload_monitor_table',
                            id: transfer.id,
                            field: 'status',
                            value: 'finished'
                        });
                        
                        ipcRenderer.send('upload_finished', transfer.id);
                    } catch (err1) {
                        console_log({err1})
                    }
                }
            }
        }

        return true
    })
    .then(() => {
        respawn_transfer(transfer.id, series_id, true)
    })
    .catch(async err => {
        xnat_api.heartbeat_stop();
        await new Promise(resolve => rimraf(new_dirpath, { disableGlob: true }, resolve))

        console_log({
            CATCH_ERROR: err,
            tss: `${transfer.id}::${series_id}||${segment_index}`
        });
        handleUploadError(transfer, series_id, segment_index, err)
    });

    /**************************************************** */
    /**************************************************** */

    const funcs = filePaths.map(copyAnonArchive);


    function copyAnonArchive(fileData) {

        const source = fileData.source
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
                        
                        fileData.anon_checksum = await file_checksum(target)
                        checksumIndex.push(fileData)

                        archive.file(target, { name: path.basename(target) });

                        resolve(false)
        
                    } catch (error) {
                        console_red('copy/anonymization ERROR', {source, target})
                        console_log({error});
                        console_log(error.message);
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


async function update_progress_details(transfer, table_row, filesize, reset = false) {
    console.count('update_progress_details')

    let my_transfer = get_transfer_from_transfer_progress(transfer, transfer_progress)
    
    let selected_row = my_transfer.rows.find(row => row.id == table_row.id)

    selected_row.progress += (filesize / selected_row.size * 100)
    selected_row.count++

    // workaround - disable duplicate upload progress error
    if (selected_row.progress <= 101.5) {
        ipcRenderer.send('progress_cell', {
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
        
        let tbl_row = db_transfer.table_rows.find(t_row => t_row.id === table_row.id);
        
        if (tbl_row) {
            tbl_row.progress = 100;
            await db_uploads._replaceDoc(transfer.id, db_transfer);
            selected_row.db = 1
        }
    }

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

async function markSegmentDone(transfer_id, series_id, segment_index) {
    let transfer = await db_uploads._getByIdCopy(transfer_id);

    const series_index = transfer.series.findIndex(serie => series_id === serie.seriesInstanceUid)
    
    transfer.series[series_index].segments[segment_index].status = true

    await db_uploads._replaceDoc(transfer_id, transfer);
}

function sendDetailsTableUpdate (transfer, series_id, plus_bytes = 0, progress) {
    const serie = transfer.series.find(serie => serie.seriesInstanceUid === series_id)

    const selected_row = transfer.table_rows.find(tr => tr.series_id === series_id)

    const total = serie.bytes
    const done = calcUploadedSerieBytes(serie)

    console_log({
        '0_series_id': series_id,
        '1_done': done, 
        '2_plus_bytes': plus_bytes, 
        '3_total': total, 
        '4_percent_done': (done + plus_bytes) / total * 100,
        '5_series.segments': serie.segments,
        '6_progress': progress
    })

    ipcRenderer.send('progress_cell', {
        table: '#upload-details-table',
        id: selected_row.id,
        field: "progress",
        value: (done + plus_bytes) / total * 100
    });
}

function calcUploadedSerieBytes(serie) {
    return serie.segments.reduce((done_bytes, segment) => {
        return segment.status ? done_bytes + segment.bytes : done_bytes
    }, 0)
}

function sendMonitorTableUpdate (transfer, plus_bytes = 0) {
    let done_bytes = 0

    // finished series
    for (let i = 0; i < transfer.done_series_ids.length; i++) {
        const serie = transfer.series.find(serie => serie.seriesInstanceUid === transfer.done_series_ids[i])
        done_bytes += serie.bytes
    }

    // unfinished series
    for (let i = 0; i < transfer.series_ids.length; i++) {
        const serie = transfer.series.find(serie => serie.seriesInstanceUid === transfer.series_ids[i])
        done_bytes += calcUploadedSerieBytes(serie, i)
    }
    
    let percent_complete = (done_bytes + plus_bytes) / transfer.total_size * 100

    ipcRenderer.send('progress_cell', {
        table: '#upload_monitor_table',
        id: transfer.id,
        field: "status",
        value: percent_complete
    });
}


async function mark_uploaded(transfer_id, series_id, segment_index) {
    console.count('mark_uploaded__SERIES_' + transfer_id + '::' + series_id)
    console.count('mark_uploaded__SEGMENT_' + transfer_id + '::' + series_id + '||' + segment_index)

    await markSegmentDone(transfer_id, series_id, segment_index)

    // TODO (SINGLE UPLOAD) - queue
    _queue_.addProcessed(transfer_id, series_id, segment_index)

    const timer_uploaded = performance.now()

    let transfer = await db_uploads._getByIdCopy(transfer_id);
    
    // copy the response
    console.log({timer_uploaded_db: _time_offset(timer_uploaded)});

    // TODO (SINGLE UPLOAD) - queue
    let processed_series = _queue_.getProcessedTransferSeries(transfer)

    console.log({timer_uploaded_processed:  _time_offset(timer_uploaded)});
    console_log({transfer_id, processed_series});

    transfer.series_ids = transfer.series_ids.filter(ser_id => {
        return !processed_series.includes(ser_id)
    })
    transfer.done_series_ids = arrayUnique((transfer.done_series_ids || []).concat(processed_series));

    const all_segments = transfer.series.reduce((total, serie) => {
        return total + serie.segments.length
    }, 0)
    
    const done_segments = transfer.series.reduce((total, serie) => {
        const done = serie.segments.reduce((seg_count, segment) => {
            return segment.status ? ++seg_count : seg_count
        }, 0)
        return done + total
    }, 0)

    let percent_complete = done_segments / all_segments * 100
    let new_status = done_segments == all_segments ? 'finished' : percent_complete

    transfer.status = new_status;

    if (new_status === 'finished') {
        ipcRenderer.send('progress_cell', {
            table: '#upload_monitor_table',
            id: transfer_id,
            field: "status",
            value: percent_complete
        });
    }

    console_log({
        id: 'mark_uploaded__transfer_series__' + transfer_id + '::' + series_id,
        to_upload: transfer.series_ids,
        done: transfer.done_series_ids
    })
    
    return new Promise((resolve, reject) => {
        db_uploads().update({ id: transfer_id }, {$set: {
            status: new_status, 
            series_ids: transfer.series_ids,
            done_series_ids: transfer.done_series_ids
        }
        }, { multi: false }, function (err, numReplaced) {
            console.log({timer_uploaded_db_updated: _time_offset(timer_uploaded)});
            if (err) reject (err);
            resolve(transfer);
        });
    })
    
}

function handleUploadError(transfer, series_id, segment_index, err) {
    console_red(`handleUploadError: ${transfer.id}::${series_id}||${segment_index}`)
    console.log({
        handleUploadError: err
    })

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
    
    remove_cancel_token(transfer.id, series_id, segment_index)

    // TODO (SINGLE UPLOAD) - queue
    _queue_.remove(transfer.id, series_id, segment_index);

    if (log_and_respawn) {
        update_transfer_summary(transfer.id, 'upload_errors', Helper.errorMessage(err), function() {
            respawn_transfer(transfer.id, series_id, false)
        });
    } else {
        // TODO (SINGLE UPLOAD) - queue
        _queue_.remove_many(transfer.id);
        execute_cancel_token(transfer.id);

        if (stream_upload_error) {
            ipcRenderer.send('global_pause_status', true)
            ipcRenderer.send('xnat_cant_handle_stream_upload')
            
            closeThisWindow(2000)
        } else if (authentication_error) {
            ipcRenderer.send('force_reauthenticate', auth.current_login_data())
            
            closeThisWindow(2000)
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
                    ipcRenderer.send('custom_error_with_details', 'Anonymization Error', subtitle, mizer_error.message)

                    ipcRenderer.send('upload_finished', transfer.id);
                    ipcRenderer.send('refresh_progress_tables');

                    closeThisWindow()
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

                    ipcRenderer.send('custom_error_with_details', 'API Request Error', subtitle, err.message)
                    ipcRenderer.send('upload_finished', transfer.id);

                    closeThisWindow()
                }
            );
        } else {
            ipcRenderer.send('main_log', {
                err_msg: err.message ? err.message : null,
                err
            })

            closeThisWindow()
        }
    }
}

function closeThisWindow(timeout = 0) {
    setTimeout(function() {
        const window = remote.getCurrentWindow();
        window.close();
    }, timeout)
}

async function update_transfer_summary(transfer_id, property, new_value, callback = false) {
    summary_log_update(transfer_id, property, new_value)
    let transfer = await db_uploads._getById(transfer_id)

    if (transfer) {
        transfer.summary = transfer.summary || {}
        transfer.summary[property] = transfer.summary[property] || []
        transfer.summary[property].push(new_value)
    
        await db_uploads._replaceDoc(transfer_id, transfer);
    }

    if (callback) {
        callback()
    }
}

// TODO (SINGLE UPLOAD) - fix this
function respawn_transfer(transfer_id, series_id, success) {
    console_red('respawn_transfer', {transfer_id, series_id, success})

    ipcRenderer.send('respawn_transfer', transfer_id, series_id, success)

    console.log({transfer_progress})
    console.log({total_upload_time: _time_offset(uploadStartTimer)});

    closeThisWindow(2000)
    
    //ipcRenderer.sendTo(webContentsId, channel, [, arg1][, arg2][, ...])
    //do_transfer(series_id, success);
}

function get_temp_upload_path() {
    return user_settings.getDefault('temp_folder_alternative', path.join(tempDir, '_xdc_temp'))
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

function _time_offset(start_time) {
    return ((performance.now() - start_time) / 1000).toFixed(2);
}


function summary_log_update(transfer_id, prop, val) {
    summary_log[transfer_id] = summary_log[transfer_id] || {}
    summary_log[transfer_id][prop] = summary_log[transfer_id][prop] || []

    summary_log[transfer_id][prop].push(val)

    //console_red('summary_log_update', summary_log)

    // TODO remove comment and add promise
    //db_uploads.updateProperty(transfer_id, 'summary', summary_log[transfer_id])
}