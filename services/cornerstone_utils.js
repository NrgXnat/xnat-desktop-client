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


const {
    ALLOW_VISUAL_PHI_CHECK,
    BULK_IMAGE_ANONYMIZATION
} = require('./constants')



function cornerston_initialize_main(element) {
    if (ALLOW_VISUAL_PHI_CHECK) {
        cornerstoneTools.init({
            touchEnabled: false
        });

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

function cornerstone_enable_thumb_element() {
    let element = document.createElement('div');

    element.style.cssText = "width: 150px; height: 150px; position: absolute; left: -300px; top: 0;";
    document.body.appendChild(element);

    cornerstone.enable(element);

    cornerstoneTools.addToolForElement(element, cornerstoneTools.RectangleOverlayTool);
    cornerstoneTools.setToolActiveForElement(element, "RectangleOverlay", {mouseButtonMask: 1});

    return element;
}

function cornerstone_enable_small_thumb_element(width = 70, height = 70) {
    let element = document.createElement('div');

    element.style.cssText = `width: ${width}px; height: ${height}px; position: absolute; left: -3000px; top: 0;`;
    document.body.appendChild(element);

    cornerstone.enable(element);

    //cornerstoneTools.addToolForElement(element, cornerstoneTools.RectangleOverlayTool);
    //cornerstoneTools.setToolActiveForElement(element, "RectangleOverlay", {mouseButtonMask: 1});

    return element;
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

            // TODO: FIX THIS ABOMINATION
            //$('#create-masking-template #series_thumbs li').eq(index).html($div);
            $$('#series_thumbs li').eq(index).html($div);

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

function load_dicom_image(series_id, session_id, cs_element = false) {
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


// =============== cornerstoneTools
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
