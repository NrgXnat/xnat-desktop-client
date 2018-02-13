const axios = require('axios');
const settings = require('electron-settings')
const ipc = require('electron').ipcRenderer

let xnat_server, user_auth;

window.$ = window.jQuery = require('jquery');

$('#menu--logout').on('click', function(){
    logout();
})

if (!settings.has('user_auth') || !settings.has('xnat_server')) {
    ipc.send('redirect', 'login.html');
} else {
    xnat_server = settings.get('xnat_server');
    user_auth = settings.get('user_auth');
    console.log(xnat_server, user_auth);
    
    document.addEventListener('click', function(e){
        switch (e.target.id) {
                case 'get_projects':
                    get_projects();
                    break;
                case 'logout':
                    logout()

                    
    
                    break;
                default:
                    break;
            
        }
    
    });
    
}

function logout() {
    
    settings.delete('user_auth')
    settings.delete('xnat_server')

    axios.get(xnat_server + '/app/action/LogoutUser')
    .then(res => {
        console.log('Logout: ', res);

        $('.hidden-by-default').each(function(){
            $(this).addClass('hidden');
        })

        ipc.send('redirect', 'login.html');
    })
    .catch(err => {
        console.log(err)
    });
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
