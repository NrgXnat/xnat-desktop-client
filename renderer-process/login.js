const axios = require('axios');
const path = require('path');
const settings = require('electron-settings')
const ipc = require('electron').ipcRenderer


let xnat_server = '';
let user_auth = {
    username: '',
    password: ''
}


$(document).on('page:load', '#login-section', function(e){
    let logins = settings.get('logins');

    if (logins.length) {
        logins.forEach(function(el) {
            var server_name = el.server.split('//');
            $('#known-users').append(`
                <button data-username="${el.username}" data-server="${el.server}" 
                    class="connect btn btn-known-user btn-lg btn-block" type="button" 
                    data-toggle="modal" data-target="#login">
                    <img src="assets/images/xnat-avatar.jpg" />
                    <div >${server_name[1]}</br>
                        <span class="user-name">User: ${el.username}</span>
                    </div>
                </button>
            `)
        })
    }

});

$(document).on('show.bs.modal', '#login', function(e) {
    //get data-id attribute of the clicked element
    let username = $(e.relatedTarget).data('username');
    $(e.currentTarget).find('input[name="username"]').val(username);

    let server = $(e.relatedTarget).data('server');
    $(e.currentTarget).find('input[name="server"]').val(server);

    let focused_field = server && username ? '#password' : '#server';
    setTimeout(function(){
        $(focused_field).focus();
    }, 500);

    if (typeof username == 'undefined') {
        $('#remove_login').hide();
    } else {
        $('#remove_login').show();
    }
});

$(document).on('hide.bs.modal', '#login', function(e) {
    $('#login_feedback').addClass('hidden');
    $(e.currentTarget).find('input[name="password"]').val('');
});

$(document).on('submit', '#loginForm', function(e){
    Helper.blockModal('#login');
    e.preventDefault();

    $('#login_feedback').addClass('hidden');

    let my_xnat_server = $('#server').val();

    let my_user_auth = {
        username: $('#username').val(),
        password: $('#password').val()
    }

    login(my_xnat_server, my_user_auth);
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


function login(xnat_server, user_auth) {
    axios.get(xnat_server + '/data/auth', {
        auth: user_auth
    })
    .then(res => {
        console.log(res);
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
            logins.splice(found, 1);
            logins.unshift({
                server: xnat_server,
                username: user_auth.username
            });
        }
        settings.set('logins', logins);      
        
        Helper.unblockModal('#login');
        $('#login').modal('hide');

        Helper.UI.userMenuShow();

        setTimeout(notify, 100);
        ipc.send('redirect', 'home.html');

        /*
        axios.get(xnat_server + '/data/JSESSION', {
            auth: user_auth
        })
        .then(res => {
            console.log('JSESSION: ', res.data);

            axios.get(xnat_server + '/data/token;jsessionid='+res.data, {
                auth: user_auth
            })
            .then(res => {
                console.log('TOKEN', res);
                
                setTimeout(notify, 100);
                ipc.send('redirect', 'home.html');
            })
            .catch(err => {
                console.log(err, err.response);
            });
            
        })
        .catch(err => {
            console.log(err, err.response);
        });
        */
        
    })
    .catch(error => {
        let msg = Helper.errorMessage(error);

        //console.log(error.config);
        Helper.unblockModal('#login');

        $('#login_feedback').removeClass('hidden');
        $('#login_error_message').html(msg);
    });
}


