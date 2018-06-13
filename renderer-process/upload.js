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

const remote = require('electron').remote;
const mizer = require('../mizer');

const NProgress = require('nprogress');
NProgress.configure({ 
    trickle: false,
    easing: 'ease',
    speed: 1,
    minimum: 0.03
});

let csrfToken = '';
let xnat_server, user_auth, session_map, selected_session_id, defined_project_exp_labels, resseting_functions;
let global_date_required, date_required, selected_session_data;

let anon_variables = {};

function _init_variables() {
    xnat_server = settings.get('xnat_server');
    user_auth = settings.get('user_auth');
    
    console.log('----------------------------------------------------');
    console.log(xnat_server);
    console.log(user_auth);
    console.log('----------------------------------------------------');


    session_map = new Map();
    selected_session_id = null;
    

    defined_project_exp_labels = [];
    


    // RESETTING TABS
    resseting_functions = new Map();

    // browse files
    resseting_functions.set(1, function(){
        console.log('resseting values in tab 1');
        
        session_map.clear();
        selected_session_id = null;
        $('#upload_folder, #file_upload_folder').val('');

        $('#upload_folder').closest('.tab-pane').find('.js_next').addClass('disabled');
    });

    // date selection
    resseting_functions.set(2, function(){
        console.log('resseting values in tab 2')

        $('#upload_session_date').val('');

        if (date_required != undefined) {
            $('#upload_session_date').prop('required', date_required);
            
        
            let next_button = $('#upload_session_date').closest('.tab-pane').find('.js_next');
            if (date_required) {
                next_button.addClass('disabled'); 
            } else {
                next_button.removeClass('disabled');     
            }
        }

    });

    // Review and Verify
    resseting_functions.set(3, function(){
        console.log('resseting values in tab 3');


        $('#nav-verify').find('.js_next').addClass('disabled');
    });

    // Summary
    resseting_functions.set(4, function(){
        summary_clear();
        console.log('resseting values in tab 4')
    });

    _init_img_sessions_table();
    _UI();
}

function _UI() {
    let server_name = xnat_server.split('//')[1];
    $('#server_name_tlbr').text(`[${server_name}]`);
}

