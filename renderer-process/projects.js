const axios = require('axios');
const settings = require('electron-settings')
const ipc = require('electron').ipcRenderer

if (!settings.has('user_auth') || !settings.has('xnat_server')) {
    ipc.send('redirect', 'login.html');
} else {
    
}

const xnat_server = settings.get('xnat_server');
const user_auth = settings.get('user_auth');
console.log(xnat_server, user_auth)

document.addEventListener('click', function(e){
    switch (e.target.id) {
            case 'get_projects':
                get_projects();
                break;
            case 'logout':
                settings.delete('user_auth')
                settings.delete('xnat_server')
                ipc.send('redirect', 'login.html');

                break;
            default:
                break;
        
    }

});

document.getElementById('username').innerHTML = user_auth.username;



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
            li.innerText = project.name + '(ID: ' + project.ID + ')';
            document.getElementById('projects').appendChild(li);
        });

        if (projects.length) {
            axios.get(xnat_server + '/data/projects/' + projects[0].ID + '/subjects', {
                auth: user_auth
            })
            .then(res => {
                console.log('First Subject', res.data.ResultSet.Result[0]);

                document.getElementById('subject_data').innerHTML = 'First Subject data:<br>' + JSON.stringify(res.data.ResultSet.Result[0]);
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
