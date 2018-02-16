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
            console.log(user_auth);
            login();
            break;
        default:
            break;
        
    }
});

$(document).on('click', '#remove_login', function(e){
    swal({
        title: "Remove stored connection?",
        text: "Are you sure you want to remove it from the list?",
        icon: "warning",
        buttons: [true, 'Remove'],
        closeOnEsc: false,
        dangerMode: true
    })
    .then((doRemove) => {
        if (doRemove) {

            xnat_server = $('#server').val();
            user_auth = {
                username: $('#username').val(),
                password: $('#password').val()
            }
            console.log('--------', xnat_server, user_auth)

            let logins = settings.get('logins');
            
            let found = -1;
            logins.forEach(function(el, i) {
                if (el.server === xnat_server && el.username === user_auth.username) {
                    found = i;
                }
            })

            console.log('FOUND: ' + found);
    
            if (found >= 0) { // not found
                logins.splice(found, 1)
            }
            settings.set('logins', logins);


            swal({
                title: "Connection data removed",
                text: "Connection data removed from the list of stored connections",
                icon: "success",
                closeOnEsc: false
            })
            .then((ok) => {
                
                $('#login').modal('hide');
                ipc.send('redirect', 'login.html');
            });
        }
    });
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

        let logins = settings.get('logins');

        let found = -1;
        logins.forEach(function(el, i) {
            if (el.server === xnat_server && el.username === user_auth.username) {
                found = i;
            }
        })


        if (found == -1) { // not found
            logins.unshift({
                server: xnat_server,
                username: user_auth.username
            });
        } else if (found == 0) { // found first
            // do nothing
        } else { // found not first
            logins.splice(found, 1)
            logins.unshift({
                server: xnat_server,
                username: user_auth.username
            });
        }
        settings.set('logins', logins);

        
        

        $('#login').modal('hide')
        $("#header_menu .hidden").each(function(){
            $(this).removeClass('hidden');
        })
        $("#menu--server").html(xnat_server);
        $("#menu--username").html(user_auth.username);
        $('#menu--username-server').html(user_auth.username + '@' + xnat_server);

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


