const electron = require('electron');
const { ipcRenderer, remote } = electron;

const httpAdapter = require('axios/lib/adapters/http');
const https = require('https');

const CONSTANTS = require('./constants');
const XNATAPI = require('./xnat-api')
const auth = require('./auth');
const { jsonStringify, stripTags } = require('../services/app_utils')

const db_uploads = remote.require('./services/db/uploads')
const nedb_logger = remote.require('./services/db/nedb_logger')
const electron_log = remote.require('./services/electron_log');


function console_log(...log_this) {
    electron_log.info(...log_this);
    // ipcRenderer.send('log', ...log_this);
}

function transfer_signature(transfer) {
    const window = remote.getCurrentWindow()

    const series_info = `(SER: ${transfer.series_ids.length}|${transfer.done_series_ids.length} of ${transfer.series.length})`
    return `[W:${window.id}] ${transfer.url_data.expt_label} ${series_info} [${transfer.id}/${transfer.session_id}]`
}

async function update_transfer_summary(transfer_id, property, new_value, callback = false) {
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

function getUserAgentString() {
    return remote.getCurrentWindow().webContents.getUserAgent();
}

exports.uploadCommit = async (transfer, res, series_id = '') => {
    try {
        let xnat_server = transfer.xnat_server, 
            project_id = transfer.url_data.project_id,
            subject_id = transfer.url_data.subject_id,
            expt_label = transfer.url_data.expt_label,
            user_auth = auth.get_user_auth();

        const xnat_api = new XNATAPI(xnat_server, user_auth);

        console_log(`COMMIT::START ${transfer_signature(transfer)}::${series_id}`)

        let session_link;
        let reference_str = '/data/prearchive/projects/';
        

        // have to make this call again if too much time has passed (large upload)
        let csrfToken = await auth.get_csrf_token(xnat_server, user_auth);


        let commit_url = res.data.trim() + '?action=commit&SOURCE=uploader&XNAT_CSRF=' + csrfToken;

        console_log(`++++ XCOMMIT_url: ${commit_url}`);


        let jsession_cookie = await auth.get_jsession_cookie()
        let commit_request_settings = {
            auth: user_auth,
            headers: {
                'User-Agent': getUserAgentString(),
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

        if (transfer.anon_variables.hasOwnProperty('tracer')) {
            let label = transfer.session_data.modality.indexOf('MR') >=0 ? 'xnat:petMrSessionData/tracer/name' : 'xnat:petSessionData/tracer/name';                

            commit_data[label] = transfer.anon_variables.tracer;
        }

        xnat_api.heartbeat_start();

        console_log({commit_url, commit_data, commit_request_settings})

        try {
            const commit_res = await xnat_api.axios_post(commit_url, commit_data, commit_request_settings)

            console_log(`COMMIT::SUCCESS-200 ${transfer_signature(transfer)}::${series_id}`)

            xnat_api.heartbeat_stop();

            let num_updated = false
            if (commit_res.data.indexOf(reference_str) >= 0) {
                console_log(`+++ SESSION PREARCHIVED +++`);

                let str_start = commit_res.data.indexOf(reference_str) + reference_str.length;
                let session_str = commit_res.data.substr(str_start);

                let res_arr = session_str.split('/');
                
                session_link = xnat_server + '/app/action/LoadImageData/project/' + res_arr[0] + '/timestamp/' + res_arr[1] + '/folder/' + res_arr[2];
                
                num_updated = await db_uploads._updateProperty(transfer.id, 'session_link', session_link)
            }

            if (num_updated) {
                Helper.notify(`Upload is finished. Session: ${expt_label}`); // session label
                nedb_logger.success(transfer.id, 'upload', `[${remote.getCurrentWindow().id}: ]` + `Session ${expt_label} uploaded successfully.`, jsonStringify(transfer.url_data));
                
                // have to split this out bc a 301 indicates archival and goes into the catch block, whereas 200 means prearchived so we are in fact finished
                await db_uploads._updateProperty(transfer.id, 'status', 'finished');

                ipcRenderer.send('progress_cell', {
                    table: '#upload_monitor_table',
                    id: transfer.id,
                    field: 'status',
                    value: 'finished'
                });
                ipcRenderer.send('upload_finished', transfer.id);

                console_log(`UploadStatus: finished 1. ${transfer_signature(transfer)}`)
            }

            // TODO: else what??

        } catch (err) {
            console_log('--- XCOMMIT_ERR ---: ' + err.response.status)
            if (err.response && err.response.data) {
                console_log({XCOMMIT_ERR_DATA: stripTags(err.response.data)});
            }
            
            xnat_api.heartbeat_stop();

            if (err.response.status != 301) {
                console_log(`COMMIT::ERROR ${transfer_signature(transfer)}::${series_id}`)
                electron_log.error('commit_error', commit_url, jsonStringify(err.response))

                let error_message = `[${remote.getCurrentWindow().id}: ]` + `Session commit failed (status code: ${err.response.status} - "${err.response.statusText}"). ${stripTags(err.response.data)}`;
                nedb_logger.error(transfer.id, 'upload', error_message, jsonStringify(err.response));

                await db_uploads._updateProperty(transfer.id, 'status', 'xnat_error');

                update_transfer_summary(transfer.id, 'commit_errors', error_message);
                
                ipcRenderer.send('progress_cell', {
                    table: '#upload_monitor_table',
                    id: transfer.id,
                    field: 'status',
                    value: 'xnat_error'
                });
                
                // Do we need this ???
                // ipcRenderer.send('upload_finished', transfer.id);
                console_log(`UploadStatus: xnat_error. ${transfer_signature(transfer)}`)
            } else {
                console_log(`COMMIT::SUCCESS-301 ${transfer_signature(transfer)}::${series_id}`)
                
                session_link = `${xnat_server}/data/archive/projects/${project_id}/subjects/${subject_id}/experiments/${expt_label}?format=html`

                try {
                    await db_uploads._updateById(transfer.id, { 
                        status: 'finished',
                        session_link: session_link
                    })

                    Helper.notify(`Upload is finished. Session: ${expt_label}`); // session label
                    nedb_logger.success(transfer.id, 'upload', `[${remote.getCurrentWindow().id}: ]` + `Session ${expt_label} uploaded successfully.`, jsonStringify(transfer.url_data));
                    
                    ipcRenderer.send('progress_cell', {
                        table: '#upload_monitor_table',
                        id: transfer.id,
                        field: 'status',
                        value: 'finished'
                    });
                    
                    ipcRenderer.send('upload_finished', transfer.id);
                    console_log(`UploadStatus: finished 2. ${transfer_signature(transfer)}`)
                } catch (err1) {
                    console_log({err1})
                }
            }
        }
    } catch (err) {
        console_log('Upload Commit Error: ', err.message)
        throw err
    }
};

    