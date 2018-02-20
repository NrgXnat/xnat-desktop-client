const axios = require('axios');
const settings = require('electron-settings')
const ipc = require('electron').ipcRenderer

let xnat_server, user_auth;

window.$ = window.jQuery = require('jquery');


if (!settings.has('user_auth') || !settings.has('xnat_server')) {
    ipc.send('redirect', 'login.html');
} else {
    xnat_server = settings.get('xnat_server');
    user_auth = settings.get('user_auth');
    console.log(xnat_server, user_auth);

    $(document).on('click', '#get_projects', get_projects);
    

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
