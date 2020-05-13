const constants = require('../services/constants');
const fs = require('fs');
const path = require('path');
const dicomParser = require('dicom-parser');
const getSize = require('get-folder-size');
const axios = require('axios');
require('promise.prototype.finally').shim();
const auth = require('../services/auth');
const api = require('../services/api');
const settings = require('electron-settings');
const ipc = require('electron').ipcRenderer;
const swal = require('sweetalert');
const archiver = require('archiver');
const mime = require('mime-types');

const templateEngine = require('../services/template_engine');

const prettyBytes = require('pretty-bytes');

const user_settings = require('../services/user_settings');
const ResetManager = require('../services/reset-manager');

const FlowReset = new ResetManager();

const remote = require('electron').remote;
const mizer = remote.require('./mizer');

const db_uploads = remote.require('./services/db/uploads')

const electron_log = remote.require('./services/electron_log');

const { selected_sessions_table } = require('../services/tables/upload-prepare');

const { random_string } = require('../services/app_utils');

const NProgress = require('nprogress');
NProgress.configure({ 
    trickle: false,
    easing: 'ease',
    speed: 1,
    minimum: 0.03
});

let csrfToken = '';
let xnat_server, user_auth, session_map, selected_session_id;
let global_date_required, date_required, selected_session_data;

let site_wide_settings = {};
let project_settings = {};



function fetch_site_wide_settings(xnat_server, user_auth) {
    return Promise.all([
        global_allow_create_subject(), 
        global_require_date(),
        mizer.get_global_anon_script(xnat_server, user_auth),
        global_series_import_filter(),
        global_pet_tracers(xnat_server, user_auth)
    ]).then(res => {
      let data = {
        allow_create_subject: (typeof res[0].data === 'boolean') ? res[0].data : (res[0].data === '' || res[0].data.toLowerCase() === 'true'),
        require_date: (typeof res[1].data === 'boolean') ? res[1].data : (res[1].data.toLowerCase() !== 'false' && res[1].data !== ''),
        anon_script: res[2], // res[2] contains actual anon script (or false)
        series_import_filter: res[3],
        pet_tracers: res[4]
      }
      
      return Promise.resolve(data);
    }).catch(err => {
        return Promise.reject(err)
    });
}

function fetch_project_settings(project_id, xnat_server, user_auth) {
    return Promise.all([
        project_subjects(xnat_server, user_auth, project_id),
        project_allow_create_subject(project_id),
        project_require_date(project_id),
        mizer.get_project_anon_script(xnat_server, user_auth, project_id),
        project_sessions(xnat_server, user_auth, project_id),
        project_series_import_filter(xnat_server, user_auth, project_id),
        project_upload_destination(xnat_server, user_auth, project_id),
        project_data(xnat_server, user_auth, project_id),
        project_pet_tracers(xnat_server, user_auth, project_id)
    ]).then(res => {

        let data = {
            subjects: res[0],
            allow_create_subject: (typeof res[1].data === 'boolean') ? res[1].data : (res[1].data === '' || res[1].data.toLowerCase() === 'true'),
            require_date: (typeof res[2].data === 'boolean') ? res[2].data : (res[2].data.toLowerCase() !== 'false' && res[2].data !== ''),
            anon_script: res[3],
            sessions: res[4],
            series_import_filter: res[5],
            upload_destination: res[6],
            project: res[7],
            pet_tracers: res[8]
        }
      
        return Promise.resolve(data)
    }).catch(err => {
        return Promise.reject(err)
    });
}

async function _init_variables() {

    console.log(':::::::::::::: >>> UPLOAD _init_variables');
    
    xnat_server = settings.get('xnat_server');
    user_auth = auth.get_user_auth();

    session_map = new Map();
    selected_session_id = null;
    

    try {
        site_wide_settings = await fetch_site_wide_settings(xnat_server, user_auth)
        console.log({site_wide_settings});
    } catch (err) {
        handle_error(err)
    }

    FlowReset.clear()
    
    FlowReset.add('project_selection', () => {
        $('#upload-project a.selected').removeClass('selected');
    })

    FlowReset.add('project_settings_table', () => {
        $('#project_settings_tbl_wrap').html('')
    })

    FlowReset.add('disable_session_upload', () => {
        $('#file_upload_folder').prop('disabled', true).closest('.btn').addClass('disabled')
    })

    FlowReset.add('session_selection', () => {
        $('#upload_folder, #file_upload_folder').val('');

        $('#dicom_parse_progress').hide().attr({
            value: 0,
            max: 100
        });
    })

    FlowReset.add('session_map_reset', () => {
        session_map.clear();
        selected_session_id = null;
    })

    FlowReset.add('next_tab_disable_1', () => {
        let current_key = $('#upload-section #nav-tab .nav-link.active').index()
        $(`#upload-section #nav-tab .nav-link:gt(${current_key})`).addClass('disabled');

        $('.tab-pane.active .js_next').addClass('disabled');

        $('#nav-verify').removeData('upload_method')
    })

    FlowReset.add('reset_overwrite_selection', () => {
        $('#upload_overwrite_method').prop('selectedIndex', 0);
    })



    // RESETTING FLOW
    FlowReset.execAll()

    _UI();
}

function _UI() {
    let server_name = xnat_server.split('//')[1];
    $('#server_name_tlbr').text(`[${server_name}]`);
}

function destroyBootstrapTable($tbl) {
    if ($.isPlainObject($tbl.bootstrapTable('getOptions'))) { // bootstrap table already initialized
        $tbl.bootstrapTable('destroy');
    }
}

function _init_img_sessions_table(table_rows) {
    let $img_session_tbl = $('#image_session');

    destroyBootstrapTable($img_session_tbl);

    $img_session_tbl.bootstrapTable({
        height: table_rows.length > 6 ? 300 : 0,
        sortName: 'series_number',
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
                field: 'modality',
                title: 'Modality',
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
        data: table_rows
    });

    $img_session_tbl.on('check.bs.table uncheck.bs.table check-all.bs.table uncheck-all.bs.table', function (e) {
        let selected = $img_session_tbl.bootstrapTable('getSelections');

        let has_pt_scan = selected.reduce((total, row) => row.modality === 'PT' ? true : total, false);

        //$('#pet_tracer_container').toggle(has_pt_scan);
        $('#pet_tracer').prop('required', has_pt_scan).prop('disabled', !has_pt_scan);

        let custom_pt_required = has_pt_scan && $('#pet_tracer').val() === 'OTHER';
        $('#custom_pet_tracer').prop('required', custom_pt_required).prop('disabled', !custom_pt_required)
        
        if (has_pt_scan) {
            $('#pet_tracer').trigger('change');
        } else {
            $('#experiment_label').val(experiment_label());
        }
    })


    $img_session_tbl.bootstrapTable('resetView');
}



