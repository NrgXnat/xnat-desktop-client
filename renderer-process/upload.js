const axios = require('axios');
const settings = require('electron-settings');
const ipc = require('electron').ipcRenderer;
const swal = require('sweetalert');


if (!settings.has('user_auth') || !settings.has('xnat_server')) {
    ipc.send('redirect', 'login.html');
} else {
    xnat_server = settings.get('xnat_server');
    user_auth = settings.get('user_auth');

    $(document).on('page:load', '#upload-section', function(e){
        console.log('Upload page:load triggered');

        

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
            .catch(err => {
                console.log(err)
            });

        
        promise_require_date(project_id)
            .then(res => {
                console.log('-----------------------------------------------------------');
                console.log(res.data === '')

                // set appropriate date input property
                $('#upload_session_date').prop('required', res.data !== '');
                
                console.log('-----------------------------------------------------------');
            })
            .catch(err => {
                console.log(err)
            })
        
        
        promise_project_experiments(project_id)
            .then(res => {
                console.log('----------------promise_project_experiments------------------------');
                console.log(res)
                console.log('-----------------------------------------------------------');
            })
            .catch(err => {
                console.log(err)
            })
        
        
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
            swal('Disabling NEXT button');
            $('.tab-pane.active .js_next').addClass('disabled');
        }, 100)
    })

    
    $(document).on('click', '.js_prev', function() {
        let active_tab_index = $('.nav-item').index($('.nav-item.active'));
        $('.nav-item').eq(active_tab_index - 1).trigger('click');

    })

    $(document).on('change', '#file_upload_folder', function(e) {
        if (this.files.length) {
            $('#upload_folder').val(this.files[0].path);
            $('.tab-pane.active .js_next').removeClass('disabled');
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

function promise_require_date(project_id) {
    return axios.get(xnat_server + '/data/projects/'+project_id+'/config/applet/require-date?contents=true&accept-not-found=true', {
        auth: user_auth
    });
}

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