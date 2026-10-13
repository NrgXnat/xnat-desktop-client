const path = require('path');
const ElectronStore = require('electron-store');
const settings = new ElectronStore();
const { ipcRenderer: ipc, shell } = require('electron')
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
                    data-auth_method="${el.auth_method || 'password'}"
                    class="connect btn btn-known-user btn-lg btn-block" type="button" 
                    data-toggle="modal" data-target="#login">
                    <span class="login_logo"><img src="${api.get_logo_path(el.server)}" /></span>
                    <div>${server_name[1]}</br>
                        <span class="user-name">${el.username ? `User: ${el.username}` : 'Log in with your browser'}</span>
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

    // new servers default to browser login; force_reauthenticate (index3.js) opens the modal without a
    // button and sets the method itself
    let auth_method = $button.length ? ($button.data('auth_method') || 'browser') : 'browser';
    set_auth_method(auth_method);

    let focused_field = !server ? '#server' : (auth_method === 'password' && username ? '#password' : '#loginForm [type="submit"]');
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
    $('#browser_auth_waiting').addClass('hidden');
    $(e.currentTarget).find('input[name="password"]').val('');
    auth.cancel_pending_browser_auth();
});

$(document).on('click', '#toggle_auth_method', function(e) {
    e.preventDefault();
    set_auth_method($('#auth_method').val() === 'browser' ? 'password' : 'browser');
});

// index3.js (force_reauthenticate) sets the hidden field and triggers change
$(document).on('change', '#auth_method', function() {
    set_auth_method($(this).val());
});

function set_auth_method(auth_method) {
    const is_browser = auth_method !== 'password';
    const username = $('#username').val();

    $('#auth_method').val(is_browser ? 'browser' : 'password');
    $('#password_auth_fields').toggleClass('hidden', is_browser);
    $('#browser_auth_fields').toggleClass('hidden', !is_browser);
    $('#browser_auth_waiting').addClass('hidden');
    $('#browser_auth_user').toggleClass('hidden', !username).find('strong').text(username || '');
    $('#toggle_auth_method').text(is_browser ? 'Log in with username and password' : 'Log in with your browser');
}

$(document).on('submit', '#loginForm', function(e){
    e.preventDefault();

    if ($('#auth_method').val() === 'browser') {
        browser_login();
        return;
    }

    Helper.blockModal('#login');

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


// Opens XNAT in the system browser. The login completes when XNAT calls back through the xnat(s)://
// protocol, which is handled by protocol_request() in index3.js.
async function browser_login() {
    $('#login .modal-body > .alert').addClass('hidden');

    let entered_server = $('#server').val().trim().replace(/\/$/, '');
    if (!entered_server) {
        $('#server').focus();
        return;
    }

    allow_insecure_ssl = $('#allow_insecure_ssl').is(':checked');

    Helper.blockModal('#login');
    let xnat_server;
    try {
        xnat_server = await auth.resolve_server_url(entered_server, allow_insecure_ssl);
    } catch (err) {
        handleLoginFail(err);
        return;
    } finally {
        Helper.unblockModal('#login');
    }

    let login_url;
    try {
        login_url = auth.browser_login_url(xnat_server, $('#username').val().trim());
    } catch (err) {
        handleLoginFail(new Error(`"${entered_server}" is not a valid server address.`));
        return;
    }

    auth.start_pending_browser_auth(xnat_server, allow_insecure_ssl);

    try {
        await shell.openExternal(login_url);
    } catch (err) {
        auth.cancel_pending_browser_auth();
        handleLoginFail(new Error(`Could not open your browser: ${err.message}`));
        return;
    }

    $('#browser_auth_waiting').removeClass('hidden');
}

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
    
    auth.save_login_data(xnat_server, user_auth, allow_insecure_ssl, false, 'password');
    auth.save_current_user(xnat_server, user_auth);
    
    auth.set_allow_insecure_ssl(allow_insecure_ssl);

    api.set_logo_path(xnat_server, user_auth);
    
    Helper.unblockModal('#login');
    $('#login').modal('hide');

    Helper.UI.userMenuShow();
    Helper.notify("Server: " + xnat_server + "\nUser: " + user_auth.username, 'XNAT Login Info');

    ipc.send('redirect', 'home.html');

}

