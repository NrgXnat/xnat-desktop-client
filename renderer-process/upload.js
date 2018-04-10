const fs = require('fs');
const path = require('path');
const dicomParser = require('dicom-parser');
const getSize = require('get-folder-size');
const axios = require('axios');
const settings = require('electron-settings');
const ipc = require('electron').ipcRenderer;
const swal = require('sweetalert');
const archiver = require('archiver');
const mime = require('mime-types');

const remote = require('electron').remote;
const mainProcess = remote.require('./main.js');

const NProgress = require('nprogress');
NProgress.configure({ 
    trickle: false,
    easing: 'ease',
    speed: 1,
    minimum: 0.03
});


let xnat_server, user_auth, session_map, selected_session_id, global_anon_script, defined_project_exp_labels, resseting_functions;
let global_date_required, date_required, project_anon_script;

function _init_variables() {
    xnat_server = settings.get('xnat_server');
    user_auth = settings.get('user_auth');
    
    console.log('----------------------------------------------------');
    console.log(xnat_server);
    console.log(user_auth);
    console.log('----------------------------------------------------');


    session_map = new Map();
    selected_session_id = null;
    
    global_anon_script = '(0008,0070) := "Electron changed this"';

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

        $('#upload_session_date').val('')

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

}





if (!settings.has('user_auth') || !settings.has('xnat_server')) {
    ipc.send('redirect', 'login.html');
    return;
}


