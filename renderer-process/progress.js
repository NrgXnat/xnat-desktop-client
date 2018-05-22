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
                filterControl: 'input',
                sortable: true
            }, 
            {
                field: 'server',
                title: 'Server',
                filterControl: 'input',
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
                title: 'Session',
                filterControl: 'input',
                sortable: true
            }, 
            {
                field: 'transfer_type',
                title: 'Process',
                filterControl: 'select',
                sortable: true,
                align: 'center'
            }, 
            {
                field: 'transfer_date',
                title: 'Transfer Date',
                filterControl: 'input',
                sortable: true,
                class: 'date_field'
            }, 
            {
                field: 'status', //VALUES: queued, finished, xnat_error, in_progress, <float 0-100>
                title: 'Status',
                filterControl: 'select',
                sortable: true,
                formatter: function(value, row, index, field) {
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
                                data-target="#success-log"
                                ><i class="fas fa-download"></i> Log</button>
                            `;
                            break;
                            
                        case 'xnat_error':
                            content = `
                            <button class="btn btn-block btn-danger" 
                                data-toggle="modal" 
                                data-target="#error-log"
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
        data: [],
        old_data: [
            {
                id: '1',
                date: '2018/02/09',
                session_label: 'Mile 1',
                transfer_type: 'Upload',
                transfer_date: '2018/02/09 2:13pm',
                status: 22.3, // queued, finished, xnat_error, in_progress
                actions: ''
            },
            {
                id: '2',
                date: '2018/02/10',
                session_label: 'Mile 2',
                transfer_type: 'Upload',
                transfer_date: '2018/02/13 2:13pm',
                status: 'queued', // queued, finished, xnat_error, in_progress
                actions: ''
            },
            {
                id: '3',
                date: '2018/02/15',
                session_label: 'Mile 3',
                transfer_type: 'Upload',
                transfer_date: '2018/02/18 11:13am',
                status: 'finished', // queued, finished, xnat_error, in_progress
                actions: ''
            },
            {
                id: '4',
                date: '2018/02/21',
                session_label: 'Mile 4',
                transfer_type: 'Upload',
                transfer_date: '2018/02/18 11:13am',
                status: 'xnat_error', // queued, finished, xnat_error, in_progress
                actions: ''
            }
        ]
    });

    let uploads = store.get('transfers.uploads');
    
        console.log(uploads);
    
        let my_data = [];
    
        uploads.forEach(function(transfer) {
            let item = {
                id: transfer.id,
                date: transfer.session_data.studyDate,
                session_label: transfer.session_data.studyDescription,
                transfer_type: 'Upload',
                transfer_date: transfer.transfer_start,
                status: 0,
                actions: '',
                server: transfer.xnat_server,
                user: transfer.user_auth.username
            };

    
            /*
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
    
            console.log(item);
            
            */
            my_data.push(item);
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
                title: 'Transfer start',
                filterControl: 'input',
                sortable: true,
                class: 'date_field'
            }, 
            {
                field: 'basename',
                title: 'File',
                filterControl: 'input',
                sortable: true
            }, 
            {
                field: 'transfer_type',
                title: 'Process',
                filterControl: 'select',
                sortable: true,
                align: 'center'
            }, 
            {
                field: 'server',
                title: 'Server',
                filterControl: 'select',
                sortable: true,
                align: 'center'
            },
            {
                field: 'user',
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
                                data-target="#error-log"
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
        let item = {
            id: transfer.id,
            transfer_start: transfer.transfer_start,
            basename: transfer.basename,
            transfer_type: 'Download',
            server: transfer.server,
            user: transfer.user,
            status: 0,
            actions: ''
        };

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

        console.log(item);
        

        my_data.push(item);
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


$(document).on('show.bs.modal', '#upload-details', function(e) {
    var id = $(e.relatedTarget).data('id');
    var session_label = $(e.relatedTarget).data('session_label');

    $(e.currentTarget).find('#session_label').html(session_label);

    _init_upload_details_table(id)
});

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




ipc.on('download_progress',function(e, item){
    //console.log(item);

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


ipc.on('upload_progress',function(e, item){
    //console.log(item);

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
