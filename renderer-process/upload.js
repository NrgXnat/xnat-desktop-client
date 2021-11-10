const { ipcRenderer, remote } = require('electron')
const fs = require('fs')
const path = require('path')
const getSize = require('get-folder-size')
const prettyBytes = require('pretty-bytes')
//require('promise.prototype.finally').shim()
const ElectronStore = require('electron-store')
const settings = new ElectronStore()
const swal = require('sweetalert')
const moment = require('moment')
const mime = require('mime-types')
const csvToJson = require('csvtojson')
const store = require('store2')

const auth = require('../services/auth')
const user_settings = require('../services/user_settings')
const ResetManager = require('../services/reset-manager')
const FlowReset = new ResetManager();
const ExperimentLabel = require('../services/experiment_label')
const mizer = remote.require('./mizer')
const db_uploads = remote.require('./services/db/uploads')
const electron_log = remote.require('./services/electron_log')
const XNATAPI = require('../services/xnat-api')
const { 
    random_string, 
    saveAsCSV, 
    objToJsonFile, 
    normalizeDateString, 
    normalizeTimeString, 
    normalizeDateTimeString
} = require('../services/app_utils')
const { selected_sessions_table, custom_upload_multiple_table, selected_scans_table } = require('../services/tables/upload-prepare')
const { findSOPClassUID } = require('../services/upload/sop_class_uids')
const templateEngine = require('../services/template_engine')
const ejs_template = require('../services/ejs_template')

const {
    DEFAULT_RECENT_UPLOAD_PROJECTS_COUNT, 
    MAX_RECENT_UPLOAD_PROJECTS_STORED,
    ALLOW_VISUAL_PHI_CHECK,
    BULK_IMAGE_ANONYMIZATION,
    UPLOAD_SELECTION_WARNING_SIZE,
    PRIMARY_MODALITIES,
    CSV_UPLOAD_FIELDS
} = require('../services/constants')


let show_unable_to_set_session_label_warning = 0

// ===================
// ADD cornerstone INIT
// ===================
// ===================
const dicomParser = require('dicom-parser');
const cornerstone = require('cornerstone-core-with-bg');
const Hammer = require('hammerjs');

const cornerstoneWADOImageLoader = require('cornerstone-wado-image-loader');
let WADOImageLoaderPath = path.dirname(require.resolve('cornerstone-wado-image-loader'));
let WADOImageLoaderWebWorkerPath = path.join(WADOImageLoaderPath, 'cornerstoneWADOImageLoaderWebWorker.js');
let WADOImageLoaderCodecsPath = path.join(WADOImageLoaderPath, 'cornerstoneWADOImageLoaderCodecs.js');

cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;

let WADOWebWorkerConfig = {
    webWorkerPath : WADOImageLoaderWebWorkerPath,
    taskConfiguration: {
        'decodeTask' : {
            codecsPath: WADOImageLoaderCodecsPath
        }
    }
};
cornerstoneWADOImageLoader.webWorkerManager.initialize(WADOWebWorkerConfig);

const cornerstoneMath = require('cornerstone-math');
const cornerstoneTools = require('cstools-overlay');

const scrollToIndex = cornerstoneTools.import('util/scrollToIndex');

cornerstoneTools.external.cornerstone = cornerstone;
cornerstoneTools.external.cornerstoneMath = cornerstoneMath;
cornerstoneTools.external.Hammer = Hammer;
// ===================
let resizing_tm;
let rectangle_state_registry = [];
let event_timeout;

let anno2, anno3;
// ===================

const dom_context = '#upload-section';
const { $$, $on } = require('./../services/selector_factory')(dom_context)


const NProgress = require('nprogress');
NProgress.configure({ 
    trickle: false,
    easing: 'ease',
    speed: 1,
    minimum: 0.03
});

let xnat_server, user_auth, session_map, selected_session_id;


let site_wide_settings = {};
let project_settings = {};

let _masking_groups = {}

/*
const _masking_template_registry = [
    {
        name: "1. Magnetic resonance spectroscopy of the occipital cortex",
        alias: "MR Occipital",
        created: 1554216555411,
        author: 'Darko L',
        data: {
            modality: "MR",
            Columns: 256,
            Rows: 256,
            SOPClassUID: "1.2.840.10008.5.1.4.1.1.4"
        },
        rectangles: [
            [20, 30, 80, 90], // [x1,y1,   x2,y2]
            [130, 20, 160, 50], // [x1,y1,   x2,y2]
        ]
    },
    {
        name: "2. Magnetic resonance spectroscopy of the occipital cortex",
        alias: "MR Occipital 2",
        created: 1554716555411,
        author: 'Darko L',
        data: {
            modality: "MR",
            Columns: 256,
            Rows: 256,
            SOPClassUID: "1.2.840.10008.5.1.4.1.1.4"
        },
        rectangles: [
            [32, 42, 92, 102], // [x1,y1,   x2,y2]
            [142, 32, 172, 62], // [x1,y1,   x2,y2]
        ]
    },
    {
        name: "X-Ray Angiography (full mask name)",
        alias: "XA_1_alias",
        created: 1551216555411,
        author: 'Darko L',
        data: {
            modality: "XA",
            Columns: 512,
            Rows: 512,
            SOPClassUID: "1.2.840.10008.5.1.4.1.1.12.1",
        },
        rectangles: [
            [10, 15, 50, 95], // [x1,y1,   x2,y2]
            [130, 20, 160, 50], // [x1,y1,   x2,y2]
            [400, 420, 480, 480], // [x1,y1,   x2,y2]
        ]
    }
];
*/

const _masking_template_registry = []
if(!store.has('masking_template_registry')) {
    store.set('masking_template_registry',  _masking_template_registry);
}

let masking_template_registry = store.get('masking_template_registry')

async function fetch_site_wide_settings(xnat_server, user_auth) {
    const xnat_api = new XNATAPI(xnat_server, user_auth)

    try {
        const res = await Promise.all([
            xnat_api.sitewide_allow_create_subject(),
            xnat_api.sitewide_require_date(),
            xnat_api.sitewide_anon_script(),
            xnat_api.sitewide_series_import_filter(),
            xnat_api.sitewide_pet_tracers()
        ])

        return {
            allow_create_subject: res[0],
            require_date: res[1],
            anon_script: res[2],
            series_import_filter: res[3],
            pet_tracers: res[4]
        }
    } catch (err) {
        throw err
    }
}

async function fetch_project_settings(project_id, xnat_server, user_auth) {
    const xnat_api = new XNATAPI(xnat_server, user_auth)

    try {
        const res = await Promise.all([
            xnat_api.project_subjects(project_id),
            xnat_api.project_allow_create_subject(project_id),
            xnat_api.project_require_date(project_id),
            xnat_api.project_anon_script(project_id),
            xnat_api.project_sessions(project_id),
            xnat_api.project_series_import_filter(project_id),
            xnat_api.project_upload_destination(project_id),
            xnat_api.project_data(project_id),
            xnat_api.project_pet_tracers(project_id),
            xnat_api.project_allow_bulk_upload(project_id),
            xnat_api.project_default_subject_labeling_scheme(project_id),
            xnat_api.project_default_session_labeling_scheme(project_id)
        ])

        return {
            subjects: res[0],
            allow_create_subject: res[1],
            require_date: res[2],
            anon_script: res[3],
            sessions: res[4],
            series_import_filter: res[5],
            upload_destination: res[6],
            project: res[7],
            pet_tracers: res[8],
            allow_bulk_upload: res[9],
            subject_labeling_scheme: res[10],
            session_labeling_scheme: res[11]
        }
    } catch (err) {
        throw err
    }
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

    init_flow_reset()

    cornerston_initialize_main_element($$('#nav-visual #dicom_image_container').get(0))
    cornerston_initialize_main_element($$('#create-masking-template #dicom_image_container').get(0))
    
    initAnno();
    initAnnoMulti();

    _UI();
}

