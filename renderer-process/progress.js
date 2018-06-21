const fs = require('fs');
const path = require('path');
const dicomParser = require('dicom-parser');
const getSize = require('get-folder-size');
const axios = require('axios');
require('promise.prototype.finally').shim();
const settings = require('electron-settings');
const ipc = require('electron').ipcRenderer;
const swal = require('sweetalert');
const archiver = require('archiver');
const mime = require('mime-types');

const FileSaver = require('file-saver');

const NProgress = require('nprogress');
NProgress.configure({ 
    trickle: false,
    easing: 'ease',
    speed: 1,
    minimum: 0.03
});


let xnat_server, user_auth;


function _init_upload_progress_table() {
    $('#upload_monitor_table').bootstrapTable({
        filterControl: true,
        uniqueId: 'id',
        //height: 300,
        columns: [
            {
                field: 'id',
                visible: false
            },
            {
                field: 'user',
                title: 'User',
                filterControl: 'select',
                sortable: true
            }, 
            {
                field: 'server',
                title: 'Server',
                filterControl: 'select',
                sortable: true
            }, 
            {
                field: 'date',
                title: 'Date',
                filterControl: 'input',
                sortable: true,
                class: 'date_field'
            }, 
            {
                field: 'session_label',
                title: 'Study',
                filterControl: 'input',
                sortable: true
            }, 
            // {
            //     field: 'transfer_type',
            //     title: 'Process',
            //     filterControl: 'select',
            //     sortable: true,
            //     align: 'center'
            // }, 
            {
                field: 'transfer_date',
                title: 'Transfer Date',
                filterControl: 'input',
                sortable: true,
                class: 'date_field',
                formatter: function(value, row, index, field) {
                    return Helper.date_time(value);
                }
            }, 
            {
                field: 'status', //VALUES: queued, finished, xnat_error, in_progress, <float 0-100>
                title: 'Status',
                filterControl: 'select',
                sortable: true,
                formatter: function(value, row, index, field) {
                    if (row.canceled) {
                        return `Canceled`;
                    }

                    if (typeof value !== 'string') {
                        let my_value = parseFloat(value);
                        return `
                            <div class="progress-bar bg-success" role="progressbar" aria-valuenow="${my_value}" aria-valuemin="0" aria-valuemax="100" style="width:${my_value}%; height:25px;">
                                <span class="sr-only">In progress</span>
                            </div>
                        `;
                    } else {
                        return value;
                    } 
                }
            }, 
            {
                field: 'actions',
                title: 'Log Upload',
                escape: false,
                formatter: function(value, row, index, field) {
                    let content;
                    switch(row.status) {
                        case 'queued':
                            content = `
                                <button class="btn btn-block btn-warning" 
                                    disabled
                                    ><i class="far fa-pause-circle"></i> Queued</button>
                            `;
                            break;

                        case 'finished':
                            content = `
                            <button class="btn btn-block btn-success" 
                                data-toggle="modal" 
                                data-target="#upload-success-log"
                                data-id="${row.id}"
                                ><i class="fas fa-download"></i> Log</button>
                            `;
                            break;
                            
                        case 'xnat_error':
                            content = `
                            <button class="btn btn-block btn-danger" 
                                data-toggle="modal" 
                                data-target="#error-log--upload"
                                data-id="${row.id}"
                                ><i class="fas fa-exclamation-triangle"></i> Log</button>
                            `;
                            break;
                        
                        default: // float
                            content = `
                                <button class="btn btn-block btn-info" 
                                    data-toggle="modal" 
                                    data-target="#upload-details"
                                    data-id="${row.id}"
                                    data-session_label="${row.session_label}"
                                    ><i class="fas fa-upload"></i> Details</button>
                            `;
                    }

                    return content;
                }
            }
        ],
        data: []
    });

    let uploads = store.get('transfers.uploads');
    
        console.log(uploads);
    
        let my_data = [];
    
        uploads.forEach(function(transfer) {
            if (transfer.xnat_server === xnat_server && transfer.user_auth.username === user_auth.username) {
                let study_label = transfer.session_data.studyId ? transfer.session_data.studyId : transfer.session_data.studyInstanceUid;
                let item = {
                    id: transfer.id,
                    date: transfer.session_data.studyDate,
                    session_label: study_label,
                    //transfer_type: 'Upload',
                    transfer_date: transfer.transfer_start,
                    status: transfer.status,
                    actions: '',
                    server: transfer.xnat_server.split('://')[1],
                    user: transfer.user_auth.username,
                    canceled: transfer.canceled === true ? true : false
                };
    
                my_data.push(item);
            }
        });
    
        console.log(my_data);
        
    
        $('#upload_monitor_table')
            .bootstrapTable('removeAll')    
            .bootstrapTable('append', my_data)
            .bootstrapTable('resetView');
}

