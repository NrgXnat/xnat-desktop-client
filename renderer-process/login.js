const path = require('path');
const ElectronStore = require('electron-store');
const settings = new ElectronStore();
const ipc = require('electron').ipcRenderer
const auth = require('../services/auth');
const api = require('../services/api');

const { require: nodeRequire, app } = require('@electron/remote')

const electron_log = nodeRequire('./services/electron_log');

let xnat_server = '';
let user_auth = {
    username: '',
    password: ''
}

let allow_insecure_ssl;

// const ejs_template = require('../services/ejs_template')

Helper.pageLoadLog('-------- LOOOOGIN')

$(document).on('page:load', '#login-section', async function(e){
    let logins = settings.get('logins') || [];

    console.log({logins});
    
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
    $('.form-check', $form).toggleClass('hidden', !allow_insecure_ssl)

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
    $('#login .modal-body > .alert').addClass('hidden');
    $(e.currentTarget).find('input[name="password"]').val('');
});

$(document).on('submit', '#loginForm', function(e){
    Helper.blockModal('#login');
    e.preventDefault();

    $('#login .modal-body > .alert').addClass('hidden');

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

            let logins = settings.get('logins') || [];
            
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

$(document).on('click', '#browser_login_btn', function(e){
    e.preventDefault();

    let server_url = $('#server').val().trim();
    if (!server_url) {
        swal('Server Required', 'Please enter a server URL first.', 'warning');
        return;
    }

    // Normalize server URL - add protocol if missing
    if (server_url.indexOf('http://') !== 0 && server_url.indexOf('https://') !== 0) {
        server_url = 'https://' + server_url;
    }
    server_url = server_url.replace(/\/$/, ''); // Remove trailing slash

    allow_insecure_ssl = $('#allow_insecure_ssl').is(':checked');
    app.allow_insecure_ssl = allow_insecure_ssl;

    // Build login URL with client_auth parameter
    const loginUrl = `${server_url}/app/template/Login.vm?client_auth=true`;

    // Store server info for when protocol handler receives the token
    settings.set('pending_browser_auth', {
        server: server_url,
        allow_insecure_ssl: allow_insecure_ssl,
        timestamp: Date.now()
    });

    // Open in default browser
    const shell = require('electron').shell;
    const opened = shell.openExternal(loginUrl);

    if (!opened) {
        electron_log.error('Failed to open browser for authentication');
        swal('Browser Error', 'Failed to open your default browser. Please check your system settings.', 'error');
        settings.delete('pending_browser_auth');
        app.allow_insecure_ssl = false;
        return;
    }

    // Close the login modal
    $('#login').modal('hide');

    // Show waiting message
    swal({
        title: 'Waiting for Authentication',
        text: 'Please complete the login process in your browser. This window will automatically update when authentication is complete.',
        icon: 'info',
        buttons: {
            cancel: {
                text: 'Cancel',
                value: false,
                visible: true
            }
        },
        closeOnClickOutside: false,
        closeOnEsc: true
    }).then((value) => {
        if (value === false) {
            // User cancelled
            settings.delete('pending_browser_auth');
            app.allow_insecure_ssl = false;
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
    let error_details = error.response ? error.response : {
        error: error,
        message: error.message
    };

    error_details = auth.anonymize_response(error_details)

    var div = document.createElement("div");
    div.innerHTML = JSON.stringify(error_details, undefined, 4);
    var text = div.textContent || div.innerText || "";

    text = text.replace(/<!--[\s\S]*?-->/g, "")
    electron_log.error(text)

    $('#login_error_details').html(text);

    // reset temporary update
    app.allow_insecure_ssl = false;

    let msg = Helper.errorMessage(error);
    //console.log(JSON.stringify(error))
        
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

