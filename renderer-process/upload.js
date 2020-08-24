const constants = require('../services/constants');
const fs = require('fs');
const path = require('path');

const getSize = require('get-folder-size');
const https = require('https');
require('promise.prototype.finally').shim();
const auth = require('../services/auth');
const settings = require('electron-settings');
const ipc = require('electron').ipcRenderer;
const swal = require('sweetalert');
const mime = require('mime-types');

const prettyBytes = require('pretty-bytes');

const user_settings = require('../services/user_settings');

const remote = require('electron').remote;
const mizer = remote.require('./mizer');

const db_uploads = remote.require('./services/db/uploads')

const electron_log = remote.require('./services/electron_log');

const XNATAPI = require('../services/xnat-api')
const { normalizeDateString } = require('../services/app_utils');
// ===================
const dicomParser = require('dicom-parser');
const cornerstone = require('cornerstone-core-with-bg');

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
const Hammer = require('hammerjs');

cornerstoneTools.external.cornerstone = cornerstone;
cornerstoneTools.external.cornerstoneMath = cornerstoneMath;
cornerstoneTools.external.Hammer = Hammer;
// ===================

const NProgress = require('nprogress');
NProgress.configure({ 
    trickle: false,
    easing: 'ease',
    speed: 1,
    minimum: 0.03
});

let xnat_server, user_auth, session_map, selected_session_id, resseting_functions;

let resizing_tm;
const PROJECT_PARAM = 'project';
const SUBJECT_PARAM = 'subject';
const VISIT_PARAM = 'visit';
const DATATYPE_PARAM = 'datatype';
const SUBTYPE_PARAM = 'protocol';


let rectangle_state_registry = [];
let event_timeout;

let anno2;

let show_unable_to_set_session_label_warning = 0;


let site_wide_settings = {};
let project_settings = {};



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
            xnat_api.project_pet_tracers(project_id)
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
            pet_tracers: res[8]
        }
    } catch (err) {
        throw err
    }
}



async function _init_variables() {
    console.log(':::::::::::::: >>> UPLOAD _init_variables');
    
    xnat_server = settings.get('xnat_server');
    user_auth = auth.get_user_auth();

    try {
        site_wide_settings = await fetch_site_wide_settings(xnat_server, user_auth)
        console.log({site_wide_settings});
    } catch (err) {
        handle_error(err)
    }

    show_unable_to_set_session_label_warning = 0;

    session_map = new Map();
    selected_session_id = null;

    // RESETTING TABS
    resseting_functions = new Map();

    // project selection
    resseting_functions.set(0, function(){
        $('.tab-pane.active .js_next').addClass('disabled');

        $('#upload-project a.selected').removeClass('selected');
    
        $('#subject-session').html('');
        $('.project-subjects-holder').hide();
    });

    // browse files
    resseting_functions.set(1, function(){
        console.log('resseting values in tab 1');
        
        session_map.clear();
        selected_session_id = null;
        show_unable_to_set_session_label_warning = 0;
        
        $('#upload_folder, #file_upload_folder').val('');

        $('#upload_folder').closest('.tab-pane').find('.js_next').addClass('disabled');

        $('#dicom_parse_progress').hide().attr({
            value: 0,
            max: 100
        });

    });

    // date selection
    resseting_functions.set(2, function(){
        console.log('resseting values in tab 2')
        const $date_validation_field = $('#upload_session_date');

        $date_validation_field.val('').removeClass('is-valid is-invalid').prop('required', project_settings.require_date);

        const $next_button = $date_validation_field.closest('.tab-pane').find('.js_next');
        $next_button.toggleClass('disabled', project_settings.require_date); 
    });

    // Review and Verify
    resseting_functions.set(3, function(){
        console.log('resseting values in tab 3');

        $('#anon_variables').find(':input[required]').removeClass('is-invalid');

        $('#nav-verify').find('.js_next').addClass('disabled');
        $('#nav-verify').find('.js_upload').addClass('disabled').prop('disabled', true); 
    });

    // Visual PHI Check
    resseting_functions.set(4, function(){
        console.log('resseting values in tab 4');

        rectangle_state_registry = []; // reset rectangle_state_registry

        const element = $('#dicom_image_container').get(0);

        if (cornerstone_is_enabled(element)) {
            clear_all_states()
        }
        
        $('#nav-visual').find('.js_next').addClass('disabled');
    });

    // Summary
    resseting_functions.set(5, function(){
        summary_clear();
        console.log('resseting values in tab 5')
    });

    cornerston_initialize_main()

    initAnno();

    resetSubsequentTabs();
    _UI();
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

    $('#image_session').on('check.bs.table uncheck.bs.table check-all.bs.table uncheck-all.bs.table', async function (e) {
        let selected = $('#image_session').bootstrapTable('getSelections');

        let has_pt_scan = selected.reduce((total, row) => row.modality === 'PT' ? true : total, false);

        //$('#pet_tracer_container').toggle(has_pt_scan);
        $('#pet_tracer').prop('required', has_pt_scan).prop('disabled', !has_pt_scan);

        let custom_pt_required = has_pt_scan && $('#pet_tracer').val() === 'OTHER';
        $('#custom_pet_tracer').prop('required', custom_pt_required).prop('disabled', !custom_pt_required)
        
        if (has_pt_scan) {
            $('#pet_tracer').trigger('change');
        } else {
            await experiment_label();
        }
    })


    $img_session_tbl.bootstrapTable('resetView');
}

