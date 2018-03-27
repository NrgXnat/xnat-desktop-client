const fs = require('fs');
const path = require('path');
const dicomParser = require('dicom-parser');
const loki = require('lokijs');
const getSize = require('get-folder-size');
const axios = require('axios');
const settings = require('electron-settings');
const ipc = require('electron').ipcRenderer;
const swal = require('sweetalert');
const archiver = require('archiver');
const mime = require('mime-types');

const NProgress = require('nprogress');

$.fn.redraw = function () {
    $(this).each(function () {
        var redraw = this.offsetHeight;
    });
};

NProgress.configure({ 
    trickle: false,
    easing: 'ease',
    speed: 1,
    minimum: 0.03
});


const db = new loki('xnat_dc.json');
const studies = db.addCollection('studies', {'unique': ['studyInstanceUid'], 'autoupdate': true});


let default_project_settings;




if (!settings.has('user_auth') || !settings.has('xnat_server')) {
    ipc.send('redirect', 'login.html');
} else {
    xnat_server = settings.get('xnat_server');
    user_auth = settings.get('user_auth');

    $(document).on('page:load', '#upload-section', function(e){
        console.log('Upload page:load triggered');


        default_project_settings = {
            allow_create_subject: true,
            require_date: false
        };

        global_allow_create_subject().then(handle_create_subject_response).catch(handle_error);
        global_require_date().then(handle_require_date).catch(handle_error);


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

                // for (let i = 0, len = projects.length; i < len; i++) {
                //     console.log('---', projects[i].id)
                //     $('#upload-project').append(`
                //         <li><a href="javascript:void(0)" data-project_id="${projects[i].ID}">${projects[i].name} [ID:${projects[i].ID}]</a></li>
                //     `)
                // }

                
                // projects.forEach(function(project){
                //     $('#upload-project').append(`
                //         <li><a href="javascript:void(0)" data-project_id="${project.ID}">${project.name} [ID:${project.ID}]</a></li>
                //     `)
                // })
                //console.log(resp.data.ResultSet.Result)
            })
            .catch(function(err) {
                console.log(err.message);
            })
        

        $('#upload_session_date')
            .attr('min', '1990-01-01')
            .attr('max', new Date().toISOString().split('T')[0])

            
    });

    let setInte;
    $(document).on('click', 'a[data-project_id]', function(e){
        
        $('#subject-session').html('');
        $('.tab-pane.active .js_next').addClass('disabled');

        $(this).closest('ul').find('a').removeClass('selected');
        $(this).addClass('selected')
        let project_id = $(this).data('project_id')

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
                console.log('-----------------------------------------------------------');
            })
            .catch(handle_error);
    });

    $(document).on('click', 'a[data-subject_id]', function(e){
        $(this).closest('ul').find('a').removeClass('selected');
        $(this).addClass('selected')
        
        $('.tab-pane.active .js_next').removeClass('disabled');
        
    });

    $(document).on('click', '.js_next:not(.disabled)', function() {
        let active_tab_index = $('.nav-item').index($('.nav-item.active'));
        $('.nav-item').eq(active_tab_index + 1).removeClass('disabled').trigger('click');
        setTimeout(function() {
            //swal('Disabling NEXT button');
            $('.tab-pane.active .js_next').addClass('disabled');
        }, 100)
    })

    
    $(document).on('click', '.js_prev', function() {
        let active_tab_index = $('.nav-item').index($('.nav-item.active'));
        $('.nav-item').eq(active_tab_index - 1).trigger('click');

    })

    let _files = [];
    $(document).on('change', '#file_upload_folder', function(e) {
        console.log(this.files.length);
        
        
        if (this.files.length) {
            $('#upload_folder').val(this.files[0].path);
            $('.tab-pane.active .js_next').removeClass('disabled');


            $('#table1 tbody').html('');

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

                                dicomParse(_files)
                                //generate_dicom_html(pth);
                            } else {
                                $('#upload_folder, #file_upload_folder').val('');
                            }
                        });
                    } else {
                        _files = walkSync(pth);
                        console.log(_files);

                        setTimeout(function() {
                            dicomParse(_files)
                        }, 0)
                        //dicomParse(_files)
                        //generate_dicom_html(pth);
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
    })

    $(document).on('click', '#test-upload', function () {
        let project_id = $('a[data-project_id].selected').data('project_id');
        let subject_id = $('a[data-subject_id].selected').data('subject_id');
        let expt_label = project_id + '__' + subject_id + '___2003';


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

                //saveStudy(studyInstanceUid, studyDescription, sourceFolder, seriesNumber, seriesInstanceUid, seriesDescription, file);
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
                        url: xnat_server + `/data/services/import?import-handler=DICOM-zip&PROJECT_ID=${project_id}&SUBJECT_ID=${subject_id}&EXPT_LABEL=${expt_label}&rename=true&prevent_anon=true&prevent_auto_commit=true&SOURCE=uploader&autoArchive=AutoArchive`,
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

                            let commit_url = xnat_server + $.trim(res.data) + '?action=commit&SOURCE=uploader';
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


    })


    $(document).on('input', '#upload_session_date', function(e) {
        if (this.validity.valid) {
            console.log('Valid')
            $('.tab-pane.active .js_next').removeClass('disabled');
        } else {
            console.log('INVALID')
            $('.tab-pane.active .js_next').addClass('disabled');
        }
    })
    
}

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
    let session_map = new Map();
    let series = [];

    
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
                            
                            const seriesDescription = dicom.string('x0008103e');
                            const seriesInstanceUid = dicom.string('x0020000e');
                            const seriesNumber = dicom.string('x00200011');
                            // ++++
                            const modality = dicom.string('x00080060');
                            // ++++
                
    
                            if (!session_map.has(studyInstanceUid)) {
                                session_map.set(studyInstanceUid, {
                                    studyInstanceUid: studyInstanceUid,
                                    studyDescription: studyDescription,
                                    modality: modality,
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
    
    // first version
    if (false) {

        for (let i = 0; i < _files.length; i++) {
            let file = _files[i];
            displayMessage(`---Reading file ${file}:`);

            let parse_single_file = function() {
                try {
                    const dicomFile = fs.readFileSync(file);
                    const dicom = dicomParser.parseDicom(dicomFile, { untilTag: '0x00324000' });           
                    
                    const studyInstanceUid = dicom.string('x0020000d');
                    
                    if (typeof studyInstanceUid !== 'undefined') {
                        const studyDescription = dicom.string('x00081030');
                        
                        const seriesDescription = dicom.string('x0008103e');
                        const seriesInstanceUid = dicom.string('x0020000e');
                        const seriesNumber = dicom.string('x00200011');
            
                        // ++++
                        const modality = dicom.string('x00080060');
                        // ++++
            
                        /*
                        dicoms.push({
                            filepath: file,
                            filename: path.basename(file),
                            studyInstanceUid: studyInstanceUid,
                            studyDescription: studyDescription,
                            seriesDescription: seriesDescription,
                            seriesInstanceUid: seriesInstanceUid,
                            seriesNumber: seriesNumber,
                            modality: modality
                        });
            
                        if ($.inArray(studyInstanceUid, sessions) === -1) {
                            sessions.push(studyInstanceUid)
                        }
            
                        if ($.inArray(seriesInstanceUid, series) === -1) {
                            series.push(seriesInstanceUid)
                        }
        
                        */
            
            
                        if (!session_map.has(studyInstanceUid)) {
                            session_map.set(studyInstanceUid, {
                                studyInstanceUid: studyInstanceUid,
                                studyDescription: studyDescription,
                                modality: modality,
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
                    
        
        
                    //console.log(`studyDescription: "${studyDescription}"`, `studyInstanceUid: ${studyInstanceUid}`, `modality: ${modality}`);
                    //saveStudy(studyInstanceUid, studyDescription, sourceFolder, seriesNumber, seriesInstanceUid, seriesDescription, file);
                } catch (error) {
                    handleError(`There was an error processing the file ${file}`, error);
                    errors++;
                }
            };

            let show_progress = function() {
                let progress = parseFloat((i/_files.length).toFixed(2)) - 0.01;

                if (progress > current_progress) {
                    NProgress.set(progress);
                    current_progress = progress;
                    console.log('current_progress: ' + current_progress);
                }
        
                $progress_bar.attr('value', i + 1);
            };

            // parse_single_file();
            // show_progress();
            $.queue.add(parse_single_file, this);
            $.queue.add(show_progress, this);
    
        }

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
                let $content = $('<ol style="text-align: left;">');
                session_map.forEach(function(cur_session, key) {
                    let session_label = cur_session.studyDescription === undefined ? key : cur_session.studyDescription;
                    $content.append(`<li>
                        ${session_label} 
                        [scans: ${cur_session.scans.size}]
                        <button data-session_id="${key}" type="button" class="btn btn-primary btn-sm" style="margin: 2px 0;">Select</button>
                        </li>`);
                });

                console.log($content.find('li').length);
                

                swal({
                    html: true,
                    title: `Please select one session. <br><small>Found sessions: ${session_map.size}.</small>`,
                    content: $content.get(0)
                })
                //break;
            //default: // more than 1
        }

    };

    // for testing only - skipping 
    $.queue.add(handle_results, this);

}

$(document).on('click', 'button[data-session_id]', function(e){
    alert($(this).data('session_id'));
});

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

function generate_dicom_html(pth) {
    fs.readdir(pth, (err, files) => {
        'use strict';
        //if (err) throw err;

        console.log(files.length, files);

        if (files.length) {
            
            let i = 0
            for (let file of files) {
                let theID = `${pth}/${file}`;
                i++;

                fs.stat(theID, (err, stats) => {
                    //console.log(stats);
                    if (err) {
                        //throw err;
                    }
                    else if (stats.isDirectory()) {
                        
                        
                        getSize(theID, function(err, size) {
                            if (err) { 
                                //throw err; 
                            }
                            let folder_size = (size / 1024 / 1024).toFixed(2);
                            console.log(theID, folder_size + ' MB');

                            fs.readdir(theID, (err, files) => {
                                let files_count = files.length;

                                $('#table1 tbody').append(`
                                <tr data-index="${i}">
                                    <td class="bs-checkbox "><input data-index="${i}" name="btSelectItem_${i}" type="checkbox"></td>
                                    <td style=""><div class="folder-name">${file}</div></td>
                                    <td style="">
                                    <div class="quality-holder">
                                        <select name="quality_${i}">
                                            <option value="" disabled="" selected="">Quality label</option>
                                            <option value="Excellent">Excellent</option>
                                            <option value="Good">Good</option>
                                            <option value="Medium">Medium</option>
                                            <option value="Bad">Bad</option>
                                        </select>
                                    </div>
                                    </td>
                                    <td style="text-align: center; "><button class="btn btn-blue" type="button" data-toggle="modal" data-target="#note">Edit note</button></td>
                                    <td style="">${files_count}</td>
                                    <td style="">${folder_size} MB</td>
                                </tr>

                                `)
                            })

                            
                        });
                        
                    }
                    else {
                        $('#upload_folder').closest('div').append(`<p style="width: 100%">FILE: ${file}</p><hr>`)
                    }

                });
            }
            
        }
        else {
            swal('Empty Folder')
        }
    });

}

let file_size = 0, file_count = 0;
function get_file_size_and_count(pth) {
    

    fs.readdir(pth, (err, files) => {
        'use strict';

        if (files.length) {
            for (let file of files) {
                let file_path = `${pth}${file}`;
                console.log(file_path)
                fs.stat(file_path, (err, stats) => {
                    if (err) {
                        //throw err;
                        console.error(err)
                    }
                    else if (stats.isDirectory()) {
                        
                        let all_files = get_file_size_and_count(file_path)

                        file_size += all_files.file_size;
                        file_count +=  all_files.file_count;
                    }
                    else {
                        file_size += stats.size;
                        file_count++;
                    }

                });
            }
            
        }

        return {
            file_size: file_size,
            file_count: file_count
        }

    });

    
}

function append_subject_row(subject){
    $('#subject-session').append(`
        <li>
            <a href="javascript:void(0)" 
                data-subject_uri="${subject.URI}"
                data-subject_insert_date="${subject.insert_date}"
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

const handle_require_date = (res) => {
    console.log( '===========', typeof res.data, '===========');
    let require_date = (typeof res.data === 'boolean') ? res.data : (res.data.toLowerCase() !== 'false' && res.data !== '');
    console.log('require_date:', require_date, `(${res.data})`);
    $('#upload_session_date').prop('required', require_date);
};

const handle_error = (err) => {
    console.log(err)
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

function promise_create_project_subject(project_id, subject_label, group) {
    return axios.put(xnat_server + '/data/projects/' + project_id + '/subjects/' + subject_label + '?group=' + group + '&event_reason=XNAT+Application', {
        auth: user_auth
    })
}


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
    }

});


$(document).on('submit', '#form_new_subject', function(e) {
    e.preventDefault();
    //$('#login_feedback').addClass('hidden')

    let project_id, subject_label, group;

    project_id = $('#form_new_subject input[name=project_id]').val();
    subject_label = $('#form_new_subject input[name=subject_label]').val();
    group = $('#form_new_subject input[name=group]').val();

    promise_create_project_subject(project_id, subject_label, group)
        .then(res => {           
            console.log(res);

            /*
            promise_project_subject(project_id, subject_label)
                .then(res => {
                    console.log(res, res.data.items[0].data_fields);
                    append_subject_row(res.data.items[0].data_fields)
                })
            */
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
        .catch(err => {
            console.log(err)
        });
})

function get_projects() {
    axios.get(xnat_server + '/data/projects', {
        auth: user_auth
    })
    .then(res => {
        const projects = res.data.ResultSet.Result;

        console.log('Projects', projects);

        projects.forEach(function(project) {
            console.log(project);
            let li = document.createElement('li');
            li.innerHTML = project.name + '<br>(ID: ' + project.ID + ')';
            document.getElementById('projects').appendChild(li);
        });

        if (projects.length) {
            document.getElementById('subject_data').innerHTML = '<i class="fa fa-spinner fa-spin"></i> Loading subject data...';

            axios.get(xnat_server + '/data/projects/' + projects[0].ID + '/subjects', {
                auth: user_auth
            })
            .then(res => {
                console.log('First Subject', res.data.ResultSet.Result[0]);
                let total_subjects_text = '<b>Total subjects: ' + res.data.ResultSet.Result.length + '</b><br>';
                document.getElementById('subject_data').innerHTML = total_subjects_text + 'First Subject data:<br>' + JSON.stringify(res.data.ResultSet.Result[0]);
            })
            .catch(err => {
                console.log(err)
            });
        } else {
            let text = document.createTextNode('No projects with read permissions')
            document.getElementById('output').appendChild(text);
        }

        
    })
    .catch(err => {
        console.log(err)
    });
}



/**
 * Indicates whether the particular study instance UID exists in the database.
 *
 * @param studyInstanceUid The study instance UID to search for.
 * @returns {boolean}
 */
const hasStudy = (studyInstanceUid) => {
    return getStudyCount(studyInstanceUid) > 0;
};



/**
 * Returns the number of studies in the database. If a study instance UID is specified, the result will be either 0 or
 * 1. This is used by the {@link #hasStudy()} method.
 *
 * @param studyInstanceUid An optional study instance UID.
 *
 * @returns {int}
 */
const getStudyCount = (studyInstanceUid = '') => {
    return studyInstanceUid ? studies.count({'studyInstanceUid': studyInstanceUid}) : studies.count();
};


/**
 * Returns all file paths stored in the database. If one or more study instance UIDs is specified, only file paths
 * associated with those sessions are returned.
 *
 * @param studyInstanceUids One or more study instance UIDs (optional).
 */
const getFilePaths = (studyInstanceUids = []) => {
    // Base query on whether or not we got any studies.
    let results = studyInstanceUids.length > 0 ? studies.find({'studyInstanceUid': {'$in': studyInstanceUids}}) : studies.find();
    return results.map(study => study.series)
        .map(series => Object.values(series))
        .reduce((acc, cur) => acc.concat(cur), [])
        .reduce((acc, cur) => acc.concat(cur.files), []);
};

const saveStudy = (studyInstanceUid, studyDescription, sourceFolder, seriesNumber, seriesInstanceUid, seriesDescription, file) => {
    displayMessage(`Saving study ${studyDescription} series ${seriesNumber}: ${seriesDescription}`);
    const study = getOrCreateStudy(studyInstanceUid, studyDescription, sourceFolder);
    const series = study['series'];
    const relative = path.relative(sourceFolder, file);
    if (!(seriesNumber in series)) {
        series[seriesNumber] = {
            'seriesNumber': seriesNumber,
            'seriesInstanceUid': seriesInstanceUid,
            'seriesDescription': seriesDescription,
            'files': [relative]
        };
    } else {
        series[seriesNumber].files.push(relative);
    }

    // Don't need to do explicit update if we have the study already because autoupdate is on.
    if (!hasStudy(studyInstanceUid)) {
        studies.insert(study);
    }
};

const getOrCreateStudy = (studyInstanceUid, studyDescription, sourceFolder) => {
    const existing = studies.findOne({'studyInstanceUid': studyInstanceUid});
    return existing || {
        'studyInstanceUid': studyInstanceUid,
        'studyDescription': studyDescription,
        'sourceFolder': sourceFolder,
        'series': new Map()
    };
};


const renderStudies = () => {
    try {
        sessions.innerHTML = hasStudies() ? studies.find().map(convertToElement).join('') : '(no sessions found)';
        if (hasStudies) {
            sessions.classList.remove('none');
        } else {
            sessions.classList.add('none');
        }
        displayMessage('');
        clearSessionsButton.disabled = !hasStudies;
    } catch (error) {
        displayMessage("There was an error trying to render the studies list || " + JSON.stringify(error), true);
    }
};

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


const clearStudies = () => {
    studies.clear();
}