$(document).on('page:load', '#upload-section', function(e){
    console.log('Upload page:load triggered');
    
    _init_variables();
    resetSubsequentTabs();
    


    global_allow_create_subject().then(handle_create_subject_response).catch(handle_error);
    global_require_date().then(handle_global_require_date).catch(handle_error);

    /*
    get_global_anon_script().then(resp => {
        global_anon_script = resp.data.ResultSet.Result[0].contents;
        console.log(resp.data.ResultSet.Result[0].contents);
    }).catch(handle_error);
    */
    


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

$(document).on('click', 'a[data-project_id]', function(e){
    resetSubsequentTabs();
    
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

    /*
    get_project_anon_script(project_id).then(resp => {
        project_anon_script = resp.data.ResultSet.Result[0].contents;
        console.log(resp.data.ResultSet.Result[0].contents);
    }).catch(handle_error);
    */

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

                            dicomParse(_files);
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
    let selected = $('#table1').bootstrapTable('getSelections');
    if (selected.length) {
        let selected_series = selected.map(function(item){
            return item.series_id;
        });
        
        let expt_label_val = $('#experiment_label').val();

        let url_data = {
            expt_label: expt_label_val ? expt_label_val : get_default_expt_label(),
            project_id: $('a[data-project_id].selected').data('project_id'),
            subject_id: $('a[data-subject_id].selected').data('subject_id')
        };
        doUpload(url_data, selected_session_id, selected_series);

    } else {
        swal({
            title: `Selection error`,
            text: `You must select at least one scan series`,
            icon: "warning",
            dangerMode: true
        })
    }
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
});

$(document).on('click', 'button[data-session_id]', function(e){
    $('.tab-pane.active .js_next').removeClass('disabled');
    selected_session_id = $(this).data('session_id');

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

        table_rows.push({
            select: false,
            series_id: key,
            description: scans_description,
            count: scan.length,
            size: `${(scan_size / 1024 / 1024).toFixed(2)}MB`
        })
        
    });

    console.log('-----------------------------------------------------------');
    
    console.log(table_rows);
    console.log('-----------------------------------------------------------');

    //$('#table1').bootstrapTable('resetView');
    $('#table1')
    .bootstrapTable('removeAll')    
    .bootstrapTable('append', table_rows)
    .bootstrapTable('resetView');

    console.log(selected_session.studyDescription);
    console.log(selected_session.modality);
    console.log(selected_session.studyInstanceUid);

    let expt_label = get_default_expt_label();
    
    $('#experiment_label').val(expt_label);
    
    $('#session_info').html('')
    .append(`Accession: ${selected_session.accession}<br>`)
    .append('Description: ' + selected_session.studyDescription + '<br>')
    .append(`Modality: ${selected_session.modality}<br>`)
    .append(`${selected_session.scans.size} scans in ${total_files} files (${(total_size / 1024 / 1024).toFixed(2)}MB)`);
    
    swal.close();
});

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
                            
                            const seriesDescription = dicom.string('x0008103e');
                            const seriesInstanceUid = dicom.string('x0020000e');
                            const seriesNumber = dicom.string('x00200011');
                            // ++++
                            const modality = dicom.string('x00080060');
                            const session_date = dicom.string('x00080020')
                            const accession = dicom.string('x00080050');
                            // ++++
                
    
                            if (!session_map.has(studyInstanceUid)) {
                                session_map.set(studyInstanceUid, {
                                    studyInstanceUid: studyInstanceUid,
                                    studyDescription: studyDescription,
                                    modality: modality,
                                    accession: accession,
                                    date: session_date,
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
                let $content = $('<div id="swal-wrapper">'),
                    $ol = $('<ol style="text-align: left;">');
                
                $content.prepend(`<p>Found sessions: ${session_map.size}.</p>`).append($ol);


                session_map.forEach(function(cur_session, key) {
                    let session_label = cur_session.studyDescription === undefined ? key : cur_session.studyDescription;
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
    let subject_id = $('a[data-subject_id].selected').data('subject_id');
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

function getUserHome() {
    return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

function copy_and_anonymize(filePaths) {
    let _timer = performance.now();

    swal('Copy & anonymize...');
    NProgress.start();

    return new Promise(function(resolve, reject){
        let dicom_temp_folder_path = path.join(getUserHome(), 'DICOM_TEMP');

        if (!fs.existsSync(dicom_temp_folder_path)) {
            fs.mkdirSync(dicom_temp_folder_path);
        }
        

        let new_dirname = 'dir_' + new Date() / 1; // eg. dir_1522274921704
        let new_dirpath = path.join(dicom_temp_folder_path, new_dirname);
    
        fs.mkdirSync(new_dirpath);
    
        let response = {
                directory: new_dirpath,
                copy_success: [],
                copy_error: []
            }, files_processed = 0;
    
        filePaths.forEach(filePath => {
            const source = filePath;
            const target = path.join(new_dirpath, path.basename(filePath));
            const targetDir = path.parse(target)['dir'];
    
    
            console.log(source, target, targetDir);
            
            // Make sure the target directory exists.
            if (!fs.existsSync(targetDir)) {
                console.log("An error occurred trying to create the directory " + targetDir);
                return;
            }
    
            let readStream = fs.createReadStream(source);
    
            readStream.once('error', (error) => {
                handleError(`An error occurred trying to copy the file ${source} to ${targetDir}`, error);
            });
    
            readStream.once('end', () => {
                console.log(source, 'readStream:END event')
            });
    
            let writeStream = fs.createWriteStream(target);
    
            writeStream.on('finish', () => {
                files_processed++;

                NProgress.set(files_processed / filePaths.length);
                console.log(target)
                console.log('writeStream:END event')
                displayMessage(`Copied ${source} to ${targetDir}`);
    
                try {
                    console.log('BEFORE ANON');
                    mainProcess.anonymize(target, global_anon_script);
                    console.log('AFTER ANON');
                    
                    response.copy_success.push(target);

                    if (files_processed === filePaths.length) {
                        NProgress.done();
                        
                        let _time_took = ((performance.now() - _timer) / 1000).toFixed(2);
                        summary_add(`${_time_took}sec`, 'Anonymization time');

                        resolve(response);
                    }
                } catch (error) {
                    console.log("An error occurred during anonymization: ", error);

                    response.copy_error.push({
                        file: source,
                        error: error
                    });

                    if (files_processed === filePaths.length) {
                        NProgress.done();

                        let _time_took = ((performance.now() - _timer) / 1000).toFixed(2);
                        summary_add(`${_time_took}sec`, 'Anonymization time');

                        resolve(response);
                    }
                }
            });
    
            readStream.pipe(writeStream);
        });
    
    });
    
    
}

function doUpload(url_data, session_id, series_ids) {
    let project_id = url_data.project_id;
    let subject_id = url_data.subject_id;
    let expt_label = url_data.expt_label;

    let _files = [];
    

    let total_size = 0;
    for (let i = 0; i < series_ids.length; i++) {
        let scan_series = session_map.get(session_id).scans.get(series_ids[i]);
        
        total_size = scan_series.reduce(function(prevVal, item) {
            return prevVal + item.filesize;
        }, total_size);

        let files = scan_series.map(function(item){
            return item.filepath;
        });
        _files = _files.concat(files);
    }

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

function zip_and_upload(dirname, _files, url_data) {
    let _timer = performance.now();

    swal('Zipping ...')
    NProgress.start();
    let zipped_count = 0;

    let project_id = url_data.project_id;
    let subject_id = url_data.subject_id;
    let expt_label = url_data.expt_label;
    
    // **********************************************************
    // create a file to stream archive data to.
    let zip_path = path.join(dirname, 'file_' + Math.random() + '.zip');
    
    var output = fs.createWriteStream(zip_path);
    var archive = archiver('zip', {
        zlib: { level: 9 } // Sets the compression level.
    });

    // listen for all archive data to be written
    // 'close' event is fired only when a file descriptor is involved
    output.on('close', function () {
        let _time_took = ((performance.now() - _timer) / 1000).toFixed(2);
        summary_add(`${_time_took}sec`, 'ZIP time');
        _timer = performance.now();

        swal('Uploading zip file ...')
        NProgress.start();

        console.log(archive.pointer() + ' total bytes');
        console.log('archiver has been finalized and the output file descriptor has closed.');

        fs.readFile(zip_path, (err, zip_content) => {
            if (err) throw err;

            axios({
                method: 'post',
                url: xnat_server + `/data/services/import?import-handler=DICOM-zip&PROJECT_ID=${project_id}&SUBJECT_ID=${subject_id}&EXPT_LABEL=${expt_label}&rename=true&prevent_anon=true&prevent_auto_commit=true&SOURCE=uploader&autoArchive=AutoArchive`,
                auth: user_auth,
                onUploadProgress: function (progressEvent) {
                    // Do whatever you want with the native progress event
                    console.log('=======', progressEvent, '===========');
                    console.log(progressEvent.loaded, progressEvent.total);
                    NProgress.set(progressEvent.loaded/progressEvent.total);
                },
                headers: {
                    'Content-Type': 'application/zip'
                },
                data: zip_content
            })
            .then(res => {
                fs.unlink(zip_path, (err) => {
                    if (err) throw err;
                    console.log(`-- ZIP file "${zip_path}" was deleted.`);
                });

                console.log('---' + res.data + '---', res);
                swal(`${_files.length} files were successfully uploaded.`);

                let commit_url = xnat_server + $.trim(res.data) + '?action=commit&SOURCE=uploader';
                
                axios.post(commit_url, {
                    auth: user_auth
                })
                .then(commit_res => {
                    console.log(commit_res)
                    swal(`Session commited.`);
                    NProgress.done();

                    let _time_took = ((performance.now() - _timer) / 1000).toFixed(2);
                    summary_add(`${_time_took}sec`, 'UPLOAD time');

                    // dies with 301
                    swal({
                        title: "Success",
                        text: `Session commited`,
                        icon: "success"
                    })
                    .then((value) => {
                        // go to summary page
                        $('#nav-tab a[href="#nav-summary"]').removeClass('disabled').trigger('click');
                    });
                })
                .catch(err => {
                    NProgress.done();
                    let _time_took = ((performance.now() - _timer) / 1000).toFixed(2);
                    summary_add(`${_time_took}sec`, 'UPLOAD time');

                    console.log(err, err.response);

                    let opt = {
                        title: "Error",
                        text: `Session upload failed (with status code: ${err.response.status} - "${err.response.statusText}").`,
                        icon: "error"
                    };

                    if (err.response.status == 301) {
                        opt = {
                            title: "Success",
                            text: `Session commited (with status code: ${err.response.status} - "${err.response.statusText}").`,
                            icon: "success"
                        }
                    }

                    // dies with 301
                    swal(opt)
                    .then((value) => {
                        // go to summary page
                        $('#nav-tab a[href="#nav-summary"]').removeClass('disabled').trigger('click');
                    });
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

    archive.on('entry', function (entry_data){
        zipped_count++;

        if (zipped_count == _files.length) {
            NProgress.done();
        } else {
            NProgress.set(zipped_count/_files.length);
        }

        fs.unlink(entry_data.sourcePath, (err) => {
            if (err) throw err;
            console.log(`-- File ${entry_data.name} was deleted.`);
        });
        
    })

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
                data-subject_id="${subject.ID}">
                ${subject.label} [ID:${subject.ID}] [GROUP: ${subject.group}]
            </a>
        </li>
    `)
}

// global anon script
function get_global_anon_script() {
    return axios.get(xnat_server + '/data/config/anon/script?format=json', {
        auth: user_auth
    });
}

// TODO - doesn't work
function get_project_anon_script(project_id) {
    return axios.get(xnat_server + '/data/config/projects/'+project_id+'/anon/script?format=json', {
        auth: user_auth
    });
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
    
};

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

function promise_create_project_subject(project_id, subject_label, group) {
    return axios.put(xnat_server + '/data/projects/' + project_id + '/subjects/' + subject_label + '?group=' + group + '&event_reason=XNAT+Application', {
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