function _init_session_selection_table(tbl_data) {
    let $found_sessions_tbl = $('#found_sessions');

    destroyBootstrapTable($found_sessions_tbl);

    $found_sessions_tbl.bootstrapTable({
        height: tbl_data.length > 5 ? 250 : 0,
        columns: [
            {
                field: 'id',
                title: 'StudyInstanceUID',
                visible: false
            },
            {
                field: 'label',
                title: 'StudyID/UID',
                sortable: true,
                class: 'break-all'
            },
            {
                field: 'root_path',
                title: 'Root Path',
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
                field: 'action',
                title: 'Actions',
                class: 'action',
                formatter: function(value, row, index, field) {
                    return `
                    <button data-session_id="${row.id}" type="button" 
                        class="btn btn-blue btn-sm" 
                        style="margin: 2px 0;">Select</button>
                    
                    `;
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


// triggered when selected tab (#nav-verify) is displayed
$(document).on('shown.bs.tab', '#upload-section .nav-tabs a[href="#nav-verify"]', function(){
    validate_upload_form();
});


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


function cornerston_initialize_main() {
    cornerstoneTools.init({
        touchEnabled: false
    });

    const element = $('#dicom_image_container').get(0);

    cornerstone_enable_main_element(element); // before first load_dicom_image()
}

function cornerstone_enable_main_element(element) {
    if (constants.ALLOW_VISUAL_PHI_CHECK) {
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

        element.addEventListener("cornerstonetoolsmousewheel", handle_stack_scroll);
        //element.addEventListener("cornerstonetoolsstackscroll", handle_stack_scroll);
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

$(document).on('click', '#save-scan-btn', function(e) {
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


$(document).on('click', '#reset-scan-btn', function(e) {
    e.preventDefault()
    const element = $('#dicom_image_container').get(0);

    let toolState = cornerstoneTools.getToolState(element, 'RectangleOverlay')

    cornerstoneTools.clearToolState(element, 'RectangleOverlay')

    //cornerstone.updateImage(element)
    registry_remove_series_state(get_current_series_id());
    
    handle_stack_scroll({
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
    });
}

function display_series_thumb(series, index, cornerstone) {
    let element = cornerstone_enable_thumb_element();

    let imageId = `wadouri:http://localhost:7714/?path=${series.thumb_path}`;


    // load image
    cornerstone.loadAndCacheImage(imageId)
    .then((image) => {

        let viewport = cornerstone.getDefaultViewportForImage(element, image);
        cornerstone.displayImage(element, image, viewport);

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

            $('#series_thumbs li').eq(index).html($div);

            let rectangle_state = find_registry_state(series.series_id);
            
            if (rectangle_state && rectangle_state.rectangles.length) {
                $div.find('.green_mark').toggle(rectangle_state.saved) 
                $div.find('.yellow_mark').toggle(!rectangle_state.saved) 
            }

            cornerstone.disable(element);

            document.body.removeChild(element);
            element = null
        }, 100);
        
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

$(document).on('click', '#dicom_image_tools a', function(e){
    e.preventDefault();

    const element = $('#dicom_image_container').get(0);

    // disable current tool(s)
    $('#dicom_image_tools a.active').each(function() {
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



function get_series_files(series_id) {
    let files = [];
    let series_scans = session_map.get(selected_session_id).scans.get(series_id);
    console.log({series_scans});

    //series_scans.sort((a,b) => (a.filepath > b.filepath) ? 1 : ((b.filepath > a.filepath) ? -1 : 0));
    series_scans.sort((a,b) => a.filepath.localeCompare(b.filepath)); // TODO - TOOLS-524 (should sort by x00200013 ...)
     
    series_scans.forEach(function(scan) {
        files.push(scan.filepath);
    });

    console.log({files});
    return files;
}

function load_dicom_image(series_id) {
    const element = $('#dicom_image_container').get(0);

    let _files = get_series_files(series_id);
    //const imageIds = _files.map(file => `wadouri:http://localhost:7714/?path=${file}`);
    console.log({_files});
    let imageIds = [];
    const imageIdRoot = `wadouri:http://localhost:7714/?path=${_files[0]}`;
    const numFrames = 64;
    for (let i = 0; i < numFrames; i++) {
      let imageId = imageIdRoot + "&frame=" + i;
      imageIds.push(imageId);
    }

    //define the stack
    const stack = {
        currentImageIdIndex: 0,
        imageIds
    };

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
    });
}

function handle_stack_scroll(e) {
    console.log('STACK_SCROLL:', e)

    let series_id = get_current_series_id();
    let element = e.srcElement;

    /*
    let rectangle_state = find_registry_state(series_id);

    console.log({rectangle_state});

    if (rectangle_state !== undefined) {
        setTimeout(() => {
            cornerstoneTools.clearToolState(element, 'RectangleOverlay');
        
            rectangle_state.data.forEach(state => {
                // cornerstoneTools.addToolState(element, 'RectangleOverlay', state)
                add_tool_state(element, 'RectangleOverlay', state)
            });

            //window.dispatchEvent(new Event('resize'));
            //cornerstone.draw(element)
            cornerstone.updateImage(element)
        }, 20)
        
    } else {
        setTimeout(() => {
            cornerstoneTools.clearToolState(element, 'RectangleOverlay');
            cornerstone.updateImage(element)
        }, 20)
    }
    */

    setTimeout((series_id, element) => {
        let rectangle_state = find_registry_state(series_id);

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

    $('#upload_session_date')
        .attr('min', '1990-01-01')
        .attr('max', new Date().toISOString().split('T')[0])


    await _init_variables();

    $('#upload-section a[href="#nav-visual"]').toggleClass('hidden', !constants.ALLOW_VISUAL_PHI_CHECK);
    $('#nav-verify .js_next').toggleClass('hidden', !constants.ALLOW_VISUAL_PHI_CHECK);
    $('#nav-verify .js_upload').toggleClass('hidden', constants.ALLOW_VISUAL_PHI_CHECK);

    $('#upload-project').html('')

    
    set_date_tab(site_wide_settings.require_date)

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
        console.log('---', projects[i].id)
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
    resetSubsequentTabs();
    
    $('.tab-pane.active .js_next').addClass('disabled');
    
    $('#subject-session').html('');
    if ($('#upload-project a.selected').length === 0) {
        $('.project-subjects-holder').show();
    }

    $(this).closest('ul').find('a').removeClass('selected');
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

        //$('#file_upload_folder').prop('disabled', false).closest('.btn').removeClass('disabled')

        // -----------------------------------------------------
        // if needed - generate warning modal (about no anon script) and suppress warning logic
        suppress_anon_script_warning(scripts, xnat_server, project_id, user_settings)
        
    } catch (err) {
        handle_error(err)
        resseting_functions.get(0)();
    }

    // ******** HANDLE SUBJECTS **********
    project_settings.subjects.forEach(append_subject_row);
    select_link_for_item('subject-session', ['subject_label', 'subject_id'], 'subject_prm');

    // TODO - check if we need to take site-wide settings into consideration (site_wide_settings.allow_create_subject)
    $('button[data-target="#new-subject"]').prop('disabled', !project_settings.allow_create_subject);
    
    // ******** HANDLE REQUIRE DATE VALUE **********
    $('#upload_session_date').prop('required', project_settings.require_date);

    let next_button = $('#upload_session_date').closest('.tab-pane').find('.js_next');
    next_button.toggleClass('disabled', project_settings.require_date)
    set_date_tab(project_settings.require_date)
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
            $('#subject-session').html('');
            $('.project-subjects-holder').hide();

            $('#upload-project a.selected').removeClass('selected');
        }
    })
}

$(document).on('click', 'a[data-subject_id]', async function(e){
    resetSubsequentTabs();

    $(this).closest('ul').find('a').removeClass('selected');
    $(this).addClass('selected')

    // set Review data
    $('#var_subject').val(get_form_value('subject_id', 'subject_label'));
    
    let project_id = $('#var_project').val();
    let subject_id = $(this).data('subject_id');

    try {
        const xnat_api = new XNATAPI(xnat_server, user_auth)
        const sorted_visits = await xnat_api.project_subject_visits(project_id, subject_id)

        console.log({sorted_visits});

        $('#visit').html('');
        $('#var_visit').val('');
        $('#var_visit_label').val('');

        if (sorted_visits.length === 0) {
            $('.tab-pane.active .js_next').removeClass('disabled');
            $('.project-subject-visits-holder').hide();
        } else {
            $('.tab-pane.active .js_next').addClass('disabled');

            sorted_visits.forEach(append_visit_row);

            $('.project-subject-visits-holder').show();
            select_link_for_item('visit', ['visit_id'], 'visit_prm');
        }
        
    } catch(err) {
        handle_error(err)
    }

});

$(document).on('click', 'a[data-visit_id]', async function(e){
    resetSubsequentTabs();
    
    $(this).closest('ul').find('a').removeClass('selected');
    $(this).addClass('selected');

    let project_id = $('#var_project').val();
    let visit_id = $(this).data('visit_id');

    // set Review data
    $('#var_visit_label').val(get_form_value('visit_id', 'visit_label'));
    $('#var_visit').val(visit_id);

    try {
        const xnat_api = new XNATAPI(xnat_server, user_auth)
        const sorted_types = await xnat_api.project_visit_datatypes(project_id, visit_id)
        console.log({sorted_types});

        $('#datatype').html('');
        $('#var_datatype').val('');

        if (sorted_types.length === 0) {
            $('.datatypes-holder').hide();
            $('.tab-pane.active .js_next').addClass('disabled');
            swal({
                title: `Error`,
                text: `No datatypes for this visit`,
                icon: "error",
                dangerMode: true
            })
        } else {
            sorted_types.forEach(append_datatype_row);
            $('.datatypes-holder').show();

            select_link_for_item('datatype', ['datatype'], 'datatype_prm');
        }
        
    } catch(err) {
        handle_error(err)
    }
    
});

$(document).on('click', 'a[data-datatype]', async function(e){
    resetSubsequentTabs();
    
    $(this).closest('ul').find('a').removeClass('selected');
    $(this).addClass('selected')

    let project_id = $('#var_project').val();
    let visit_id   = $('#var_visit').val();
    let datatype   = $(this).data('datatype');

    $('#var_datatype').val(datatype);

    try {
        const xnat_api = new XNATAPI(xnat_server, user_auth)
        const subtypes = await xnat_api.project_visit_subtypes(project_id, visit_id, datatype)
        console.log({subtypes});

        $('#subtype').html('');
        $('#var_subtype').val('');

        if (subtypes.length === 0) {
            $('.subtypes-holder').hide();
            $('.tab-pane.active .js_next').removeClass('disabled');
        } else {
            $('.tab-pane.active .js_next').addClass('disabled');

            subtypes.forEach(append_subtype_row);
            $('.subtypes-holder').show();
            select_link_for_item('subtype', ['subtype'], 'subtype_prm');
        }
        
    } catch(err) {
        handle_error(err)
    }

});

$(document).on('click', 'a[data-subtype]', function(e){
    resetSubsequentTabs();
    
    $(this).closest('ul').find('a').removeClass('selected');
    $(this).addClass('selected')

    // set Review data
    $('#var_subtype').val(get_form_value('subtype', 'subtype'));

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

$(document).on('input', '#upload_session_date', function(e) {
    resetSubsequentTabs();

    const $date_field = $('#upload_session_date');

    console.log({
        selected_session: session_map.get(selected_session_id), 
        selected_session_date: session_map.get(selected_session_id).date,
        normalizeDateString_VALUE: normalizeDateString(session_map.get(selected_session_id).date),
        input_VALUE: $date_field.val()
    });

    const valid_date_value = this.validity.valid && $date_field.val() === normalizeDateString(session_map.get(selected_session_id).date)

    $date_field.toggleClass('is-invalid', !valid_date_value)
    $date_field.toggleClass('is-valid', valid_date_value)

    $('.tab-pane.active .js_next').toggleClass('disabled', !valid_date_value)
});

function validate_upload_form() {
    let required_input_error = false;

    let selected = $('#image_session').bootstrapTable('getSelections');
    let $required_inputs = $('#anon_variables').find(':input[required]');

    if ($('#experiment_label').hasClass('is-invalid')) {
        $('#experiment_label').focus();
        required_input_error = true;
    }

    $required_inputs.each(function(){
        if ($(this).val().trim() === '') {
            $(this).addClass('is-invalid');
            required_input_error = true;
        }
    });

    if (selected.length === 0) {
        required_input_error = true;
    }

    $('#nav-verify .js_next, #upload-section .js_upload').toggleClass('disabled', required_input_error);
    $('#upload-section .js_upload').prop('disabled', required_input_error);

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

$(document).on('click', '.js_upload', function() {
    let upload_form_error = validate_upload_form();

    if (!upload_form_error) {
        if (!valid_pixel_anon()) {
            swal({
                title: `Area Selection Error`,
                text: `All selected areas must be confirmed using "Save Scan" button.`,
                icon: "warning",
                dangerMode: true
            })

            return;
        }

        let selected_series_ids = get_selected_series_ids()
        
        let url_data = {
            expt_label: $('#experiment_label').val(),
            project_id: get_form_value('project_id', 'project_id'),
            subject_id: get_form_value('subject_id', 'subject_label')
        };

        let visit_id = $('#var_visit').val();
        if (visit_id) {
            url_data['visit_id'] = visit_id;
        }
        
        let subtype = $('#var_subtype').val();
        if (subtype) {
            url_data['subtype'] = subtype;
        }

        let my_anon_variables = {};

        console.log('++++++++++++++', project_settings.computed.anon_variables);
        

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

        console.log({my_anon_variables});
        //doUpload(url_data, selected_session_id, selected_series_ids);
        storeUpload(url_data, selected_session_id, selected_series_ids, my_anon_variables);

    } else {
        swal({
            title: `Form Error`,
            text: `Please select at least one scan series and enter all variable value(s)`,
            icon: "warning",
            dangerMode: true
        })
    }

});

$(document).on('input', '#anon_variables :input[required]', function(e){
    $(this).removeClass('is-invalid');
    validate_upload_form();
});

$(document).on('change click', '#upload-section #nav-verify .bs-checkbox :checkbox', function(e) {
    resetSubsequentTabs();
    validate_upload_form();
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

$(document).on('change', '#pet_tracer', async function(e) {
    let custom_pt_required = $(this).val() === 'OTHER';
    
    $('#custom_pet_tracer').prop('required', custom_pt_required).prop('disabled', !custom_pt_required).toggleClass('hidden', !custom_pt_required);

    if (custom_pt_required) {
        $('#custom_pet_tracer').focus();
    }

    await experiment_label()
    validate_upload_form()    
})

$(document).on('keyup', '#custom_pet_tracer', async function(e) {
    await experiment_label()
    validate_upload_form() 
})

$(document).on('keyup', '#custom_pet_tracer', async function(e) {
    await experiment_label();
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
            const csrfToken = await auth.get_csrf_token(xnat_server, user_auth)

            const xnat_api = new XNATAPI(xnat_server, user_auth)

            const new_subject_res = await xnat_api.create_project_subject(project_id, subject_label, group, csrfToken)
            console.log({promise_create_project_subject: new_subject_res})

            project_settings.subjects = await xnat_api.project_subjects(project_id)

            append_subject_row({
                ID: new_subject_res.data,
                URI: '/data/subjects/' + new_subject_res.data,
                insert_date: '',
                label: subject_label,
                group: group
            });

            $('#subject-session li:last-child a').trigger('click');

            $('#new-subject').modal('hide');
        } catch(err) {
            handle_error(err)
        }

        Helper.unblockModal(modal_id);
        $form.data('processing', false);
    }
    
});

$(document).on('click', '.js_cancel_session_selection', function(){
    resetSubsequentTabs();
    //resetTabsAfter($('#upload-section #nav-tab .nav-link.active').index() - 1)
    resseting_functions.get(1)();
});

$(document).on('hidden.bs.modal', '#session-selection', function(e) {
    console.log(`**** selected_session_id: ${selected_session_id} *****`);
    if (selected_session_id) {
        $('.tab-pane.active .js_next').trigger('click');
    }
});

async function select_session_id(new_session_id) {
    selected_session_id = new_session_id;
    
    console.log('******************************************');
    console.log('anon_variables', project_settings.computed.anon_variables);
    console.log('******************************************');

    $('#additional-upload-fields').html('');
    Object.keys(project_settings.computed.anon_variables).forEach(key => {
        if (key == 'project' || key == 'subject' || key == 'session' || key == 'visit' || key == 'subtype') {
            return;
        }
        let key_cap = Helper.capitalizeFirstLetter(key);
        let field_text = '';
        let field_value = project_settings.computed.anon_variables[key];

        $('#additional-upload-fields').append(`
        <div class="form-group row">
            <label for="var_${key}" class="col-sm-2 col-form-label"><b>${key_cap}</b>:</label>
            <div class="input-group col-sm-10">
                <input class="form-control" type="text" name="${key}" id="var_${key}" value="${field_value}" required>
                ${field_text}
            </div>
        </div>
        `);
        console.log('$$$$ ' + key + ' => ' + project_settings.computed.anon_variables[key]);
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

    console.log(selected_session.studyDescription);
    console.log(selected_session.modality);
    console.log(selected_session.studyInstanceUid);

    if (selected_session.date) {
        $('#image_session_date').html(selected_session.date);
    }

    await experiment_label();

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
        let subtype = $('#var_subtype').val();
        let pet_tracer_options = project_settings.computed.pet_tracers.map(function(el) {
            let selected = (subtype && el == subtype) ? ' selected="selected"' : '';
            return `<option value="${el}" ${selected}>${el}</option>`;
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

        $('#pet_tracer').trigger('change');

    }

    $('.tab-pane.active .js_next').removeClass('disabled');
}

$(document).on('click', 'button[data-session_id]', function(e){
    select_session_id($(this).data('session_id'));
    $('#session-selection').modal('hide');
});

function get_form_value(field, data) {
    return $(`a[data-${field}].selected`).data(data);
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
                let folder_size = (size / 1024 / 1024).toFixed(2);
                console.log('--->', pth, folder_size + ' MB');
                resolve(Math.round(size / 1024 / 1024));
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

                            const NumberOfFrames = parseInt(dicom.string('x00280008'));
                            const InstanceNumber = parseInt(dicom.string('x00200013'));
                            console.log({NumberOfFrames, InstanceNumber});
                            // ++++
                
    
                            if (!session_map.has(studyInstanceUid)) {
                                session_map.set(studyInstanceUid, {
                                    studyId: studyId,
                                    studyInstanceUid: studyInstanceUid,
                                    studyDescription: studyDescription,
                                    modality: [],
                                    accession: accession,
                                    date: study_date,
                                    time: study_time,
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
                                    frames: NumberOfFrames,
                                    order: InstanceNumber,
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
                resetSubsequentTabs();
                resseting_functions.get(1)();
                
                    swal({
                    title: 'No DICOM files',
                    text: 'No DICOM files were found inside selected folder. Please choose another folder.',
                    icon: "warning",
                    dangerMode: true
                })


                break;
            
            case 1:
                let my_session_id;
                session_map.forEach(function(cur_session, key) {
                    my_session_id = key
                });

                select_session_id(my_session_id);
                $('#nav-verify').find('.js_upload').removeClass('disabled').prop('disabled', false);
                setTimeout(function() {
                    $('.tab-pane.active .js_next').trigger('click');
                }, 500)

                break;

            default:
                let tbl_data = [];
                session_map.forEach(function(cur_session, key) {
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

                    let session_data = {
                        id: key,
                        label: session_label,
                        root_path: root_path + find_common_path(paths),
                        scan_count: cur_session.scans.size,
                        action: ''
                    }

                    tbl_data.push(session_data);
                });

                $('#nav-verify').find('.js_upload').removeClass('disabled').prop('disabled', false);
                _init_session_selection_table(tbl_data);
                $('#session-selection').modal('show');
        }

        $.unblockUI();

    };


    $.queuer.add(handle_results, this);

    $.queuer.add(function(){
        console.log(session_map);
        
    }, this);

}

async function experiment_label() {
    let XXX_modality = full_modality = '';
    let subject_label = '' + $('a[data-subject_id].selected').data('subject_label'); // always cast as string

    let selected = $('#image_session').bootstrapTable('getSelections');

    let pet_tracer = $('#pet_tracer').length ? $('#pet_tracer').val() : '';
    let custom_pet_tracer = ('' + $('#custom_pet_tracer').val()).trim().split(' ').join('_');

    console.log({pet_tracer: pet_tracer});


    let upload_modalities_index = selected.reduce((allModalities, row) => {
        if (constants.PRIMARY_MODALITIES.indexOf(row.modality) !== -1) {
            if (allModalities.hasOwnProperty(row.modality)) {
                allModalities[row.modality]++;
            } else {
                allModalities[row.modality] = 1;
                full_modality += row.modality;
            }
        }
        
        return allModalities;
    }, {});

    let selected_modality = get_form_value('datatype', 'modality');
    
    if (selected_modality && selected_modality != full_modality && selected.length) {
        swal({
            title: "Mismatched modality",
            text: `You are trying to upload ${full_modality} data after indicating that you were going to upload ${selected_modality} data.`,
            icon: "error",
            button: "Okay",
        }).then(proceed => {
            resetSubsequentTabs();
            resseting_functions.get(1)();
            resseting_functions.get(3)();
            $('a[href="#nav-project"]').click();
        });
        return;
    }

    let upload_modalities = Object.keys(upload_modalities_index);


    if (upload_modalities.indexOf('PT') >= 0) {
        XXX_modality = pet_tracer === 'OTHER' ? custom_pet_tracer : pet_tracer;
    } else if (upload_modalities.length == 1) {
        XXX_modality = upload_modalities[0];
    } else {
        //remove OT from upload_modalities_index
        delete upload_modalities_index['OT'];

        // chose most frequent modality (with most series)
        let greatest_mod_value = 0;
        for (let mod in upload_modalities_index) {
            if (upload_modalities_index[mod] > greatest_mod_value) {
                greatest_mod_value = upload_modalities_index[mod]
                XXX_modality = mod
            }
        }
    }

    console.log({selected_modality, upload_modalities, pet_tracer, modality: XXX_modality, full_modality, upload_modalities_index});

    let project_id = $('#var_project').val();
    let subject_id = get_form_value('subject_id', 'subject_id');
    let visit_id = $('#var_visit').val();
    let subtype = $('#var_subtype').val();
    let session_date = $('#image_session_date').text();

    function update_experiment_label(expt_label) {
        console.log('EXPT_LABEL_NEW', expt_label);
        $('#experiment_label').val(expt_label);
    }

    function default_set_experiment_label() {
        let expt_label = subject_label.split(' ').join('_') + '_' + XXX_modality + '_';
        console.log({expt_label0: expt_label});
        for (let i = 1; i < 100000; i++) {
            let my_expt_label = expt_label + i;
            if (project_settings.computed.experiment_labels.indexOf(my_expt_label) === -1) {
                expt_label = my_expt_label;
                break;
            }
        }
        console.log({expt_label1: expt_label});
        update_experiment_label(expt_label);
    }

    try {
        const xnat_api = new XNATAPI(xnat_server, user_auth)
        const expt_label = await xnat_api.project_experiment_label(project_id, subject_id, visit_id, subtype, session_date, full_modality)

        console.log({expt_label2: expt_label});

        if (!expt_label) {
            default_set_experiment_label();
        } else {
            update_experiment_label(expt_label);
        }
        
    } catch (err) {
        if (err.response && err.response.status === 400) {
            default_set_experiment_label();

            if (show_unable_to_set_session_label_warning === 0) {
                show_unable_to_set_session_label_warning++
                swal({
                    title: `Warning: unable to set session label per project protocol labeling template`,
                    text: 'Unable to set session label per protocol template: ' + err.response.data + '. Reverting to default labeling.',
                    icon: "warning",
                    button: 'OK',
                    dangerMode: true
                })
            }
            
        } else {
            default_set_experiment_label();
        }
    }

}


function storeUpload(url_data, session_id, series_ids, _anon_variables) {
    console.log('==== anon_variables ====', _anon_variables);
    
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

    let studyDate = selected_session.date ? 
        selected_session.date.substr(0, 4) + '-' +
        selected_session.date.substr(4, 2) + '-' +
        selected_session.date.substr(6, 2) : '';
    
    let studyTime = selected_session.time ? 
        selected_session.time.substr(0, 2) + ':' +
        selected_session.time.substr(2, 2) + ':' +
        selected_session.time.substr(4, 2) : '';

    let pixel_anon_data = []
    rectangle_state_registry.forEach((state) => {
        pixel_anon_data.push({
            series_id: state.series_id,
            rectangles: state.rectangles
        })
    })
    

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
    
    db_uploads().insert(upload_digest, (err, newItem) => {
        if (err) {
            console.log(err)
        }
        console.log({newItem});

        update_recent_projects(project_id)
    })
    

    ipc.send('start_upload');
    
    ipc.send('redirect', 'progress.html');

    setTimeout(function(){
        $('#nav-upload-tab').trigger('click');
    }, 40);
    
}

function update_recent_projects(project_id) {
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

function append_subject_row(subject){
    let group_tag = subject.group ? `${subject.group}` : `/`
    $('#subject-session').append(`
        <li>
            <a href="javascript:void(0)" 
                data-subject_uri="${subject.URI}"
                data-subject_insert_date="${subject.insert_date}"
                data-subject_label="${subject.label}"
                data-subject_id="${subject.ID}">
                ${subject.label} <span class="meta_key">ID: ${subject.ID}</span>
                <span class="meta_value">Group: ${group_tag}</span>
            </a>
        </li>
    `)
}

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

ipc.on('launch_upload', function(e, data){
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
