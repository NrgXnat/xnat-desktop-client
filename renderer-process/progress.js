require('promise.prototype.finally').shim();
const settings = require('electron-settings');
const ipc = require('electron').ipcRenderer;
const swal = require('sweetalert');
const prettyBytes = require('pretty-bytes');
const FileSaver = require('file-saver');

const db_uploads = require('electron').remote.require('./services/db/uploads')
const db_uploads_archive = require('electron').remote.require('./services/db/uploads_archive')
const db_downloads = require('electron').remote.require('./services/db/downloads')
const db_downloads_archive = require('electron').remote.require('./services/db/downloads_archive')

const nedb_log_reader = require('electron').remote.require('./services/db/nedb_log_reader')
const moment = require('moment');

const { objArrayToCSV } = require('../services/app_utils');

const { console_red } = require('../services/logger');

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
        hideUnusedSelectOptions: true,
        uniqueId: 'id',
        //height: 300,
        sortName: 'transfer_date',
        sortOrder: 'desc',
        columns: [
            {
                field: 'id',
                visible: false
            },/*
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
            }, */
            {
                field: 'experiment_label',
                title: 'Session',
                filterControl: 'input',
                sortable: true
            }, 
            {
                field: 'date',
                title: 'Session Date',
                filterControl: 'input',
                sortable: true,
                //class: 'date_field'
            }, 
            {
                field: 'session_label',
                title: 'Study',
                filterControl: 'input',
                sortable: true,
                visible: false
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
                //class: 'date_field',
                formatter: function(value, row, index, field) {
                    return Helper.date_time(value);
                }
            }, 
            {
                field: 'status', //VALUES: queued, finished, xnat_error, in_progress, <float 0-100>
                title: 'Status',
                filterControl: 'select',
                filterData: 'json: {"In progress": "In progress", "Canceled": "Canceled", "queued": "Queued", "Completed": "Completed", "xnat_error": "XNAT Error"}',
                sortable: true,
                formatter: function(value, row, index, field) {
                    if (row.canceled) {
                        return `Canceled`;
                    }

                    if (typeof value !== 'string') {
                        let my_value = parseFloat(value);
                        let my_text = my_value === 100 ? 'Archiving...' : '';
                        return progress_bar_html(my_value, my_text);
                    } else {
                        //return value
                        return value === 'finished' ? 'Completed' : value;
                    } 
                }
            }, 
            {
                field: 'actions',
                title: 'Log',
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
                            let display_transfer_rate = (typeof row.status !== 'string') ? true : false;
                            content = `
                                <button class="btn btn-block btn-info" 
                                    data-toggle="modal" 
                                    data-target="#upload-details"
                                    data-id="${row.id}"
                                    data-session_label="${row.session_label}"
                                    data-show_transfer_rate="${display_transfer_rate}"
                                    ><i class="fas fa-upload"></i> Details</button>
                            `;
                    }

                    return content;
                }
            }
        ],
        data: []
    });

    db_uploads.listAll((err, uploads) => {
        console.log({uploads});

        let my_data = [];

        uploads.forEach((transfer) => {
            if (transfer.xnat_server === xnat_server && transfer.user === user_auth.username) {
                let study_label = transfer.session_data.studyId ? transfer.session_data.studyId : transfer.session_data.studyInstanceUid;
                let session_datetime = '';
                if (transfer.session_data.studyDate) {
                    session_datetime += transfer.session_data.studyDate
                    session_datetime += transfer.session_data.studyTime ? ' ' + transfer.session_data.studyTime : '00:00:00'
                }

                let item = {
                    id: transfer.id,
                    date: session_datetime,
                    session_label: study_label,
                    experiment_label: transfer.anon_variables.experiment_label,
                    //transfer_type: 'Upload',
                    transfer_date: transfer.transfer_start,
                    status: transfer.status,
                    actions: '',
                    server: transfer.xnat_server.split('://')[1],
                    user: transfer.user,
                    canceled: transfer.canceled === true ? true : false
                };

                my_data.push(item);
            }
        });

        console.log({tbl_data: my_data});
        

        $('#upload_monitor_table')
            .bootstrapTable('removeAll')    
            .bootstrapTable('append', my_data)
            .bootstrapTable('resetView');
    })

}