function init_flow_reset() {
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

    FlowReset.add('update_add_subject_button_state', () => {
        $('button[data-target="#new-subject"]').prop('disabled', !project_settings.allow_create_subject);
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

    FlowReset.add('disable_next_tabs', () => {
        let current_key = $('#upload-section #nav-tab .nav-link.active').index()
        $(`#upload-section #nav-tab .nav-link:gt(${current_key})`).addClass('disabled');
    })
    FlowReset.add('disable_next_button', () => {
        $('#upload-section .tab-pane.active .js_next').addClass('disabled');
    })

    FlowReset.add('reset_upload_method', () => {
        $('#nav-verify').removeData('upload_method')
    })

    FlowReset.add('clear_visits', () => {
        // containers
        $('.visits-holder').addClass('hidden')
            
        // lists
        $('#visit').html('');

        // values
        $('#var_visit').val('');
    })

    FlowReset.add('clear_datatypes', () => {
        // containers
        $('.datatypes-holder').addClass('hidden')
        
        // lists
        $('#datatype').html('');
        
        // values
        $('#var_datatype').val('');
    })

    FlowReset.add('clear_subtypes', () => {
        // containers
        $('.subtypes-holder').addClass('hidden')
        
        // lists
        $('#subtype').html('');
        
        // values
        $('#var_subtype').val('');
    })

    FlowReset.add('clear_experiment_label', () => {
        $('#experiment_label').val('')
    })

    FlowReset.add('reset_overwrite_selection', () => {
        $('#upload_overwrite_method').prop('selectedIndex', 0);
    })


    // RESETTING FLOW
    FlowReset.execAll()
}


function initAnno() {
    anno2 = new Anno([{
        target  : '#series_thumbs', // second block of code
        position: 'top',
        content : 'This pane shows scan thumbnails. Drag a thumbnail into the viewer pane to view it. ',
        className: 'pera-klasa'
      }, {
        target  : '#dicom_image_container',
        position: 'center-top',
        content : 'This pane is the viewer. Scroll on this pane or click and drag up and down using the "Scroll Stack" tool to move through the image stack. ',
      }, {
        target  : '#dicom_image_tools',
        position: 'top',
        content : 'This is the toolbar. Toggle between tools to change how you use the viewer. Use "Select Area" to select an area to black out PHI.'
      }, {
        target  : '#scans_save_toolbar',
        position: 'center-top',
        content : 'When you have completed your review, use these controls to save or remove your changes to each scan, or mark it okay as is.'
      }]);

    $('#show_div_tour').on('click', function(e) {
        e.preventDefault();
        anno2.show();
    })
}

function initAnnoMulti() {
    anno3 = new Anno([/*{
        target  : '#masking-groups', // second block of code
        position: 'top',
        content : 'Scans are grouped... TO-DO',
        className: 'anno-width-400'
      }, */{
        target  : '#masking-groups > .row:first-child',
        position: 'bottom',
        content : 'Some scans cannot support pixel anonymization. For example, scans with multiple resolutions, such as DICOM WSI. These can still be uploaded, but they cannot be modified with this tool. Click here to toggle between groupings of valid and unsupported scans.',
        className: 'anno-width-400'
      }, {
        target  : '#masking-groups .mask-group-row:eq(0)',
        position: 'top',
        content : 'The scans from your selected data have been regrouped by modality, resolution, and SOP Class information, so that we can apply common pixel anonymization templates to them. Each of these scan groups may contain scans from multiple sessions.',
        className: 'anno-width-400'
      }, {
        target  : '#masking-groups .mask-group-row:eq(0)',
        position: {
            top: '20px',
            left: '880px'
        },
        arrowPosition: 'center-right',
        content : 'To review each group of scans and draw pixel anonymization templates, click the "Review" button within each scan group. There, you can draw and apply anonymization templates, or simply exclude scans from the upload queue.',
        className: 'anno-width-400'
      }, {
        target  : '#visual-phi-removal-instructions',
        position: 'bottom',
        content : 'For further help, see <a href="https://wiki.xnat.org/xnat-tools/xnat-desktop-client-dxm/uploading-image-sessions/applying-pixel-anonymization-during-the-upload-process">documentation</a> on pixel anonymization. To see these tips again, click the "Help" button.'
      }]);

    $$('#visual-phi-removal-instructions').on('click', function(e) {
        e.preventDefault();
        anno3.show();
    })
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

    $img_session_tbl.on('check.bs.table uncheck.bs.table check-all.bs.table uncheck-all.bs.table', async function (e) {
        let selected = $img_session_tbl.bootstrapTable('getSelections');

        let has_pt_scan = selected.reduce((total, row) => row.modality === 'PT' ? true : total, false);

        //$('#pet_tracer_container').toggle(has_pt_scan);
        $('#pet_tracer').prop('required', has_pt_scan).prop('disabled', !has_pt_scan);

        let custom_pt_required = has_pt_scan && $('#pet_tracer').val() === 'OTHER';
        $('#custom_pet_tracer').prop('required', custom_pt_required).prop('disabled', !custom_pt_required)
        
        if (has_pt_scan) {
            $('#pet_tracer').trigger('change');
        } else {
            await experiment_label_with_api()
            validate_upload_form()
        }
    })


    $img_session_tbl.bootstrapTable('resetView');
}


// triggered when selected tab (#nav-verify) is displayed
$(document).on('shown.bs.tab', '#upload-section .nav-tabs a[href="#nav-verify"]', function(){
    let upload_method = $('#nav-verify').data('upload_method')

    const HIDE_PHI_TAB = !ALLOW_VISUAL_PHI_CHECK || upload_method !== 'custom_upload'
    const HIDE_PHI_MULTI_TAB = !BULK_IMAGE_ANONYMIZATION || upload_method === 'custom_upload'

    $('#upload-section a[href="#nav-visual"]').toggleClass('hidden', HIDE_PHI_TAB);
    $('#upload-section a[href="#nav-visual-bulk"]').toggleClass('hidden', HIDE_PHI_MULTI_TAB);

    switch (upload_method) {
        case 'quick_upload':
            $('#quick_upload').show().siblings().hide()
            break
        case 'custom_upload_multiple':
            $('#custom_upload_multiple').show().siblings().hide()
            $('#subject_labeling_pattern').val(project_settings.subject_labeling_scheme).trigger('change')
            $('#session_labeling_pattern').val(project_settings.session_labeling_scheme).trigger('change')
            break
        case 'custom_upload':
        default:
            $('#custom_upload').show().siblings().hide()
            
            // TODO - refactor handling of the passed parameters from custom protocol URL (select_link_for_item() METHOD)
            $('#var_subject').val($('#subject_prm').val()).trigger('change')
            $('#subject_prm').val('')// reset #subject_prm
            $('#var_visit').val($('#visit_prm').val()).trigger('change')
            $('#var_datatype').val($('#datatype_prm').val()).trigger('change')
            $('#var_subtype').val($('#subtype_prm').val()).trigger('change')
            break
    }

    validate_upload_form();
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
    //$('.js_custom_upload').prop('disabled', invalid_days || selected.length != 1)
    $('.js_custom_upload').prop('disabled', invalid_days || selected.length === 0)
}

$(document).on('change', '#skip_session_date_validation', toggle_upload_buttons)


$(document).on('change', '#subject_labeling_pattern', function() {
    let subject_pattern = $(this).val()
    let session_pattern = $('#session_labeling_pattern').val()

    switch (subject_pattern) {
        case 'auto':
            generate_field_pattern('xnat_subject_id', 'subject_auto')
            break;
        
        case 'dicom_patient_name':
            generate_field_pattern('xnat_subject_id', 'subject_dicom_patient_name')
            break;

        case 'dicom_patient_id':
            generate_field_pattern('xnat_subject_id', 'subject_dicom_patient_id')
            break;

        default:

            break;

    }

    if (session_pattern === 'auto') {
        generate_session_auto()
    }
})


$(document).on('change', '#session_labeling_pattern', function() {
    let session_pattern = $(this).val()

    switch (session_pattern) {
        case 'auto':
            generate_session_auto()
            break;
        
        case 'dicom_accession_num':
            generate_field_pattern('experiment_label', 'session_accession')
            break;

        default:

            break;

    }
})

function generate_field_pattern(target_field, source_field) {
    let $tbl = $('#custom_upload_multiple_tbl')
    let tbl_data = $tbl.bootstrapTable('getData')

    let existing_labels = project_settings.computed.experiment_labels

    for (let i = 0; i < tbl_data.length; i++) {
        let row = tbl_data[i]
        let reinit_val = i === tbl_data.length - 1

        let row_value = row[source_field] === undefined ? '' : row[source_field]
        if (target_field === 'experiment_label') {
            row_value = generate_unique_session_label(row_value, existing_labels)
            existing_labels.push(row_value)
        }

        $tbl.bootstrapTable("updateCellByUniqueId", {
            id: row.id,
            field: target_field,
            value: row_value,
            reinit: reinit_val
        });
    }
}

function generate_session_auto() {
    let $tbl = $('#custom_upload_multiple_tbl')
    let tbl_data = $tbl.bootstrapTable('getData')

    let existing_labels = project_settings.computed.experiment_labels

    for (let i = 0; i < tbl_data.length; i++) {
        let row = tbl_data[i]
        let reinit_val = i === tbl_data.length - 1

        const new_session_label = generate_unique_session_label(row.xnat_subject_id + row.label_suffix, existing_labels)
        existing_labels.push(new_session_label)

        $tbl.bootstrapTable("updateCellByUniqueId", {
            id: row.id,
            field: 'experiment_label',
            value: new_session_label,
            reinit: reinit_val
        });
    }
}

function generate_unique_session_label(proposedLabel, existing_labels) {
    if (existing_labels.includes(proposedLabel)) {
        const regex_test = /.*_(\d+)$/gm;
        if (regex_test.test(proposedLabel)) {
            const regex = /(.*_)(\d+)$/gm;
            let matched = regex.exec(proposedLabel);

            let currentIndex = parseInt(matched[2])
            let prefix = matched[1]
            let newLabel
            do {
                currentIndex++
                newLabel = prefix + currentIndex
            } while (existing_labels.includes(newLabel))

            return newLabel
        } else {
            let currentIndex = 0
            let prefix = proposedLabel + '_'
            let newLabel
            do {
                currentIndex++
                newLabel = prefix + currentIndex
            } while (existing_labels.includes(newLabel))

            return newLabel
        }
    } else {
        return proposedLabel
    }
}


function _init_session_selection_table(tbl_data) {
    let $found_sessions_tbl = $('#found_sessions');

    let date_required = site_wide_settings.require_date || project_settings.require_date;
    let single_select = !project_settings.allow_bulk_upload;

    destroyBootstrapTable($found_sessions_tbl);

    const event_list = 'check.bs.table uncheck.bs.table check-all.bs.table uncheck-all.bs.table';
    $found_sessions_tbl.off(event_list).on(event_list, toggle_upload_buttons)

    window.foundSessionsEvents = {
        'input .day-validation': function (e, value, row, index) {
            row.entered_day = $(e.target).val()
            toggle_upload_buttons()
        }
    }

    $('.js_custom_upload, .js_quick_upload').prop('disabled', false);


    $found_sessions_tbl.bootstrapTable({
        height: tbl_data.length > 8 ? 400 : 0,
        sortName: 'patient_name',
        classes: 'table-sm',
        theadClasses: 'thead-light',
        maintainMetaData: true,
        singleSelect: single_select,
        // clickToSelect: true,
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
                title: 'Study Description (studyId)',
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
    ipcRenderer.send('redirect', 'login.html');
    return;
}

function validate_upload_form() {
    console.log('validate_upload_form() TRIGGERED');
    let required_input_error = false;


    let selected = $$('#image_session').bootstrapTable('getSelections');

    // current upload mode - required fields
    let $required_inputs = $$('#nav-verify > div:visible #anon_variables :input[required]');

    required_input_error = !valid_experiment_label_syntax()

    $required_inputs.each(function(i){
        console.log({required_el: this.id});
        const is_invalid = $(this).val() !== undefined && $(this).val() !== null && $(this).val().trim() === ''

        $(this).toggleClass('is-invalid', is_invalid);

        if (is_invalid) {
            required_input_error = true;
        }
    });

    // validate visits and protocols
    $$('#visit, #datatype, #subtype').each(function() {
        if ($(this).is(':visible')) {
            console.log(this.id, $(this).find('a.selected').length)
            if ($(this).find('a.selected').length === 0) {
                required_input_error = true;
            } else {
                console.log(this.id, 'Valid')
            }
        }
    })

    if (selected.length === 0) {
        required_input_error = true;
    }

    $$('#nav-verify .js_next, .js_upload').toggleClass('disabled', required_input_error);
    $$('.js_upload').prop('disabled', required_input_error);

    return required_input_error;
}

function valid_pixel_anon() {
    let is_valid = true
    rectangle_state_registry.forEach(state => {
        if (state.rectangles.length && !state.saved) {
            is_valid = false
            $(`#LI_${state.series_id}`).find('.yellow_mark').show()
        }
    })

    return is_valid;
}

// CORNERSTONE

let image_thumbnails = [];
// triggered when selected tab (#nav-visual) is displayed
$(document).on('shown.bs.tab', '#upload-section .nav-tabs a[href="#nav-visual"]', function(){
    $('.main-title').focus()

    window.dispatchEvent(new Event('resize'));// HACK TO recalculate canvas size for main cornerstone image

    set_image_thumbnails()


    // reset
    $('#series_thumbs').html('');
    image_thumbnails.map(el => {
        $('#series_thumbs').append(`<li id="LI_${el.series_id}">`);
    });

    console.log({image_thumbnails});
    
    image_thumbnails.forEach((series, index) => {
        display_series_thumb(series, index, cornerstone)
    });

    // Load first image
    load_dicom_image(image_thumbnails[0].series_id);
    
    $('#series_thumbs li').eq(0).addClass('highlite-outline');

    $("html, body").stop().animate({scrollTop:0}, 50);


    if(!store.has('dicom_viewer_tour_shown')) {
        store.set('dicom_viewer_tour_shown',  true);
        anno2.show();
    }
});

function scan_has_uniform_size(scan_files) {
    const unique_sizes = scan_files.reduce(function (sizes, file) {
        const size = `${file.Rows}x${file.Columns}`
        if (!sizes.includes(size)) {
            sizes.push(size)
        }
        return sizes
    }, [])

    return unique_sizes.length <= 1
}

function scan_has_uniform_SOPClassUID(scan_files) {
    const unique_values = scan_files.reduce(function (sizes, file) {
        const label = file.SOPClassUID
        if (!sizes.includes(label)) {
            sizes.push(label);
        }
        return sizes;
    }, []);

    return unique_values.length <= 1
}


let bulk_image_thumbnails = [];
// triggered when selected tab (#nav-visual-bulk) is displayed
$on('shown.bs.tab', '.nav-tabs a[href="#nav-visual-bulk"]', async function(){
    console.time('scan_table')
    $.blockUI()

    const upload_method = $('#nav-verify').data('upload_method')

    let selected_session_ids = []

    if (upload_method === 'quick_upload') {
        selected_session_ids = get_quick_selected_session_ids()
    } else if (upload_method === 'custom_upload_multiple') {
        selected_session_ids = get_custom_selected_session_ids()
    }

    console.log({selected_session_ids});

    let my_scans = []

    for (const selected_session_id of selected_session_ids) {
        const session = session_map.get(selected_session_id)

        session.scans.forEach((scan_files, seriesInstanceUid) => {
            const selected_image_index = Math.floor(scan_files.length / 2)
            const sel_img = scan_files[selected_image_index]

            const filepath_frame = sel_img.filepath + (sel_img.frames && sel_img.frames > 1 ? `&frame=${Math.floor(sel_img.frames / 2)}` : '')

            console.log({sel_img__frames: sel_img.frames});
            const tbl_row = {
                // from series (scan)
                id: seriesInstanceUid,

                // from study
                sessionId: selected_session_id,
                studyId: session.studyId,
                studyInstanceUid: session.studyInstanceUid,
                studyDescription: session.studyDescription,
                accession: session.accession,
                studyDate: session.date,
                studyTime: session.time,
                patientName: session.patient.name,
                patientId: session.patient.id,

                seriesDescription: sel_img.seriesDescription,
                seriesNumber: parseInt(sel_img.seriesNumber),
                thumbPath: filepath_frame,
                filesCount: scan_files.length,
                uniformScanSize: scan_has_uniform_size(scan_files),
                uniformScanSOPClass: scan_has_uniform_SOPClassUID(scan_files),

                SOPClassUID: sel_img.SOPClassUID,
                TransferSyntaxUID: sel_img.TransferSyntaxUID,
                PhotometricInterpretation: sel_img.PhotometricInterpretation,
                Rows: parseInt(sel_img.Rows),
                Columns: parseInt(sel_img.Columns),


                frames: sel_img.frames,
                modality: sel_img.modality,
                imgDataUrl: '',
                status: 0,
                excluded: false,
                rectangles: []
            }

            my_scans.push(tbl_row);
        });
    }

    // find the matchingMasks
    my_scans.forEach(row => {
        let masks = masking_template_registry.filter(item => {
            for (const prop in item.data) {
                // console.log({row, mask_data: item.data, prop})
                // match = match && item[prop] === row[prop]
                if (item.data[prop] !== row[prop]) {
                    return false
                }
            }
            return true
        })
        row.matchingMasks = masks
    });

    // reset _masking_groups
    _masking_groups = {}

    // group scans (by parameters or unsupported)
    my_scans.forEach(scan => {
        // const rand = Math.random()
        // const is_supported_scan = rand < 0.8

        const is_supported_scan = scan.uniformScanSize && scan.uniformScanSOPClass

        const group_identifier = is_supported_scan ? `${scan.modality}|${scan.Rows}x${scan.Columns}|${scan.SOPClassUID}` : '_UNSUPPORTED_'
        if (_masking_groups[group_identifier] === undefined) {
            _masking_groups[group_identifier] = []
        }
        _masking_groups[group_identifier].push(scan)
    })

    const img_promises = my_scans.map(async scan_data => {
        return await dicomFileToDataURL(scan_data.thumbPath, cornerstone, 100, 100)
    })

    Promise.all(img_promises)
        .then(async imgDataImages => {
            
            imgDataImages.forEach((imgDataImage, index) => {
                my_scans[index].imgDataUrl = imgDataImage
            })

            console.log({_masking_groups, my_scans_FIRST: Object.assign({}, my_scans)});

            display_masking_groups('supported')
            
            //selected_scans_table($$('#selected_scans'), my_scans)
        })
        .catch(error => console.log(`Error in executing ${error}`))
        .finally(() => {
            console.log('FINALLY TRIGGERED!!!')
            console.timeEnd('scan_table');
            $.unblockUI()

            if(!store.has('visual-phi-removal-instructions')) {
                store.set('visual-phi-removal-instructions',  true);
                anno3.show();
            }
        })
});

async function display_masking_groups(mask_type) {
    let tpl_html = await ejs_template('upload/list', {findSOPClassUID, masking_groups: _masking_groups, show: mask_type})
    $('#masking-groups').html(tpl_html)
}

function add_anon_rectangles_to_scan(session_id, series_id, rectangles) {
    let found_scan = find_grouped_scan(session_id, series_id)

    if (found_scan) {
        found_scan.rectangles = rectangles
    }

    console.log({found_scan});
}

function exclude_scan(session_id, series_id) {
    let found_scan = find_grouped_scan(session_id, series_id)

    if (found_scan) {
        found_scan.rectangles = []
        found_scan.excluded = true
    }

    console.log({found_scan});
}

function reset_scan(session_id, series_id) {
    let found_scan = find_grouped_scan(session_id, series_id)

    if (found_scan) {
        found_scan.rectangles = []
        found_scan.excluded = false
    }
}

function find_grouped_scan(session_id, series_id) {
    let found_scan;

    for (const group in _masking_groups) {
        
        found_scan = _masking_groups[group].find(scan => {
            return scan.sessionId == session_id && scan.id == series_id
        })

        if (found_scan) {
            break;
        }
    }

    return found_scan
}

$on('show.bs.modal', '#setTemplateModal', async function(){
    console.log({modal_data: $(this).data()})
    refresh_masking_templates()
})

$on('hide.bs.modal', '#setTemplateModal', async function(){
    scan_review_set_template_button_label()
})

function get_masking_templates_by_alias(_mask_alias = false) {
    const mask_alias = _mask_alias ? _mask_alias : $$('#review-series-images').data('mask_alias')
    const all_templates = store.get('masking_template_registry')
    
    return all_templates.filter(tpl => {
        return tpl.data.Rows == _masking_groups[mask_alias][0].Rows && tpl.data.Columns == _masking_groups[mask_alias][0].Columns
    })
}

function get_template_rectangles(template_alias) {
    const masking_template_registry = store.get('masking_template_registry')
    const tpl = masking_template_registry.find(template => template.alias == template_alias)

    return tpl ? tpl.rectangles : []
}

async function refresh_masking_templates(scroll_to_last = false) {
    const appropriate_templates = get_masking_templates_by_alias()

    let tpl_html = await ejs_template('upload/template-list-item', {
        templates: appropriate_templates,
        moment
    })

    $$('#template-listing').html(tpl_html)

    if (scroll_to_last) {
        var scrollPos = $$('#template-listing').height()
        $$('#template-listing').closest('.modal-body').scrollTop(scrollPos)

        // FLASH GREEN
        $$('#template-listing .row:last-child').css({background: 'lightgreen', transition: 'background 0s'}); 
        setTimeout(function(){
            $$('#template-listing .row:last-child').css({background: 'transparent', transition: 'background 2s'})
        }, 100)
    }
    
}

function get_session_by_series(_series_id) {
    let found_session;
    session_map.forEach(function(cur_session, key) {
        /************************** */
        let series_data = get_session_series(cur_session);
        /************************** */

        let found_series = series_data.find(series => series.series_id == _series_id)
        
        if (found_series !== undefined) {
            found_session = cur_session
        }

        /*

        let studyDate = normalizeDateString(cur_session.date);

        let session_data = {
            id: key,
            patient_name: cur_session.patient.name,
            patient_id: cur_session.patient.id,
            subject_auto: generate_unique_xnat_subject_id(existing_project_subjects, xnat_subject_ids),
            subject_dicom_patient_name: cur_session.patient.name,
            subject_dicom_patient_id: cur_session.patient.id,
            xnat_subject_id: new_xnat_subject_id,
            label: session_label,
            session_accession: cur_session.accession,
            label_suffix: generate_experiment_label('', series_data, 'PT', 'YYY'), // TODO replace PT and YYY values with dicom data
            experiment_label: new_xnat_subject_id ? generate_experiment_label(new_xnat_subject_id, series_data, 'PT', 'YYY') : '', //, // TODO replace PT and YYY values with dicom data
            modality: cur_session.modality.join(", "),
            scan_count: cur_session.scans.size,
            tracer: null,
            study_date: studyDate
        }
        */

    });

    return found_session;
}

$on('click', '[data-js-create-template]', function() {
    console.log({rectangle_state_registry});
    if (rectangle_state_registry.length === 0) {
        $(this).closest('.modal').modal('hide')
        return
    }

    let masking_template_registry = store.get('masking_template_registry')

    const { series_id, rectangles } = rectangle_state_registry[0]


    let rand, name_value, alias_value, existing_tpl, rand_size = 3
    do {
        rand = random_string(rand_size, 'NUM')
        name_value = `Generic ${rand} template`
        alias_value = `GEN ${rand}`
        rand_size ++
        existing_tpl = masking_template_registry.find(tpl => tpl.alias == alias_value)
    } while (existing_tpl !== undefined)
    

    let found_session = get_session_by_series(series_id)

    console.log({series_id, found_session});


    const all_files = found_session.scans.get(series_id)

    masking_template_registry.push({
        name: name_value,
        alias: alias_value,
        created: Date.now(),
        author: auth.get_current_user(),
        data: {
            modality: found_session.modality.join(','),
            Columns: all_files[0].Columns,
            Rows: all_files[0].Rows,
            SOPClassUID: all_files[0].SOPClassUID
        },
        rectangles: rectangles
    })

    console.log({masking_template_registry});

    store.set('masking_template_registry', masking_template_registry)

    // reset rectangle_state_registry
    rectangle_state_registry = []

    $(this).closest('.modal').modal('hide')

    // reload templates found content
    refresh_masking_templates(true)

})

$on('click', '[data-apply-canvas-id]', function() {
    const template_alias = $(this).data('template-alias');
    let canvas_id = $(this).data('apply-canvas-id')
    let old_canvas = document.getElementById(canvas_id)

    // add overlay canvases
    $('.scan_checkbox:checked + .scan-review-item > .img-data').each(function() {
        const $img_data = $(this)
        const $label = $(this).closest('.scan-review-item')

        if ($label.hasClass('excluded')) {
            Helper.pnotify(null, `Scan "${$label.find('>h3').text()}" is already excluded! Selected template is not applied. You need to reset this scan if you want to apply the anonymization template.`, 'notice');
        } else {
            // only if not already applied
            if ($(`[data-template-alias="${template_alias}"]`, $img_data).length == 0) {
                let new_canvas = cloneCanvas(old_canvas)
                new_canvas.setAttribute('data-template-alias', template_alias)
                $img_data.prepend(new_canvas)
            }
        }
    })

    // updated scans rectangle data
    $$('#scan_images .scan_checkbox:checked + label').each(function() {
        const data = $(this).prev().data()

        const rectangles = []
        $(this).find('.img-data canvas').each(function() {
            const template_rectangles = get_template_rectangles($(this).data('template-alias'))

            template_rectangles.forEach(rect => {
                rectangles.push(rect)
            })
        })
        console.log({rectangles})
        add_anon_rectangles_to_scan(data.sessionId, data.seriesId, rectangles)
    })

    // uncheck all and trigger scanselectionchange
    $$('#scan_images .scan_checkbox').prop('checked', false)
    $$('#review-series-images').trigger('scanselectionchange.bulkanon')
})

$on('click', '[data-template-alias-delete]', async function() {
    const proceed = await swal({
        title: `Delete this template?`,
        text: `Deleting the template will not remove it from the scans that the template is already applied to.
               If you want to remove the template from the scan - select the scan and click "Reset" button.`,
        icon: "warning",
        buttons: ['Cancel', 'Delete Template'],
        dangerMode: true
    })
    
    if (proceed) {
        const template_alias = $(this).data('template-alias-delete')
        let masking_template_registry = store.get('masking_template_registry') || []

        masking_template_registry = masking_template_registry.filter(item => item.alias !== template_alias)
        store.set('masking_template_registry',  masking_template_registry);
        
        $(this).closest('.row').remove()
    }
})

function cloneCanvas(oldCanvas) {

    //create a new canvas
    var newCanvas = document.createElement('canvas');
    var context = newCanvas.getContext('2d');

    //set dimensions
    newCanvas.width = oldCanvas.width;
    newCanvas.height = oldCanvas.height;

    //apply the old canvas to the new one
    context.drawImage(oldCanvas, 0, 0);

    //return the new canvas
    return newCanvas;
}

$on('click', '.btn-link[data-mask-type]', function() {
    display_masking_groups($(this).data('mask-type'))
});

$on('click', '[data-review-mask-alias]', function() {
    const mask_alias = $(this).data('review-mask-alias')

    const scan_images = _masking_groups[mask_alias].map(scan => scan.thumbPath)

    _masking_groups[mask_alias][0].Columns
    _masking_groups[mask_alias][0].Rows

    const scan_image_promises = scan_images.map(async imagePath => {
        return await dicomFileToDataURL(imagePath, cornerstone, 540, 300)
    })

    Promise.all(scan_image_promises)
        .then(imgDataImages => {
            generateBulkImageReview(_masking_groups[mask_alias], imgDataImages)

            $$('#modal_mask_alias').text(mask_alias)

            $$('#review-series-images').data({
                mask_alias: mask_alias
            }).modal('show')
        
        })
});

$on('click', '#scan_images .has-popover', function(e) {
    console.log('Popover clicked')
    e.preventDefault();
})

$on('change', '#review-scans-select-all', function(e) {
    const select_all = $(this).is(':checked')
    const hide_excluded = $('#review-scans-hide-excluded').is(':checked')
    const $scan_checkboxes = $$('#scan_images .scan_checkbox')
    const $excluded = $$('#scan_images label.excluded')

    $scan_checkboxes.prop('checked', select_all)

    if (select_all && hide_excluded) {
        $excluded.each(function() {
            $(this).prev().prop('checked', false)
        })
    }

    $$('#review-series-images').trigger('scanselectionchange.bulkanon')
})

$on('change', '#scan_images .scan_checkbox', function(e) {
    $$('#review-series-images').trigger('scanselectionchange.bulkanon')
})

$on('change', '#review-scans-hide-excluded', function(e) {
    // reset all selection if there are excluded
    if ($$('#scan_images label.excluded').length) {
        $$('#review-scans-select-all').prop('checked', false)
    }

    const hide_excluded = $(this).is(':checked')
    $$('#scan_images').toggleClass('hide-excluded', hide_excluded)

    $$('#review-series-images').trigger('scanselectionchange.bulkanon')
})

$on('scanselectionchange.bulkanon', '#review-series-images', function() {
    const selected_scans_count = $$('#scan_images .scan_checkbox:checked').length

    if (selected_scans_count === 0) {
        $$('#review-scans-select-all').prop('checked', false)
    } 

    scan_review_updated_selected_count()
    scan_review_update_excluded_count()
    scan_review_toggle_back_to_groups()

    // close all popovers
    $$('[data-toggle="popover"]').popover('hide')

    // buttons disabled status
    $$('[data-js-review-set-template]').prop('disabled', selected_scans_count === 0)
    $$('[data-js-review-exclude]').prop('disabled', selected_scans_count === 0)
    $$('[data-js-review-reset]').prop('disabled', selected_scans_count === 0)

    console.log({
        checked_checkboxes: selected_scans_count,
        _masking_groups
    });
})

$on('click', '[data-js-review-reset]', function() {
    $$('#scan_images .scan_checkbox:checked + label > .img-data canvas').remove()

    $$('#scan_images .scan_checkbox:checked + label')
        .removeClass('excluded')
        .each(function() {
            const data = $(this).prev().data()
            reset_scan(data.sessionId, data.seriesId)
        })
    

    // uncheck all and trigger scanselectionchange
    $$('#scan_images .scan_checkbox').prop('checked', false)
    $$('#review-series-images').trigger('scanselectionchange.bulkanon')
})

$on('click', '[data-js-review-exclude]', function() {
    $$('#scan_images .scan_checkbox:checked + label > .img-data canvas').remove()

    $$('#scan_images .scan_checkbox:checked + label')
        .addClass('excluded')
        .each(function() {
            const data = $(this).prev().data()
            exclude_scan(data.sessionId, data.seriesId)
        })

    // uncheck all and trigger scanselectionchange
    $$('#scan_images .scan_checkbox').prop('checked', false)
    $$('#review-series-images').trigger('scanselectionchange.bulkanon')
})

function scan_review_update_excluded_count() {
    const scans_total = $$('#scan_images .scan-review-item').length
    const excluded_scans_total = $$('#scan_images .scan-review-item.excluded').length

    $$('#review-series-images--excluded').text(`${excluded_scans_total}/${scans_total}`)
}

function scan_review_updated_selected_count() {
    const selected_scans_count = $$('#scan_images .scan_checkbox:checked').length
    $$('#review-series-images--selected').text(selected_scans_count)
}

function scan_review_toggle_back_to_groups() {
    const included_count = $$('#scan_images .scan-review-item').not('.excluded').length
    $$('#review-series-images-done').toggle(included_count == 0)
}

function scan_review_set_template_button_label() {
    const matching_alias_templates = get_masking_templates_by_alias()
    const button_label = matching_alias_templates.length ? 'Set Template' : 'Create Template'

    $$('[data-target="#setTemplateModal"]').text(button_label)
}

$on('click', '[data-js-review-create-template]', function() {
    $first_selected_scan = $$('#scan_images .scan_checkbox:checked').eq(0)

    $$('#create-masking-template')
        .data({
            'session-id': $first_selected_scan.data('session-id'),
            'series-id': $first_selected_scan.data('series-id'),
        })
        .modal('show')
})

$on('shown.bs.modal', '#create-masking-template', function(e) {
    console.log($(this).data())

    let selected_session_id = $(this).data('session-id')
    let selected_series_ids = [$(this).data('series-id')]

    $$('#create-masking-template--content')
        .html('')
        .append($('<div>').text(`Session ID: ${selected_session_id}`))
        .append($('<div>').text(`Series ID: ${selected_series_ids[0]}`));


    image_thumbnails = [];

    
    session_map.get(selected_session_id).scans.forEach(function(scan, key) {
        if (selected_series_ids.includes(key)) {
            image_thumbnails.push({
                series_id: key,
                series_description: scan[0].seriesDescription,
                series_number: parseInt(scan[0].seriesNumber),
                thumb_path: scan[0].filepath,
                scans: scan.length
            })
        }
    })

    // reset
    $$('#create-masking-template #series_thumbs').html('');
    image_thumbnails.map(el => {
        $('#create-masking-template #series_thumbs').append(`<li id="LI_${el.series_id}">`);
    });

    console.log({image_thumbnails});
    
    image_thumbnails.forEach((series, index) => {
        display_series_thumb(series, index, cornerstone)
    });

    const _el = $('#create-masking-template #dicom_image_container').get(0)
    // Load first image
    load_dicom_image(
        image_thumbnails[0].series_id, 
        selected_session_id, 
        _el
    );

    //cornerstoneTools.setToolEnabledForElement(_el, 'RectangleOverlay');
    //cornerstoneTools.setToolActiveForElement(_el, 'RectangleOverlay', {mouseButtonMask: 1});

    //cornerstoneTools.addToolForElement(_el, cornerstoneTools.RectangleOverlayTool);
    cornerstoneTools.setToolActiveForElement(_el, "RectangleOverlay", {mouseButtonMask: 1});
    
    $('#create-masking-template #series_thumbs li').eq(0).addClass('highlite-outline');
    $("html, body").stop().animate({scrollTop:0}, 50);

    window.dispatchEvent(new Event('resize'));// HACK TO recalculate canvas size for main cornerstone image
});

function cornerstone_enable_small_thumb_element(width = 70, height = 70) {
    let element = document.createElement('div');

    element.style.cssText = `width: ${width}px; height: ${height}px; position: absolute; left: -3000px; top: 0;`;
    document.body.appendChild(element);

    cornerstone.enable(element);

    //cornerstoneTools.addToolForElement(element, cornerstoneTools.RectangleOverlayTool);
    //cornerstoneTools.setToolActiveForElement(element, "RectangleOverlay", {mouseButtonMask: 1});

    return element;
}



function dicomFileToDataURL(thumb_path, cornerstone, width, height) {
    return new Promise((resolve, reject) => {
        // validate thumb_path
        if (!thumb_path) {
            reject('Error - dicomFileToDataURL > "thumb_path" is not set')
            return
        }

        let element = cornerstone_enable_small_thumb_element(width, height);
        let imageId = `wadouri:http://localhost:7714/?path=${thumb_path}`;

        // console.log({imageId});

        // this should trigger after "cornerstone.displayImage()" method
        element.addEventListener('cornerstoneimagerendered', function() {
            const img_data_src = $(element).find("canvas").get(0).toDataURL();
            cornerstone.disable(element);
            document.body.removeChild(element);
            element = null

            resolve(img_data_src)
        })

        element.addEventListener('cornerstoneimageloadfailed', function() {
            reject(`Error - cornerstoneimageloadfailed > [path: ${thumb_path}]`)
        })

        // load image
        cornerstone.loadAndCacheImage(imageId)
            .then((image) => {
                let viewport = cornerstone.getDefaultViewportForImage(element, image);
                cornerstone.displayImage(element, image, viewport);
            })
            .catch(err => {
                reject(`Thumbnail Load Error: ${err.error.message}\n[${imageId}]`)
            });
    })
    
}


function set_bulk_image_thumbnails() {
    let bulk_image_thumbnails = [];

    let selected_series_ids = get_quick_selected_session_ids()

    console.log({selected_series_ids});

    //console.log({selected_session_id, session_map})
    session_map.get(selected_session_id).scans.forEach(function(scan, key) {
        if (selected_series_ids.includes(key)) {
            bulk_image_thumbnails.push({
                series_id: key,
                series_description: scan[0].seriesDescription,
                series_number: parseInt(scan[0].seriesNumber),
                thumb_path: scan[0].filepath,
                scans: scan.length
            })
        }
    })

    return bulk_image_thumbnails.sort((a,b) => (a.series_number > b.series_number) ? 1 : ((b.series_number > a.series_number) ? -1 : 0));
}

function get_quick_selected_session_ids() {
    let selected_series = $('#selected_session_tbl').bootstrapTable('getData');
    return selected_series.map(item => item.id)
}

function get_custom_selected_session_ids() {
    let selected_series = $('#custom_upload_multiple_tbl').bootstrapTable('getData');
    return selected_series.map(item => item.id)
}

function get_selected_series_ids() {
    let selected_series = $('#image_session').bootstrapTable('getSelections');
    return selected_series.map(item => item.series_id)
}


function set_image_thumbnails() {
    image_thumbnails = [];

    let selected_series_ids = get_selected_series_ids()

    //console.log({selected_session_id, session_map})
    session_map.get(selected_session_id).scans.forEach(function(scan, key) {
        if (selected_series_ids.includes(key)) {
            image_thumbnails.push({
                series_id: key,
                series_description: scan[0].seriesDescription,
                series_number: parseInt(scan[0].seriesNumber),
                thumb_path: scan[0].filepath,
                scans: scan.length
            })
        }
    })

    image_thumbnails.sort((a,b) => (a.series_number > b.series_number) ? 1 : ((b.series_number > a.series_number) ? -1 : 0));
}


function cornerston_initialize_main_element(element) {
    cornerstoneTools.init({
        touchEnabled: false
    });

    cornerstone_enable_main_element(element); // before first load_dicom_image()
}

function cornerstone_enable_main_element(element) {
    if (ALLOW_VISUAL_PHI_CHECK) {
        cornerstone.enable(element);

        cornerstoneTools.addToolForElement(element, cornerstoneTools.ZoomTool);
        //cornerstoneTools.setToolActiveForElement(element, "Zoom", {mouseButtonMask: 1});
        
        cornerstoneTools.addToolForElement(element, cornerstoneTools.PanTool);
        
        cornerstoneTools.addToolForElement(element, cornerstoneTools.RectangleOverlayTool);
        //cornerstoneTools.setToolActiveForElement(element, "RectangleOverlay", {mouseButtonMask: 1});

        cornerstoneTools.addToolForElement(element, cornerstoneTools.StackScrollMouseWheelTool)
        cornerstoneTools.setToolActiveForElement(element, 'StackScrollMouseWheel', {});


        //element.addEventListener("cornerstonetoolsmeasurementadded", handle_measurement_update);
        element.addEventListener("cornerstonetoolsmeasurementmodified", handle_measurement_update);
        element.addEventListener("cornerstonetoolsmeasurementcompleted", handle_measurement_update);
        element.addEventListener("cornerstonetoolsmeasurementremoved", handle_measurement_update);
        element.addEventListener("cornerstonetoolskeypress", handle_measurement_update);

        element.addEventListener("cornerstonetoolsmousewheel", redraw_rectangles);
        element.addEventListener("cornerstonetoolsstackscroll", stack_scroll_handler);
    }
}

function cornerstone_is_enabled(element) {
    try {
        cornerstone.getEnabledElement(element);
        return true;
    } catch(e) {
        console.log({e});
        return false
    }
    
}

function cornerstone_disable_element(element) {
    if (cornerstone_is_enabled(element)) {
        cornerstone.disable(element)
    }
}

$on('click', '#save-scan-btn', function(e) {
    e.preventDefault()
    let series_id = get_current_series_id();
    let rectangle_state = find_registry_state(series_id);

    if (rectangle_state !== undefined) {
        rectangle_state.saved = true;
    }
    

    let index = $('li.highlite-outline').index();
    display_series_thumb(image_thumbnails[index], index, cornerstone)

    
    $('#stack-scroll-btn').trigger('click');

    console.log({rectangle_state_registry});
})


$on('click', '#reset-scan-btn', function(e) {
    e.preventDefault()
    const $context = $(this).closest('#topBarCustom').closest('div').find('#imgGalleryPreview')
    const element = $('#dicom_image_container', $context).get(0);

    let toolState = cornerstoneTools.getToolState(element, 'RectangleOverlay')

    cornerstoneTools.clearToolState(element, 'RectangleOverlay')

    //cornerstone.updateImage(element)
    registry_remove_series_state(get_current_series_id());
    
    redraw_rectangles({
        srcElement: element
    })

    let index = $('li.highlite-outline').index();
    display_series_thumb(image_thumbnails[index], index, cornerstone)

})


function cornerstone_enable_thumb_element() {
    let element = document.createElement('div');

    element.style.cssText = "width: 150px; height: 150px; position: absolute; left: -300px; top: 0;";
    document.body.appendChild(element);

    cornerstone.enable(element);

    cornerstoneTools.addToolForElement(element, cornerstoneTools.RectangleOverlayTool);
    cornerstoneTools.setToolActiveForElement(element, "RectangleOverlay", {mouseButtonMask: 1});

    return element;
}

// go through all series, display them, and clearToolState for that imageId
function clear_all_states() {
    //cornerstoneTools.clearToolState(element, 'RectangleOverlay');

    image_thumbnails.forEach((series) => {
        clear_main_tool_state(series.thumb_path)
    });

}

function clear_main_tool_state(image_path) {
    const element = $('#dicom_image_container').get(0);

    const imageId = `wadouri:http://localhost:7714/?path=${image_path}`;

    cornerstone.loadAndCacheImage(imageId)
    .then((image) => {
        cornerstone.displayImage(element, image);
        cornerstoneTools.clearToolState(element, 'RectangleOverlay');
    })
    .catch(err => {
        console.log({clear_main_tool_state_ERR: err});
    });
}

function display_series_thumb(series, index, cornerstone) {
    $$('#series_thumbs').each(function() {
        console.log({
            visible: $(this).is(':visible'),
            el: $(this).get(0)
        })
    })

    let element = cornerstone_enable_thumb_element();

    let imageId = `wadouri:http://localhost:7714/?path=${series.thumb_path}`;


    // load image
    cornerstone.loadAndCacheImage(imageId)
    .then((image) => {

        let viewport = cornerstone.getDefaultViewportForImage(element, image);
        cornerstone.displayImage(element, image, viewport);

        // Update first image in case rectangles are not painted on first scan in series
        setTimeout((series_id, element) => {
            let rectangle_state = find_registry_state(series_id);
    
            cornerstoneTools.clearToolState(element, 'RectangleOverlay');
        
            if (rectangle_state !== undefined) {
                rectangle_state.data.forEach(state => {
                    add_tool_state(element, 'RectangleOverlay', state)
                });
            }
    
            cornerstone.updateImage(element)
        }, 20, series.series_id, element)

        setTimeout(function() {
            let $img = $('<img>');
            let img_data_src = $(element).find("canvas").get(0).toDataURL();
            $img.attr('src', img_data_src);
            $img.attr('id', 'ID_' + series.series_id.replace(/\./g, '_'));
            $img.attr('data-series_id', series.series_id);
            $img.attr('data-order', index);
            $img.attr('data-path', series.thumb_path);

            $img.attr('draggable', true);

            $img.on('dragstart', function (event) {
                dragstart_dicom(event.originalEvent)
            });

            let $div = $('<div>');
            $div.append($img);

            
            //$div.append(`<p style="text-align: center">S:${series.series_number}  (F:${series.scans})</p>`)
            $div.append(`<div style="text-align: center; font-size: 12px; color: #9ccef9; margin: 3px 0 35px; position: relative;">
                <div style="float: left;">S:${series.series_number} </div>
                <div style="float: right;">F:${series.scans}</div>
                <div style="position: absolute; top: -30px; right: 1px; display: none;" class="green_mark">
                    <svg version="1.2" preserveAspectRatio="none" viewBox="0 0 24 24" 
                    style="opacity: 1; mix-blend-mode: normal; fill: rgb(23, 209, 6); width: 24px; height: 24px;
                    "><g><path xmlns:default="http://www.w3.org/2000/svg" 
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" 
                    style="fill: rgb(23, 209, 6);"></path></g></svg>
                </div>
                <div style="position: absolute; top: -30px; right: 1px; display: none;" class="yellow_mark">
                    <svg version="1.2" preserveAspectRatio="none" viewBox="0 0 24 24"
                    style="opacity: 1; mix-blend-mode: normal; fill: rgb(247, 227, 46); width: 24px; height: 24px;
                    "><g><path xmlns:default="http://www.w3.org/2000/svg" 
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" 
                    style="fill: rgb(247, 227, 46);"></path></g></svg>
                </div>
            </div>`);

            $$('#series_thumbs:visible li').eq(index).html($div);

            let rectangle_state = find_registry_state(series.series_id);
            
            if (rectangle_state && rectangle_state.rectangles.length) {
                $div.find('.green_mark').toggle(rectangle_state.saved) 
                $div.find('.yellow_mark').toggle(!rectangle_state.saved) 
            }

            cornerstone.disable(element);

            document.body.removeChild(element);
            element = null
        }, 100);
        
    })
    .catch(err => {
        Helper.pnotify('Thumbnail Load Error', `${err.error.message}\n[${imageId}]`, 'warning');
        console.log({display_series_thumb_ERR: err});
    });
}

function get_tool_state(element, tool) {
    const toolStateManager = cornerstoneTools.getElementToolStateManager(element);
    return toolStateManager.get(element, tool);
}

function add_tool_state(element, tool, state) {
    const toolStateManager = cornerstoneTools.getElementToolStateManager(element);
    toolStateManager.add(element, tool, state);

    // OR JUST
    // cornerstoneTools.addToolState(element, tool, state)
}





$(document).on('dragover', '#dicom_image_container', function(event) {
    dragover_dicom(event.originalEvent)
})
$(document).on('drop', '#dicom_image_container', function(event) {
    drop_dicom(event.originalEvent)
})

$(document).on('click', '#series_thumbs img', function() {
    console.log(this.id);
});

function dragstart_dicom(ev) {
	// Add the target element's id to the data transfer object
	console.log(ev.target.id, $(ev.target).attr('data-path'), $(ev.target).data('path'))

	ev.dataTransfer.setData("dicomimg/id", ev.target.id);
	ev.dataTransfer.setData("dicomimg/path", $(ev.target).attr('data-path'));
	ev.dataTransfer.setData("dicomimg/series_id", $(ev.target).attr('data-series_id'));
	ev.dataTransfer.dropEffect = "link";
}

function dragover_dicom(ev) {
	ev.preventDefault();
	ev.dataTransfer.dropEffect = "link";
}

function drop_dicom(ev) {
	ev.preventDefault();
	// Get the id of the target and add the moved element to the target's DOM

	console.log(ev.dataTransfer.getData("dicomimg/id"))
    console.log(ev.dataTransfer.getData("dicomimg/path"))
    console.log(ev.dataTransfer.getData("dicomimg/series_id"))
    
    let id = "#" + ev.dataTransfer.getData("dicomimg/id");
    $(id).closest('li').addClass('highlite-outline').siblings().removeClass('highlite-outline');

	load_dicom_image(ev.dataTransfer.getData("dicomimg/series_id"))
}

$on('click', '#dicom_image_tools a', function(e){
    e.preventDefault();

    const $context = $(this).closest('#topBarCustom').closest('div').find('#imgGalleryPreview')

    const element = $('#dicom_image_container', $context).get(0);

    // disable current tool(s)
    $$('#dicom_image_tools a.active').each(function() {
        cornerstoneTools.setToolEnabledForElement(element, $(this).data('tool'));
    })

    
    // enable selected tool
    let tool_name = $(this).data('tool');

    if (tool_name === 'StackScrollMouseWheel') {
        cornerstoneTools.setToolActiveForElement(element, tool_name, {});
    } else {
        cornerstoneTools.setToolActiveForElement(element, tool_name, {mouseButtonMask: 1});
    }

    // update UI
    $('#dicom_image_tools a').removeClass('active');
    $(this).addClass('active');
})



function get_series_files(series_id, session_id = null) {
    const _selected_session_id = session_id ? session_id : selected_session_id;
    let files = [];
    let series_scans = session_map.get(_selected_session_id).scans.get(series_id);
    console.log({series_scans});

    if (Array.isArray(series_scans) && series_scans.length > 0) {
        // backward compatibility TOOLS-524 (sort by x00200013 ...)
        if (series_scans[0].hasOwnProperty('order')) {
            series_scans.sort((a,b) => a.order > b.order ? 1 : b.order > a.order ? -1 : 0);
        } else {
            series_scans.sort((a,b) => a.filepath.localeCompare(b.filepath));
        }

        series_scans.forEach((scan) => {
            files.push({
                filepath: scan.filepath,
                frames: scan.frames ? scan.frames : 0
            });
        });
    }

    console.log({files});
    return files;
}

function load_dicom_image(series_id, session_id, cs_element = false) {
    console.log({series_id, session_id, cs_element});
    const element = cs_element ? cs_element : $('#dicom_image_container').get(0);

    console.log({_EL_: element});

    const _session_id = session_id ? session_id : null;

    const _files = get_series_files(series_id, _session_id);

    
    let imageIds = [];
    let frames = 0;
    _files.forEach(file => {
        const imageIdRoot = `wadouri:http://localhost:7714/?path=${file.filepath}`;
        
        if (file.frames > 1) {
            for (let i = 0; i < file.frames; i++) {
                imageIds.push(imageIdRoot + `&frame=${i}`);
            }
            frames = file.frames
        } else {
            imageIds.push(imageIdRoot);
        }
    })

    if (frames) {
        $('#frame_input_container').html(`
            <div id="input_range_container" class="range-slider">
                <input type="range" id="image_frame_counter" name="image_frame_counter" min="0" max="${frames - 1}" value="0">
                <span class="range-slider__value">0</span>
            </div>
        `)

        let default_image_frame_counter = 0
        $('#image_frame_counter').off('input').on('input', function(e){
            const new_frame_index = parseInt(this.value)

            if (default_image_frame_counter != new_frame_index) {
                scrollToIndex(element, new_frame_index); // triggers "cornerstonetoolsstackscroll" event
                default_image_frame_counter = new_frame_index
            }
            
        })
    } else {
        $('#frame_input_container').html('')
    }

    //define the stack
    const stack = {
        currentImageIdIndex: 0,
        imageIds
    };

    console.log({_files, stack});

    cornerstone.loadAndCacheImage(imageIds[0])
    .then((image) => {
        console.log({image})

        let viewport = cornerstone.getDefaultViewportForImage(element, image);
        cornerstone.displayImage(element, image, viewport);

        
        cornerstoneTools.addStackStateManager(element, ['stack'])
		cornerstoneTools.addToolState(element, 'stack', stack);

		// HACK: force display of existing rectangles
		cornerstoneTools.setToolActiveForElement(element, "RectangleOverlay", {mouseButtonMask: 1});
		cornerstone.updateImage(element)
		cornerstoneTools.setToolEnabledForElement(element, "RectangleOverlay");
    })
    .catch(err => {
        swal({
            title: `Error`,
            text: `${err.error.message}\n[${imageIds[0]}]`,
            icon: "error",
            dangerMode: true
        })
        console.log({load_dicom_image_ERR: err});
    });
}


function stack_scroll_handler(e) {
    const frame = e.detail.newImageIdIndex
    $('#image_frame_counter').val(frame).next('.range-slider__value').html(frame);

    redraw_rectangles(e)
}

function redraw_rectangles(e) {
    const series_id = get_current_series_id();
    const element = e.srcElement;
    
    setTimeout((series_id, element) => {
        const rectangle_state = find_registry_state(series_id);

        cornerstoneTools.clearToolState(element, 'RectangleOverlay');
    
        if (rectangle_state !== undefined) {
            rectangle_state.data.forEach(state => {
                // cornerstoneTools.addToolState(element, 'RectangleOverlay', state)
                add_tool_state(element, 'RectangleOverlay', state)
            });
        }

        cornerstone.updateImage(element)
    }, 20, series_id, element)
}

function handle_measurement_update(e) {
    clearTimeout(event_timeout);
    event_timeout = setTimeout(() => {
        console.log(`EVENT DATA:`, e);
        console.log(`TYPE: ${e.type}`);
        console.log('DATA:', e.detail.measurementData);


        let series_id = get_current_series_id();
        let element = e.srcElement;
        
        let toolState = get_tool_state(element, 'RectangleOverlay');

        if (toolState !== undefined) {
            let state_data = {
                series_id: series_id,
                data: toolState.data,
                rectangles: toolStateDataToRect(toolState.data),
                saved: false
            };

            let rectangle_state = find_registry_state(series_id);
            
            if (rectangle_state !== undefined) { // if defined -> update
                rectangle_state.data = state_data.data
                rectangle_state.rectangles = state_data.rectangles
                rectangle_state.saved = state_data.saved
                // rectangle_state = {...rectangle_state, ...state_data} // merge
            } else { // if not defined -> insert
                rectangle_state_registry.push(state_data)
            }

            console.log({rectangles: state_data});

            
            $('#series_thumbs li.highlite-outline').find('.green_mark').toggle(state_data.saved && state_data.rectangles > 0);
            $('#series_thumbs li.highlite-outline').find('.yellow_mark').toggle(!state_data.saved);
        }
        
        //const toolStateManager = cornerstoneTools.getElementToolStateManager(element);
        //toolStateManager.clearToolState(element, 'RectangleOverlay')
        //cornerstoneTools.addToolState(element, 'RectangleOverlay', new_data)
    }, 100);
}

function toolStateDataToRect(toolStateData) {
    return toolStateData.map(data => {
        let x_1 = Math.min(data.handles.start.x, data.handles.end.x)
        let y_1 = Math.min(data.handles.start.y, data.handles.end.y)
        let x_2 = Math.max(data.handles.start.x, data.handles.end.x)
        let y_2 = Math.max(data.handles.start.y, data.handles.end.y)
        return [x_1, y_1, x_2, y_2]
    })

}


function find_registry_state(series_id) {
    return rectangle_state_registry.find((el) => el.series_id === series_id)
}

function registry_remove_series_state(series_id) {
    let series_index = rectangle_state_registry.findIndex((el) => el.series_id === series_id)

    if (series_index >= 0) {
        rectangle_state_registry.splice(series_index, 1);
    }
}

function get_current_series_id() {
    return $('#series_thumbs li.highlite-outline').find('img[data-series_id]').data('series_id');
}



$(document).on('page:load', '#upload-section', async function(e){
    console.log('Upload page:load triggered');

    $.blockUI({
        message: '<h1>Processing...</h1>'
    });

    rectangle_state_registry = [];

    //Modal
    $('#closeBtn').on('click', function (e) {
        $('#fullscreenModal').modal('hide')
    });
    $('#fullscreenModal').on('show.bs.modal', function (e) {
        $('body').addClass('dicomImageViewerFS');
        let contentCut = $("#fullscreenContent").detach()
        contentCut.appendTo("#fullscreenModal .modal-body");
        $('#series_thumbs').css('max-height', `${($(window).height() - 41 - 70 - 20)}px`);
        $('#dicom_image_container').css('height', `${($(window).height() - 41 - 70)}px`);
    })

    $('#fullscreenModal').on('hide.bs.modal', function (e) {
        let contentCutAgain = $(".modal-body #fullscreenContent").detach()
        contentCutAgain.appendTo("#fullscreenMode .container .row")
        $('body').removeClass('dicomImageViewerFS');

        $('#series_thumbs').css('max-height', '480px');
        $('#dicom_image_container').css('height', `500px`);
    })

    $('#fullscreenModal').on('hidden.bs.modal shown.bs.modal', function (e) {
        window.dispatchEvent(new Event('resize'))
    })

    
    $(window).on('resize', function() {
        clearTimeout(resizing_tm);
        resizing_tm = setTimeout(() => {
            $('.dicomImageViewerFS #series_thumbs').css('max-height', `${($(window).height() - 41 - 70 - 20)}px`);
            $('.dicomImageViewerFS #dicom_image_container').css('height', `${($(window).height() - 41 - 70)}px`);
        }, 20);
    });

    // TODO - check if this is needed
    $('#upload_session_date')
        .attr('min', '1990-01-01')
        .attr('max', new Date().toISOString().split('T')[0])

    
    await _init_variables();

    $('#upload-section a[href="#nav-visual"]').toggleClass('hidden', !ALLOW_VISUAL_PHI_CHECK);
    $('#nav-verify #custom_upload .js_next').toggleClass('hidden', !ALLOW_VISUAL_PHI_CHECK);
    $('#nav-verify #custom_upload .js_upload').toggleClass('hidden', ALLOW_VISUAL_PHI_CHECK);

    
    $$('#nav-verify #quick_upload .js_next').toggleClass('hidden', !BULK_IMAGE_ANONYMIZATION);
    $('#nav-verify #quick_upload .js_upload').toggleClass('hidden', BULK_IMAGE_ANONYMIZATION);
    
    $('#upload-project').html('')
    $('button[data-target="#new-subject"]').prop('disabled', !site_wide_settings.allow_create_subject);

    try {
        const xnat_api = new XNATAPI(xnat_server, user_auth)
        let projects = await xnat_api.get_projects()
    
        if (projects.length) {
            generate_project_list(projects)
        } else {
            no_upload_privileges_warning()
        }
    } catch (err) {
        handle_error(err)
    }

    $.unblockUI();
});

function generate_project_list(projects) {
    let rupc = user_settings.get('recent_upload_projects_count');
    if (rupc === undefined) {
        rupc = DEFAULT_RECENT_UPLOAD_PROJECTS_COUNT
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

    select_link_for_item('upload-project', ['project_id'], 'project_prm');
}

$(document).on('click', '#upload-section a[data-project_id]', async function(e){
    FlowReset.execFrom('project_selection');

    $(this).addClass('selected');

    // set Review data
    $('#var_project').val(get_form_value('project_id', 'project_id'));
    
    let project_id = $(this).data('project_id');

    try {
        project_settings = await fetch_project_settings(project_id, xnat_server, user_auth);

        const scripts = XNATAPI._aggregate_script(site_wide_settings.anon_script, project_settings.anon_script)

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

// ====================================================================================================
// ====================================================================================================


$on('change', '#var_subject', async function(e){
    console.log('change#var_subject');

    let project_id = $$('#var_project').val();
    let subject_id = $(this).find('option:selected').eq(0).data('subject_id');

    console.log({project_id, subject_id});

    FlowReset.execFrom('clear_visits')

    if (!subject_id) {
        validate_upload_form()
        return
    }

    try {
        const xnat_api = new XNATAPI(xnat_server, user_auth)
        const sorted_visits = await xnat_api.project_subject_visits(project_id, subject_id)

        console.log({sorted_visits});

        if (sorted_visits.length !== 0) {
            sorted_visits.forEach(append_visit_row);

            $('.visits-holder').removeClass('hidden')
            select_link_for_item('visit', ['visit_id'], 'visit_prm');
        } else {
            await experiment_label_with_api()
            //validate_upload_form()
        }

    } catch(err) {
        handle_error(err)
    }

    // await experiment_label_with_api()
    validate_upload_form()

});

$(document).on('click', 'a[data-visit_id]', async function(e){
    $(this).closest('ul').find('a').removeClass('selected');
    $(this).addClass('selected');

    let project_id = $('#var_project').val();
    let visit_id = $(this).data('visit_id');

    // set Review data
    $('#var_visit').val(visit_id);

    FlowReset.execFrom('clear_datatypes')

    try {
        const xnat_api = new XNATAPI(xnat_server, user_auth)
        const sorted_types = await xnat_api.project_visit_datatypes(project_id, visit_id)
        console.log({sorted_types});

        if (sorted_types.length === 0) {
            $('.datatypes-holder').addClass('hidden');

            swal({
                title: `Error`,
                text: `No datatypes for this visit`,
                icon: "error",
                dangerMode: true
            })
        } else {
            sorted_types.forEach(append_datatype_row);
            $('.datatypes-holder').removeClass('hidden');

            select_link_for_item('datatype', ['datatype'], 'datatype_prm');
        }
        
    } catch(err) {
        handle_error(err)
    }
    
});

$(document).on('click', 'a[data-datatype]', async function(e){
    $(this).closest('ul').find('a').removeClass('selected');
    $(this).addClass('selected')

    let project_id = $('#var_project').val();
    let visit_id   = $('#var_visit').val();
    let datatype   = $(this).data('datatype');

    $('#var_datatype').val(datatype);

    FlowReset.execFrom('clear_subtypes')

    try {
        const xnat_api = new XNATAPI(xnat_server, user_auth)
        const subtypes = await xnat_api.project_visit_subtypes(project_id, visit_id, datatype)
        console.log({subtypes});

        if (subtypes.length === 0) {
            $('.subtypes-holder').addClass('hidden');
        } else {
            subtypes.forEach(append_subtype_row);
            $('.subtypes-holder').removeClass('hidden');

            select_link_for_item('subtype', ['subtype'], 'subtype_prm');
        }

        await experiment_label_with_api()
        validate_upload_form()
        
    } catch(err) {
        handle_error(err)
    }

});

$(document).on('click', 'a[data-subtype]', async function(e){
    $(this).closest('ul').find('a').removeClass('selected');
    $(this).addClass('selected')

    // set Review data
    $('#var_subtype').val(get_form_value('subtype', 'subtype'));

    FlowReset.execFrom('clear_experiment_label')

    await experiment_label_with_api()
    validate_upload_form()
});

// ====================================================================================================
function append_visit_row(visit){
    let vt = visit.type ? visit.type : 'ad hoc';
    let label = `${visit.name} (${vt})`;
    $('#visit').append(`
        <li>
            <a href="javascript:void(0)"
                data-visit_id="${visit.id}"
                data-visit_name="${visit.name}"
                data-visit_type="${vt}"
                data-visit_label="${label}">
                ${label}<span class="meta_key">ID: ${visit.id}</span>
            </a>
        </li>
    `)
}

function append_datatype_row(datatype){
    $('#datatype').append(`
        <li>
            <a href="javascript:void(0)"
                data-datatype="${datatype.xsitype}"
                data-modality="${datatype.modality}">
                ${datatype.name}
            </a>
        </li>
    `)
}

function append_subtype_row(subtype){
    $('#subtype').append(`
        <li>
            <a href="javascript:void(0)"
                data-subtype="${subtype}">
                ${subtype}
            </a>
        </li>
    `)
}
// ====================================================================================================
// ====================================================================================================


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

                if (response > UPLOAD_SELECTION_WARNING_SIZE) {
                    swal({
                        title: `Selected folder size: ${prettyBytes(response)}`,
                        text: `It may take a while to process this much data. Are you sure you want to continue?`,
                        icon: "info",
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

$on('click', '[data-js-visual-bulk-upload]', async function() {
    const upload_method = $('#nav-verify').data('upload_method')
    console.log({upload_method});

    let total_scans = 0;
    let count_included = 0
    let count_user_excluded = 0
    let count_anonymized = 0
    for(const group in _masking_groups) {
        total_scans += _masking_groups[group].length
        count_included += _masking_groups[group].filter(_scan => _scan.excluded === false).length
        count_user_excluded += _masking_groups[group].filter(_scan => _scan.excluded === true).length
        count_anonymized += _masking_groups[group].filter(_scan => _scan.rectangles.length > 0).length
    }

    /* ---- */
    const unsupported_size = _masking_groups._UNSUPPORTED_ ? masking_groups._UNSUPPORTED_.length : 0;
    const supported_size = total_scans - unsupported_size;
    /* ---- */

    const proceed = await swal({
        title: `Upload Overview`,
        text: `From ${total_scans} total scans in original dataset:  
        * ${count_anonymized} scans to upload with pixel anonymization
        * ${count_included - count_anonymized} scans to upload without pixel anonymization
        * ${count_user_excluded} scans excluded by user
        `,
        icon: "info",
        buttons: ['Cancel', 'Continue Upload'],
        dangerMode: true
    })
    
    if (!proceed) {
        console.log('BREAK UPLOAD --- cancel');
        return
    }

    console.log('CONTINUE UPLOAD');

    const tbl_id = upload_method === 'quick_upload' ? '#selected_session_tbl' : '#custom_upload_multiple_tbl'
    const _sessions = $(tbl_id).bootstrapTable('getData');

    const overwrite = upload_method === 'quick_upload' 
        ? $('#upload_overwrite_method', '#quick_upload').val() 
        : $('#upload_overwrite_method', '#custom_upload_multiple').val()
    await handle_upload_multi(_sessions, project_settings, overwrite)

})

async function handle_upload_multi(_sessions, project_settings, overwrite) {
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

        if (session.hasOwnProperty('tracer') && session.tracer) {
            my_anon_variables['tracer'] = session.tracer;
        }

        // -----------------------------------------------------
        // const all_series = get_session_series(session_map.get(session.id))
        // const selected_series_ids = all_series.map(ser => ser.series_id);
        // -----------------------------------------------------

        let selected_series_ids = []
        for(const group in _masking_groups) {
            let selected_scans = _masking_groups[group]
                .filter(_scan => _scan.sessionId == session.id && _scan.excluded === false)
                .map(_scan => _scan.id)
            if (selected_scans.length) {
                selected_series_ids.push(...selected_scans)
            }
        }

        console.log({
            _masking_groups,
            storeUpload: {
                _selected_session_id: session.id, 
                _selected_series_ids: selected_series_ids, 
                url_data, 
                my_anon_variables
            }
        });
        
        if (selected_series_ids.length) {
            await storeUpload(url_data, session.id, selected_series_ids, my_anon_variables);
        }
    })

    console.log('=========================DONE')
    
    start_upload_and_redirect()
}


$(document).on('click', '.js_upload', async function() {
    let upload_method = $('#nav-verify').data('upload_method')
    console.log({upload_method});
    if (upload_method === 'quick_upload') {
        // TODO - disable Inspect images tab
        if (validate_required_inputs($('#quick_upload'))) {
            const _sessions = $('#selected_session_tbl').bootstrapTable('getData');
            const overwrite = $('#upload_overwrite_method', '#quick_upload').val()
            await handle_upload(_sessions, project_settings, overwrite)
        } else {
            swal({
                title: `Form Error`,
                text: `Please select at least one scan series and enter all variable value(s)`,
                icon: "warning",
                dangerMode: true
            })
        }
        
    } else if (upload_method === 'custom_upload') {
        await handle_custom_upload()
    } else if (upload_method === 'custom_upload_multiple') {
        // TODO - disable Inspect images tab
        const _sessions = $('#custom_upload_multiple_tbl').bootstrapTable('getSelections');

        if (_sessions.length && validate_required_inputs($('#custom_upload_multiple'))) {
            const overwrite = $('#upload_overwrite_method', '#custom_upload_multiple').val()
            
            await handle_upload(_sessions, project_settings, overwrite)
        } else {
            swal({
                title: `Form Error`,
                text: `Please enter all variable value(s)`,
                icon: "warning",
                dangerMode: true
            })
        }
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

async function handle_upload(_sessions, project_settings, overwrite) {

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
        xnat_subject_id: "L1OG4ZRA",
        tracer: "XYZ" // ? optional
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

        if (session.hasOwnProperty('tracer') && session.tracer) {
            my_anon_variables['tracer'] = session.tracer;
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

// TODO - refactor validation (use existing method)
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

        if (!valid_pixel_anon()) {
            swal({
                title: `Area Selection Error`,
                text: `All selected areas must be confirmed using "Save Scan" button.`,
                icon: "warning",
                dangerMode: true
            })

            return;
        }

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
    valid_experiment_label_syntax()
});

function valid_experiment_label_syntax() {
    let $el = $('#experiment_label');
    let val = $el.val();

    // allow only alphanumeric, space, dash, underscore
    if (val.match(/[^a-z0-9_-]/i) !== null) {
        console.log('valid_experiment_label_syntax: INVALID')
        $el.addClass('is-invalid');
        return false
    } else {
        console.log('valid_experiment_label_syntax: valid')
        $el.removeClass('is-invalid');
        return true
    }
}

$(document).on('change', '#pet_tracer', async function(e) {
    let custom_pt_required = $(this).val() === 'OTHER';
    
    $('#custom_pet_tracer').prop('required', custom_pt_required).prop('disabled', !custom_pt_required).toggleClass('hidden', !custom_pt_required);

    if (custom_pt_required) {
        $('#custom_pet_tracer').focus();
    }

    //$('#experiment_label').val(experiment_label());
    console.log('change#pet_tracer');
    await experiment_label_with_api()
    validate_upload_form()
})

$(document).on('keyup', '#custom_pet_tracer', async function(e) {
    //$('#experiment_label').val(experiment_label());
    await experiment_label_with_api()
    validate_upload_form()
})

$(document).on('submit', '#form_new_subject', async function(e) {
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

        
        try {
            const xnat_api = new XNATAPI(xnat_server, user_auth)

            const csrfToken = await auth.get_csrf_token(xnat_server, user_auth);

            const new_subject_res = await xnat_api.create_project_subject(project_id, subject_label, group, csrfToken)
            console.log({promise_create_project_subject: new_subject_res})

            project_settings.subjects = await xnat_api.project_subjects(project_id)

            generate_subject_dropdown(new_subject_res.data)

            $('#new-subject').modal('hide');
        } catch(err) {
            handle_error(err)
        }

        Helper.unblockModal(modal_id);
        $form.data('processing', false);
        
    }
    
    
});

$(document).on('click', '.js_cancel_session_selection', function(){
    FlowReset.execAfter('disable_session_upload')
});

$(document).on('click', '.js_custom_upload', function(){
    let selected = $('#found_sessions').bootstrapTable('getSelections');

    console.log({selected});

    if (selected.length > 1) {
        custom_upload_multiple_selection(selected)
    } else {
        select_session_id(selected[0])
    }
    
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

    let msg = project_settings.allow_bulk_upload ? 'Select one or more sessions to upload:' : 'Select a session to upload:'

    $('.modal-header .modal-title', $(this)).html(title);
    $('#select-sessions-message', $(this)).html(msg);

});

$(document).on('shown.bs.modal', '#session-selection', function(e) {
    // NEEDED to reset view (https://examples.bootstrap-table.com/#welcomes/modal-table.html)
    $('#found_sessions').bootstrapTable('resetView');
});

function generate_subject_dropdown(selected_id = false) {
    let subject_options = project_settings.subjects.map(function(subject) {
        return `<option value="${subject.label}" data-subject_id="${subject.ID}" 
            ${(subject.ID === selected_id ? 'selected' : '')}>
            ${subject.label}${(subject.group ? ` (Group: ${subject.group})`: '')}
            </option>`;
    });
    subject_options.unshift('<option value="">Select subject</option>')

    $('#var_subject')
        .html(subject_options.join("\n"))
        .trigger('change')

    select_link_for_item('upload-project', ['project_id'], 'project_prm');
}

function generate_unique_xnat_subject_id(existing_project_subjects, xnat_subject_ids) {
    let subject_id;
    let all_subjects = [...existing_project_subjects, ...xnat_subject_ids]
    do {
        subject_id = random_string(2) + random_string(3, 'NUMERIC')
    } while(all_subjects.includes(subject_id))

    return subject_id;
}

function get_session_series(session) {
    let series_data = [];

    console.log({session_scans: session.scans});

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


$(document).on('click', '#switch_to_quick_upload', function() {
    let selected = $('#custom_upload_multiple_tbl').bootstrapTable('getData');
    quick_upload_selection(selected)
    $('#quick_upload').show().siblings().hide()
})

$(document).on('click', '#switch_to_custom_upload', function() {
    let selected = $('#selected_session_tbl').bootstrapTable('getData');

    if (selected.length > 1) {
        custom_upload_multiple_selection(selected)
        $('#custom_upload_multiple').show().siblings().hide()
        $('#subject_labeling_pattern').val(project_settings.subject_labeling_scheme).trigger('change')
        $('#session_labeling_pattern').val(project_settings.session_labeling_scheme).trigger('change')
    } else {
        // never happens
        select_session_id(selected[0])
        $('#custom_upload').show().siblings().hide()
    }
    
})

function quick_upload_selection(_sessions) {
    const session_ids = _sessions.map(sess => sess.id)
    const tbl_data = selected_sessions_display_data(session_map, session_ids, project_settings.subjects, true)

    console.log({session_ids, tbl_data});

    selected_sessions_table($('#selected_session_tbl'), tbl_data)

    selected_session_id = session_ids;

    $('.tab-pane.active .js_next').removeClass('disabled');

    $('#nav-verify').data('upload_method', 'quick_upload');
}

function custom_upload_multiple_selection(_sessions) {
    const session_ids = _sessions.map(sess => sess.id)
    const tbl_data = selected_sessions_display_data(session_map, session_ids, project_settings.subjects)

    tbl_data.forEach(row => {
        row.enabled = true
    })

    console.log({session_ids, tbl_data});

    custom_upload_multiple_table($('#custom_upload_multiple_tbl'), tbl_data)

    selected_session_id = session_ids;

    $('.tab-pane.active .js_next').removeClass('disabled');

    $('#nav-verify').data('upload_method', 'custom_upload_multiple');
}


$(document).on('click', '#upload-section [data-csv-tpl-download]', function(e) {
    const data = $('#custom_upload_multiple_tbl').bootstrapTable('getSelections')
    
    if (data.length === 0) {
        Helper.pnotify('Selection Error', 'You have to select at least 1 session for CSV export.', 'warning', 3000);
    } else {
        const relevant_data = data.map(item => {
            let mapped_item = {}
    
            // remap item property names
            for (const property in item) {
                const selected_field = CSV_UPLOAD_FIELDS.find(field => field.name === property)

                if (selected_field !== undefined) {
                    mapped_item[selected_field['label']] = item[property]
                }
            }
    
            return mapped_item
        })
    
        saveAsCSV(relevant_data, `Sessions Upload ${Date.now()}.csv`)
    }
})

async function validate_csv_upload(csv_path) {

    try {
        let jsonArray

        if (!csv_path.toLowerCase().endsWith('.csv')) {
            throw new Error('filetype_error')
        }

        try {
            jsonArray = await csvToJson().fromFile(csv_path);
        } catch(err) {
            throw new Error('csv_conversion_error')
        }

        if (jsonArray.length === 0) {
            throw new Error('empty_json_error')
        }

        // get all JSON fields
        const jsonFields = Object.keys(jsonArray[0]);

        // get all required field
        const required_fields = CSV_UPLOAD_FIELDS.filter(item => item.required).map(item => item.label)

        // all required fields are present in JSON object
        let jsonFieldsValid = required_fields.every(rf => jsonFields.includes(rf));

        if (!jsonFieldsValid) {
            throw new Error('required_fields_error')
        }

        return jsonArray

    } catch(err) {
        let error_title = 'Error', error_message;

        switch (err.message) {
            case 'filetype_error':
                error_title = `Filetype Error`
                error_message = `You must select a CSV file.`
                break;

            case 'csv_conversion_error':
                error_title = 'CVS to JSON Conversion Error'
                error_message = `The file you have selected could not be converted to JSON.`
                break;

            case 'empty_json_error':
                error_title = 'Empty JSON Error'
                error_message = `The file you have selected does not contain valid rows.`
                break;

            case 'required_fields_error':
                error_title = 'CSV Column(s) Missing Error'
                error_message = `One or more CSV colums are missing.`
                break;

            default:
                error_title = 'Error'
                error_message = err.message
        }

        swal({
            title: error_title,
            text: error_message,
            icon: "error",
            dangerMode: true
        })

        return false;
    }


}

$(document).on('change', '#upload-section [data-csv-file-upload]', async function(e) {
    if (this.files.length === 1) {
        let jsonArray = await validate_csv_upload(this.files[0].path);

        if (jsonArray !== false) {
            let default_data = $('#custom_upload_multiple_tbl').bootstrapTable('getData')

            // disable all rows
            default_data.forEach(row => row.enabled = false)

            jsonArray.forEach(row => {
                let item_match_index = default_data.findIndex(item => item.id === row['Study UID'])

                if (item_match_index >= 0) {
                    default_data[item_match_index].enabled = true
                    
                    for (const column in row) {
                        const selected_field = CSV_UPLOAD_FIELDS.find(field => field.label === column)

                        if (selected_field !== undefined) {
                            default_data[item_match_index][selected_field.name] = row[column]
                        }
                    }
                }
            })

            custom_upload_multiple_table($('#custom_upload_multiple_tbl'), default_data)
        }

        this.value = '' // reset upload field
    } 


})

function selected_sessions_display_data(session_map, session_ids, project_subjects, automatic_labeling = false) {
    let tbl_data = []
    let xnat_subject_ids = []

    let existing_project_subjects = project_subjects.map(item => item.label)

    session_map.forEach(function(cur_session, key) {
        console.log({cur_session});

        if (!session_ids.includes(key)) {
            console.log('SKIPPING: ' + key);
            return
        }

        let new_xnat_subject_id = automatic_labeling ? generate_unique_xnat_subject_id(existing_project_subjects, xnat_subject_ids) : ''
        if (new_xnat_subject_id) {
            xnat_subject_ids.push(new_xnat_subject_id)
        }

        
        /************************** */
        let series_data = get_session_series(cur_session);
        /************************** */

        
        let session_label = cur_session.studyId === undefined ? key : cur_session.studyId;

        let studyDate = normalizeDateString(cur_session.date);

        let session_data = {
            id: key,
            patient_name: cur_session.patient.name,
            patient_id: cur_session.patient.id,
            subject_auto: generate_unique_xnat_subject_id(existing_project_subjects, xnat_subject_ids),
            subject_dicom_patient_name: cur_session.patient.name,
            subject_dicom_patient_id: cur_session.patient.id,
            xnat_subject_id: new_xnat_subject_id,
            label: session_label,
            session_accession: cur_session.accession,
            label_suffix: generate_experiment_label('', series_data, 'PT', 'YYY'), // TODO replace PT and YYY values with dicom data
            experiment_label: new_xnat_subject_id ? generate_experiment_label(new_xnat_subject_id, series_data, 'PT', 'YYY') : '', //, // TODO replace PT and YYY values with dicom data
            modality: cur_session.modality.join(", "),
            scan_count: cur_session.scans.size,
            tracer: null,
            study_date: studyDate
        }

        tbl_data.push(session_data);
    });

    return tbl_data;
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

    if (selected_session.date) {
        $('#image_session_date').val(normalizeDateString(selected_session.date));
    }

    let expt_label = experiment_label();
    
    $('#experiment_label').val(expt_label);

    let studyDate = normalizeDateTimeString(selected_session.date, selected_session.time) || 'N/A'
    
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
                <div class="input-group col-sm-6">
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

function get_form_value(field, data) {
    let $field = $(`a[data-${field}].selected`);
    return $field.length ? $field.data(data) : '';
}


$.queuer = {
    _timer: null,
    _queue: [],
    add: function(fn, context, time) {
        let setTimer = function(time) {
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

        let next = $.queuer._queue.shift();
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
                resolve(size);
            }
        });
    });
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

                        // Here we have the file data as an ArrayBuffer.  dicomParser requires as input a
                        // Uint8Array so we create that here
                        const byteArray = new Uint8Array(dicomFile);

                        const dicom = dicomParser.parseDicom(byteArray, { untilTag: 'x00324000' });           
                        console.log({dicomFile, byteArray, dicom});
                        const studyInstanceUid = dicom.string('x0020000d');


                        // http://dicom.nema.org/medical/dicom/current/output/chtml/part05/sect_6.2.html
                        // the DataSet object has functions to support every VR type:
                        // All string types - string()
                        // US: unsigned short - uint16()
                        // SS - int16()
                        // UL - uint32()
                        // SL - int32()
                        // FL - float()
                        // FD - double()
                        // DS - floatString()
                        // IS - intString()
                        
                        if (typeof studyInstanceUid !== 'undefined') {
                            const studyDescription = dicom.string('x00081030');
                            const studyId = dicom.string('x00200010') || '-';
                            
                            const seriesDescription = dicom.string('x0008103e');
                            const seriesInstanceUid = dicom.string('x0020000e');
                            const seriesNumber = dicom.string('x00200011');

                            // ----------------------------------------------------
                            const SOPClassUID = dicom.string('x00080016');
                            const TransferSyntaxUID = dicom.string('x00020010');
                            const PhotometricInterpretation = dicom.string('x00280004');
                            const Rows = dicom.uint16('x00280010');
                            const Columns = dicom.uint16('x00280011');
                            console.log({Rows, Columns});
                            // ----------------------------------------------------

                            const SOPInstanceUID = dicom.string('x00080018');
                            
                            // ++++
                            const modality = dicom.string('x00080060');
                            const study_date = dicom.string('x00080020');
                            const study_time = dicom.string('x00080030');

                            const accession = dicom.string('x00080050');
                            // ++++

                            // ***********
                            const NumberOfFrames = dicom.intString('x00280008');
                            const InstanceNumber = dicom.intString('x00200013');
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
                            let scan_files = studyInstance.scans.get(seriesInstanceUid);
                            let filtered = scan_files.filter(el => 
                                el.filename === file_name && 
                                el.filesize === file_size && 
                                el.SOPInstanceUID === SOPInstanceUID
                            );
            
                            // only add unique files
                            if (filtered.length === 0) {
                                scan_files.push({
                                    filepath: file,
                                    filename: file_name,
                                    filesize: file_size,
                                    frames: NumberOfFrames,
                                    order: InstanceNumber,
                                    seriesDescription: seriesDescription,
                                    seriesInstanceUid: seriesInstanceUid,
                                    seriesNumber: seriesNumber,
                                    modality: modality ? modality.toUpperCase() : '',
                                    SOPInstanceUID: SOPInstanceUID,

                                    SOPClassUID,
                                    TransferSyntaxUID,
                                    PhotometricInterpretation,
                                    Rows,
                                    Columns,
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
                let total_size = scan.reduce(function(prevVal, elem) {
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

                    let studyDate = normalizeDateString(cur_session.date);

                    let session_data = {
                        id: key,
                        state: true,
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


async function storeUpload(url_data, session_id, series_ids, _anon_variables) {
    console.log('==== anon_variables ====', _anon_variables);
    
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

    let studyDate = normalizeDateString(selected_session.date) || '';
    let studyTime = normalizeTimeString(selected_session.time) || '';

    let pixel_anon_data = []

    // if _masking_groups is an empty object
    if (Object.entries(_masking_groups).length === 0) {
        // single session anon
        rectangle_state_registry.forEach((state) => {
            pixel_anon_data.push({
                series_id: state.series_id,
                rectangles: state.rectangles
            })
        })
    } else {
        // multi session anon
        for (let i = 0; i < series_ids.length; i++) {
            const series_id = series_ids[i]

            let found_scan = find_grouped_scan(session_id, series_id)

            if (found_scan) {
                const rectangles = found_scan.rectangles ? found_scan.rectangles : []
                pixel_anon_data.push({
                    series_id: series_id,
                    rectangles: rectangles
                })

            }
        }
    }
    

    let upload_digest = {
        id: Helper.uuidv4(),
        url_data: url_data,
        anon_variables: _anon_variables,
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
        pixel_anon: pixel_anon_data,
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

    // todo: remove this
    // const target_path = path.resolve(remote.app.getPath('desktop'), `upload_digest-${Date.now()}.json`)
    // objToJsonFile(upload_digest, target_path);
    
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
    ipcRenderer.send('start_upload');
    ipcRenderer.send('redirect', 'progress.html');

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
    filtered = filtered.slice(0, MAX_RECENT_UPLOAD_PROJECTS_STORED)

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



function user_defined_pet_tracers(settings) {
    return settings.has('default_pet_tracers') ? settings.get('default_pet_tracers').split(",") : []
}


function get_pet_tracers(project_pts, server_pts, user_defined_pts) {
    let _pet_tracers;
    if (project_pts !== false) {
        _pet_tracers = project_pts
    } else if (server_pts.length) {
        _pet_tracers = server_pts
    } else {
        _pet_tracers = user_defined_pts;
    }

    if (!_pet_tracers.includes('OTHER')) {
        _pet_tracers.push('OTHER')
    }

    return _pet_tracers;
}



function handle_error(err) {
    console.error({err})

    let message = err.message;

    // AXIOS?
    if (err.config && err.config.url) {
        message += "\n" + err.config.url 
    }
    message += "\n\n STACK:\n" + err.stack

    swal({
        title: err.name,
        text: `MESSAGE:\n\n${message}`,
        icon: "error",
        dangerMode: true
    })

    FlowReset.execAll()
}

//================================

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

const PROJECT_PARAM = 'project';
const SUBJECT_PARAM = 'subject';
const VISIT_PARAM = 'visit';
const DATATYPE_PARAM = 'datatype';
const SUBTYPE_PARAM = 'protocol';

ipcRenderer.on('launch_upload', function(e, data){
    const params = data.PARAMS;
    if (!params.hasOwnProperty(PROJECT_PARAM)) {
        return;
    }
    $('#project_prm').val(params[PROJECT_PARAM]);
    if (!params.hasOwnProperty(SUBJECT_PARAM)) {
        return;
    }
    $('#subject_prm').val(params[SUBJECT_PARAM]);
    if (!params.hasOwnProperty(VISIT_PARAM)) {
        return;
    }
    $('#visit_prm').val(params[VISIT_PARAM]);
    if (!params.hasOwnProperty(DATATYPE_PARAM)) {
        return;
    }
    $('#datatype_prm').val(params[DATATYPE_PARAM]);
    if (!params.hasOwnProperty(SUBTYPE_PARAM)) {
        return;
    }
    $('#subtype_prm').val(params[SUBTYPE_PARAM]);
});

ipcRenderer.on('custom_upload_multiple:generate_exp_label',function(e, row){
    const series_data = get_session_series(session_map.get(row.id))

    const tracer_val = row.tracer ? row.tracer : 'PT'
    const new_label = generate_experiment_label(row.xnat_subject_id, series_data, tracer_val, '')
    
    $('#custom_upload_multiple_tbl').bootstrapTable("updateCellByUniqueId", {
        id: row.id,
        field: 'experiment_label',
        value: new_label,
        reinit: false
    });

    $('.label-field', `tr[data-uniqueid="${row.id}"]`).val(new_label)

    console.log({row, series_data});
})

function select_link_for_item(ulid, attrs, targetid) {
    const $target = $('#' + targetid);
    if ($target.length === 0) {
        return;
    }
    const val = $target.val();
    if (!val) {
        return;
    }
    $target.val('');
    for (let i = 0; i < attrs.length; i++) {
        let attr = attrs[i];
        let $link = $('#' + ulid + ' a[data-' + attr + '=' +  $.escapeSelector(val) + ']');
        if ($link.length > 0) {
            $link.get(0).scrollIntoView();
            $link.click();
        }
    }
}



// =======================================================================
// ================ EXPERIMENT LABELS ====================================
// =======================================================================

// single - helper
function __selected_modality_string(selected_series) {
	// CALCULATED
	return selected_series.reduce((agg, item) => {
	  if (!agg.includes(item.modality)) {
		  agg += item.modality
	  }
	  
	  return agg
	}, '')
}


// single
async function __experiment_label_api(project_id, subject_id, visit_id, subtype, session_date, selected_modality, selected_series, xnat_api) {
	// CALCULATED
	const full_modality = __selected_modality_string(selected_series)

	// validation - Mismatched modality
	if (selected_modality && selected_modality != full_modality && selected_series.length) {
		throw new Error('ModalityMismatch')
	}

	try {
		const expt_label = await xnat_api.project_experiment_label(project_id, subject_id, visit_id, subtype, session_date, full_modality)

		return expt_label ? expt_label : false
		
	} catch (err) {
		if (err.response && err.response.status === 400) {
			throw err        
        }
		
		return false
	}
}

// single
async function __generate_experiment_label_api() {
	const project_id = $('#var_project').val();
	const subject_id = $('#var_subject option:selected').eq(0).data('subject_id');
	const visit_id = $('#var_visit').val();
	const subtype = $('#var_subtype').val();
	const session_date = $('#image_session_date').val();
	const selected_modality = get_form_value('datatype', 'modality'); // datatype
	const selected_series = $('#image_session').bootstrapTable('getSelections');

	const xnat_api = new XNATAPI(xnat_server, user_auth)
	
	try {
		const exp_label = await __experiment_label_api(project_id, subject_id, visit_id, subtype, session_date, selected_modality, selected_series, xnat_api)
		
		return exp_label === false ? __generate_experiment_label_single() : exp_label
		
	} catch(err) {
		if (err.message === 'ModalityMismatch') {
			// CALCULATED
			const full_modality = __selected_modality_string(selected_series)
			
			swal({
				title: "Mismatched modality",
				text: `You are trying to upload ${full_modality} data after indicating that you were going to upload ${selected_modality} data.`,
				icon: "error",
				button: "Okay",
			}).then(proceed => {
				// resetSubsequentTabs();
				//$('a[href="#nav-project"]').click();
			});
			
		} else if (err.response && err.response.status === 400 && show_unable_to_set_session_label_warning === 0) {
			show_unable_to_set_session_label_warning++
			swal({
				title: `Warning: unable to set session label per project protocol labeling template`,
				text: 'Unable to set session label per protocol template: ' + err.response.data + '. Reverting to default labeling.',
				icon: "warning",
				button: 'OK',
				dangerMode: true
			})
			
			return __generate_experiment_label_single()
		} else {
			throw err
		}
	}
	
}

// single
function __generate_experiment_label_single() {
	const subject_label = $('#var_subject').val()
    const selected_series = $('#image_session').bootstrapTable('getSelections')
    const pet_tracer = $('#pet_tracer').length ? $('#pet_tracer').val() : ''
    const custom_pet_tracer = ('' + $('#custom_pet_tracer').val()).trim().split(' ').join('_')

	return generate_experiment_label(subject_label, selected_series, pet_tracer, custom_pet_tracer)
}

// single and bulk
function generate_experiment_label(_subject_label, _selected_series, _pet_tracer, _custom_pet_tracer) {
	const data = {
		subject_label: _subject_label,
		selected_series: _selected_series,
		pet_tracer: _pet_tracer,
		custom_pet_tracer: _custom_pet_tracer
	};
	
	const exp_label = new ExperimentLabel(data, project_settings.computed.experiment_labels);
    
	return exp_label.generateLabel()
}

// single
async function experiment_label_with_api() {
    try {
        const expt_label = await __generate_experiment_label_api()
	
        if (expt_label) {
            console.log('EXPT_LABEL_NEW_1', expt_label);
            
            // project_settings.computed.experiment_labels.push(expt_label)
            
            $('#experiment_label').val(expt_label);
        }
    } catch (err) {
        const msg = err.response && err.response.data ? err.response.data : err.message

        console.log(`Experiment Label Error (API): ${msg}`);
        return
        swal({
			title: `Experiment Label Error (API)`,
			text: msg,
			icon: "error",
			dangerMode: true
		})
    }
	
}

// bulk
function experiment_label(store_locally = false) {
	try {
		const expt_label = __generate_experiment_label_single()
		console.log('EXPT_LABEL_NEW_2', expt_label);
        
        if (store_locally) {
            project_settings.computed.experiment_labels.push(expt_label)
        }
		
		return expt_label
	} catch(err) {
        console.log(`Experiment Label Error: ${err.message}`);
        return
		swal({
			title: `Experiment Label Error`,
			text: err.message,
			icon: "error",
			dangerMode: true
		})
	}
}

$(document).on('click', '#label_generate_api', async function() {
    await experiment_label_with_api()
})
$(document).on('click', '#label_generate_local', function() {
    $('#experiment_label').val(experiment_label());
})
$(document).on('click', '#validate_form', function() {
    console.log('upload form errors: ' + validate_upload_form())
})


$on('click', '[data-action="bulk-action-review"]', function() {
    const $scans_tbl = $$('#selected_scans')
    const selected_scans = $scans_tbl.bootstrapTable('getSelections');

    if (selected_scans.length === 0) {
        return
    }

    const default_cols = selected_scans[0].Columns
    const default_rows = selected_scans[0].Rows

    for (let i = 0; i < selected_scans.length; i++) {
        if (selected_scans[i].Columns != default_cols || selected_scans[i].Rows != default_rows) {
            swal({
                title: `Image Size Error`,
                text: `All images must be the same size!`,
                icon: "error",
                dangerMode: true
            })

            return
        }
    }

    $$('#review-series-images').modal('show')
})

$on('shown.bs.modal', '#review-series-images', function(e) {
    $$('#review-scans-hide-excluded').prop('checked', false).trigger('change')
})

$on('hide.bs.modal', '#review-series-images', function(e) {
    // TODO - activate based on current active group type (supported or unsupported)
    display_masking_groups('supported')
})

async function generateBulkImageReview(selected_scans, imgDataImages) {
    console.log({selected_scans});
    let tpl_html = await ejs_template('upload/scan_review_list', {selected_scans, imgDataImages})
    $('#scan_images').html(tpl_html)
}

$on('change', '#apply_masking_template', function(e) {
    console.log($(this).val())
    if ($(this).val() == "1") {
        
    }
})

function generateBulkImageReviewRow(row, imgSrc) {

}

function generateBulkImageReview__OLD(selected_scans, imgDataImages) {
    $$('#scan_images').html('');
    for(let i = 0; i < selected_scans.length; i++) {
        const row = selected_scans[i]
        const imgSrc = imgDataImages[i]
        
        $$('#scan_images').append(`
            <div style="width: 50%; border: 1px solid #eee; padding: 15px; float: left;">
                <h3>Series: <b>${row.seriesNumber}</b>: [${row.seriesDescription}]</h3>
                <h4>Study: ${row.studyId} - ${row.studyDescription}</h4>
                <div style="display: inline-block; padding: 20px;"><img src="${imgSrc}"></div>
            </div>
        `)
    }
}

function generateScanImage(imgSrc) {
    $$('#scan_images').append(`<div style="display: inline-block; padding: 20px;"><img src="${imgSrc}"></div>`)
}

$on('click', 'button[data-clear-filter-control]', function(e) {
    let tbl_id = $(this).data('clear-filter-control');
    $(tbl_id).bootstrapTable('clearFilterControl').bootstrapTable('triggerSearch');
})


$on('post-body.bs.table refresh.bs.table pre-body.bs.table reset-view.bs.table search.bs.table column-search.bs.table', '#selected_scans', function (e) {
    // console.log(`***************** ${e.type}::${e.namespace} *******************`);
})
