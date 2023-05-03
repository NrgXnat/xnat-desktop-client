const electron = require('electron')
const { ipcRenderer, remote } = electron

const ElectronStore = require('electron-store')
const settings = new ElectronStore()

const auth = require('../services/auth')
const db_uploads = remote.require('./services/db/uploads')
const { file_checksum, uuidv4, isEmptyObject, promiseSerial, arrayUnique, isDevEnv, currentVersionChannel, getFilesizeInBytes } = require('../services/app_utils')

const { console_red } = require('../services/logger')
const electron_log = remote.require('./services/electron_log')

const CONSTANTS = require('../services/constants');

function console_log(...log_this) {
    if (!logger_enabled) {
        return;
    }

    electron_log.info(...log_this);
    console.log(...log_this);
    //console.trace('<<<<== UPLOAD TRACE ==>>>>');
    ipcRenderer.send('log', ...log_this);
}

let logger_enabled = isDevEnv() || ['alpha', 'beta'].includes(currentVersionChannel())

console_log({logger_enabled});


ipcRenderer.on('start_upload',function(e, item){
    console_red('ipc.on :: start_upload');
    setTimeout(do_transfer, 200);
})


ipcRenderer.on('single_upload_finished', function(e, window_id){
    console_red('ipc.on :: single_upload_finished', window_id);
})

ipcRenderer.on('respawn_transfer', function(e, transfer_id, series_id, success){
    console_red('ipc.on :: respawn_transfer', transfer_id, series_id, success);
    respawn_transfer(transfer_id, series_id, success)
})

ipcRenderer.on('single_upload_load_error', async function(e, transfer_id, series_id, segment_index) {
    _queue_.remove(transfer_id, series_id, segment_index)
    respawn_transfer(transfer_id, series_id, false)
})

/*
ipcRenderer.on('cancel_upload',function(e, transfer_id){
    console_red('ipc.on :: cancel_upload', transfer_id);
    execute_cancel_token(transfer_id)
})
*/

if (!settings.has('global_pause')) {
    settings.set('global_pause', false);
}

// let { _queue_ } = require('../services/_queue_')
let { _queue_ } = remote.getGlobal('shared');



console_log(__filename);
do_transfer();
setInterval(do_transfer, 10000);



async function do_transfer(source_series_id = 'initial', source_upload_success = true) {
    let xnat_server = settings.get('xnat_server');
    let current_username = auth.get_current_user();

    console_log({
        items: _queue_.items,
        processed: _queue_._processed,
        current_username
    });


    if (settings.get('global_pause')) {
        return;
    }

    let _list_all_timer = performance.now();

    let current_transfers = [];
    try {
        let my_transfers = await db_uploads._listAll()

        let _list_all_took = ((performance.now() - _list_all_timer) / 1000).toFixed(2);
        console_red('_list_all_took', _list_all_took)

        current_transfers = my_transfers.filter(transfer => {
            return transfer.xnat_server === xnat_server && 
                transfer.user === current_username && 
                transfer.canceled !== true && 
                typeof transfer.status === 'number' && 
                transfer.series_ids.length > 0
        })

    } catch (db_uploads_listAll_error) {
        console_log({db_uploads_listAll_error});
        return
    }

    if (current_transfers.length && _queue_.queueNotFull()) {
        for (let i = 0; i < current_transfers.length; i++) {
            let transfer = current_transfers[i]

            for (let j = 0; j < transfer.series_ids.length; j++) {
                let series_id = transfer.series_ids[j]

                let selected_series = transfer.series.find(serie => {
                    return serie.seriesInstanceUid === series_id
                })

                for (let segment_index = 0; segment_index < selected_series.segments.length; segment_index++) {
                    if (_queue_.add(transfer.id, series_id, segment_index)) {
                        doUpload(transfer, series_id, segment_index);
                    }
                }
            }
        }
    } else {
        console_log('Queue FULL', _queue_.items.length);
    }
}

async function doUpload(transfer, series_id, segment_index) {
    ipcRenderer.send('init_upload_single', transfer, series_id, segment_index)
}

function respawn_transfer(transfer_id, series_id, success) {
    console_red('respawn_transfer', {transfer_id, series_id, success})
    do_transfer(series_id, success);
}


setInterval(function() {
    console_red('_queue_.items: ', _queue_.items)
    console_red('_queue_._processed: ', _queue_._processed)
}, 2000)