function _init_download_progress_table() {

    $('#download_monitor_table').bootstrapTable({
        filterControl: true,
        hideUnusedSelectOptions: true,
        uniqueId: 'id',
        //height: 300,
        sortName: 'transfer_start',
        sortOrder: 'desc',
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
                //class: 'date_field',
                formatter: function(value, row, index, field) {
                    return Helper.date_time(value);
                }
            }, 
            {
                field: 'basename',
                title: 'File',
                filterControl: 'input',
                sortable: true,
                formatter: function(value, row, index, field) {
                    return value.split('?')[0];
                }
            }, /*
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
            },*/
            {
                field: 'download_status', //VALUES: queued, finished, xnat_error, in_progress, <float 0-100>
                title: 'Status',
                filterControl: 'select',
                filterData: 'json: {"Canceled": "Canceled", "In progress": "In progress", "queued": "Queued", "Completed": "Completed", "XNAT Error": "XNAT Error", "complete_with_errors": "complete_with_errors"}',
                sortable: true,
                formatter: function(value, row, index, field) {
                    if (row.canceled) {
                        return `Canceled`;
                    }

                    if (typeof value !== 'string') {
                        let my_value = parseFloat(value);
                        return `
                        <div class="progress-container">
                            <div class="progress-bar bg-success" role="progressbar" aria-valuenow="${my_value}" aria-valuemin="0" aria-valuemax="100" style="width:${my_value}%; height:25px;">
                                <span class="sr-only">In progress</span>
                            </div>
                        </div>
                        `;
                    } else {
                        if (value == 'xnat_error') {
                            return `<i class="fas fa-exclamation-triangle"></i> XNAT Error`
                        } else if (value == 'complete_with_errors') {
                            return 'complete_with_errors';
                            //return `<i class="fas fa-exclamation-triangle"></i> Complete With Errors`
                        } else if (value == 'finished') {
                            return 'Completed';
                            //return `<i class="fas fa-exclamation-triangle"></i> Complete With Errors`
                        } else {
                            return value;
                        }
                    } 
                }
            }, 
            {
                field: 'actions',
                title: 'Log',
                escape: false,
                formatter: function(value, row, index, field) {
                    let content;
                    let basename = row.basename.split('?')[0];

                    let display_transfer_rate = (typeof row.download_status !== 'string') ? true : false;

                    switch(row.download_status) {
                        // TODO show info
                        case 'queued':
                            content = `
                                <button class="btn btn-block btn-warning" 
                                    data-toggle="modal" 
                                    data-target="#download-details"
                                    data-id="${row.id}"
                                    data-file="${basename}"
                                    data-show_transfer_rate="${display_transfer_rate}"
                                    ><i class="far fa-pause-circle"></i> Queued</button>
                            `;
                            break;

                        case 'finished':
                        case 'complete_with_errors':
                            content = `
                            <button class="btn btn-block btn-success" 
                                data-toggle="modal" 
                                data-target="#download-details"
                                data-id="${row.id}"
                                data-file="${basename}"
                                data-show_transfer_rate="${display_transfer_rate}"
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
                                    data-file="${basename}"
                                    data-show_transfer_rate="${display_transfer_rate}"
                                    ><i class="fas fa-upload"></i> Details</button>
                            `;
                    }

                    return content;
                }
            }
        ],
        data: []
    });


    db_downloads.listAll((err, downloads) => {
        console.log(downloads);
    

        let my_data = [];
    
        downloads.forEach((transfer) => {
            if (transfer.server === xnat_server && transfer.user === user_auth.username) {
                console.log('********************** DOWNLOAD transfer **********************');
                console.log(transfer);
                
                let item = {
                    id: transfer.id,
                    transfer_start: transfer.transfer_start,
                    basename: transfer.basename,
                    //dl_transfer_type: 'Download',
                    dl_server: transfer.server.split('://')[1],
                    dl_user: transfer.user,
                    download_status: transfer.hasOwnProperty('status') ? transfer.status : 0,
                    canceled: transfer.canceled === true ? true : false,
                    actions: ''
                };
    
                let x_total = 0, x_success = 0, x_error = 0, x_done = 0;
                transfer.sessions.forEach(function(session){
                    session.files.forEach(function(file){
                        x_total++;
        
                        if (file.status != 0) {
                            x_done++;
                        }
                        if (file.status === 1) {
                            x_success++;
                        }
                        if (file.status === -1) {
                            x_error++;
                        }
                    })
                });
        
                console.log('--------mile------------' , x_total, x_success, x_error, x_done, '---------------------');
    
                if (item.download_status === 0) {
                    let total_files = 0, done_files = 0, error_files = 0;
                    transfer.sessions.forEach(function(session){
                        session.files.forEach(function(file){
                            total_files++;
            
                            if (file.status != 0) {
                                done_files++;
                            }
                            if (file.status === -1) {
                                error_files++;
                            }
                        })
                    });
            
                    console.log('--------------------' , done_files, total_files, error_files, '---------------------');
                    
                    if (done_files == total_files) {
                        item.download_status = error_files ? 'complete_with_errors' : 'finished';

                        // added status for finished item (maybe move to _download.js)
                        db_downloads.updateProperty(transfer.id, 'status', item.download_status);
                    } else if (done_files == 0 && settings.get('transfering_download') !== transfer.id) {
                        item.download_status = 'queued';
                    } else {
                        item.download_status = done_files / total_files * 100;
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
    })

    
}

function _UI() {
    $('#progress-section .date_field input.form-control').datepicker({
        changeMonth: true,
        changeYear: true,
        dateFormat: "yy-mm-dd",
        beforeShow:function( input, inst ) {
          var dp = $(inst.dpDiv);
          console.log(inst, dp);
          
          var offset = $(input).outerWidth(false) - dp.outerWidth(false);
          dp.css('margin-right', offset);
        },
        onSelect: function(dateText, inst) {
            // $(this).closest('table.filtered-table').bootstrapTable('triggerSearch');
            // console.log(dateText)
        }
      });

    $('.js_pause_all').html(pause_btn_content(settings.get('global_pause')));

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

const csv_export_buttons = [
    '#download_log_csv',
    '#upload_log_csv',

    '#upload-success-log [data-save-csv]',
    '#error-log--download [data-save-csv]',
    '#error-log--upload [data-save-csv]'
];

$(document).on('click', csv_export_buttons.join(','), function(e) {
    let id = $(this).closest('.modal-content').attr('data-id');

    swal({
        title: "Notice!",
        text: "This log file may contain patient information extracted from your files. Please do not export without appropriate review.",
        icon: "warning",
        buttons: {
            yes: "Save log as CSV",
            cancel: "Cancel"
        },

        closeOnEsc: true,
        dangerMode: true
    })
    .then((toDownload) => {
        if (toDownload === "yes") {
            downloadCsvLog(id);
        }
    });
})

function downloadCsvLog(id) {
    nedb_log_reader.fetch_log(id, (err, docs) => {

        let relevant_data = docs.map(obj => {
            return Object.assign({}, {
                timestamp: obj.timestamp,
                type: obj.type, 
                status: obj.level,
                transfer_id: obj.transfer_id,
                message: obj.message,
                details: JSON.parse(obj.details)
            });
        });

        let csv = objArrayToCSV(relevant_data);

        var file = new File([csv], `log_export-${id}.csv`, {type: "text/csv;charset=utf-8"});
        FileSaver.saveAs(file);

    })
}

$(document).on('show.bs.modal', '#download-details', function(e) {
    var id = $(e.relatedTarget).data('id');
    var file = $(e.relatedTarget).data('file');
    var show_transfer_rate = $(e.relatedTarget).data('show_transfer_rate');
    $(e.currentTarget).find('#transfer_rate_download').toggle(show_transfer_rate)

    $(e.currentTarget).find('#file_basename').html(file);

    $('#download-details .modal-content').attr('data-id', id);

    set_download_details_total_percentage(id)

    _init_download_details_table(id)


    nedb_log_reader.fetch_log(id, (err, docs) => {
        console.log(docs);
        $('#download-nedb-log').html('');
        $('#download-nedb-log').append(`
            <tr>
                <th>Type</th>
                <th>Message</th>
                <th>Date/Time</th>
            </tr>
        `)
        
        docs.forEach(doc => {
            let datetime = moment(doc.timestamp).format('YYYY-MM-DD HH:mm:ss')
            $('#download-nedb-log').append(`
                <tr>
                    <td>${doc.level}</td>
                    <td>${doc.message}</td>
                    <td>${datetime}</td>
                    <!-- <td>${doc.details}</td> -->
                </tr>
            `)
        })
    })
});

function set_download_details_total_percentage(transfer_id) {

    db_downloads._getById(transfer_id)
        .then(transfer => {
            if (transfer) {
                let total_files = transfer.sessions.reduce((total, session) => {
                    return total + session.files.length
                }, 0);
                
                let transfered_files = transfer.sessions.reduce((total, session) => {
                    let transfered = session.files.reduce((t, file) => {
                        let add = file.status !== 0 ? 1 : 0;
                        return t + add
                    }, 0);
                    return total + transfered
                }, 0);

                let percent = 100 * transfered_files / total_files;
                let $details_total_progress_bar = $('#transfer_rate_download .progress-bar');
                $details_total_progress_bar.attr('aria-valuenow', percent).css('width', percent + '%');
        
            } else {
                throw new Error('greska')
            }
        })
        .catch(err => {

        });

}

$(document).on('show.bs.modal', '#error-log--download', function(e) {
    var transfer_id = $(e.relatedTarget).data('id');
    $('#error-log--download .modal-content').attr('data-id', transfer_id);

    var id = parseInt(transfer_id);
    let $log_text = $(e.currentTarget).find('.log-text');

    db_downloads.getById(id, (err, download) => {
        $log_text.html(download.error);
    });
});

$(document).on('show.bs.modal', '#error-log--upload', function(e) {
    var transfer_id = $(e.relatedTarget).data('id');
    $('#error-log--upload .modal-content').attr('data-id', transfer_id);
    var log = $(this).find('.log-text');
    nedb_log_reader.fetch_log(transfer_id, (err, docs) => {
        console.log(docs);
        table = '<table class="table table-bordered">';
        table += `
            <tr>
                <th>Type</th>
                <th>Message</th>
                <th>Date/Time</th>
                <th>Details</th>
            </tr>
        `;
        
        docs.forEach(doc => {
            let datetime = moment(doc.timestamp).format('YYYY-MM-DD HH:mm:ss')
            let details;
            try {
                details = JSON.parse(doc.details).data;
            } catch (e) {
                details = doc.details;
            }
            table += `
                <tr>
                    <td>${doc.level}</td>
                    <td>${doc.message}</td>
                    <td>${datetime}</td>
                    <td style="font-size: 11px;">${details}</td>
                </tr>
            `;
        })
        table += '</table>';
        log.html('');
        log.append(table);
    });
});

$(document).on('show.bs.modal', '#upload-details', function(e) {
    var id = $(e.relatedTarget).data('id');

    var show_transfer_rate = $(e.relatedTarget).data('show_transfer_rate');
    $(e.currentTarget).find('#transfer_rate_upload').toggle(show_transfer_rate)

    var session_label = $(e.relatedTarget).data('session_label');

    $(e.currentTarget).find('#session_label').html(session_label);

    $('#upload-details .modal-content').attr('data-id', id);

    set_upload_details_total_percentage(id)

    _init_upload_details_table(id)

    nedb_log_reader.fetch_log(id, (err, docs) => {
        console.log(docs);
        $('#upload-nedb-log').html('');
        $('#upload-nedb-log').append(`
            <tr>
                <th>Type</th>
                <th>Message</th>
                <th>Date/Time</th>
            </tr>
        `)
        
        docs.forEach(doc => {
            let datetime = moment(doc.timestamp).format('YYYY-MM-DD HH:mm:ss')
            $('#upload-nedb-log').append(`
                <tr>
                    <td>${doc.level}</td>
                    <td>${doc.message}</td>
                    <td>${datetime}</td>
                    <!-- <td>${doc.details}</td> -->
                </tr>
            `)
        })
    })
    
});


$(document).on('hidden.bs.modal', function(){
    $('#upload-nedb-log-container').collapse("hide");
});

function set_upload_details_total_percentage(transfer_id) {

    db_uploads._getById(transfer_id)
        .then(transfer => {
            if (transfer) {
                let total_files = transfer.series.length;
                let transfered_files = transfer.done_series_ids ? transfer.done_series_ids.length : 0;

                let percent = 100 * transfered_files / total_files;
                let $details_total_progress_bar = $('#transfer_rate_upload .progress-bar');
                $details_total_progress_bar.attr('aria-valuenow', percent).css('width', percent + '%');
        
            } else {
                throw new Error('greska')
            }
        })
        .catch(err => {

        });

}

// fix modal from modal body overflow problem
$(document).on('shown.bs.modal', '#upload-details', function(e) {
    $('body').addClass('modal-open')
});

$(document).on('show.bs.modal', '#upload-success-log', function(e) {
    var transfer_id = $(e.relatedTarget).data('id');

    $('#upload-success-log .modal-content').attr('data-id', transfer_id);

    db_uploads.getById(transfer_id, (err, my_transfer) => {
        console.log(my_transfer);
        console.log($(e.currentTarget));
    
        let $log_text = $(e.currentTarget).find('.log-text');
        $log_text.html('');
    
        $('#upload-details-link').data({
            id: my_transfer.id,
            session_label: my_transfer.url_data.expt_label
        });

        for (key in my_transfer.session_data) {
            $log_text.append(`<p><b>${key}</b>: <span>${my_transfer.session_data[key]}</span></p>\n`);
        }
    
        let total_files = my_transfer.summary.total_files.reduce((prevVal, item) => {
            return prevVal + item;
        }, 0);
        let total_size = my_transfer.summary.total_size.reduce((prevVal, item) => {
            return prevVal + item;
        }, 0);
    
        $log_text.append(`<p><b>Total files</b>: <span>${total_files} (${prettyBytes(total_size)})</span></p>\n`);
        $log_text.append(`<p><a href="${my_transfer.session_link}" target="_blank"><b>Session Link</b></a><span style="display: none;">:</span> <a style="display: none;" href="${my_transfer.session_link}">${my_transfer.session_link}</a>`);
    
        let $ul = $(`<ul>`);
        for (key in my_transfer.anon_variables) {
            $ul.append(`<li><b>${key}</b>: <span>${my_transfer.anon_variables[key]}</span></li>\n`);
        }
    
        $log_text.append(`<b>Anon variables:</b>\n`).append($ul);
    
    
        //_init_upload_details_table(id)
    })
    
});

$(document).on('shown.bs.tab', '#progress-section .nav-tabs a', function (e) {
    let transfer_label = e.currentTarget.id === 'nav-upload-tab' ? 'Upload' : 'Download';
    $('#progress-section #transfer-type').text(transfer_label)
});


function _init_download_details_table(transfer_id) {
    function init_bootstrap_table(transfer) {
        $('#download-details-table').bootstrapTable('destroy');
        $('#download-details-table').bootstrapTable({
            uniqueId: 'id',
            detailView: true,
            detailFormatter: function(index, row) {
                var html = [];
    
                transfer.sessions.forEach(function(session){
                    if (session.id == row.id) {
                        session.files.forEach(function(file){
                            let status_icon;
                            switch (file.status) {
                                case 0:
                                case undefined:
                                    status_icon = '<i class="far fa-clock"></i>'
                                    break;
    
                                case 1:
                                    status_icon = '<i style="color: green" class="fas fa-check"></i>'
                                    break;
    
                                case -1:
                                    status_icon = '<i style="color: red" class="fas fa-exclamation-triangle"></i>'
                                    break;
                            }
                            html.push('<tr><td style="text-align: center;">' + status_icon + '</td><td>' + file.name + '</td></tr>');
                        });
                    }
                });
    
                return '<table class="table-sm table-bordered">' + html.join('') + '</table>';
                
            },
            columns: [
                {
                    field: 'id',
                    title: 'ID',
                    visible: false
                }, 
                {
                    field: 'transfer_id',
                    title: 'Transfer ID',
                    visible: false
                },
                {
                    field: 'session',
                    title: 'Session',
                    sortable: true,
                    formatter: function(str, row, index, field) {
                        const regex_project = /project: (\w+)/i;
                        const regex_subject = /subject: (\w+)/i;
                        const regex_label = /label: (\w+)/i;
                        let p, s, l;

                        if (
                            (p = regex_project.exec(str)) !== null &&
                            (s = regex_subject.exec(str)) !== null &&
                            (l = regex_label.exec(str)) !== null
                        ) {
                            return `<b>${l[1]}</b> (Subject: ${s[1]}, Project: ${p[1]})`;
                        } else {
                            return str;
                        }
                    }
                },  
                {
                    field: 'file_count',
                    title: 'File Count',
                    sortable: true,
                    align: 'center',
                    visible: false
                }, 
                {
                    field: 'scan_count',
                    title: 'Scans',
                    sortable: true,
                    align: 'right',
                    class: 'right-aligned'
                }, 
                {
                    field: 'errors',
                    title: 'Errors',
                    sortable: true,
                    align: 'right',
                    class: 'right-aligned'
                },
                {
                    field: 'progress',
                    title: 'Download progress',
                    sortable: false,
                    formatter: function(value, row, index, field) {
                        let percent = value / row.file_count * 100;
                        return `
                        <div class="progress-container">
                            <div class="progress-bar bg-success" role="progressbar" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="${row.file_count}" style="width:${percent}%; height:25px;">
                                <span class="sr-only">In progress</span>
                            </div>
                        </div>
                        `;
                    }
                }
            ],
            data: []
        });
    }
    
    db_downloads.getById(transfer_id, (err, transfer) => {
        init_bootstrap_table(transfer);

        let my_data = [];

        let $details = $('#download-details');

        let $buttons = $details.find('.js_pause_download, .js_cancel_download');
        if (transfer.status === 'finished' || transfer.status === 'complete_with_errors') {
            $buttons.hide();
        } else {
            $buttons.show();

            let cancel_button_html = transfer.canceled ? '<i class="fas fa-redo"></i> Restart Download' : '<i class="far fa-stop-circle"></i> Cancel Download';
            $details.find('.js_cancel_download').data({
                'transfer_id': transfer_id,
                'new_cancel_status': !transfer.canceled
            }).html(cancel_button_html);
        }

        $('#download-details').find('.modal-content').toggleClass('transfer-canceled', transfer.canceled);
        

        transfer.sessions.forEach(function(session){
            let single_session = {
                id: session.id,
                transfer_id: transfer.id,
                session: session.name,
                file_count: session.files.length,
                scan_count: 0,
                progress: 0,
                errors: 0
            };
            let uri_counter = [];
            session.files.forEach(function(file){
                uri_counter.push(file.uri.split('/resources/')[0]);

                if (file.status != 0) {
                    single_session.progress++;
                }

                if (file.status === -1) {
                    single_session.errors++;
                }
            });

            single_session.scan_count = ($.unique(uri_counter)).length;

            my_data.push(single_session);
        });

        console.log(my_data);

        $('#download-details-table')
            .bootstrapTable('removeAll')    
            .bootstrapTable('append', my_data)
            .bootstrapTable('resetView');
    });


    // TODO migrate open links to table!!! transfer.sessions[1].files[0].name ... up one directory
    //$('#download-details-table').closest('.bootstrap-table').after(`<button type="button" data="" class="btn btn-blue">Open</button>`)
}

function _init_upload_details_table(transfer_id) {
    function init_bootstrap_table(transfer) {
        $('#upload-details-table').bootstrapTable('destroy');
        $('#upload-details-table').bootstrapTable({
            uniqueId: 'id',
            sortName: 'series_number',
            sortOrder: 'asc',
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
                    field: 'progress',
                    title: 'Upload Progress',
                    sortable: false,
                    formatter: function(value, row, index, field) {
                        return progress_bar_html(value);
                    }
                },
                {
                    field: 'size',
                    title: 'Size (bytes)',
                    sortable: true,
                    align: 'right',
                    class: 'right-aligned',
                    formatter: function(value, row, index, field) {
                        return prettyBytes(value);
                        // return `${(value / 1024 / 1024).toFixed(2)} MB`;
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
    }
    

    db_uploads.getById(transfer_id, (err, transfer) => {
        init_bootstrap_table(transfer);

        let $details = $('#upload-details');
        let $buttons = $details.find('.js_pause_upload, .js_cancel_upload');
        if (transfer.status === 'finished') {
            $buttons.hide();
        } else {
            $buttons.show();

            let cancel_button_html = transfer.canceled ? '<i class="fas fa-redo"></i> Restart Upload' : '<i class="far fa-stop-circle"></i> Cancel Upload';
            $details.find('.js_cancel_upload').data({
                'transfer_id': transfer_id,
                'new_cancel_status': !transfer.canceled
            }).html(cancel_button_html);
        }

        $('#upload-details').find('.modal-content').toggleClass('transfer-canceled', transfer.canceled);

        $('#upload-details-table')
            .bootstrapTable('removeAll')    
            .bootstrapTable('append', transfer.table_rows)
            .bootstrapTable('resetView');
    });
    
}


$(document).on('click', '.js_cancel_download', function(e){
    let $button = $(this);
    
    let transfer_id = $button.data('transfer_id');
    let new_cancel_status = $button.data('new_cancel_status');



    // disable button to prevent further submission
    $button.attr("disabled", true);

    //db_downloads.updateProperty(transfer_id, 'canceled', new_cancel_status);


    db_downloads._updateProperty(transfer_id, 'canceled', new_cancel_status)
    .then(num => {

        setTimeout(() => {
            db_downloads._getById(transfer_id)
                .then(transfer => {
                    if (transfer) {
                        //TODO check if all transfered and disable cancel if so

                        if (transfer.canceled === new_cancel_status) {
                            if (new_cancel_status) {
                                console_red('js_cancel_download SUCCESS', {
                                    new_cancel_status,
                                    num
                                })

                                ipc.send('cancel_download', transfer_id);
                            } else {
                                ipc.send('start_download');
                            }
                            
                            $('#download-details').find('.modal-content').toggleClass('transfer-canceled', new_cancel_status);
                        
                            let cancel_button_html = new_cancel_status ? '<i class="fas fa-redo"></i> Restart Download' : '<i class="far fa-stop-circle"></i> Cancel Download';
                            $button.attr("disabled", false).data('new_cancel_status', !new_cancel_status).html(cancel_button_html);
                        
                            update_transfer_cancel_status('#download_monitor_table', transfer_id, new_cancel_status);
                            
                        } else {
                            console_red('FAIL TRY AGAIN', 'ok')
                            $button.attr("disabled", false).trigger('click')
                        }
                    } else {
                        throw new Error('greska')
                    }
                })
                .catch(err => {
                    $button.attr("disabled", false)
                    console_red('IMMEDIATE ERROR', {err})
                })
        }, 200)
        
        
    })
    .catch(err => {
        console_red('js_cancel_download', {err})
    })


});

$(document).on('click', '.js_cancel_upload', function(e){
    let $button = $(this);
    
    let transfer_id = $button.data('transfer_id');
    let new_cancel_status = $button.data('new_cancel_status');

    // disable button to prevent further submission
    $button.attr("disabled", true);

    db_uploads._updateProperty(transfer_id, 'canceled', new_cancel_status)
        .then(num => {
            setTimeout(() => {
                db_uploads._getById(transfer_id)
                    .then(transfer => {
                        if (transfer) {
                            console_red('TRANSFER', {transfer})
                            //TODO check if all transfered and disable cancel if so
                            if (transfer.canceled === new_cancel_status) {
                                if (new_cancel_status) {
                                    console_red('js_cancel_upload SUCCESS', {
                                        new_cancel_status,
                                        num
                                    })
                    
                                    ipc.send('cancel_upload', transfer_id);
                                } else {
                                    ipc.send('start_upload');
                                }
                                
                                $('#upload-details').find('.modal-content').toggleClass('transfer-canceled', new_cancel_status);
                            
                                let cancel_button_html = new_cancel_status ? '<i class="fas fa-redo"></i> Restart Upload' : '<i class="far fa-stop-circle"></i> Cancel Upload';
                                $button.attr("disabled", false).data('new_cancel_status', !new_cancel_status).html(cancel_button_html);
                            
                                update_transfer_cancel_status('#upload_monitor_table', transfer_id, new_cancel_status);
                                
                            } else {
                                console_red('FAIL TRY AGAIN', 'ok')
                                $button.attr("disabled", false).trigger('click')
                            }
                        } else {
                            throw new Error('greska upload')
                        }
                    })
                    .catch(err => {
                        $button.attr("disabled", false)
                        console_red('IMMEDIATE ERROR upload', {err})
                    })
            }, 200)

        
        })
        .catch(err => {
            console_red('js_cancel_upload', {err})
        })

    
});

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

    Promise.all([
        update_uploads_cancel_status(true), 
        update_downloads_cancel_status(true)
    ]).then(([modified_uploads, modified_downloads]) => {
        ipc.send('reload_upload_window');
        ipc.send('reload_download_window');

        settings.set('global_pause', global_pause);

        if (modified_uploads + modified_downloads === 0) {
            Helper.pnotify('Cancel All Tranfsers', 'No new transfers were canceled.', 'notice');
        } else {
            Helper.pnotify('Cancel All Tranfsers - Success', `Downloads canceled: ${modified_downloads}
                Uploads canceled: ${modified_uploads}`);
        }

        _init_download_progress_table();
        _init_upload_progress_table();
    });
    
});

$(document).on('click', '.js_restart_all_transfers', function(){
    let global_pause = settings.get('global_pause');
    settings.set('global_pause', true);

    Promise.all([
        update_uploads_cancel_status(false), 
        update_downloads_cancel_status(false)
    ]).then(([modified_uploads, modified_downloads]) => {
        ipc.send('reload_upload_window');
        ipc.send('reload_download_window');

        settings.set('global_pause', global_pause);

        if (modified_uploads + modified_downloads === 0) {
            Helper.pnotify('Restart All Canceled', 'No transfers were restarted.', 'notice');
        } else {
            Helper.pnotify('Restart All Canceled - Success', `Downloads restarted: ${modified_downloads}
                Uploads restarted: ${modified_uploads}`);
        }
    
        _init_download_progress_table();
        _init_upload_progress_table();
    });
    
});

$(document).on('click', '.js_pause_all', function(){
    let new_pause_status = !settings.get('global_pause');
    global_pause_status(new_pause_status)
});

function global_pause_status(new_pause_status) {
    if (settings.get('global_pause') === new_pause_status) {
        return;
    }

    if (!new_pause_status) {
        ipc.send('start_download');
        ipc.send('start_upload');
    }
    
    settings.set('global_pause', new_pause_status);
    $('#progress-section .js_pause_all').html(pause_btn_content(new_pause_status));

    let title = new_pause_status ? 'Pause' : 'Resume';
    let body = new_pause_status ? 'Paused' : 'Resumed';

    Helper.pnotify(`${title} All Tranfsers`, `All Transfers Successfully ${body}.`, 'success', 3000);
}

$(document).on('click', '.js_clear_finished', function(){

    Promise.all([
        db_uploads._listAll(), 
        db_downloads._listAll()
    ]).then(([all_uploads, all_downloads]) => {
        const cancel_reducer = (total, transfer) => {
            return total + transfer.canceled
        }
        let canceled_count = all_uploads.reduce(cancel_reducer, 0) + all_downloads.reduce(cancel_reducer, 0);
        

        const finished_reducer = (total, transfer) => {
            return total + (transfer.hasOwnProperty('status') && (transfer.status === "finished" || transfer.status === "complete_with_errors"))
        }

        let finished_count = all_uploads.reduce(finished_reducer, 0) + all_downloads.reduce(finished_reducer, 0);


        console.log({all_uploads, all_downloads, canceled_count, finished_count});

        let question;
        if (canceled_count > 0 && finished_count > 0) {
            
            question = {
                title: "Which transfers to archive?",
                text: "Choose which uploads and downloads to archive.",
                icon: "warning",
                buttons: {
                    all: "Completed and Canceled",
                    finished: "Only Completed",
                    cancel: "Cancel"
                },
        
                closeOnEsc: false,
                dangerMode: true
            }


        } else if (finished_count > 0) {

            question = {
                title: "Archive completed transfers?",
                text: "All completed uploads and downloads will be archived.",
                icon: "warning",
                buttons: {
                    all: "Yes",
                    cancel: "Cancel"
                },
        
                closeOnEsc: false,
                dangerMode: true
            }

        } else if (canceled_count > 0) {
            question = {
                title: "Archive canceled transfers?",
                text: "There are no completed transfers. Archive CANCELED transfers?",
                icon: "warning",
                buttons: {
                    all: "Yes",
                    cancel: "Cancel"
                },
        
                closeOnEsc: false,
                dangerMode: true
            }
        } else {
            swal('Nothing to archive!', 'There are no finished or canceled transfers', 'warning');
            return;
        }

        swal(question)
            .then((toClear) => {
                console.log(toClear);
                switch (toClear) {
                    case "all":
                        remove_transfers(true);
                        break;

                    case "finished":
                        remove_transfers(false);
                        break;

                    default:
                        
                }
            });
        
    });


});


function update_uploads_cancel_status(new_cancel_status) {
    // db_uploads().find({canceled: {$ne: !new_cancel_status}, $where: () => this.series_ids.length }, (err, my_transfers) => {

    // });

    return new Promise((resolve, reject) => {
        db_uploads.listAll((err, my_transfers) => {
            let updated = 0;
    
            my_transfers.forEach((transfer) => {
                // validate current user/server
                if (transfer.xnat_server === xnat_server &&
                    transfer.user === user_auth.username &&
                    transfer.canceled != new_cancel_status && 
                    typeof transfer.status == 'number' &&
                    transfer.series_ids.length
                ) {
                    db_uploads.updateProperty(transfer.id, 'canceled', new_cancel_status)
                    updated++;
                }
            });

            // ugly hack
            setTimeout(() => {
                resolve(updated);
            }, 500)
        })
    })

}

function update_downloads_cancel_status(new_cancel_status) {
    return new Promise((resolve, reject) => {
        db_downloads.listAll((err, my_transfers) => {
            let updated = 0;
    
            my_transfers.forEach((transfer) => {
                if (transfer.server === xnat_server && 
                    transfer.user === user_auth.username && 
                    transfer.canceled != new_cancel_status
                ) {
                    let left_to_download = 0;
            
                    transfer.sessions.forEach(function(session){
                        session.files.forEach(function(file){
                            if (file.status === 0) {
                                left_to_download++;
                            }
                        });
                    });
        
                    if (left_to_download) {
                        db_downloads.updateProperty(transfer.id, 'canceled', new_cancel_status)
                        updated++;
                    }
                }
                
            });

            // ugly hack
            setTimeout(() => {
                resolve(updated);
            }, 500)
        })
    })

}

function remove_transfers(include_canceled) {
    Promise.all([
        remove_finished_uploads(include_canceled), 
        remove_finished_downloads(include_canceled)
    ]).then(([removed_uploads, removed_download]) => {
        console_red('remove_transfers -> then', {removed_uploads, removed_download})
        Helper.pnotify(`Clear Completed Tranfsers`,  `Downloads Removed: ${removed_download}
        Uploads Removed: ${removed_uploads}`, 'success');

        //_init_download_progress_table();
        //_init_upload_progress_table();
    })
}

function remove_finished_uploads(remove_canceled = false) {
    return new Promise((resolve, reject) => {
        db_uploads.listAll((err, my_transfers) => {
            let to_archive = [];
            let delete_ids = [];
    
            my_transfers.forEach((transfer) => {
                // validate current user/server
                if (transfer.xnat_server === xnat_server && transfer.user === user_auth.username) {
                    let include_canceled = remove_canceled && transfer.canceled === true;
                    
                    if (transfer.status === 'finished' || include_canceled) {
                        delete_ids.push(transfer._id);
                        to_archive.push(transfer)
                    }
                }
            });

            console_red('remove_finished_uploads', {to_archive, delete_ids})
    
            if (delete_ids.length) {
                db_uploads().remove({_id: {$in: delete_ids}}, {multi: true}, (err, numRemoved) => {
                    console.log(`Removed ${numRemoved} from ${delete_ids.length} from db.uploads`)
        
                    db_uploads_archive().insert(to_archive, function (err, newDocs) {
                        //console.log(`Added ${newDocs.length} from ${to_archive.length} into db.uploads_archive`)
        
                        _init_upload_progress_table();
    
                        resolve(numRemoved)
                    });
                })
            } else {
                resolve(0)
            }
    
        })
    })

}

function remove_finished_downloads(remove_canceled = false) {
    return new Promise((resolve, reject) => {
        db_downloads.listAll((err, my_transfers) => {
            let to_archive = [];
            let delete_ids = [];

            console_red('my_transfers', {my_transfers})
    
            my_transfers.forEach((transfer) => {
                // validate current user/server
                if (transfer.server === xnat_server && transfer.user === user_auth.username) {
                    let include_canceled = remove_canceled && transfer.canceled === true;
                    if (transfer.status === 'finished' || transfer.status === 'complete_with_errors' || include_canceled) {
                        delete_ids.push(transfer._id);
                        to_archive.push(transfer)
                    }
                }
                
            });

            console_red('remove_finished_downloads', {to_archive, delete_ids})

            if (delete_ids.length) {
                db_downloads().remove({_id: {$in: delete_ids}}, {multi: true}, (err, numRemoved) => {
                    console.log(`Removed ${numRemoved} from ${delete_ids.length} from db.uploads`)
        
                    db_downloads_archive().insert(to_archive, function (err, newDocs) {
                        //console.log(`Added ${newDocs.length} from ${to_archive.length} into db.uploads_archive`)
        
                        _init_download_progress_table();
    
                        resolve(numRemoved)
                    });
                })
            } else {
                resolve(0);
            }
    
        })
    })

}

function pause_btn_content(status) {
    return status ? 
        '<i class="far fa-play-circle"></i> Resume All' :
        '<i class="far fa-pause-circle"></i> Pause All';
}

function update_transfer_cancel_status(table_id, transfer_id, new_cancel_status) {
    $(table_id).bootstrapTable('updateByUniqueId', {
        id: transfer_id,
        row: {
            canceled: new_cancel_status
        }
    });
}

function progress_bar_html(my_value, my_text) {
    return `
    <div class="progress-container">
        <div class="progress-bar bg-success" role="progressbar" aria-valuenow="${my_value}" aria-valuemin="0" aria-valuemax="100" style="width:${my_value}%; height:25px;">
            ${my_text || ''}
            <span class="sr-only">In progress</span>
        </div>
    </div>
    `;
}

ipc.on('upload_finished',function(e, transfer_id){
    let $modal_content = $(`#upload-details [data-id=${transfer_id}]`);

    console_red('ipc.on upload_finished', $modal_content.length, $modal_content.is(':visible'))

    if ($modal_content.is(':visible')) {
        $(`#upload-details`).modal('hide');
        $(`tr[data-uniqueid=${transfer_id}] button[data-toggle=modal]`).trigger('click');
    }
})


ipc.on('progress_cell',function(e, item){
    console_red('progress_cell', item);
    let $item_table = $(item.table);
    let $tbl_row = $(`${item.table} [data-uniqueid="${item.id}"]`);
    let is_upload = item.table === '#upload_monitor_table';

    if ($item_table.length && $tbl_row.length) {
        let $progress_bar = $tbl_row.find('.progress-bar');

        let reinit = typeof item.value != 'number' || $progress_bar.length == 0;
        
        $item_table.bootstrapTable("updateCellByUniqueId", {
            id: item.id,
            field: item.field,
            value: item.value,
            reinit: reinit
        });

        if (!reinit) {
            let percent = 100 * item.value / parseInt($progress_bar.attr('aria-valuemax'));
            $progress_bar.attr('aria-valuenow', item.value).css('width', percent + '%');
            if (percent === 100 && is_upload) {
                $progress_bar.append('Archiving...');
            }
        }



        if (item.table === '#download_monitor_table') {
            let $modal_content = $(`#download-details [data-id=${item.id}]`);
            
            if (typeof item.value != 'number') {
                
                $modal_content.find('.js_cancel_download').hide();
    
                let set_not_canceled = false;
                db_downloads._updateProperty(item.id, 'canceled', set_not_canceled)
                    .then(num => {
                        console.log('xxx', $modal_content.length, item.id)
                        $modal_content.find('#transfer_rate_download').hide();
                        $modal_content.toggleClass('transfer-canceled', set_not_canceled);
                        update_transfer_cancel_status('#download_monitor_table', item.id, set_not_canceled);
                    })
                    .catch(err => {
                        console_red('progress_cell error', {err})
                    })
            }

            if ($modal_content.is(':visible')) {
                let $details_total_progress_bar = $modal_content.find('#transfer_rate_download .progress-bar');

                let percent = 100 * item.value / parseInt($details_total_progress_bar.attr('aria-valuemax'));
                $details_total_progress_bar.attr('aria-valuenow', percent).css('width', percent + '%');
            }
        }

        if (is_upload) {
            let $modal_content = $(`#upload-details [data-id=${item.id}]`);

            if (typeof item.value != 'number') {
                $modal_content.find('.js_cancel_upload').hide();
                $modal_content.find('#transfer_rate_upload').hide();
            }

            if ($modal_content.is(':visible')) {
                let $details_total_progress_bar = $modal_content.find('#transfer_rate_upload .progress-bar');

                let percent = 100 * item.value / parseInt($details_total_progress_bar.attr('aria-valuemax'));
                $details_total_progress_bar.attr('aria-valuenow', percent).css('width', percent + '%');
            }
        }

        
        
    }

});

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

ipc.on('upload_progress',function(e, item) {
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

ipc.on('global_pause_status', function(e, item) {
    global_pause_status(item)
    // $('.js_pause_all').html(pause_btn_content(item));
})

ipc.on('mizer_error_file', (e, message, file) => {

    let msg = `An error occured while trying to anonymize a file:\n${file}.\n\nTransfer was canceled.`

    let html = $(`<div class="error-details-outer">
        <p>
            <button class="btn btn-sm btn-gray" 
                type="button" data-toggle="collapse" data-target="#errorDetails" 
                aria-expanded="false" aria-controls="errorDetails">
                Details
            </button>
        </p>
        <div class="collapse" id="errorDetails">
            <small class="card card-body text-left">
                ${message}
            </small>
        </div>
    </div>
    `)

    swal({
        title: 'Anonymization Error',
        text: msg,
        content: html.get(0),
        icon: "error",
        buttons: ['Okay'],
        dangerMode: true
    })

    _init_upload_progress_table()

    console.log({mizer_error: message});
})