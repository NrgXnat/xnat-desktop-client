const axios = require('axios');
const path = require('path');
const settings = require('electron-settings')
const ipc = require('electron').ipcRenderer


const error_holder = document.getElementById('login_feedback');

let xnat_server = '';
let user_auth = {
    username: '',
    password: ''
}

document.addEventListener('submit', function(e) {
    switch (e.target.id) {
        case 'loginForm':
            e.preventDefault();
            error_holder.classList.add('hidden');
            xnat_server = document.getElementById('server').value;
            user_auth = {
                username: document.getElementById('username').value,
                password: document.getElementById('password').value
            }
            login();
            break;
        default:
            break;
        
    }
});


function login() {
    console.log(xnat_server, user_auth);
    axios.get(xnat_server + '/data/auth', {
        auth: user_auth
    })
    .then(res => {
        settings.set('xnat_server', xnat_server);
        settings.set('user_auth', user_auth);

        // Notification code
        const notification = {
            title: 'XNAT Login Info',
            body: "Server: " + xnat_server + "\nUser: " + user_auth.username,
            icon: path.join(__dirname, '../assets/icons/png/icon.png')
        };

        function notify() {
            const myNotification = new window.Notification(notification.title, notification);
        }

        setTimeout(notify, 100);

        ipc.send('redirect', 'projects.html');
    })
    .catch(error => {
        
        let msg;


        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            //console.log(error.response.status);
            //console.log(error.response.data);
            //console.log(error.response.headers);
            switch(error.response.status) {
                case 401:
                    msg = 'Invalid username or password!';
                    break;
                case 404:
                    msg = 'Invalid XNAT server address';
                    break;
                default:
                    msg = 'An error occured. Please try again.'
            }
            
          } else if (error.request) {
            // The request was made but no response was received
            // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
            // http.ClientRequest in node.js
            console.log(error.request);
            msg = 'Please check XNAT server address (and your internet connection).'
          } else {
            // Something happened in setting up the request that triggered an Error
            console.log('Error', error.message);
            msg = error.message;
          }
          //console.log(error.config);

          console.log(error_holder);
          document.getElementById('login_feedback').classList.remove("hidden");
          document.getElementById('login_error_message').innerHTML = msg;
    });
}


