const { ipcRenderer } = require('electron')

const { getGlobal, require: nodeRequire } = require('@electron/remote');

const ElectronStore = require('electron-store')
const settings = new ElectronStore()

const auth = require('../services/auth')
const db_uploads = nodeRequire('./services/db/uploads')
const { file_checksum, uuidv4, isEmptyObject, promiseSerial, arrayUnique, isDevEnv, currentVersionChannel, getFilesizeInBytes, simpleLog } = require('../services/app_utils')

const { console_red } = require('../services/logger')
const electron_log = nodeRequire('./services/electron_log')

const CONSTANTS = require('../services/constants');

const Singleton = nodeRequire('./services/singleton');
const singletonInstance = Singleton.getInstance();
console.log(__filename, 'getRandomNumber', singletonInstance.getRandomNumber()); // This will log the random number

let thisVersionChannel
(async () => {
    thisVersionChannel = await currentVersionChannel()
})()

let logger_enabled = isDevEnv() || ['alpha', 'beta'].includes(thisVersionChannel)

console_log({logger_enabled});

function console_log(...log_this) {
    if (!logger_enabled) {
        return;
    }

    electron_log.info(...log_this);
    console.log(...log_this);
    //console.trace('<<<<== UPLOAD TRACE ==>>>>');
    ipcRenderer.send('log', ...log_this);
}


ipcRenderer.on('start_upload',function(e, item){
    console_red('ipc.on :: start_upload');
    setTimeout(do_transfer, 200);
})

ipcRenderer.on('scan_segment_done', async function(e, transfer_id, series_id, segment_index){
    console_red('ipc.on :: scan_segment_done', transfer_id, series_id, segment_index);

    let transfer = await db_uploads._getByIdCopy(transfer_id);

    if (transfer.done_series_ids.includes(series_id)) {
        const selected_row = transfer.table_rows.find(tr => tr.series_id === series_id)
    
        ipcRenderer.send('progress_cell', {
            table: '#upload-details-table',
            id: selected_row.id,
            field: "progress",
            value: 100
        });
    }
})

ipcRenderer.on('single_upload_finished', function(e, window_id){
    console_red('ipc.on :: single_upload_finished', window_id);
})

ipcRenderer.on('respawn_transfer', function(e, transfer_id, series_id, segment_index, success){
    console_red('ipc.on :: respawn_transfer', transfer_id, series_id, segment_index, success);
    // let transfer_label = `${transfer_id}::${series_id}||${segment_index}`;
    // simpleLog(`ipc.on :: respawn_transfer [${transfer_label}] - ${isDoingTransfer ? 'NO RESPAWN' : 'YES RESPAWN'}`, 'xdc--queue')
    respawn_transfer(transfer_id, series_id, segment_index, success)
})

ipcRenderer.on('single_upload_load_error', async function(e, transfer_id, series_id, segment_index) {
    let transfer_label = `${transfer_id}::${series_id}||${segment_index}`;
    simpleLog(`*${transfer_label} > single_upload_load_error`, 'xdc--queue')
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
let { _queue_ } = getGlobal('shared');

let isDoingTransfer = false;

console_log(__filename);
do_transfer();
setInterval(do_transfer, 10000, 'setInterval');


async function do_transfer(source_series_id = 'initial', source_upload_success = true) {
    simpleLog(`do_transfer [${source_series_id}] > ${isDoingTransfer ? 'SKIP' : 'GO'}`, 'xdc--queue')
    if (isDoingTransfer || settings.get('global_pause')) {
        return
    }

    isDoingTransfer = true

    let xnat_server = settings.get('xnat_server');
    let current_username = auth.get_current_user();

    console_log({
        items: _queue_.items,
        processed: _queue_._processed,
        current_username
    });

    let _list_all_timer = performance.now();

    let current_transfers = [];
    try {
        let my_transfers = await db_uploads._listAll()

        let _list_all_took = ((performance.now() - _list_all_timer) / 1000).toFixed(2);
        console_red('_list_all_took', _list_all_took)
        simpleLog(`_list_all_took [${source_series_id}] > ${_list_all_took}`, 'xdc--queue')

        current_transfers = my_transfers.filter(transfer => {
            return transfer.xnat_server === xnat_server && 
                transfer.user === current_username && 
                transfer.canceled !== true && 
                typeof transfer.status === 'number' && 
                transfer.series_ids.length > 0
        })

    } catch (db_uploads_listAll_error) {
        console_log({db_uploads_listAll_error});
        isDoingTransfer = false
        return
    }

    if (current_transfers.length && _queue_.queueNotFull()) {
        const loop_start_time = performance.now()
        for (let i = 0; i < current_transfers.length; i++) {
            let transfer = current_transfers[i]

            for (let j = 0; j < transfer.series_ids.length; j++) {
                let series_id = transfer.series_ids[j]

                let selected_series = transfer.series.find(serie => {
                    return serie.seriesInstanceUid === series_id
                })

                for (let segment_index = 0; segment_index < selected_series.segments.length; segment_index++) {
                    if (!settings.get('global_pause') && _queue_.add(transfer.id, series_id, segment_index)) {
                        await doUpload(transfer, series_id, segment_index);
                    } else {
                        // simpleLog(`do_transfer [${source_series_id}] > doUpload SKIP`, 'xdc--queue')
                    }
                }
            }
        }
        simpleLog(`do_transfer [${source_series_id}] > loop_time: ${_time_offset(loop_start_time)}`, 'xdc--queue')
    }

    isDoingTransfer = false
}

function _time_offset(start_time) {
    return ((performance.now() - start_time) / 1000).toFixed(2);
}

async function doUpload(transfer, series_id, segment_index) {
    return new Promise(resolve => {
        setTimeout(() => {
            ipcRenderer.send('init_upload_single', transfer.id, series_id, segment_index)
            resolve()
        }, 200);
    });
    
}

function respawn_transfer(transfer_id, series_id, segment_index, success) {
    console_red('respawn_transfer', {transfer_id, series_id, segment_index, success})
    // transfer, series_id, segment_index

    let transfer_label = `${transfer_id}::${series_id}||${segment_index}`;
    do_transfer(transfer_label, success);
}


setInterval(function() {
    console_red('_queue_.items: ', _queue_.items)
    console_red('_queue_._processed: ', _queue_._processed)
}, 2000)