function _init_download_progress_table() {

    $('#download_monitor_table').bootstrapTable({
        filterControl: true,
        uniqueId: 'id',
        //height: 300,
        columns: [
            {
                field: 'id',
                title: 'ID',
                visible: false
            },
            {
                field: 'transfer_start',
                title: 'Transfer Start',
                filterControl: 'input',
                sortable: true,
                class: 'date_field',
                formatter: function(value, row, index, field) {
                    return Helper.date_time(value);
                }
            }, 
            {
                field: 'basename',
                title: 'File',
                filterControl: 'input',
                sortable: true
            }, 
            // {
            //     field: 'dl_transfer_type',
            //     title: 'Process',
            //     filterControl: 'select',
            //     sortable: true,
            //     align: 'center'
            // }, 
            {
                field: 'dl_server',
                title: 'Server',
                filterControl: 'select',
                sortable: true,
                align: 'center'
            },
            {
                field: 'dl_user',
                title: 'User',
                filterControl: 'select',
                sortable: true,
                align: 'center'
            },
            {
                field: 'status', //VALUES: queued, finished, xnat_error, in_progress, <float 0-100>
                title: 'Status',
                filterControl: 'select',
                sortable: true,
                formatter: function(value, row, index, field) {
                    if (row.canceled) {
                        return `Canceled`;
                    }

                    if (typeof value !== 'string') {
                        let my_value = parseFloat(value);
                        return `
                            <div class="progress-bar bg-success" role="progressbar" aria-valuenow="${my_value}" aria-valuemin="0" aria-valuemax="100" style="width:${my_value}%; height:25px;">
                                <span class="sr-only">In progress</span>
                            </div>
                        `;
                    } else {
                        if (value == 'xnat_error') {
                            return `<i class="fas fa-exclamation-triangle"></i> XNAT Error`
                        } else {
                            return value;
                        }
                    } 
                }
            }, 
            {
                field: 'actions',
                title: 'Log download',
                escape: false,
                formatter: function(value, row, index, field) {
                    let content;
                    switch(row.status) {
                        case 'queued':
                            content = `
                                <button class="btn btn-block btn-warning" 
                                    disabled
                                    ><i class="far fa-pause-circle"></i> Queued</button>
                            `;
                            break;

                        case 'finished':
                            content = `
                            <button class="btn btn-block btn-success" 
                                data-toggle="modal" 
                                data-target="#download-details"
                                data-id="${row.id}"
                                data-file="${row.basename}"
                                ><i class="fas fa-download"></i> Log</button>
                            `;
                            break;
                            
                        case 'xnat_error':
                            content = `
                            <button class="btn btn-block btn-danger" 
                                data-toggle="modal" 
                                data-target="#error-log--download"
                                data-id="${row.id}"
                                ><i class="fas fa-exclamation-triangle"></i> Log</button>
                            `;
                            break;
                        
                        default: // float
                            content = `
                                <button class="btn btn-block btn-info" 
                                    data-toggle="modal" 
                                    data-target="#download-details"
                                    data-id="${row.id}"
                                    data-file="${row.basename}"
                                    ><i class="fas fa-upload"></i> Details</button>
                            `;
                    }

                    return content;
                }
            }
        ],
        data: []
    });

    let downloads = store.transfers.get('downloads');

    console.log(downloads);
    

    let my_data = [];

    downloads.forEach(function(transfer) {
        if (transfer.server === xnat_server && transfer.user_auth.username === user_auth.username) {
            console.log('********************** DOWNLOAD transfer **********************');
            console.log(transfer);
            
            let item = {
                id: transfer.id,
                transfer_start: transfer.transfer_start,
                basename: transfer.basename,
                //dl_transfer_type: 'Download',
                dl_server: transfer.server.split('://')[1],
                dl_user: transfer.user,
                status: transfer.hasOwnProperty('status') ? transfer.status : 0,
                canceled: transfer.canceled === true ? true : false,
                actions: ''
            };

            if (item.status === 0) {
                let total_files = 0, done_files = 0;
                transfer.sessions.forEach(function(session){
                    session.files.forEach(function(file){
                        total_files++;
        
                        if (file.status === 1) {
                            done_files++;
                        }
                    })
                });
        
                console.log('--------------------' , done_files, total_files, '---------------------');
                
                if (done_files == total_files) {
                    item.status = 'finished';
                } else if (done_files == 0) {
                    item.status = 'queued';
                } else {
                    item.status = done_files / total_files * 100;
                }
            }
    
            console.log(item);
            
            my_data.push(item);
        }
        
    });

    console.log(my_data);
    

    $('#download_monitor_table')
        .bootstrapTable('removeAll')    
        .bootstrapTable('append', my_data)
        .bootstrapTable('resetView');
}

