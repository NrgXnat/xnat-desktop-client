const electron = require('electron');
const settings = require('electron-settings')
const ElectronStore = require('electron-store');
const app_config = new ElectronStore();
const ipc = electron.ipcRenderer
const app = electron.remote.app
const shell = electron.shell
const axios = require('axios');
const isOnline = require('is-online');
const auth = require('../services/auth');
const api = require('../services/api');

const appMetaData = require('../package.json');
electron.crashReporter.start({
    companyName: appMetaData.author,
    productName: appMetaData.name,
    productVersion: appMetaData.version,
    submitURL: appMetaData.extraMetadata.submitUrl,
    uploadToServer: app_config.get('send_crash_reports', false)
});





try {
    let mizer = require('../mizer');
} catch(e) {
    if (process.platform === "win32" && e.message.includes('nodejavabridge_bindings.node')) {
        $('#win_install_cpp').modal({
            keyboard: false,
            backdrop: 'static'
        })
    } else {
        throw e;
    }
}




const swal = require('sweetalert');

const electron_log = electron.remote.require('./services/electron_log');

const {URL} = require('url');

reset_user_data();


const links = document.querySelectorAll('link[rel="import"]')

let active_page, logins;
if (!settings.has('user_auth') || !settings.has('xnat_server')) {
    active_page = 'login.html'
} else {
    active_page = settings.has('active_page') ? settings.get('active_page') : 'login.html';
}

logins = settings.get('logins') || [];
settings.set('logins', logins);



if (!settings.has('user_auth')) {
    Helper.UI.userMenuHide();
} else {
    Helper.UI.userMenuShow();
}

console_log('ACTIVE PAGE: ', active_page);

loadPage(active_page)

ipc.send('appIsReady');
app.isReallyReady = true;

// *******************************************************************
// *******************************************************************


function loadPage(page) {
    // Import and add each page to the DOM
    Array.prototype.forEach.call(links, function (link) {

        if (link.href.endsWith(page)) {
            console_log('Our page: ' + page);
            let template = link.import.querySelector('.task-template')
            let clone = document.importNode(template.content, true)
        
            let contentContainer = document.querySelector('.content');
    
            contentContainer.innerHTML = '';

            contentContainer.appendChild(clone);
            document.body.scrollTop = 0;

            settings.set('active_page', page); 

            return;
        }

    });

    if (settings.get('active_page') !== page) {
        //settings.delete('active_page');
    }

}


function logout() {
    let xnat_server = settings.get('xnat_server');


    auth.logout_promise(xnat_server)
        .then(res => {
            clearLoginSession();
        })
        .catch(error => {
            let msg;

            isOnline().then(onlineStatus => {
                console_log(onlineStatus);
                //=> true
                if (onlineStatus) {
                    msg = Helper.errorMessage(error);
                } else {
                    msg = 'You computer seems to be offline!';
                }

                console_log('Error: ' + msg);
                
                swal({
                    title: 'Connection error',
                    text: msg,
                    icon: "warning",
                    buttons: ['Stay on this page', 'Force logout'],
                    dangerMode: true
                })
                    .then((proceed) => {
                        if (proceed) {
                            clearLoginSession();
                        }
                    });
            });

        });
}

function clearLoginSession() {
    auth.remove_current_user();
    auth.set_allow_insecure_ssl(false);
    
    Helper.UI.userMenuHide();
    loadPage('login.html');
}


function reset_user_data() {
    console_log('****************** reset_user_data **************');
    auth.remove_current_user();
    auth.set_allow_insecure_ssl(false);
}


// ===============
$(document).on('click', 'a', function(e){
    const href = $(this).attr('href');
    if (href.indexOf('http') !== 0) {
        if (href !== '#') {
            e.preventDefault();
            loadPage(href);
        }
    } else {
        e.preventDefault();
        shell.openExternal(href)
    }
})

// ===============
$(document).on('click', 'a.logo-header', function(e){
    e.preventDefault();
    let page = (!settings.has('user_auth') || !settings.has('xnat_server')) ? 'login.html' : 'home.html';
    loadPage(page);
})