$(document).on('shown.bs.tab', '#upload-section .nav-tabs a[href="#nav-verify"]', function(){
    let upload_method = $('#nav-verify').data('upload_method')

    if (upload_method === 'quick_upload') {
        $('#quick_upload').show().siblings().hide()
    } else {
        $('#custom_upload').show().siblings().hide()
    }
})


function toggle_upload_buttons() {
    let selected = $('#found_sessions').bootstrapTable('getSelections');

    let date_required = site_wide_settings.require_date || project_settings.require_date;

    let skip_session_date_validation = $('#skip_session_date_validation').is(':checked');

    console.log({skip_session_date_validation});

    let invalid_days = false;

    if (date_required && !skip_session_date_validation) {
        selected.forEach(sess => {
            if (sess.study_date && sess.study_date.substr(8,2) !== sess.entered_day) {
                invalid_days = true;
            }
        })
    }

    $('.js_quick_upload').prop('disabled', invalid_days || selected.length < 2); // TODO < 2
    $('.js_custom_upload').prop('disabled', invalid_days || selected.length != 1)
}

$(document).on('change', '#skip_session_date_validation', toggle_upload_buttons)


function _init_session_selection_table(tbl_data) {
    let $found_sessions_tbl = $('#found_sessions');

    let date_required = site_wide_settings.require_date || project_settings.require_date;

    destroyBootstrapTable($found_sessions_tbl);

    const event_list = 'check.bs.table uncheck.bs.table check-all.bs.table uncheck-all.bs.table';
    $found_sessions_tbl.off(event_list).on(event_list, toggle_upload_buttons)

    window.foundSessionsEvents = {
        'input .day-validation': function (e, value, row, index) {
            row.entered_day = $(e.target).val()
            toggle_upload_buttons()
        }
    }

    $('.js_custom_upload, .js_quick_upload').prop('disabled', true);


    $found_sessions_tbl.bootstrapTable({
        height: tbl_data.length > 8 ? 400 : 0,
        sortName: 'patient_name',
        classes: 'table-sm',
        theadClasses: 'thead-light',
        maintainMetaData: true,
        //singleSelect: true,
        uniqueId: 'id',
        columns: [
            {
                field: 'state',
                checkbox: true,
                align: 'center',
                valign: 'middle'
            },
            {
                field: 'id',
                title: 'StudyInstanceUID',
                visible: false
            },
            {
                field: 'patient_name',
                title: 'Patient Name',
                sortable: true,
                class: 'break-all'
            },
            {
                field: 'patient_id',
                title: 'Patient ID',
                sortable: true,
                class: 'break-all'
            },
            {
                field: 'label',
                title: 'Study Description',
                sortable: true,
                class: 'break-all'
            },
            {
                field: 'modality',
                title: 'Modality',
                sortable: true,
                class: 'break-all'
            },
            {
                field: 'scan_count',
                title: 'Scans',
                sortable: true,
                class: 'right-aligned'
            },
            {
                field: 'study_date',
                title: 'Study Date',
                class: 'right-aligned',
                sortable: false,
                visible: false
            },
            {
                field: 'entered_day',
                title: 'Study Date',
                events: 'foundSessionsEvents',
                width: 152,
                sortable: false,
                class: project_settings.require_date ? 'emphasize' : '',
                formatter: function(value, row, index, field) {
                    //let parsed_value = value ? value : (row.study_date ? row.study_date.substr(8,2) : false)
                    
                    if (date_required && row.study_date !== false) {
                        return `${row.study_date.substr(0, 7)}-<input 
                                type="text"
                                placeholder="##"
                                size="1"
                                maxlength="2"
                                class="day-validation"
                                value="${value}"
                                data-valid="${row.study_date.substr(8,2)}" 
                                pattern="${row.study_date.substr(8,2)}">
                            <span class="day-valid">&#10003;</span>
                            <span class="day-invalid">&#9888;</span>
                                `;
                    } else {
                        return row.study_date ? row.study_date : 'N/A';
                    }
                    
                }
            }
            
        ],
        data: tbl_data
    });

    $found_sessions_tbl.bootstrapTable('resetView');
}




if (!settings.has('user_auth') || !settings.has('xnat_server')) {
    ipc.send('redirect', 'login.html');
    return;
}


$(document).on('page:load', '#upload-section', async function(e){
    console.log('Upload page:load triggered');
    
    _init_variables();

    csrfToken = await auth.get_csrf_token(xnat_server, user_auth);
    console.log(csrfToken);

    if (csrfToken === false) {
        // An error occured while fetching CSRF token
    }

    global_allow_create_subject().then(handle_create_subject_response).catch(handle_error);
    global_require_date().then(handle_global_require_date).catch(handle_error);
    

    $.blockUI({
        message: '<h1>Processing...</h1>'
    });
    promise_projects()
        .then(function(resp) {
            let totalRecords = resp.data.ResultSet.Result.length;

            let projects = (totalRecords === 1) ? [resp.data.ResultSet.Result[0]] : resp.data.ResultSet.Result;
            //let projects = resp.data.ResultSet.Result;

            console.log(projects)

            $('#upload-project').html('')

            
            if (projects.length) {
                let rupc = user_settings.get('recent_upload_projects_count');
                if (rupc === undefined) {
                    rupc = constants.DEFAULT_RECENT_UPLOAD_PROJECTS_COUNT
                }

                if (rupc > 0) {
                    let recent_projects_ids = user_settings.get('recent_upload_projects') || [];
                    if (recent_projects_ids.length > rupc) {
                        recent_projects_ids = recent_projects_ids.slice(0, rupc);
                    }
                    
                    let recent_projects = [];
    
                    // find recent projects and preserve order
                    recent_projects_ids.forEach(recent_project_id => {
                        let found_project = projects.find(project => project.id === recent_project_id)
                        if (found_project) {
                            recent_projects.push(found_project)
                        }
                    })
                    
                    let other_projects = projects.filter((project) => !recent_projects_ids.includes(project.id));
    
                    projects = recent_projects.concat(other_projects)

                    console.log({recent_projects_ids, recent_projects, other_projects, projects});
                }


                for (let i = 0, len = projects.length; i < len; i++) {
                    if (i == 0 && rupc != 0) {
                        $('#upload-project').append(`
                            <li class="divider">Recent:</li>
                        `)
                    }

                    if (i == rupc && rupc != 0) {
                        $('#upload-project').append(`
                            <li class="divider">Other:</li>
                        `)
                    }
                    
                    $('#upload-project').append(`
                        <li><a href="javascript:void(0)" data-project_id="${projects[i].id}">${projects[i].secondary_id} <span class="project_id">ID: ${projects[i].id}</span></a></li>
                    `)
                    
                }
            } else {
                no_upload_privileges_warning()
            }

        })
        .catch(function(err) {
            handle_error(err);
        })
        .finally(function() {
            $.unblockUI();
        })
    

    $('#upload_session_date')
        .attr('min', '1990-01-01')
        .attr('max', new Date().toISOString().split('T')[0])

        
});