function _UI() {
    $('#progress-section .date_field input.form-control').datepicker({
        changeMonth: true,
        changeYear: true,
        dateFormat: "yy/mm/dd",
        beforeShow:function( input, inst ) {
          var dp = $(inst.dpDiv);
          console.log(inst, dp);
          
          var offset = $(input).outerWidth(false) - dp.outerWidth(false);
          dp.css('margin-right', offset);
        }
      });

    $('.js_pause_all').html(pause_btn_content(settings.get('global_pause')))
}


function _init_variables() {
    xnat_server = settings.get('xnat_server');
    user_auth = settings.get('user_auth');

    _init_download_progress_table();
    _init_upload_progress_table();
    _UI();
}


if (!settings.has('user_auth') || !settings.has('xnat_server')) {
    ipc.send('redirect', 'login.html');
    return;
}


$(document).on('page:load', '#progress-section', function(e){
    console.log('PROGRESS page:load triggered');
    
    _init_variables();
});

$(document).on('show.bs.modal', '#download-details', function(e) {
    var id = $(e.relatedTarget).data('id');
    var file = $(e.relatedTarget).data('file');

    $(e.currentTarget).find('#file_basename').html(file);

    _init_download_details_table(id)
});

$(document).on('show.bs.modal', '#error-log--download', function(e) {
    var id = $(e.relatedTarget).data('id');
    let my_transfers = store.get('transfers.downloads');

console.log(id, my_transfers);

    
    let error_text = '';
    for (let i = 0; i < my_transfers.length; i++) {
        if (my_transfers[i].id === id) {
            error_text = my_transfers[i].error;
            console.log(my_transfers[i]);
            
            break;
        }
    }

    let $log_text = $(e.currentTarget).find('.log-text');
    $log_text.html(error_text);
});


$(document).on('show.bs.modal', '#upload-details', function(e) {
    var id = $(e.relatedTarget).data('id');

    let my_transfers = store.get('transfers.uploads');
    for (let i = 0; i < my_transfers.length; i++) {
        if (my_transfers[i].id === id) {
            console.log(my_transfers[i]);
            break;
        }
    }

    var session_label = $(e.relatedTarget).data('session_label');

    $(e.currentTarget).find('#session_label').html(session_label);

    _init_upload_details_table(id)
});

