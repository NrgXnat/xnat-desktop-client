require('promise.prototype.finally').shim();
const settings = require('electron-settings');
const ipc = require('electron').ipcRenderer;
const prettyBytes = require('pretty-bytes');

const FileSaver = require('file-saver');

const db_uploads_archive = require('electron').remote.require('./services/db/uploads_archive')
const db_downloads_archive = require('electron').remote.require('./services/db/downloads_archive')

const NProgress = require('nprogress');
NProgress.configure({ 
    trickle: false,
    easing: 'ease',
    speed: 1,
    minimum: 0.03
});


let xnat_server, user_auth;


function _init_upload_archive_table() {
    $('#upload_archive_table').bootstrapTable({
        filterControl: true,
        hideUnusedSelectOptions: true,
        uniqueId: 'id',
        //height: 300,
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
                sortable: true,
                visible: false
            },
            {
                field: 'experiment_label',
                title: 'Session Label',
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
                                data-target="#upload-archive-success-log"
                                data-id="${row.id}"
                                ><i class="fas fa-download"></i> Log</button>
                            `;
                            break;
                            
                        case 'xnat_error':
                            content = `
                            <button class="btn btn-block btn-danger" 
                                data-toggle="modal" 
                                data-target="#error-log--upload-archive"
                                data-id="${row.id}"
                                ><i class="fas fa-exclamation-triangle"></i> Log</button>
                            `;
                            break;
                        
                        default: // float
                            content = `
                                <button class="btn btn-block btn-info" 
                                    data-toggle="modal" 
                                    data-target="#upload-archive-details"
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

    db_uploads_archive.listAll((err, uploads) => {
        console.log(uploads);
    
        let my_data = [];
    
        uploads.forEach(function(transfer) {
            console.log(transfer)
            if (transfer.xnat_server === xnat_server && transfer.user === user_auth.username) {
                let study_label = transfer.session_data.studyId ? transfer.session_data.studyId : transfer.session_data.studyInstanceUid;
                let item = {
                    id: transfer.id,
                    date: transfer.session_data.studyDate,
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
    
        console.log(my_data);
        
    
        $('#upload_archive_table')
            .bootstrapTable('removeAll')    
            .bootstrapTable('append', my_data)
            .bootstrapTable('resetView');
    })
        
}

function _init_download_archive_table() {

    $('#download_archive_table').bootstrapTable({
        filterControl: true,
        hideUnusedSelectOptions: true,
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
                        } else if (value == 'complete_with_errors') {
                            return 'complete_with_errors';
                            //return `<i class="fas fa-exclamation-triangle"></i> Complete With Errors`
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
                    let basename = row.basename.split('?')[0];
                    switch(row.download_status) {
                        // TODO show info
                        case 'queued':
                            content = `
                                <button class="btn btn-block btn-warning" 
                                    disabled
                                    ><i class="far fa-pause-circle"></i> Queued</button>
                            `;
                            break;

                        case 'finished':
                        case 'complete_with_errors':
                            content = `
                            <button class="btn btn-block btn-success" 
                                data-toggle="modal" 
                                data-target="#download-archive-details"
                                data-id="${row.id}"
                                data-file="${basename}"
                                ><i class="fas fa-download"></i> Log</button>
                            `;
                            break;

                        case 'xnat_error':
                            content = `
                            <button class="btn btn-block btn-danger" 
                                data-toggle="modal" 
                                data-target="#error-log--download-archive"
                                data-id="${row.id}"
                                ><i class="fas fa-exclamation-triangle"></i> Log</button>
                            `;
                            break;
                        
                        default: // float
                            content = `
                                <button class="btn btn-block btn-info" 
                                    data-toggle="modal" 
                                    data-target="#download-archive-details"
                                    data-id="${row.id}"
                                    data-file="${basename}"
                                    ><i class="fas fa-upload"></i> Details</button>
                            `;
                    }

                    return content;
                }
            }
        ],
        data: []
    });

    db_downloads_archive.listAll((err, downloads) => {
        console.log(downloads);

        let my_data = [];
    
        downloads.forEach(function(transfer) {
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
                    } else if (done_files == 0) {
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
        
    
        $('#download_archive_table')
            .bootstrapTable('removeAll')    
            .bootstrapTable('append', my_data)
            .bootstrapTable('resetView');
    })
    
}

function _UI() {
    $('#progress-archive-section .date_field input.form-control').datepicker({
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

    _init_download_archive_table();
    _init_upload_archive_table();
    _UI();
}


if (!settings.has('user_auth') || !settings.has('xnat_server')) {
    ipc.send('redirect', 'login.html');
    return;
}


$(document).on('page:load', '#progress-archive-section', function(e){
    console.log('PROGRESS ARCHIVE page:load triggered');
    
    _init_variables();
});

$(document).on('show.bs.modal', '#download-archive-details', function(e) {
    var id = $(e.relatedTarget).data('id');
    var file = $(e.relatedTarget).data('file');

    $(e.currentTarget).find('#file_basename').html(file);

    _init_download_details_table(id)
});


$(document).on('show.bs.modal', '#error-log--download-archive', function(e) {
    var id = parseInt($(e.relatedTarget).data('id'));
    let $log_text = $(e.currentTarget).find('.log-text');

    db_downloads_archive.getById(id, (err, download) => {
        $log_text.html(download.error);
    });
});


$(document).on('show.bs.modal', '#upload-archive-details', function(e) {
    var id = $(e.relatedTarget).data('id');

    var session_label = $(e.relatedTarget).data('session_label');

    $(e.currentTarget).find('#session_label').html(session_label);

    _init_upload_details_table(id)
});

// fix modal from modal body overflow problem
$(document).on('shown.bs.modal', '#upload-archive-details', function(e) {
    $('body').addClass('modal-open')
});

$(document).on('show.bs.modal', '#upload-archive-success-log', function(e) {
    db_uploads_archive.getById(transfer_id, (err, my_transfer) => {
        console.log(my_transfer);
        console.log($(e.currentTarget));
    
        let $log_text = $(e.currentTarget).find('.log-text');
        $log_text.html('');
    
        $('#upload-archive-details-link').data({
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
    })


    //_init_upload_details_table(id)
});


function _init_download_details_table(transfer_id) {
    
    $('#download-archive-details-table').bootstrapTable({
        uniqueId: 'id',
        detailView: true,
        detailFormatter: function(index, row) {
            var html = [];

            db_downloads_archive.getById(id, (err, transfer) => {
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
            });

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
                        <div class="progress-bar bg-success" role="progressbar" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="${row.file_count}" style="width:${percent}%; height:25px;">
                            <span class="sr-only">In progress</span>
                        </div>
                    `;
                }
            }
        ],
        data: []
    });


    db_downloads_archive.getById(id, (err, transfer) => {
        let $details = $('#download-archive-details');

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
        

        transfer.sessions.forEach(function(session){
            let single_session = {
                id: session.id,
                transfer_id: transfer.id,
                session: session.name,
                session_number: '-',
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

        $('#download-archive-details-table')
            .bootstrapTable('removeAll')    
            .bootstrapTable('append', my_data)
            .bootstrapTable('resetView');
    });

    // TODO migrate open links to table!!! transfer.sessions[1].files[0].name ... up one directory
    //$('#download-archive-details-table').closest('.bootstrap-table').after(`<button type="button" data="" class="btn btn-blue">Open</button>`)
}

function _init_upload_details_table(transfer_id) {
    $('#upload-archive-details-table').bootstrapTable({
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
                    return prettyBytes(value);
                    //return `${(value / 1024 / 1024).toFixed(2)} MB`;
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

    db_uploads_archive.getById(transfer_id, (err, transfer) => {
        let $details = $('#upload-archive-details');
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

        $('#upload-archive-details-table')
            .bootstrapTable('removeAll')    
            .bootstrapTable('append', transfer.table_rows)
            .bootstrapTable('resetView');
    })
    
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