$(document).on('click', '#trigger_download', function(){
    setTimeout(function(){
        $('button[data-target="#download_modal"]').trigger('click');
    }, 300);
    ipc.send('redirect', 'home.html');
})

$(document).on('click', '#menu--logout', function(){
    logout();
})

$(document).on('click', '[data-href]', function() {
    let path, tab;
    if ($(this).data('href').indexOf('#') >= 0) {
        let items = $(this).data('href').split('#');
        path = items[0];
        tab = items[1];
    } else {
        path = $(this).data('href');
    }

    if (tab) {       
        setTimeout(function(){
            $('#' + tab).trigger('click');
        }, 30);
    }
    
    loadPage(path)
});


ipc.on('load:page',function(e, item){
    console_log('Loading page ... ' + item)
    loadPage(item)
});


ipc.on('remove_current_session',function(e, item){
    reset_user_data()
});

ipc.on('custom_error',function(e, title, message){
    console_log(title, message);
    
    swal(title, message, 'error');
    // swal({
    //     title: title,
    //     text: message,
    //     icon: "error",
    //     buttons: ['Dismiss'],
    //     dangerMode: true
    // })
});

ipc.on('log', ipc_log);

function ipc_log(e, ...args){
    console_log('%c============= IPC LOG =============', 'font-weight: bold; color: red');
    console_log(...args);
};


ipc.on('update-available', (e, ...args) => {
    $('#auto_update_current').text('v' + app.getVersion())
    $('#auto_update_available').text('v' + args[0].version)

    $('#auto_update_modal').modal({
        keyboard: false,
        backdrop: 'static'
    })
    console_log('update-available')
    console_log(args);

    store.set('version-info-update', 'Updated version available.')
})

ipc.on('update-not-available', (e, ...args) => {
    store.set('version-info-update', 'You are running the latest version.')
})

ipc.on('update-error', (e, ...args) => {
    //let str = args.join(' | ')
    //Helper.pnotify('Naslov', 'Poruka: ' + str);
    console_log('update-error')
    swal('Update error', 'An error occurred during update download.', 'error');
    electron_log.error('update-error', e)
    console_log(args);

    store.set('version-info-update', 'An error occurred during update download.')
})

ipc.on('download-progress', (e, ...args) => {
    //let str = args.join(' | ')
    //Helper.pnotify('Naslov', 'Poruka: ' + str);
    console_log('download-progress')
    console_log(args);
    console_log(args[0].percent)

    $('#auto_update_progress').attr("value", Math.ceil(args[0].percent))
})

ipc.on('update-downloaded', (e, ...args) => {
    //let str = args.join(' | ')
    //Helper.pnotify('Naslov', 'Poruka: ' + str);
    console_log('update-downloaded')
    console_log(args);
})

$(document).on('click', '#download_and_install', function(e) {
    $(this).prop('disabled', true);
    $('#auto_update_progress').removeClass('hidden');

    ipc.send('download_and_install');
})



ipc.on('handle_protocol_request', protocol_request)