function _init_img_sessions_table() {
    $('#image_session').bootstrapTable({
        height: 300,
        columns: [
            {
                field: 'select',
                title: 'Upload',
                checkbox: true
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
        data: [{
            select: false,
            series_number: 1234,
            description: 'Some text',
            count: 12,
            size: 1526257,
            series_id: '12345678'
        }]
    });
}





if (!settings.has('user_auth') || !settings.has('xnat_server')) {
    ipc.send('redirect', 'login.html');
    return;
}


$(document).on('page:load', '#upload-section', function(e){
    console.log('Upload page:load triggered');
    
    _init_variables();
    resetSubsequentTabs();
    
    get_csrf_token()
        .then(resp => {
            const regex = /var csrfToken = '(.+?)';/g;
            const str = resp.data;
            let m;
            
            while ((m = regex.exec(str)) !== null) {
                // This is necessary to avoid infinite loops with zero-width matches
                if (m.index === regex.lastIndex) {
                    regex.lastIndex++;
                }

                csrfToken = m[1];
            }

            console.log('csrfToken: ' + csrfToken);
            
        })
        .catch(Helper.errorMessage);

        

    global_allow_create_subject().then(handle_create_subject_response).catch(handle_error);
    global_require_date().then(handle_global_require_date).catch(handle_error);
    


    promise_projects()
        .then(function(resp) {
            let totalRecords = resp.data.ResultSet.Result.length;

            let projects = (totalRecords === 1) ? [resp.data.ResultSet.Result[0]] : resp.data.ResultSet.Result;
            //let projects = resp.data.ResultSet.Result;

            console.log(projects)

            $('#upload-project').html('')


            for (let i = 0, len = projects.length; i < len; i++) {
                console.log('---', projects[i].id)
                $('#upload-project').append(`
                    <li><a href="javascript:void(0)" data-project_id="${projects[i].id}">${projects[i].secondary_id} [ID:${projects[i].id}]</a></li>
                `)
            }

        })
        .catch(function(err) {
            console.log(err.message);
        })
    

    $('#upload_session_date')
        .attr('min', '1990-01-01')
        .attr('max', new Date().toISOString().split('T')[0])

        
});

$(document).on('click', '#upload-section a[data-project_id]', function(e){
    resetSubsequentTabs();
    
    $('#subject-session').html('');
    $('.tab-pane.active .js_next').addClass('disabled');

    $(this).closest('ul').find('a').removeClass('selected');
    $(this).addClass('selected')
    let project_id = $(this).data('project_id');

    mizer.get_mizer_scripts(xnat_server, user_auth, project_id).then(scripts => {
        if (scripts.length === 0) {
            swal({
                title: `Warning: No anonymization scripts are set!`,
                text: `Do you want to continue?`,
                icon: "warning",
                buttons: ['Cancel', 'Continue'],
                dangerMode: true
            })
            .then((proceed) => {
                if (proceed) {
                    
                } else {
                    ipc.send('redirect', 'home.html');
                }
            });
        }

        let contexts = mizer.getScriptContexts(scripts);

        anon_variables = mizer.getReferencedVariables(contexts);
    }).catch(function(error) {
        console.log("Failed!", error);
    });

    promise_subjects(project_id)
        .then(res => {
            let subjects = res.data.ResultSet.Result;
            console.log(subjects.length);
            console.log(res.data.ResultSet.Result[0]);

            subjects.forEach(append_subject_row)

        })
        .catch(handle_error);

    project_allow_create_subject(project_id).then(handle_create_subject_response).catch(handle_error);
    project_require_date(project_id).then(handle_require_date).catch(handle_error);


    promise_project_experiments(project_id)
        .then(res => {
            console.log('----------------promise_project_experiments------------------------');
            console.log(res.data.ResultSet.totalRecords, res.data.ResultSet.Result)
            if (res.data.ResultSet.totalRecords) {
                defined_project_exp_labels = res.data.ResultSet.Result.map(function(item){
                    return item.label;
                });
                console.log(defined_project_exp_labels);
            }
            console.log('-----------------------------------------------------------');
        })
        .catch(handle_error);
});

$(document).on('click', 'a[data-subject_id]', function(e){
    resetSubsequentTabs();

    $(this).closest('ul').find('a').removeClass('selected');
    $(this).addClass('selected')
    
    $('.tab-pane.active .js_next').removeClass('disabled');
    
});

$(document).on('click', '.js_next:not(.disabled)', function() {
    let active_tab_index = $('.nav-item').index($('.nav-item.active'));
    if ($('.nav-item').eq(active_tab_index + 1).hasClass('hidden')) {
        active_tab_index++;
    }
    $('.nav-item').eq(active_tab_index + 1).removeClass('disabled').trigger('click');
    setTimeout(function() {
        //swal('Disabling NEXT button');
        $('.tab-pane.active .js_next').addClass('disabled');
    }, 100)
});

$(document).on('click', '.js_prev', function() {
    let active_tab_index = $('.nav-item').index($('.nav-item.active'));
    $('.nav-item').eq(active_tab_index - 1).trigger('click');
});

$(document).on('change', '#file_upload_folder', function(e) {
    let _files = [];
    resetSubsequentTabs();
    
    console.log(this.files.length);

    if (this.files.length) {
        $('#upload_folder').val(this.files[0].path);

        let pth = this.files[0].path;


        getSizeAsPromised(pth)
            .then(function(response){
                console.log(response);

                if (response > 1000) {
                    swal({
                        title: `Are you sure?`,
                        text: `This folder is ${response} MB in size! Continue?`,
                        icon: "warning",
                        buttons: ['Cancel', 'Continue'],
                        dangerMode: true
                    })
                    .then((proceed) => {
                        if (proceed) {
                            _files = walkSync(pth);
                            console.log(_files);

                            $('#file_upload_folder').val('');
                            dicomParse(_files);
                        } else {
                            $('#upload_folder, #file_upload_folder').val('');
                        }
                    });
                } else {
                    _files = walkSync(pth);
                    console.log(_files);

                    setTimeout(function() {
                        $('#file_upload_folder').val('');
                        dicomParse(_files)
                    }, 0)
                }
                
            })
            .catch(function(err) {
                $('#upload_folder, #file_upload_folder').val('');
                
                swal({
                    title: `Error`,
                    text: `You can't select this folder.\n${err.message}`,
                    icon: "error",
                    dangerMode: true
                })
            });
        
    }
});

$(document).on('input', '#upload_session_date', function(e) {
    resetSubsequentTabs();

    if (this.validity.valid) {
        console.log('Valid')
        console.log(session_map, selected_session_id, session_map.get(selected_session_id), session_map.get(selected_session_id).date);
        if (date_required) {
            if ($('#upload_session_date').val().split("-").join('') === session_map.get(selected_session_id).date) {
                $('.tab-pane.active .js_next').removeClass('disabled');
            } else {
                swal({
                    title: `Error`,
                    text: 'Entered session date doesn\'t match with date from session!',
                    icon: "error",
                    dangerMode: true
                })
                $('.tab-pane.active .js_next').addClass('disabled');
            }
        } else {
            $('.tab-pane.active .js_next').removeClass('disabled');
        }
        
        
    } else {
        console.log('INVALID')
        $('.tab-pane.active .js_next').addClass('disabled');
    }
});

$(document).on('click', '.js_upload', function() {
    let selected = $('#image_session').bootstrapTable('getSelections');

    let $required_inputs = $('#anon_variables').find(':input[required]');
    let required_input_error = false;

    $required_inputs.each(function(){
        if ($(this).val().trim() === '') {
            $(this).addClass('is-invalid');
            required_input_error = true;
        }
    })
    
    
    if (selected.length && !required_input_error) {
        let selected_series = selected.map(function(item){
            return item.series_id;
        });
        
        let expt_label_val = $('#experiment_label').val();

        let url_data = {
            expt_label: expt_label_val ? expt_label_val : get_default_expt_label(),
            project_id: $('a[data-project_id].selected').data('project_id'),
            subject_id: $('a[data-subject_id].selected').data('subject_id')
        };

        let anon_variables = {};
        $('#additional-upload-fields').find(':input').each(function(){
            let $field = $(this);
            anon_variables[$field.attr('name')] = $field.val();
        });

        //doUpload(url_data, selected_session_id, selected_series);
        storeUpload(url_data, selected_session_id, selected_series, anon_variables);

    } else {
        swal({
            title: `Selection error`,
            text: `Please select at least one scan series and enter variable value(s)`,
            icon: "warning",
            dangerMode: true
        })
    }
    

});
$(document).on('input', '#anon_variables :input[required]', function(e){
    let $input = $(this);
    $input.on('input', function(){
        $input.removeClass('is-invalid');
    });
});


$(document).on('show.bs.modal', '#new-subject', function(e) {
    console.log(e)

    let project_id = $('#upload-project a.selected').data('project_id');

    if (!project_id) {
        swal({
            text: 'You must select a project first!',
            icon: "warning",
            dangerMode: true
        })
        .then(value => {
            $('#new-subject').modal('hide');                
        });

    } else {
        $('#new_subject_project_id').html(project_id)
        $('#form_new_subject input[name=project_id]').val(project_id)
        $('#form_new_subject input[name=subject_label]').val('')
        $('#form_new_subject input[name=group]').val('')

        setTimeout(function(){
            $('#form_new_subject input[name=subject_label]').focus()
        }, 500);
    }

});

$(document).on('submit', '#form_new_subject', function(e) {
    e.preventDefault();
    let $form = $(e.target);

    if ($form.data('processing') !== true) {
        $form.data('processing', true);

        let modal_id = '#' + $(this).closest('.modal').attr('id');
        Helper.blockModal(modal_id);
    
        
    
        let project_id, subject_label, group;
    
        project_id = $('#form_new_subject input[name=project_id]').val();
        subject_label = $('#form_new_subject input[name=subject_label]').val();
        group = $('#form_new_subject input[name=group]').val();
    
        promise_create_project_subject(project_id, subject_label, group)
            .then(res => {
                console.log(res);
    
                append_subject_row({
                    ID: res.data,
                    URI: '/data/subjects/' + res.data,
                    insert_date: '',
                    label: subject_label,
                    group: group
                });
    
                $('#subject-session li:last-child a').trigger('click');
    
                $('#new-subject').modal('hide');
    
            })
            .catch(handle_error)
            .finally(() => {
                Helper.unblockModal(modal_id);
                $form.data('processing', false);
            });
    }
    
    
});

$(document).on('click', 'button[data-session_id]', function(e){
    $('.tab-pane.active .js_next').removeClass('disabled');
    selected_session_id = $(this).data('session_id');

    
    console.log('******************************************');
    console.log('anon_variables', anon_variables);
    console.log('******************************************');

    $('#additional-upload-fields').html('');
    Object.keys(anon_variables).forEach(key => {
        let key_cap = Helper.capitalizeFirstLetter(key);
        let field_type = (key == 'subject' || key == 'project') ? 'hidden' : 'text';

        let field_text, field_value;
        if (key == 'subject') {
            field_text = get_form_value('subject_id', 'subject_label');
            field_value = field_text;
        } else if (key == 'project') {
            field_text = get_form_value('project_id', 'project_id');
            field_value = field_text;
        } else {
            field_text = '';
            field_value = anon_variables[key];
        }

        

        $('#additional-upload-fields').append(`
            <div class="form-group row">
                <label for="var_${key}" class="col-4 text-right"><b>${key_cap}</b>:</label>
                <div class="input-group col-8">
                    <input class="form-control" type="${field_type}" name="${key}" id="var_${key}" value="${field_value}" required>
                    ${field_text}
                </div>
            </div>
        `);
        console.log('$$$$ ' + key + ' => ' + anon_variables[key] );
    });

    let session_id = selected_session_id,
        selected_session = session_map.get(session_id),
        total_files = 0,
        total_size = 0,
        table_rows = [];

    selected_session.scans.forEach(function(scan, key) {
        let scan_size = scan.reduce(function(prevVal, elem) {
            return prevVal + elem.filesize;
        }, 0);
        total_size += scan_size;
        total_files += scan.length;
        
        // use scan description from the last one (or any other from the batch)
        let scans_description = scan[0].seriesDescription;
        let series_number = scan[0].seriesNumber
        console.log(scan);
        
        table_rows.push({
            select: false,
            series_number: series_number,
            series_id: key,
            description: scans_description,
            count: scan.length,
            size: scan_size
        })
        
    });

    console.log('-----------------------------------------------------------');
    
    console.log(table_rows);
    console.log('-----------------------------------------------------------');

    $('#image_session')
    .bootstrapTable('removeAll')    
    .bootstrapTable('append', table_rows)
    .bootstrapTable('resetView');

    console.log(selected_session.studyDescription);
    console.log(selected_session.modality);
    console.log(selected_session.studyInstanceUid);

    let expt_label = get_default_expt_label();
    
    $('#experiment_label').val(expt_label);

    let studyDate = selected_session.date ? 
        selected_session.date.substr(0, 4) + '-' +
        selected_session.date.substr(4, 2) + '-' +
        selected_session.date.substr(6, 2) + ' ' + 
        
        (selected_session.time ?
            selected_session.time.substr(0, 2) + ':' +
            selected_session.time.substr(2, 2) + ':' +
            selected_session.time.substr(4, 2) :
            ''
        ) : 
        'N/A';
    
    $('#session_info').html('')
    .append(`Study ID: ${selected_session.studyId}<br>`)
    .append(`Accession: ${selected_session.accession}<br>`)
    .append('Description: ' + selected_session.studyDescription + '<br>')
    .append('Date: ' + studyDate + '<br>')
    .append(`Modality: ${selected_session.modality}<br>`)
    .append(`${selected_session.scans.size} scans in ${total_files} files (${(total_size / 1024 / 1024).toFixed(2)}MB)`);
    
    swal.close();
});

function get_form_value(field, data) {
    return $(`a[data-${field}].selected`).data(data);
}

// TODO - test code (removal OK)
$(document).on('click', '#test-upload', function () {
    let project_id = $('a[data-project_id].selected').data('project_id');
    let subject_id = $('a[data-subject_id].selected').data('subject_id');
    let expt_label = project_id + '__' + subject_id + '___2009';


    swal(project_id + "\n" + subject_id + "\nFiles: " + _files.length);


    /*
    
    let errors = 0;
    let warnings = 0;

    for (let i = 0; i < _files.length; i++) {
        let file = _files[i];
        displayMessage(`---Reading file ${file}:`);

        try {
            const dicomFile = fs.readFileSync(file);
            const dicom = dicomParser.parseDicom(dicomFile, { untilTag: '0x00324000' });
            const studyDescription = dicom.string('x00081030');
            const studyInstanceUid = dicom.string('x0020000d');

            const seriesDescription = dicom.string('x0008103e');
            const seriesInstanceUid = dicom.string('x0020000e');
            const seriesNumber = dicom.string('x00200011');

            // ++++
            const modality = dicom.string('x00080060');
            // ++++
            console.info({
                studyDescription: studyDescription,
                studyInstanceUid: studyInstanceUid,
                modality: modality
            })

            //console.log(`studyDescription: "${studyDescription}"`, `studyInstanceUid: ${studyInstanceUid}`, `modality: ${modality}`);

            
        } catch (error) {
            handleError(`There was an error processing the file ${file}`, error);
            errors++;
        }
    }
    */
    
    if (true) {
        // **********************************************************
        // create a file to stream archive data to.
        let zip_path = path.join('C:', 'Temp', 'dicom', 'file_' + Math.random() + '.zip');

        var output = fs.createWriteStream(zip_path);
        var archive = archiver('zip', {
            zlib: { level: 9 } // Sets the compression level.
        });

        // listen for all archive data to be written
        // 'close' event is fired only when a file descriptor is involved
        output.on('close', function () {
            console.log(archive.pointer() + ' total bytes');
            console.log('archiver has been finalized and the output file descriptor has closed.');


            // let zipReadStream = fs.createReadStream(zip_path);
            // zipReadStream.on('error', function(err) {
            //     console.log(err);
            // })
            // zipReadStream.on('data', function(data){
            //     console.log(data)
            // });


            fs.readFile(zip_path, (err, zip_content) => {
                if (err) throw err;
                axios({
                    method: 'post',
                    url: xnat_server + `/data/services/import?import-handler=DICOM-zip&PROJECT_ID=${project_id}&SUBJECT_ID=${subject_id}&EXPT_LABEL=${expt_label}&rename=true&prevent_anon=true&prevent_auto_commit=true&SOURCE=uploader&autoArchive=AutoArchive` + '&XNAT_CSRF=' + csrfToken,
                    auth: user_auth,
                    onUploadProgress: function (progressEvent) {
                        // Do whatever you want with the native progress event
                        console.log('=======', progressEvent, '===========');

                    },
                    headers: {
                        'Content-Type': 'application/zip'
                    },
                    data: zip_content
                })
                    .then(res => {
                        console.log('---' + res.data + '---', res);

                        let commit_url = xnat_server + $.trim(res.data) + '?action=commit&SOURCE=uploader' + '&XNAT_CSRF=' + csrfToken;
                        //let commit_url = xnat_server + `/data/prearchive/projects/${project_id}/${subject_id}/${expt_label}?action=commit&SOURCE=uploader`;

                        axios.post(commit_url, {
                            auth: user_auth
                        })
                        .then(commit_res => {
                            console.log(commit_res)
                        })
                        .catch(err => {
                            console.log(err)
                        });
                        
                    })
                    .catch(err => {
                        console.log(err)
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


});



$.queue = {
    _timer: null,
    _queue: [],
    add: function(fn, context, time) {
        var setTimer = function(time) {
            $.queue._timer = setTimeout(function() {
                time = $.queue.add();
                if ($.queue._queue.length) {
                    setTimer(time);
                }
            }, time || 0);
        }

        if (fn) {
            $.queue._queue.push([fn, context, time]);
            if ($.queue._queue.length == 1) {
                setTimer(time);
            }
            return;
        }

        var next = $.queue._queue.shift();
        if (!next) {
            return 0;
        }
        next[0].call(next[1] || window);
        return next[2];
    },
    clear: function() {
        clearTimeout($.queue._timer);
        $.queue._queue = [];
    }
};

function getSizeAsPromised(pth) {
    return new Promise(function(resolve, reject) {
        getSize(pth, function(err, size) {
            if (err) { 
                reject(err);
            } else {
                let folder_size = (size / 1024 / 1024).toFixed(2);
                console.log('--->', pth, folder_size + ' MB');
                resolve(Math.round(size / 1024 / 1024));
            }
        });
    });
}

// TODO - remove (not used)
function dicomParseMime(_files) {
    let mime_types = [];
    for (let i = 0; i < _files.length; i++) {
        let file = _files[i]
        console.log(path.basename(file) + ':' + mime.lookup(file));
    }
}

function dicomParse(_files) {
    //swal("\nFiles: " + _files.length);
            
    let errors = 0;
    let warnings = 0;

    let dicoms = [];
    let sessions = [];
    let series = [];

    session_map.clear();

    
    NProgress.start();
    let current_progress = 0.03;


    let $progress_bar = $('#dicom_parse_progress');
    $progress_bar.attr('value', 0);
    $progress_bar.attr('max', _files.length);

    let timer_start;
    $.queue.add(function(){
        timer_start = performance.now();
        console.time('dicomParse');
    }, this);


    let bundle_size = 50;

    let files_bundle = Math.ceil(_files.length / bundle_size);

    let files_parsed = [];

    // splitting for loop into multiple bundles ... to display progress 
    // ... because javascript doesn't let browser render updates while it's working
    for (let h = 0; h < files_bundle; h++) {
        let i_max = Math.min((h + 1) * bundle_size, _files.length);

        let parse_file_bundle = function() {
            for(let i = h * bundle_size; i < i_max; i++) {
                let file = _files[i];
                files_parsed.push(file);
                
                displayMessage(`---Reading file ${file}:`);

                // only parse dicom files or those of unknown mime type
                if (mime.lookup(file) === false || mime.lookup(file) === 'application/dicom') {
                    try {
                        const dicomFile = fs.readFileSync(file);
                        const dicom = dicomParser.parseDicom(dicomFile, { untilTag: '0x00324000' });           
                        
                        const studyInstanceUid = dicom.string('x0020000d');
                        
                        if (typeof studyInstanceUid !== 'undefined') {
                            const studyDescription = dicom.string('x00081030');
                            const studyId = dicom.string('x00200010');
                            
                            const seriesDescription = dicom.string('x0008103e');
                            const seriesInstanceUid = dicom.string('x0020000e');
                            const seriesNumber = dicom.string('x00200011');
                            
                            // ++++
                            const modality = dicom.string('x00080060');
                            const study_date = dicom.string('x00080020');
                            const study_time = dicom.string('x00080030');

                            const accession = dicom.string('x00080050');
                            // ++++
                
    
                            if (!session_map.has(studyInstanceUid)) {
                                session_map.set(studyInstanceUid, {
                                    studyId: studyId,
                                    studyInstanceUid: studyInstanceUid,
                                    studyDescription: studyDescription,
                                    modality: modality,
                                    accession: accession,
                                    date: study_date,
                                    time: study_time,
                                    scans: new Map()
                                });
                            }
                
                            if (!session_map.get(studyInstanceUid).scans.has(seriesInstanceUid)) {
                                session_map.get(studyInstanceUid).scans.set(seriesInstanceUid, []);
                            }
                            
                            let file_name = path.basename(file);
                            let file_size = getFilesizeInBytes(file);
                            let my_scans = session_map.get(studyInstanceUid).scans.get(seriesInstanceUid);
                            let filtered = my_scans.filter(el => el.filename === file_name && el.filesize === file_size);
            
                            // only add unique files
                            if (filtered.length === 0) {
                                my_scans.push({
                                    filepath: file,
                                    filename: file_name,
                                    filesize: file_size,
                                    seriesDescription: seriesDescription,
                                    seriesInstanceUid: seriesInstanceUid,
                                    seriesNumber: seriesNumber
                                }); 
                            }
                                       
                        }
                        
                    } catch (error) {
                        handleError(`There was an error processing the file ${file}`, error);
                        errors++;
                    }
                }

            }
        };

        let show_bundle_progress = function() {
            let progress = parseFloat( ((h+1)*bundle_size/_files.length).toFixed(2) ) - 0.01;

            if (progress > current_progress) {
                NProgress.set(progress);
                current_progress = progress;
                console.log('current_progress: ' + current_progress);
            }
    
            $progress_bar.attr('value', i_max);
        };

        $.queue.add(parse_file_bundle, this);
        $.queue.add(show_bundle_progress, this);
    }
    

    let display_results = function(){
        NProgress.done();

        //console.info(dicoms, 'studyInstanceUid: ', sessions, 'seriesInstanceUids: ',series);

        console.log('session_map size: ' + session_map.size);
        console.log(session_map);
        
        console.timeEnd('dicomParse');

        let info = 'Time: ' + ((performance.now() - timer_start)/1000).toFixed(2) + "s \n\n";
        info += 'Total sessions: ' + session_map.size + "\n";
        session_map.forEach(function(cur_session, key) {
            info += `** ${key} (scans: ${cur_session.scans.size})`;
            
            let sep = "\n------ ";
            cur_session.scans.forEach(function(scan, key) {
                var total_size = scan.reduce(function(prevVal, elem) {
                    return prevVal + elem.filesize;
                }, 0);

                info += sep + key + ` [imgs: ${scan.length}] {size: ${(total_size / 1024 / 1024).toFixed(2)}MB}`;
            });

            info += "\n\n";
        });

        swal(info)
    };

    // for testing only - skipping 
    // $.queue.add(display_results, this);

    let handle_results = function(){
        NProgress.done();

        switch(session_map.size) {
            case 0:
                swal({
                    title: 'No DICOM files',
                    text: 'No DICOM files were found inside selected folder. Please choose another folder.',
                    icon: "warning",
                    dangerMode: true
                })
                break;
            
            default:
                let $content = $('<div id="swal-wrapper">'),
                    $ol = $('<ol style="text-align: left;">');
                
                $content.prepend(`<p>Found sessions: ${session_map.size}.</p>`).append($ol);


                session_map.forEach(function(cur_session, key) {
                    console.log(cur_session);
                    
                    //let session_label = cur_session.studyDescription === undefined ? key : cur_session.studyDescription;
                    let session_label = cur_session.studyId === undefined ? key : cur_session.studyId;
                    $ol.append(`<li>
                        ${session_label} 
                        [scans: ${cur_session.scans.size}]
                        <button data-session_id="${key}" type="button" class="btn btn-primary btn-sm" 
                        style="margin: 2px 0;">Select</button>
                        </li>`);
                });
                

                swal({
                    html: true,
                    title: `Please select one session`,
                    content: $content.get(0)
                })
                //break;
            //default: // more than 1
        }

    };


    $.queue.add(handle_results, this);

    $.queue.add(function(){
        console.log(session_map);
        
    }, this);

}

function get_default_expt_label() {
    let subject_id = $('a[data-subject_id].selected').data('subject_label');
    let modality = session_map.get(selected_session_id).modality;
    
    let expt_label = subject_id.split(' ').join('_') + '_' + modality + '_';
    for (let i = 1; i < 10000; i++) {
        let my_expt_label = expt_label + i;
        if (defined_project_exp_labels.indexOf(my_expt_label) === -1) {
            expt_label = my_expt_label;
            break;
        }
    }
    console.log('EXPT_LABEL', expt_label);

    return expt_label;
}

function storeUpload(url_data, session_id, series_ids, anon_variables) {
    console.log('==== anon_variables ====', anon_variables);
    
    let project_id = url_data.project_id;
    let subject_id = url_data.subject_id;
    let expt_label = url_data.expt_label;

    let _files = [];
    let series = [];

    let total_size = 0;
    for (let i = 0; i < series_ids.length; i++) {
        let scan_series = session_map.get(session_id).scans.get(series_ids[i]);
        series.push(scan_series)
        
        total_size = scan_series.reduce(function(prevVal, item) {
            return prevVal + item.filesize;
        }, total_size);

        let files = scan_series.map(function(item){
            return item.filepath;
        });
        _files = _files.concat(files);
    }
    // -----------------------------------------------------

    selected_session = session_map.get(session_id);
    table_rows = [];
    selected_session.scans.forEach(function(scan, key) {
        console.log(key);
        
        if (series_ids.indexOf(key) >= 0) {
            let scan_size = scan.reduce(function(prevVal, elem) {
                return prevVal + elem.filesize;
            }, 0);
            total_size += scan_size;
            //total_files += scan.length;
            
            // use scan description from the last one (or any other from the batch)
            let scans_description = scan[0].seriesDescription;
            let series_number = scan[0].seriesNumber
            console.log(scan);
            
            table_rows.push({
                id: Helper.uuidv4(),
                series_number: series_number,
                series_id: key,
                description: scans_description,
                progress: 0,
                count: scan.length,
                size: scan_size
            })
        } else {
            console.log('Preskacemo ' + key);
        }       
        
    });

    let studyDate = selected_session.date ? 
        selected_session.date.substr(0, 4) + '-' +
        selected_session.date.substr(4, 2) + '-' +
        selected_session.date.substr(6, 2) : '';
    
    let studyTime = selected_session.time ? 
        selected_session.time.substr(0, 2) + ':' +
        selected_session.time.substr(2, 2) + ':' +
        selected_session.time.substr(4, 2) : '';


    let upload_digest = {
        id: Helper.uuidv4(),
        url_data: url_data,
        anon_variables: anon_variables,
        session_id: session_id,
        session_data: {
            studyId: selected_session.studyId,
            studyInstanceUid: selected_session.studyInstanceUid,
            studyDescription: selected_session.studyDescription,
            modality: selected_session.modality,
            accession: selected_session.accession,
            studyDate: studyDate,
            studyTime: studyTime
        },
        series_ids: series_ids,
        series: series,
        //_files: _files,
        total_size: total_size,
        user_auth: user_auth,
        xnat_server: xnat_server,
        csrfToken: csrfToken,
        transfer_start: Helper.unix_timestamp(),
        table_rows: table_rows,
        status: 0
    };

    let my_transfers = store.get('transfers.uploads');

    my_transfers.push(upload_digest);
    store.set('transfers.uploads', my_transfers);
    
    console.log(upload_digest);
return; /////////////////////////////////////////////////////////////////////////////////
    ipc.send('start_upload');
    
    ipc.send('redirect', 'progress.html');

    setTimeout(function(){
        $('#nav-upload-tab').trigger('click');
    }, 40);
    
    return;

    // -----------------------------------------------------



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



function getFilesizeInBytes(filename) {
    const stats = fs.statSync(filename)
    const fileSizeInBytes = stats.size
    return fileSizeInBytes
}

// recursive directory listing
const walkSync = (dir, fileList = []) => {
    fs.readdirSync(dir).forEach(file => {
      const filePath = path.join(dir, file)
  
      if (fs.statSync(filePath).isDirectory()) {
        walkSync(filePath, fileList)
      } else {
        fileList.push(filePath)
      }
      
    })
    return fileList;
}

function append_subject_row(subject){
    $('#subject-session').append(`
        <li>
            <a href="javascript:void(0)" 
                data-subject_uri="${subject.URI}"
                data-subject_insert_date="${subject.insert_date}"
                data-subject_label="${subject.label}"
                data-subject_id="${subject.ID}">
                ${subject.label} [ID:${subject.ID}] [GROUP: ${subject.group}]
            </a>
        </li>
    `)
}


// allow_create_subject
function global_allow_create_subject() {
    return axios.get(xnat_server + '/data/config/applet/allow-create-subject?contents=true&accept-not-found=true', {
        auth: user_auth
    });
}


function project_allow_create_subject(project_id) {
    return axios.get(xnat_server + '/data/config/projects/'+project_id+'/applet/allow-create-subject?contents=true&accept-not-found=true', {
        auth: user_auth
    });
}

const handle_create_subject_response = (res) => {
    console.log( '===========', typeof res.data, '===========');
    
    let allow_create_subject = (typeof res.data === 'boolean') ? res.data : (res.data === '' || res.data.toLowerCase() === 'true');
    console.log('allow_create_subject:', allow_create_subject, `(${res.data})`);
    $('button[data-target="#new-subject"]').prop('disabled', !allow_create_subject);
};

// require_date
function global_require_date() {
    return axios.get(xnat_server + '/data/config/applet/require-date?contents=true&accept-not-found=true', {
        auth: user_auth
    });
}

function project_require_date(project_id) {
    return axios.get(xnat_server + '/data/config/projects/'+project_id+'/applet/require-date?contents=true&accept-not-found=true', {
        auth: user_auth
    });
}

const handle_global_require_date = (res) => {
    
    
    global_date_required = (typeof res.data === 'boolean') ? res.data : (res.data.toLowerCase() !== 'false' && res.data !== '');
    console.log('========== handle_global_require_date ===========', global_date_required, $('#nav-date', 'a[href="#nav-date"]').length);
    
    set_date_tab(global_date_required)
}

const handle_require_date = (res) => {
    console.log( '===========', typeof res.data, '===========');
    if (res.data === '') {
        date_required = global_date_required;
    } else {
        date_required = (typeof res.data === 'boolean') ? res.data : (res.data.toLowerCase() !== 'false');
    }
    
    console.log('date_required:', date_required, `(${res.data})`);
    $('#upload_session_date').prop('required', date_required);
    

    let next_button = $('#upload_session_date').closest('.tab-pane').find('.js_next');
    if (date_required) {
        next_button.addClass('disabled'); 
    } else {
        next_button.removeClass('disabled');     
    }

    set_date_tab(date_required)
    
};

const set_date_tab = (date_required) => {
    if (date_required) {
        $('#nav-date, a[href="#nav-date"]').each(function(){
            console.log($(this));
            
            $(this).removeClass('hidden')
        })
    } else {
        $('#nav-date, a[href="#nav-date"]').each(function(){
            $(this).addClass('hidden')
        })
    }
}

const handle_error = (err) => {
    console.log(err, err.response);
};

//================================

function promise_projects() {
    return axios.get(xnat_server + '/data/projects?permissions=edit&dataType=xnat:subjectData', {
    //return axios.get(xnat_server + '/data/projects?accessible=true', {
        auth: user_auth
    });
}

function promise_project_experiments(project_id) {
    return axios.get(xnat_server + '/data/projects/'+project_id+'/experiments?columns==ID,label,xnat:experimentData/meta/status', {
        auth: user_auth
    });
}

function promise_subjects(project_id) {
    return axios.get(xnat_server + '/data/projects/' + project_id + '/subjects?columns=group,insert_date,insert_user,project,label', {
        auth: user_auth
    })
    
}

function promise_project_subject(project_id, subject_label) {
    return axios.get(xnat_server + '/data/projects/' + project_id + '/subjects/' + subject_label + '?format=json', {
        auth: user_auth
    })
}

function get_csrf_token() {
    return axios.get(xnat_server + '/', {
        auth: user_auth
    });
}

function promise_create_project_subject(project_id, subject_label, group) {
    return axios.put(xnat_server + '/data/projects/' + project_id + '/subjects/' + subject_label + '?group=' + group + '&event_reason=XNAT+Application' + '&XNAT_CSRF=' + csrfToken, {
        auth: user_auth
    })
}


const displayMessage = (text = '', isError = false) => {
    if (isError) {
        console.error(text)
    } else {
        console.info(text);
    }
};

const handleError = (message, error = '') => {
    if (!error) {
        displayMessage(message, true);
    } else if (!error.message) {
        displayMessage(`${message}: ${error}`.trim(), true);
    } else {
        displayMessage(`${message}: ${error.message}`.trim(), true);
    }
};

function resetSubsequentTabs() {
    console.log('resseting tabs after: ' + $('#upload-section #nav-tab .nav-link.active').index());
    resetTabsAfter($('#upload-section #nav-tab .nav-link.active').index());
}

function resetTabsAfter(tabIndex) {
    resseting_functions.forEach(function(reset, key) {
        if (key > tabIndex) {
            $('#upload-section #nav-tab .nav-link').eq(key).addClass('disabled');
            reset();
        }
    })
}

const summary_clear = () => {
    $('#summary_info').html('');
}

const summary_add = (text, label = '') => {
    let label_html = label ? `<b>${label}: </b>` : '';

    $('#summary_info').append(`<p>${label_html} ${text}</p>`);
}