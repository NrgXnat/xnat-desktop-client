const axios = require('axios');
const settings = require('electron-settings');
const ipc = require('electron').ipcRenderer;


if (!settings.has('user_auth') || !settings.has('xnat_server')) {
    ipc.send('redirect', 'login.html');
} else {
    xnat_server = settings.get('xnat_server');
    user_auth = settings.get('user_auth');

    $(document).on('page:load', '#upload-section', function(e){
        console.log('Upload page:load triggered');

        promise_projects()
            .then(function(resp) {
                let projects = resp.data.ResultSet.Result;

                $('#upload-project').html('')
                projects.forEach(function(project){
                    $('#upload-project').append(`
                        <li><a href="javascript:void(0)" data-project_id="${project.ID}">${project.name} [ID:${project.ID}]</a></li>
                    `)
                })
                console.log(resp.data.ResultSet.Result)
            })
            .catch(function(err) {
                console.log(err.message);
            })
        
    });

    $(document).on('click', 'a[data-project_id]', function(e){
        $('#subject-session').html('');
        $('.tab-pane.active .js_next').addClass('disabled');

        $(this).closest('ul').find('a').removeClass('selected');
        $(this).addClass('selected')
        promise_subjects($(this).data('project_id'))
            .then(res => {
                let subjects = res.data.ResultSet.Result;
                console.log(subjects.length);
                console.log(res.data.ResultSet.Result[0]);

                subjects.forEach(function(subject){
                    $('#subject-session').append(`
                        <li>
                            <a href="javascript:void(0)" 
                                data-subject_uri="${subject.URI}"
                                data-subject_insert_date="${subject.insert_date}"
                                data-subject_id="${subject.ID}">
                                ${subject.label} [ID:${subject.ID}]
                            </a>
                        </li>
                    `)
                })

                
            })
            .catch(err => {
                console.log(err)
            });
        
    });

    $(document).on('click', 'a[data-subject_id]', function(e){
        $(this).closest('ul').find('a').removeClass('selected');
        $(this).addClass('selected')
        
        $('.tab-pane.active .js_next').removeClass('disabled');
        
    });

    $(document).on('click', '.js_next:not(.disabled)', function() {
        let active_tab_index = $('.nav-item').index($('.nav-item.active'));
        $('.nav-item').eq(active_tab_index + 1).removeClass('disabled').trigger('click');
    })

    
    $(document).on('click', '.js_prev', function() {
        let active_tab_index = $('.nav-item').index($('.nav-item.active'));
        $('.nav-item').eq(active_tab_index - 1).trigger('click');

    })
    
}



function promise_projects() {
    return axios.get(xnat_server + '/data/projects', {
        auth: user_auth
    });
}

function promise_subjects(project_id) {
    return axios.get(xnat_server + '/data/projects/' + project_id + '/subjects', {
        auth: user_auth
    })
    
}

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