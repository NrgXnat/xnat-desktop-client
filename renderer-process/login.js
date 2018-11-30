const path = require('path');
const settings = require('electron-settings')
const ipc = require('electron').ipcRenderer
const auth = require('../services/auth');
const api = require('../services/api');

const app = require('electron').remote.app

let xnat_server = '';
let user_auth = {
    username: '',
    password: ''
}

let allow_insecure_ssl;


$(document).on('page:load', '#login-section', function(e){
    let logins = settings.get('logins');

    if (logins.length) {
        logins.forEach(function(el) {
            var server_name = el.server.split('//');
            $('#known-users').append(`
                <button data-username="${el.username}" data-server="${el.server}" data-allow_insecure_ssl="${el.allow_insecure_ssl ? 'true' : 'false'}"
                    class="connect btn btn-known-user btn-lg btn-block" type="button" 
                    data-toggle="modal" data-target="#login">
                    <span class="login_logo"><img src="${api.get_logo_path(el.server)}" /></span>
                    <div>${server_name[1]}</br>
                        <span class="user-name">User: ${el.username}</span>
                    </div>
                </button>
            `)
        })
    }

});

$(document).on('show.bs.modal', '#login', function(e) {
    let $button = $(e.relatedTarget);
    let $form = $(e.currentTarget);
    
    //get data-id attribute of the clicked element
    let username = $button.data('username');
    $form.find('input[name="username"]').val(username);

    let server = $button.data('server');
    $form.find('input[name="server"]').val(server);

    let allow_insecure_ssl = $button.data('allow_insecure_ssl');
    $form.find('input[name="allow_insecure_ssl"]').prop('checked', allow_insecure_ssl);

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

    let my_xnat_server = $('#server').val().replace(/\/$/, '');

    let my_user_auth = {
        username: $('#username').val(),
        password: $('#password').val()
    }

    allow_insecure_ssl = $('#allow_insecure_ssl').is(':checked');

    app.allow_insecure_ssl = allow_insecure_ssl;
    
    if (my_xnat_server.indexOf('http://') === 0 || my_xnat_server.indexOf('https://') === 0) {
        login_attempt(my_xnat_server, my_user_auth);
    } else {
        let server_with_protocol = 'https://' + my_xnat_server;
        auth.login_promise(server_with_protocol, my_user_auth)
            .then(res => {
                handleLoginSuccess(server_with_protocol, my_user_auth);
            })
            .catch(err => {
                server_with_protocol = 'http://' + my_xnat_server;
                login_attempt(server_with_protocol, my_user_auth);
            })
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

            Helper.pnotify('Connection data removed!', 'Connection data removed from the list of stored connections.');

            $('#login').modal('hide');
            ipc.send('redirect', 'login.html');
        }
    });
});


function login_attempt(xnat_server, user_auth) {
    auth.login_promise(xnat_server, user_auth)
        .then(res => {
            handleLoginSuccess(xnat_server, user_auth);
        })
        .catch(handleLoginFail);
}

function htmlEntities(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function handleLoginFail(error) {
    let error_details = error.response ? error.response : error.message;
    $('#login_error_details').html(JSON.stringify(error_details));
    console.log('error.response', error.response);
    
    console.log('error.response.status', error.response);
    console.log('error.request', error.request);


    console.log('error.message', error.message);
    // reset temporary update
    app.allow_insecure_ssl = false;

    let msg = Helper.errorMessage(error);
        
    Helper.unblockModal('#login');
    
    $('#login_feedback').removeClass('hidden');
    $('#login_error_message').html(msg);
}

function handleLoginSuccess(xnat_server, user_auth) {
    // reset temporary update
    app.allow_insecure_ssl = false;
    
    auth.save_login_data(xnat_server, user_auth, allow_insecure_ssl);
    auth.save_current_user(xnat_server, user_auth);
    
    auth.set_allow_insecure_ssl(allow_insecure_ssl);

    api.set_logo_path(xnat_server, user_auth);
    
    Helper.unblockModal('#login');
    $('#login').modal('hide');

    Helper.UI.userMenuShow();
    Helper.notify("Server: " + xnat_server + "\nUser: " + user_auth.username, 'XNAT Login Info');

    ipc.send('redirect', 'home.html');

}