$(document).on('click', '#upload-section a[data-project_id]', async function(e){
    $('.tab-pane.active .js_next').addClass('disabled');
    

    $(this).closest('ul').find('a').removeClass('selected');
    $(this).addClass('selected');

    // set Review data
    $('#var_project').val(get_form_value('project_id', 'project_id'));
    
    let project_id = $(this).data('project_id');

    try {
        project_settings = await fetch_project_settings(project_id, xnat_server, user_auth);

        const scripts = mizer.aggregate_script(site_wide_settings.anon_script, project_settings.anon_script)

        project_settings.computed = {
            scripts: scripts,
            anon_variables: mizer.get_scripts_anon_vars(scripts),
            experiment_labels: project_settings.sessions.map(item => item.label),
            pet_tracers: get_pet_tracers(project_settings.pet_tracers, site_wide_settings.pet_tracers, user_defined_pet_tracers(settings))
        }


        console.log({PROJECT_SETTINGS: project_settings});

        // -----------------------------------------------------
        // render project settings overview table
        let tpl = $('#project_settings_tbl_tpl').html();
        let tbl = templateEngine(tpl, {
            project_settings: project_settings,
            site_wide_settings: site_wide_settings,
            site_wide_anon_script: site_wide_settings.anon_script !== false
        })


        $('#project_settings_tbl_wrap').html(tbl)

        $('#file_upload_folder').prop('disabled', false).closest('.btn').removeClass('disabled')

        FlowReset.execAfter('disable_session_upload')

        // -----------------------------------------------------
        // if needed - generate warning modal (about no anon script) and suppress warning logic
        suppress_anon_script_warning(scripts, xnat_server, project_id, user_settings)
        
    } catch (err) {
        handle_error(err)
    }

});


function suppress_anon_script_warning(scripts, xnat_server, project_id, user_settings) {
    let suppress = user_settings.get('suppress_anon_script_missing_warning');

    let warning_suppressed = Array.isArray(suppress) && 
        (suppress.indexOf('*|*') !== -1 || 
        suppress.indexOf(`${xnat_server}|*`) !== -1 || 
        suppress.indexOf(`${xnat_server}|${project_id}`) !== -1);

    if (scripts.length === 0 && !warning_suppressed) {
        generate_anon_script_warning(xnat_server, project_id, user_settings)
    }
}


function generate_anon_script_warning(xnat_server, project_id, user_settings) {
    let html = $(`<div class="outer">

        <div class="container">
            <div class="row">
                <div class="col-sm-8">
                    <div class="checkbox" style="font-size: 0.8rem; color: #777; text-align: right;">
                        <label data-toggle="collapse" data-target="#collapseOptions" aria-expanded="false" aria-controls="collapseOptions">
                            <input type="checkbox" name="suppress_toggle" id="suppress_toggle"/> Don't show this message again
                        </label>
                    </div>
                </div>
                <div class="col-sm-2" style="padding: 0">
                    <div id="collapseOptions" aria-expanded="false" class="collapse">
                        <select class="form-control" name="suppress_anon_script_missing_warning" id="suppress_anon_script_missing_warning" 
                            style="font-size: 0.8rem; color: #777; height: auto; padding: 1px;">
                            <option value="${xnat_server}|${project_id}">For this project</option>
                            <option value="${xnat_server}|*">For This Server</option>
                            
                            <!-- <option value="*|*">For Any Server</option> -->
                        </select>
                    </div>
                </div>
            </div>
        </div>
        
    </div>
    `);

    swal({
        title: `Warning: No anonymization scripts found!`,
        text: `Anonymization scripts are not set for this site or this project. Do you want to continue?`,
        content: html.get(0),
        icon: "warning",
        buttons: ['Choose a different project', 'Continue'],
        dangerMode: true
    })
    .then(proceed => {

        if ($('#suppress_toggle').is(':checked')) {
            let suppress_error = $('#suppress_anon_script_missing_warning').val()
            user_settings.push('suppress_anon_script_missing_warning', suppress_error)
        }

        if (proceed) {
            
        } else {
            $('#upload-project a.selected').removeClass('selected');
        }
    })
}



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

    if ($('.nav-item').eq(active_tab_index - 1).hasClass('hidden')) {
        active_tab_index--;
    }

    $('.nav-item').eq(active_tab_index - 1).trigger('click');
    
    setTimeout(function() {
        $('.tab-pane.active .js_next').removeClass('disabled');
    }, 300);

});