async function protocol_request(e, url) {
    console_log(' ************* handle_protocol_request ***********');

    let app_protocols = [app.app_protocol, app.app_protocol + 's'];

    if (Array.isArray(url)) {
        url = url.length ? url[0] : '';
    }

    if (url === null) {
        url = '';
    }

    for (let i = 0; i < app_protocols.length; i++) {
        let app_protocol = app_protocols[i];
        if (url.indexOf(app_protocol + '://') === 0) {
            try {
                let url_object = new URL(url);
                console_log(url_object);
                
                let safe_protocol = '';
                if (app_protocol === app.app_protocol + 's') {
                    safe_protocol = 's';
                }
    
                let server = 'http' + safe_protocol + '://' + url_object.host
    
                let last_download_index = url_object.pathname.lastIndexOf('/download/');
                let last_upload_index = url_object.pathname.lastIndexOf('/upload/');
                let last_index;
    
                // is it upload or download
                if (last_download_index >= 0) {
                    server += url_object.pathname.substr(0, last_download_index);
                    last_index = last_download_index;
    
                } else if (last_upload_index >= 0) {
                    server += url_object.pathname.substr(0, last_upload_index);
                    last_index = last_upload_index;
    
                } else {
                    // protocol match, but path is invalid URL not handled
                    throw_new_error('Invalid Path', `Requested URL: ${url} \ncontains invalid path with neither '/upload/' nor '/download/' segments.`);
                }
                


                let search_items = url_object.search.substr(1).split('&');
    
                let url_params = {};
                for (let i = 0; i < search_items.length; i++) {
                    search_segments = search_items[i].split('=');
                    url_params[search_segments[0]] = search_segments[1]
                }

                if (!url_params.hasOwnProperty('a') || !url_params.hasOwnProperty('s')) {
                    throw_new_error('Missing Credentials Error', `User token is not passed.`);
                }
                
                let my_user_auth = {
                    username: url_params.a,
                    password: url_params.s
                };

                console_log(server, my_user_auth);
                
                let real_username;
                try {
                    app.allow_insecure_ssl = auth.is_insecure_ssl_allowed(server);

                    let resp = await auth.login_promise(server, my_user_auth); // wait till the promise resolves (*);
                    real_username = resp.data.split("'")[1];
                    
                    app.allow_insecure_ssl = false;
                } catch (err) {
                    app.allow_insecure_ssl = false;
                    
                    throw_new_error('Connection Error', Helper.errorMessage(err));
                }

                console_log(url_object);

                let url_data = {
                    title: 'External URL trigger',
                    URL: url_object.href,
                    HOST: url_object.host,
                    SERVER: server,
                    USERNAME: real_username,
                    REST_XML: server + '/xapi/archive' + url_object.pathname.substr(last_index, url_object.pathname.length - last_index - 4) + '/xml',
                    ALIAS: url_params.a,
                    SECRET: url_params.s
                };

                console_log(url_data);

                

                // logged in
                if (settings.has('xnat_server')) {
                    if (url_data.SERVER !== settings.get('xnat_server') ||
                        url_data.USERNAME !== auth.get_current_user()) { // not the current user
                        
                        //logout
                        reset_user_data();
                        handleTokenLogin(url_data);
                    } else { // good login data (current user) - no need to logout or store token data

                    }
                    
                } else { // not logged in
                    handleTokenLogin(url_data);
                }

                // add ipc send (to home) + plus redirect
                ipc.send('launch_download_modal', url_data);

            } catch (err) {
                var error_obj = parse_error_message(err);
                console_log(error_obj);
                //alert(error_obj.title);
                //alert(error_obj.body);
                
                swal(error_obj.title, error_obj.body, 'error');
            }
            

        } else {
            console_log(`handle_protocol_request::${app_protocol} - NOT MATCHED`, url);
        }
    }

}

function handleTokenLogin(url_data) {
    let user_auth = {
        username: url_data.USERNAME
    };

    let token_auth = {
        username: url_data.ALIAS,
        password: url_data.SECRET
    };

    let allow_insecure_ssl = auth.is_insecure_ssl_allowed(url_data.SERVER);

    //already confirmed login data so save (logins array)
    auth.save_login_data(url_data.SERVER, user_auth, allow_insecure_ssl);
    
    // TODO: REFACTOR
    settings.set('xnat_server', url_data.SERVER);
    settings.set('user_auth', user_auth);
    auth.set_user_auth(token_auth);

    auth.set_allow_insecure_ssl(allow_insecure_ssl);
    
    Helper.UI.userMenuShow();
    Helper.notify("Server: " + url_data.SERVER + "\nUser: " + url_data.USERNAME, 'XNAT Login Info');

    api.set_logo_path(url_data.SERVER, token_auth);
}


function throw_new_error(title, message) {
    var err_msg = JSON.stringify({
        title: title,
        body: message
    });

    throw new Error(err_msg);
}

function parse_error_message(err) {
    var msg;
    try {
        msg = JSON.parse(err.message);
    } catch (e) {
        msg = {
            title: err.name,
            body: err.message
        }
    }

    return msg;
}

function console_log(...log_this) {
    console.log(...log_this);
}

window.onerror = function (errorMsg, url, lineNumber) {
    electron_log.error(`[Custom Uncaught Error]:: ${__filename}:: (${url}:${lineNumber}) ${errorMsg}`)
    console_log(__filename + ':: ' +  errorMsg);
    return false;
}