$(document).on('show.bs.modal', '#upload-success-log', function(e) {
    let my_transfer = get_transfer($(e.relatedTarget).data('id'));

    console.log(my_transfer);
    console.log($(e.currentTarget));

    let $log_text = $(e.currentTarget).find('.log-text');
    $log_text.html('');


    Object.keys(my_transfer.session_data).forEach(key => {
        $log_text.append(`<p><b>${key}</b>: <span>${my_transfer.session_data[key]}</span></p>\n`);
    });
    let total_files = my_transfer.summary.total_files.reduce((prevVal, item) => {
        return prevVal + item;
    }, 0);
    let total_size = my_transfer.summary.total_size.reduce((prevVal, item) => {
        return prevVal + item;
    }, 0);

    $log_text.append(`<p><b>Total files</b>: <span>${total_files} (${(total_size / 1024 / 1024).toFixed(2)} MB)</span></p>\n`);

    let $ul = $(`<ul>`);
    Object.keys(my_transfer.anon_variables).forEach(key => {
        $ul.append(`<li><b>${key}</b>: <span>${my_transfer.anon_variables[key]}</span></li>\n`);
    });

    $log_text.append(`<b>Anon variables:</b>\n`).append($ul);

    

    //_init_upload_details_table(id)
});

function get_transfer(transfer_id) {
    let my_transfers = store.get('transfers.uploads');

    let transfer = false;
    for (let i = 0; i < my_transfers.length; i++) {
        if (my_transfers[i].id === transfer_id) {
            transfer = my_transfers[i];
            break;
        }
    }

    return transfer;
}

function _init_download_details_table(transfer_id) {
    
    $('#download-details-table').bootstrapTable({
        uniqueId: 'id',
        columns: [
            {
                field: 'id',
                title: 'ID',
                visible: false
            },
            {
                field: 'session',
                title: 'Session',
                sortable: true
            }, 
            {
                field: 'session_number',
                title: 'S/N',
                sortable: true
            }, 
            {
                field: 'file_count',
                title: 'File Count',
                sortable: true,
                align: 'center'
            }, 
            {
                field: 'progress',
                title: 'Download progress',
                sortable: false,
                formatter: function(value, row, index, field) {
                    let percent = value / row.file_count * 100;
                    return `
                        <div class="progress-bar bg-success" role="progressbar" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="${row.file_count}" style="width:${percent}%; height:25px;">
                            <span class="sr-only">In progress</span>
                        </div>
                    `;
                }
            }
        ],
        data: []
    });

    let downloads = store.get('transfers.downloads');

    let transfer;
    for (let i = 0; i < downloads.length; i++) {
        if (downloads[i].id === transfer_id) {
            transfer = downloads[i];
            break;
        }
    }
    
    let my_data = [];

    console.log(transfer);
    

    transfer.sessions.forEach(function(session){
        let single_session = {
            id: session.id,
            session: session.name,
            session_number: '-',
            file_count: session.files.length,
            progress: 0
        };
        session.files.forEach(function(file){
            if (file.status === 1) {
                single_session.progress++;
            }
        });
        my_data.push(single_session);
    });

    console.log(my_data);

    $('#download-details-table')
        .bootstrapTable('removeAll')    
        .bootstrapTable('append', my_data)
        .bootstrapTable('resetView');

    // TODO migrate open links to table!!! transfer.sessions[1].files[0].name ... up one directory
    //$('#download-details-table').closest('.bootstrap-table').after(`<button type="button" data="" class="btn btn-blue">Open</button>`)
}