$(document).on('change', '#file_upload_folder', function(e) {
    let _files = [];
    
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
                            dicomParse(_files, pth);
                        } else {
                            $('#upload_folder, #file_upload_folder').val('');
                        }
                    });
                } else {
                    _files = walkSync(pth);
                    console.log(_files);

                    setTimeout(function() {
                        $('#file_upload_folder').val('');
                        dicomParse(_files, pth)
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


$(document).on('click', '.js_upload', async function() {
    let upload_method = $('#nav-verify').data('upload_method')

    if (upload_method === 'quick_upload') {
        if (validate_required_inputs($('#quick_upload'))) {
            const _sessions = $('#selected_session_tbl').bootstrapTable('getData');
            const overwrite = $('#upload_overwrite_method').val()
            await handle_quick_upload(_sessions, project_settings, overwrite)
        } else {
            swal({
                title: `Form Error`,
                text: `Please select at least one scan series and enter all variable value(s)`,
                icon: "warning",
                dangerMode: true
            })
        }
        
    } else {
        await handle_custom_upload()
    }

});

function validate_required_inputs($container) {
    let $required_inputs = $container.find(':input[required]');
    let all_valid = true;

    $required_inputs.each(function(){
        $(this).removeClass('is-invalid');

        if ($(this).val().trim() === '') {
            $(this).addClass('is-invalid');
            all_valid = false;
        }
    })

    return all_valid;
}

async function handle_quick_upload(_sessions, project_settings, overwrite) {

    const selected_session_id = _sessions.map(sess => sess.id);
    
    const ___session_single = {
        experiment_label: "L1OG4ZRA_MR_1",
        id: "1.3.46.670589.11.0.1.1996082307380006",
        label: "191",
        modality: "MR",
        patient_id: "7",
        patient_name: "MR/BRAIN/GRASE/1024",
        scan_count: 1,
        study_date: "1995-03-30",
        xnat_subject_id: "L1OG4ZRA"
    }


    _sessions.forEach(async session => {
        const url_data = {
            expt_label: session.experiment_label,
            project_id: project_settings.project.ID,
            subject_id: session.xnat_subject_id,
            overwrite: overwrite
        };

        let my_anon_variables = {
            experiment_label: session.experiment_label
        };

        // -----------------------------------------------------
        Object.keys(project_settings.computed.anon_variables).forEach(key => {
            switch (key) {
                case 'session':
                    my_anon_variables[key] = url_data.expt_label;
                    break;
                case 'subject':
                    my_anon_variables[key] = url_data.subject_id;
                    break;
                case 'project':
                    my_anon_variables[key] = url_data.project_id;
                    break;
                default:
                    my_anon_variables[key] = project_settings.computed.anon_variables[key] === '' ? 
                        '_ANONIMIZED_' : 
                        project_settings.computed.anon_variables[key];
            }
        })

        if (my_anon_variables.hasOwnProperty('pet_tracer')) {
            if (my_anon_variables.pet_tracer === 'OTHER') {
                my_anon_variables['tracer'] = my_anon_variables.custom_pet_tracer; // potential problem with quick upload
            } else {
                my_anon_variables['tracer'] = my_anon_variables.pet_tracer;
            }
        }
        // -----------------------------------------------------
        const all_series = get_session_series(session_map.get(session.id))
        const selected_series = all_series.map(ser => ser.series_id);
        // -----------------------------------------------------

        console.log({storeUpload: {url_data, selected_session_id: session.id, selected_series, my_anon_variables}});
        
        await storeUpload(url_data, session.id, selected_series, my_anon_variables);
        
    })

    start_upload_and_redirect()


    const ___selected_single = {
        count: 1,
        description: undefined,
        modality: "XA",
        select: true,
        series_id: "1.3.12.2.1107.5.4.3.123456789012345.19950922.121803.8", // seriesInstanceUid
        series_number: "1",
        size: 1702398
    }
}

async function handle_custom_upload() {
    let selected = $('#image_session').bootstrapTable('getSelections');

    let $required_inputs = $('#anon_variables').find(':input[required]');
    let required_input_error = false;

    if ($('#experiment_label').hasClass('is-invalid')) {
        $('#experiment_label').focus();
        return false;
    }

    $required_inputs.each(function(){
        $(this).removeClass('is-invalid');

        if ($(this).val().trim() === '') {
            $(this).addClass('is-invalid');
            required_input_error = true;
        }
    })
    
    if (selected.length && !required_input_error) {
        let selected_series = selected.map(item => item.series_id);
        
        let expt_label_val = $('#experiment_label').val();

        let url_data = {
            expt_label: expt_label_val ? expt_label_val : experiment_label(),
            project_id: get_form_value('project_id', 'project_id'),
            subject_id: $('#var_subject').val()
        };

        let my_anon_variables = {};

        

        if (project_settings.computed.anon_variables.hasOwnProperty('session')) {
            my_anon_variables['session'] = url_data.expt_label;
        }

        $('#anon_variables').find(':input[required]').each(function(){
            let $field = $(this);
            my_anon_variables[$field.attr('name')] = $field.val();
        });

        if (my_anon_variables.hasOwnProperty('pet_tracer')) {
            if (my_anon_variables.pet_tracer === 'OTHER') {
                my_anon_variables.tracer = my_anon_variables.custom_pet_tracer;
            } else {
                my_anon_variables.tracer = my_anon_variables.pet_tracer;
            }
        }


        console.log({url_data, selected_session_id, selected_series, my_anon_variables});

        await storeUpload(url_data, selected_session_id, selected_series, my_anon_variables);

        start_upload_and_redirect()

    } else {
        swal({
            title: `Form Error`,
            text: `Please select at least one scan series and enter all variable value(s)`,
            icon: "warning",
            dangerMode: true
        })
    }
}

$(document).on('input', '#anon_variables :input[required]', function(e){
    let $input = $(this);
    $input.on('input', function(){
        $input.removeClass('is-invalid');
    });
});


$(document).on('show.bs.modal', '#new-subject', function(e) {
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

// new subject for field validation
$(document).on('input propertychange change', '#form_new_subject input[type=text], #experiment_label', function(e){
    let $el = $(this);
    let val = $el.val();

    // allow only alphanumeric, space, dash, underscore
    if (val.match(/[^a-z0-9_-]/i) !== null) {
        $el.addClass('is-invalid');
    } else {
        $el.removeClass('is-invalid');
    }
});

$(document).on('change', '#pet_tracer', function(e) {
    let custom_pt_required = $(this).val() === 'OTHER';
    
    $('#custom_pet_tracer').prop('required', custom_pt_required).prop('disabled', !custom_pt_required).toggleClass('hidden', !custom_pt_required);

    if (custom_pt_required) {
        $('#custom_pet_tracer').focus();
    }

    $('#experiment_label').val(experiment_label());
})

$(document).on('keyup', '#custom_pet_tracer', function(e) {
    $('#experiment_label').val(experiment_label());
})

$(document).on('submit', '#form_new_subject', function(e) {
    e.preventDefault();
    let $form = $(e.target);

    if ($form.find('.is-invalid').length) {
        return false;
    }

    if ($form.data('processing') !== true) {
        $form.data('processing', true);

        let modal_id = '#' + $(this).closest('.modal').attr('id');
        Helper.blockModal(modal_id);
    
        
    
        let project_id, subject_label, group;
        
        let $subject_label = $form.find('input[name=subject_label]');
        let $group = $form.find('input[name=group]');
    
        project_id = $form.find('input[name=project_id]').val();

        subject_label = $subject_label.val();
        //subject_label = subject_label.replace(/\s+/g, '_');

        group = $group.val();
        //group = group.replace(/\s+/g, '_');

        promise_create_project_subject(project_id, subject_label, group)
        .then(async res => {
            console.log({promise_create_project_subject: res});
            
            project_settings.subjects = await project_subjects(xnat_server, user_auth, project_id)

            generate_subject_dropdown(res.data)

            //$('#experiment_label').val(experiment_label());$('#experiment_label').val(experiment_label());

            $('#new-subject').modal('hide');

        })
        .catch(handle_error)
        .finally(() => {
            Helper.unblockModal(modal_id);
            $form.data('processing', false);
        });
    }
    
    
});

$(document).on('click', '.js_cancel_session_selection', function(){
    FlowReset.execAfter('disable_session_upload')
});

$(document).on('click', '.js_custom_upload', function(){
    let selected = $('#found_sessions').bootstrapTable('getSelections');

    console.log({selected});

    select_session_id(selected[0])
    $('#session-selection').modal('hide');
})

$(document).on('click', '.js_quick_upload', function(){
    let selected = $('#found_sessions').bootstrapTable('getSelections');

    quick_upload_selection(selected)

    $('#session-selection').modal('hide');
});

$(document).on('hidden.bs.modal', '#session-selection', function(e) {
    console.log(`**** selected_session_id: ${selected_session_id} *****`);

    if (selected_session_id) {
        $('.tab-pane.active .js_next').trigger('click');
    }
});

$(document).on('show.bs.modal', '#session-selection', function(e) {
    let date_required = site_wide_settings.require_date || project_settings.require_date;
    $('[data-display="require_date"]').toggle(date_required);

    let tbl_data = $(this).data('tbl_data')
    let title = tbl_data.length == 1 ? `Found 1 session` : `Found ${tbl_data.length} sessions`;


    $('.modal-header .modal-title', $(this)).html(title);

});

$(document).on('shown.bs.modal', '#session-selection', function(e) {
    // NEEDED to reset view (https://examples.bootstrap-table.com/#welcomes/modal-table.html)
    $('#found_sessions').bootstrapTable('resetView');
});

function generate_subject_dropdown(selected_id = false) {
    let subject_options = project_settings.subjects.map(function(subject) {
        return `<option value="${subject.label}" data-subject_ID="${subject.ID}" 
            ${(subject.ID === selected_id ? 'selected' : '')}>
            ${subject.label}${(subject.group ? ` (Group: ${subject.group})`: '')}
            </option>`;
    });
    subject_options.unshift('<option value="">Select subject</option>')

    $('#var_subject')
        .html(subject_options.join("\n"))
        .trigger('change')
}

$(document).on('change', '#var_subject', function() {
    $('#experiment_label').val(experiment_label());
})

function generate_unique_xnat_subject_id(existing_project_subjects, xnat_subject_ids) {
    let subject_id;
    let all_subjects = [...existing_project_subjects, ...xnat_subject_ids]
    do {
        subject_id = random_string(8)
    } while(all_subjects.includes(subject_id))

    return subject_id;
}

function get_session_series(session) {
    let series_data = [];

    // Map() traverse
    session.scans.forEach((scan, key) => {
        const scan_size = scan.reduce((prevVal, elem) => {
            return prevVal + elem.filesize;
        }, 0);

        // use scan description from the first one (or any other from the batch)
        
        series_data.push({
            select: true,
            series_number: scan[0].seriesNumber,
            series_id: key,
            description: scan[0].seriesDescription,
            modality: scan[0].modality,
            count: scan.length,
            size: scan_size
        });
    });

    return series_data;
}

function quick_upload_selection(_sessions) {
    let session_ids = _sessions.map(sess => sess.id)

    let tbl_data = [];

    let xnat_subject_ids = []

    let existing_project_subjects = project_settings.subjects.map(item => item.label)

    session_map.forEach(function(cur_session, key) {
        console.log({cur_session});

        if (!session_ids.includes(key)) {
            console.log('SKIPPING: ' + key);
            return
        }

        let new_xnat_subject_id = generate_unique_xnat_subject_id(existing_project_subjects, xnat_subject_ids);
        xnat_subject_ids.push(new_xnat_subject_id)

        
        /************************** */
        let series_data = get_session_series(cur_session);
        /************************** */

        
        let session_label = cur_session.studyId === undefined ? key : cur_session.studyId;

        let studyDate = getStudyDate(cur_session.date);

        let session_data = {
            id: key,
            patient_name: cur_session.patient.name,
            patient_id: cur_session.patient.id,
            xnat_subject_id: new_xnat_subject_id,
            label: session_label,
            experiment_label: generate_experiment_label(new_xnat_subject_id, series_data, 'PT', 'YYY'), // TODO replace PT and YYY values with dicom data
            modality: cur_session.modality.join(", "),
            scan_count: cur_session.scans.size,
            study_date: studyDate
        }

        tbl_data.push(session_data);
    });

    console.log({session_ids, tbl_data});

    selected_sessions_table($('#selected_session_tbl'), tbl_data)

    selected_session_id = session_ids;

    $('.tab-pane.active .js_next').removeClass('disabled');

    $('#nav-verify').data('upload_method', 'quick_upload');
}



function select_session_id(_session) {
    selected_session_id = _session.id;
    
    console.log('******************************************');
    console.log({anon_variables: project_settings.computed.anon_variables});
    console.log('******************************************');



    $('#additional-upload-fields').html('');
    Object.keys(project_settings.computed.anon_variables).forEach(key => {
        let key_cap = Helper.capitalizeFirstLetter(key);
        
        let field_type = 'text';
        let field_text = '';
        let field_value = project_settings.computed.anon_variables[key];

        if (key != 'project' && key != 'subject' && key != 'session') {
            $('#additional-upload-fields').append(`
            <div class="form-group row">
                <label for="var_${key}" class="col-sm-2 col-form-label"><b>${key_cap}</b>:</label>
                <div class="input-group col-sm-10">
                    <input class="form-control" type="${field_type}" name="${key}" id="var_${key}" value="${field_value}" required>
                    ${field_text}
                </div>
            </div>
            `);
            console.log('$$$$ ' + key + ' => ' + project_settings.computed.anon_variables[key]);
        }
    });

    let session_id = selected_session_id,
        selected_session = session_map.get(session_id),
        total_files = 0,
        total_size = 0,
        table_rows = [];

    let all_modalities = [];

    selected_session.scans.forEach(function(scan, key) {
        let scan_size = scan.reduce(function(prevVal, elem) {
            return prevVal + elem.filesize;
        }, 0);
        total_size += scan_size;
        total_files += scan.length;
        
        console.log(scan)

        // use scan description from the last one (or any other from the batch)
        let scans_description = scan[0].seriesDescription;
        let series_number = scan[0].seriesNumber;
        let modality = scan[0].modality;
        console.log(scan);
        
        table_rows.push({
            select: true,
            series_number: series_number,
            series_id: key,
            description: scans_description,
            modality: modality,
            count: scan.length,
            size: scan_size
        });

        if (all_modalities.indexOf(modality) === -1) {
            all_modalities.push(modality);
        }
        
    });

    console.log('-----------------------------------------------------------');
    console.log(table_rows);
    console.log('---------------------*** --------------------------------------');
    console.log(all_modalities);

    _init_img_sessions_table(table_rows);

    generate_subject_dropdown();

    console.log(selected_session.studyDescription);
    console.log(selected_session.modality);
    console.log(selected_session.studyInstanceUid);

    let expt_label = experiment_label();
    
    $('#experiment_label').val(expt_label);

    let studyDate = getStudyDate(selected_session.date, selected_session.time) || 'N/A'
    
    let modality_str = (all_modalities.length > 1 ? "Modalities: " : "Modality: ") + all_modalities.join(', ');

    $('#session_info').html('')
        .append(`Study ID: ${selected_session.studyId}<br>`)
        .append(`Accession: ${selected_session.accession}<br>`)
        .append('Description: ' + selected_session.studyDescription + '<br>')
        .append('Date: ' + studyDate + '<br>')
        .append(modality_str  + '<br>')
        //.append(`Modality: ${selected_session.modality}<br>`)
        .append(`${selected_session.scans.size} scans in ${total_files} files (${(total_size / 1024 / 1024).toFixed(2)}MB)`);

    // search for PET scan
    $('#pet_tracer_container').remove();
    
    if (all_modalities.indexOf('PT') !== -1) {
        
        let pet_tracer_options = project_settings.computed.pet_tracers.map(function(el) {
            return `<option value="${el}">${el}</option>`;
        });

        pet_tracer_options.unshift('<option value="">...</option>')

        let $pet_tracer_container = $(`
            <div class="form-group row" id="pet_tracer_container">
                <label class="col-sm-2 col-form-label">
                    <b>Set tracer</b>:
                </label>
                <div class="input-group col-sm-10">
                    <select class="form-control" id="pet_tracer" name="pet_tracer" style="width: 20%" required>
                        ${pet_tracer_options.join("\n")}
                    </select>
                    <input type="text" id="custom_pet_tracer" name="custom_pet_tracer" class="form-control hidden" style="width: 70%">
                </div>
            </div>
        `);
        $pet_tracer_container.insertBefore('#experiment_label_container');

    }

    $('.tab-pane.active .js_next').removeClass('disabled');

    $('#nav-verify').data('upload_method', 'custom_upload');
}

$(document).on('click', 'button[data-session_id]', function(e){
    select_session_id($(this).data('session_id'));
    $('#session-selection').modal('hide');
});

function get_form_value(field, data) {
    let $field = $(`a[data-${field}].selected`);
    return $field.length ? $field.data(data) : '';
}


$.queuer = {
    _timer: null,
    _queue: [],
    add: function(fn, context, time) {
        var setTimer = function(time) {
            $.queuer._timer = setTimeout(function() {
                time = $.queuer.add();
                if ($.queuer._queue.length) {
                    setTimer(time);
                }
            }, time || 0);
        }

        if (fn) {
            $.queuer._queue.push([fn, context, time]);
            if ($.queuer._queue.length == 1) {
                setTimer(time);
            }
            return;
        }

        var next = $.queuer._queue.shift();
        if (!next) {
            return 0;
        }
        next[0].call(next[1] || window);
        return next[2];
    },
    clear: function() {
        clearTimeout($.queuer._timer);
        $.queuer._queue = [];
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

function dicomParse(_files, root_path) {
    $.blockUI({
        message: '<h1>Processing...</h1>'
    });
            
    let errors = 0;
    let warnings = 0;

    let dicoms = [];
    let sessions = [];
    let series = [];

    session_map.clear();

    
    NProgress.start();
    let current_progress = 0.03;


    let $progress_bar = $('#dicom_parse_progress');
    $progress_bar.show().attr({
        value: 0,
        max: _files.length
    });

    let timer_start;
    $.queuer.add(function(){
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

                            const SOPInstanceUID = dicom.string('x00080018');
                            
                            // ++++
                            const modality = dicom.string('x00080060');
                            const study_date = dicom.string('x00080020');
                            const study_time = dicom.string('x00080030');

                            const accession = dicom.string('x00080050');
                            // ++++

                            // ***********
                            const PatientName = dicom.string('x00100010'); // PatientName
                            const PatientID = dicom.string('x00100020'); // PatientID
                            // ***********
                
    
                            if (!session_map.has(studyInstanceUid)) {
                                session_map.set(studyInstanceUid, {
                                    studyId: studyId,
                                    studyInstanceUid: studyInstanceUid,
                                    studyDescription: studyDescription,
                                    modality: [],
                                    accession: accession,
                                    date: study_date,
                                    time: study_time,
                                    patient: {
                                        name: PatientName,
                                        id: PatientID
                                    },
                                    scans: new Map()
                                });
                            }

                            let studyInstance = session_map.get(studyInstanceUid);

                            // TODO fix global modality
                            if (modality && studyInstance.modality.indexOf(modality) === -1) {
                                studyInstance.modality.push(modality.toUpperCase());
                            }
                
                            if (!studyInstance.scans.has(seriesInstanceUid)) {
                                studyInstance.scans.set(seriesInstanceUid, []);
                            }
                            
                            let file_name = path.basename(file);
                            let file_size = getFilesizeInBytes(file);
                            let my_scans = studyInstance.scans.get(seriesInstanceUid);
                            let filtered = my_scans.filter(el => 
                                el.filename === file_name && 
                                el.filesize === file_size && 
                                el.SOPInstanceUID === SOPInstanceUID
                            );
            
                            // only add unique files
                            if (filtered.length === 0) {
                                my_scans.push({
                                    filepath: file,
                                    filename: file_name,
                                    filesize: file_size,
                                    seriesDescription: seriesDescription,
                                    seriesInstanceUid: seriesInstanceUid,
                                    seriesNumber: seriesNumber,
                                    modality: modality ? modality.toUpperCase() : '',
                                    SOPInstanceUID: SOPInstanceUID
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

        $.queuer.add(parse_file_bundle, this);
        $.queuer.add(show_bundle_progress, this);
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
    // $.queuer.add(display_results, this);

    let handle_results = function(){

        function find_common_path(paths) {
            if (paths.length === 0) {
                return '';
            }
            
            // find a common path
            let common_path = paths[0];
            let searching = paths.length === 1 ? false : true;

            while (common_path.length > 0 && searching) {
                for (let j = 1; j < paths.length; j++) {
                    let path_suffix = paths[j].substring(common_path.length);

                    if (paths[j].indexOf(common_path) !== 0 || (path_suffix.length > 0 && path_suffix.indexOf(path.sep) !== 0)) {
                        let last_path_separator = common_path.lastIndexOf(path.sep);
                        common_path = last_path_separator > 0 ? common_path.substring(0, last_path_separator) : '';
                        break;
                    }

                    // if no break has happened - we found our match
                    if (j == paths.length - 1) {
                        searching = false;
                    }
                    
                }
            }

            return common_path;
        }

        NProgress.done();

        console.log(`************************* session_map.size: ${session_map.size} ********************************`);
        
        switch (session_map.size) {
            case 0:
                FlowReset.execFrom('session_selection')
                
                swal({
                    title: 'No DICOM files',
                    text: 'No DICOM files were found inside selected folder. Please choose another folder.',
                    icon: "warning",
                    dangerMode: true
                })

                break;
            
            // case 1:
            //     let my_session_id;
            //     session_map.forEach(function(cur_session, key) {
            //         my_session_id = key
            //     });

            //     select_session_id(my_session_id);
            //     $('.tab-pane.active .js_next').trigger('click');

            //     break;

            default:
                let tbl_data = [];
                session_map.forEach(function(cur_session, key) {
                    console.log({cur_session});

                    let paths = [];
                    cur_session.scans.forEach(function (files, scan_id) {                       
                        for (let i = 0; i < files.length; i++) {
                            let node_path = path.dirname(files[i].filepath)
                            let rel_dir_path = node_path.substring(root_path.length);
                            paths.push(rel_dir_path);
                        }
                    });
                    
                    console.log('=================== COMMON PATH '+ root_path + find_common_path(paths) +'=============================');
                    console.log(paths);
                    console.log('===============================================');
                    
                    let session_label = cur_session.studyId === undefined ? key : cur_session.studyId;
                    //let session_label = cur_session.studyDescription === undefined ? key : cur_session.studyDescription;
                    // let session_label = JSON.stringify({
                    //     stud_desc: cur_session.studyDescription,
                    //     stud_id: cur_session.studyId
                    // })

                    let studyDate = getStudyDate(cur_session.date);

                    let session_data = {
                        id: key,
                        state: false,
                        patient_name: cur_session.patient.name,
                        patient_id: cur_session.patient.id,
                        label: session_label,
                        modality: cur_session.modality.join(", "),
                        root_path: root_path + find_common_path(paths),
                        scan_count: cur_session.scans.size,
                        study_date: studyDate,
                        entered_day: ''
                    }

                    tbl_data.push(session_data);
                });

                _init_session_selection_table(tbl_data);

                $('#session-selection').data('tbl_data', tbl_data).modal('show');
        }

        $.unblockUI();

    };


    $.queuer.add(handle_results, this);

    $.queuer.add(function(){
        console.log(session_map);
        
    }, this);

}

function getStudyDate(date_string, time_string = false) {
    if (!date_string) {
        return false;
    } else {
        let only_numbers = date_string.replace(/[^\d]/g, '');

        let _date = `${only_numbers.substr(0, 4)}-${only_numbers.substr(4, 2)}-${only_numbers.substr(6, 2)}`

        if (time_string) {
            _date += ' ' + getStudyTime(time_string);
        }

        return _date;
    }
}

function getStudyTime(time_string) {
    if (!time_string) {
        return false;
    } else {
        time_string = time_string.replace(/[^\d]/g, '');

        return `${time_string.substr(0, 2)}:${time_string.substr(2, 2)}:${time_string.substr(4, 2)}`;
    }
}

function generate_experiment_label(_subject_id, _selected_series, _pet_tracer, _custom_pet_tracer) {
    let upload_modalities_index = _selected_series.reduce((allModalities, row) => {
        if (constants.PRIMARY_MODALITIES.indexOf(row.modality) !== -1) {
            if (allModalities.hasOwnProperty(row.modality)) {
                allModalities[row.modality]++;
            } else {
                allModalities[row.modality] = 1;
            }
        }
        
        return allModalities;
    }, {});


    let upload_modalities = Object.keys(upload_modalities_index);

    let modality = '';

    if (upload_modalities.indexOf('PT') >= 0) {
        modality = _pet_tracer === 'OTHER' ? _custom_pet_tracer : _pet_tracer;
    } else if (upload_modalities.length == 1) {
        modality = upload_modalities[0];
    } else {
        //remove OT from upload_modalities_index
        delete upload_modalities_index['OT'];

        // chose most frequent modality (with most series)
        let greatest_mod_value = 0;
        for (let mod in upload_modalities_index) {
            if (upload_modalities_index[mod] > greatest_mod_value) {
                greatest_mod_value = upload_modalities_index[mod]
                modality = mod
            }
        }
    }


    /* ***************** */
    let expt_label = _subject_id.split(' ').join('_') + '_' + modality + '_';
    for (let i = 1; i < 100000; i++) {
        let my_expt_label = expt_label + i;
        if (project_settings.computed.experiment_labels.indexOf(my_expt_label) === -1) {
            project_settings.computed.experiment_labels.push(expt_label)
            expt_label = my_expt_label;
            break;
        }
    }

    console.log('EXPT_LABEL_NEW', expt_label);

    return expt_label;

}

function experiment_label() {
    const _subject_id = $('#var_subject').val();
    const _selected_series = $('#image_session').bootstrapTable('getSelections');
    const _pet_tracer = $('#pet_tracer').length ? $('#pet_tracer').val() : '';
    const _custom_pet_tracer = ('' + $('#custom_pet_tracer').val()).trim().split(' ').join('_'); // ???

    return generate_experiment_label(_subject_id, _selected_series, _pet_tracer, _custom_pet_tracer)
}


async function storeUpload(url_data, session_id, series_ids, anon_variables) {
    console.log('==== anon_variables ====', anon_variables);
    
    let project_id = url_data.project_id;

    const selected_session = session_map.get(session_id);

    // -----------------------------------------------------
    let _files = [];
    let series = [];
    let total_size = 0;

    for (let i = 0; i < series_ids.length; i++) {
        let scan_series = selected_session.scans.get(series_ids[i]);
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

    let table_rows = [];
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
            console.log('Skipping ' + key);
        }       
        
    });

    let studyDate = getStudyDate(selected_session.date) || '';
    let studyTime = getStudyTime(selected_session.time) || '';


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
        //user_auth: user_auth,
        xnat_server: xnat_server,
        user: auth.get_current_user(),
        transfer_start: Helper.unix_timestamp(),
        table_rows: table_rows,
        status: 0,
        canceled: false
    };
    console.log({upload_digest});

    try {
        const newItem = await db_uploads._insertDoc(upload_digest)

        await update_recent_projects(project_id)
        console.log(newItem);

    } catch (err) {
        console.log(err)
        electron_log.error(err.message)
    }

}

function start_upload_and_redirect() {
    ipc.send('start_upload');
    ipc.send('redirect', 'progress.html');

    setTimeout(function(){
        $('#nav-upload-tab').trigger('click');
    }, 40);
}

async function update_recent_projects(project_id) {
    let recent_upload_projects = user_settings.get('recent_upload_projects') || []

    // remove value if it exists
    let filtered = recent_upload_projects.filter(project => project !== project_id)
    // prepend it
    filtered.unshift(project_id)

    // limit recent upload list
    filtered = filtered.slice(0, constants.MAX_RECENT_UPLOAD_PROJECTS_STORED)

    // store it
    user_settings.set('recent_upload_projects', filtered)
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


const no_upload_privileges_warning = () => {
    swal({
        title: `Warning: No projects to display`,
        text: `There are no projects on this XNAT server that you have permission to upload to.`,
        icon: "warning",
        dangerMode: true,
        button: 'Cancel'
    })
    .then((proceed) => {
        console.log(proceed);
    });
}


// allow_create_subject
function global_allow_create_subject() {
    return axios.get(xnat_server + '/data/config/applet/allow-create-subject?contents=true&accept-not-found=true', {
        auth: user_auth
    });
}

function user_defined_pet_tracers(settings) {
    return settings.has('default_pet_tracers') ? settings.get('default_pet_tracers').split(",") : []
}


function get_pet_tracers(project_pts, server_pts, user_defined_pts) {
    let pet_tracers;
    if (project_pts !== false) {
        pet_tracers = project_pts
    } else if (server_pts.length) {
        pet_tracers = server_pts
    } else {
        pet_tracers = user_defined_pts;
    }

    if (!pet_tracers.includes('OTHER')) {
        pet_tracers.push('OTHER')
    }

    return pet_tracers;
}


function global_pet_tracers(xnat_server, user_auth) {
    return new Promise(function(resolve, reject) {
        axios.get(xnat_server + '/data/config/tracers/tracers?contents=true&accept-not-found=true', {
            auth: user_auth
        }).then(resp => {
            let pet_tracers, 
                pet_tracers_str = resp.data.trim();

            if (pet_tracers_str.length) {
                pet_tracers = pet_tracers_str.split(/\s+/);
            } else {
                pet_tracers = [];
            }

            resolve(pet_tracers);
            
        }).catch(err => {
            reject({
                type: 'axios',
                data: err
            })
        });
    });
}

function project_pet_tracers(xnat_server, user_auth, project_id) {
    return new Promise(function(resolve, reject) {
        axios.get(xnat_server + `/data/projects/${project_id}/config/tracers/tracers?contents=true&accept-not-found=true`, {
            auth: user_auth
        }).then(resp => {
            let pet_tracers

            if (resp.status === 200) {
                let pet_tracers_str = resp.data.trim()

                if (pet_tracers_str.length) {
                    pet_tracers = pet_tracers_str.split(/\s+/)
                } else {
                    pet_tracers = []
                }
            } else {
                pet_tracers = false
            }

            resolve(pet_tracers)
            
        }).catch(err => {
            reject({
                type: 'axios',
                data: err
            })
        });
    });
}

function global_series_import_filter() {
    return new Promise(function(resolve, reject) {
        axios.get(xnat_server + '/data/config/seriesImportFilter?contents=true&accept-not-found=true', {
            auth: user_auth
        }).then(resp => {
            let global_filter_enabled = resp.data.ResultSet.Result[0].status == 'disabled' ? false : true;
            let global_filter = resp.data.ResultSet.Result[0].contents;

            if (global_filter_enabled) {
                resolve(global_filter);
            } else {
                resolve(false);
            }
            
        }).catch(err => {
            if (err.response && err.response.status === 404) {
                resolve(false);    
            } else {
                reject({
                    type: 'axios',
                    data: err
                })
            }
        });
    });
}

function project_series_import_filter(xnat_server, user_auth, project_id) {
    return new Promise(function(resolve, reject) {
        axios.get(xnat_server + `/data/projects/${project_id}/config/seriesImportFilter/config?format=json`, {
            auth: user_auth
        }).then(resp => {
            let filter_data = resp.data.ResultSet.Result[0];
            let filter_value = filter_data.status === 'disabled' ? false : JSON.parse(filter_data.contents)

            resolve(filter_value);
            
        }).catch(err => {
            if (err.response && err.response.status === 404) {
                resolve(false);    
            } else {
                reject({
                    type: 'axios',
                    data: err
                })
            }
        });
    });
}

function project_upload_destination(xnat_server, user_auth, project_id) {
    return new Promise(function(resolve, reject) {
        axios.get(xnat_server + `/data/projects/${project_id}/prearchive_code`, {
            auth: user_auth
        }).then(resp => {
            let upload_destination;
            console.log({resp_data: resp.data});
            switch (resp.data) {
                case 0:
                    upload_destination = "PREARCHIVE";
                    break;
                case 4:
                    upload_destination = "ARCHIVE (Reject duplicates)";
                    break;
                case 5:
                    upload_destination = "ARCHIVE (Overwrite duplicates)"
                    break;
            }

            resolve(upload_destination);
            
        }).catch(err => {
            reject({
                type: 'axios',
                data: err
            })
        });
    });
}

function project_data(xnat_server, user_auth, project_id) {
    return new Promise(function(resolve, reject) {
        axios.get(xnat_server + `/data/projects/${project_id}?format=json`, {
            auth: user_auth
        }).then(resp => {
            console.log({project_data: resp.data});

            resolve(resp.data.items[0].data_fields);
            
        }).catch(err => {
            reject({
                type: 'axios',
                data: err
            })
        });
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

function handle_error(err) {
    console.error('_ERROR_')
    console.log(err, err.response);

    const message = err.type == 'axios' ? err.data.message + "\n" + err.data.config.url : err.message

    swal({
        title: `Error`,
        text: `Message:\n\n${message}`,
        icon: "error",
        dangerMode: true
    })

    FlowReset.execAll()

};

//================================

function promise_projects() {
    return axios.get(xnat_server + '/data/projects?permissions=edit&dataType=xnat:subjectData', {
    //return axios.get(xnat_server + '/data/projects?accessible=true', {
        auth: user_auth
    });
}

function promise_project_experiments(project_id) {
    return axios.get(xnat_server + '/data/projects/'+project_id+'/experiments?columns=ID,label,xnat:experimentData/meta/status', {
        auth: user_auth
    });
}

function promise_project_pet_tracers(project_id) {
    return axios.get(xnat_server + `/data/projects/${project_id}/config/tracers/tracers?contents=true&accept-not-found=true`, {
        auth: user_auth
    })
}

function promise_server_pet_tracers() {
    return axios.get(xnat_server + `/data/config/tracers/tracers?contents=true&accept-not-found=true`, {
        auth: user_auth
    })
}

function promise_subjects(project_id) {
    return axios.get(xnat_server + '/data/projects/' + project_id + '/subjects?columns=group,insert_date,insert_user,project,label', {
        auth: user_auth
    })
}

function sortAlpha(attr = false) {
    return function (a, b) {
        var aValue = attr === false ? a : a[attr].toLowerCase();
        var bValue = attr === false ? b : b[attr].toLowerCase(); 
        return ((aValue < bValue) ? -1 : ((aValue > bValue) ? 1 : 0));
    }
}


function project_subjects(xnat_server, user_auth, project_id) {
    return new Promise(function(resolve, reject) {
        axios.get(xnat_server + '/data/projects/' + project_id + '/subjects?columns=group,insert_date,insert_user,project,label', {
            auth: user_auth
        }).then(resp => {
            /*
            let subjects = resp.data.ResultSet.Result;
            let sorted_subjects = subjects.sort(sortAlpha('label'));
            resolve(sorted_subjects);
            */
            
            resolve(resp.data.ResultSet.Result.sort(sortAlpha('label')));
            
        }).catch(err => {
            reject({
                type: 'axios',
                data: err
            })
        });
    });
}

function project_sessions(xnat_server, user_auth, project_id) {
    return new Promise(function(resolve, reject) {
        axios.get(xnat_server + '/data/projects/' + project_id + '/experiments?columns=ID,label&format=json', {
            auth: user_auth
        }).then(resp => {
            console.log({sessions: resp.data.ResultSet.Result});
            resolve(resp.data.ResultSet.Result);
        }).catch(err => {
            reject({
                type: 'axios',
                data: err
            })
        });
    });
}


function promise_project_subject(project_id, subject_label) {
    return axios.get(xnat_server + '/data/projects/' + project_id + '/subjects/' + subject_label + '?format=json', {
        auth: user_auth
    })
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


const summary_clear = () => {
    $('#summary_info').html('');
}

const summary_add = (text, label = '') => {
    let label_html = label ? `<b>${label}: </b>` : '';

    $('#summary_info').append(`<p>${label_html} ${text}</p>`);
}