function _init_upload_details_table(transfer_id) {
    $('#upload-details-table').bootstrapTable({
        uniqueId: 'id',
        columns: [
            {
                field: 'id',
                title: 'ID',
                visible: false
            }, 
            {
                field: 'series_number',
                title: 'Series Number',
                sortable: true,
                align: 'right',
                class: 'right-aligned'
            },
            {
                field: 'description',
                title: 'Series Description',
                sortable: true
            }, 
            {
                field: 'count',
                title: 'File Count',
                sortable: true,
                align: 'right',
                class: 'right-aligned'
            }, 
            {
                field: 'progress',
                title: 'Upload Progress',
                sortable: false,
                formatter: function(value, row, index, field) {
                    let percent = value;
                    return `
                        <div class="progress-bar bg-success" role="progressbar" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="100" style="width:${percent}%; height:25px;">
                            <span class="sr-only">In progress</span>
                        </div>
                    `;
                }
            },
            {
                field: 'size',
                title: 'Size (bytes)',
                sortable: true,
                align: 'right',
                class: 'right-aligned',
                formatter: function(value, row, index, field) {
                    return `${(value / 1024 / 1024).toFixed(2)} MB`;
                }
            }, 
            {
                field: 'series_id',
                title: 'Series ID',
                visible: false
            }
        ],
        data: []
    });

    let uploads = store.get('transfers.uploads');

    let transfer;
    for (let i = 0; i < uploads.length; i++) {
        if (uploads[i].id === transfer_id) {
            transfer = uploads[i];
            break;
        }
    }
    
    my_data = transfer.table_rows;

    console.log(transfer);
    

    $('#upload-details-table')
        .bootstrapTable('removeAll')    
        .bootstrapTable('append', my_data)
        .bootstrapTable('resetView');
}



$(document).on('click', '[data-save-txt]', function(){
    let text_content = $.trim($(this).closest('.modal-content').find('.modal-body').text());
    let lines = text_content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        lines[i] = $.trim(lines[i]);
    }
    text_content = lines.join('\n');

    let blob = new Blob([text_content], {type: "text/plain;charset=utf-8"});
    FileSaver.saveAs(blob, "success_log.txt");
});

$(document).on('click', '.js_cancel_all_transfers', function(){
    let global_pause = settings.get('global_pause')
    settings.set('global_pause', true);
    
    cancel_all_uploads();
    cancel_all_downloads();

    ipc.send('reload_upload_window');
    ipc.send('reload_download_window');

    settings.set('global_pause', global_pause);
});

function cancel_all_uploads() {
    let my_transfers = store.get('transfers.uploads'); 

    my_transfers.forEach(function(transfer) {
        // validate current user/server
        if (transfer.xnat_server === xnat_server && transfer.user_auth.username === user_auth.username) {
            if (typeof transfer.status == 'number') {
                if (transfer.series_ids.length) {
                    transfer.canceled = true;
                }
            }
        }
        
    });

    store.set('transfers.uploads', my_transfers);
}

function cancel_all_downloads() {
    let my_transfers = store.get('transfers.downloads');

    my_transfers.forEach(function(transfer) {

        // validate current user/server
        if (transfer.server === xnat_server && transfer.user_auth.username === user_auth.username) {
            let manifest_urls = new Map();
    
            transfer.sessions.forEach(function(session){
                session.files.forEach(function(file){
                    if (file.status === 0) {
                        manifest_urls.set(file.name, file.uri)
                    }
                });
            });
    
            if (manifest_urls.size) {
                transfer.canceled = true;
            }
        }
        
    });
    
    store.set('transfers.downloads', my_transfers);
}

$(document).on('click', '.js_pause_all', function(){
    let new_pause_status = !settings.get('global_pause');
    
    settings.set('global_pause', new_pause_status);
    $(this).html(pause_btn_content(new_pause_status));
    
});

function pause_btn_content(status) {
    return status ? 
        '<i class="far fa-play-circle"></i> Unpause All' :
        '<i class="far fa-pause-circle"></i> Pause All';
}




ipc.on('download_progress',function(e, item){
    console.log(item);

    if (item.table !== undefined) {
        
        if ($(item.table).length) {
            $(item.table).bootstrapTable('updateByUniqueId', item.data);
        }
    }

    if (item.selector !== undefined) {
        if ($(item.selector).length) {
            $(item.selector).html(item.html);
        }
    }
    
});


ipc.on('upload_progress',function(e, item) {
    console.log(item);

    if (item.table !== undefined) {
        if ($(item.table).length) {
            $(item.table).bootstrapTable('updateByUniqueId', item.data);
        }
    }

    if (item.selector !== undefined) {
        if ($(item.selector).length) {
            $(item.selector).html(item.html);
        }
    }
    
});

