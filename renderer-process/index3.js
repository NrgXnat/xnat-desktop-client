const settings = require('electron-settings')
const ipc = require('electron').ipcRenderer
const app = require('electron').remote.app
const axios = require('axios');
const isOnline = require('is-online');
const auth = require('../services/auth');

const swal = require('sweetalert');

const {URL} = require('url');

reset_user_data();

let transfers = store.namespace('transfers');
if (!transfers.has('downloads')) {
    transfers.set('downloads', []);
}


const links = document.querySelectorAll('link[rel="import"]')

let active_page, logins;
if (!settings.has('user_auth') || !settings.has('xnat_server')) {
    active_page = 'login.html'
} else {
    active_page = settings.has('active_page') ? settings.get('active_page') : 'login.html';
}

logins = settings.has('logins') ? settings.get('logins') : [];
settings.set('logins', logins);



if (!settings.has('user_auth')) {
    Helper.UI.userMenuHide();
} else {
    Helper.UI.userMenuShow();
}

console.log('ACTIVE PAGE: ', active_page);

loadPage(active_page)

ipc.send('appIsReady');
app.isReallyReady = true;


function loadPage(page) {
    // Import and add each page to the DOM
    Array.prototype.forEach.call(links, function (link) {

        if (link.href.endsWith(page)) {
            console.log('Our page: ' + page);
            let template = link.import.querySelector('.task-template')
            let clone = document.importNode(template.content, true)
        
            let contentContainer = document.querySelector('.content');
    
            contentContainer.innerHTML = '';
            // while (contentContainer.firstChild) {
            //     contentContainer.removeChild(contentContainer.firstChild);
            // }
            //console.log(clone);
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

            isOnline()
                .then(onlineStatus => {
                    console.log(onlineStatus);
                    //=> true
                    if (onlineStatus) {
                        msg = Helper.errorMessage(error);
                    } else {
                        msg = 'You computer seems to be offline!';
                    }

                    console.log('Error: ' + msg);
                    
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
    Helper.UI.userMenuHide();
    loadPage('login.html');
}


function reset_user_data() {
    console.log('****************** reset_user_data **************');
    auth.remove_current_user();

    //store.set('transfers.downloads', []);
    //store.set('transfers.uploads', []);
}


// ===============
$(document).on('click', 'a', function(e){
    const href = $(this).attr('href');
    if (href.indexOf('http') !== 0 && href !== '#') {
        e.preventDefault();
        loadPage(href);
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
    
    //ipc.send('redirect', path);
    loadPage(path)

});


ipc.on('load:page',function(e, item){
    //console.log('EVENTTT', e);
    console.log('Loading page ... ' + item)
    loadPage(item)
});


ipc.on('console:log',function(e, item){
    console.log('================ console:log ================');
    console.log(item);
});


ipc.on('remove_current_session',function(e, item){
    reset_user_data()
});

ipc.on('custom_error',function(e, title, message){
    console.log(title, message);
    
    swal(title, message, 'error');
    // swal({
    //     title: title,
    //     text: message,
    //     icon: "error",
    //     buttons: ['Dismiss'],
    //     dangerMode: true
    // })
});

ipc.on('log', (e, ...args) => {
    console.log('                                   ');
    console.log('============= IPC LOG =============');
    console.log(...args);
})

ipc.on('handle_protocol_request', (e, url) => {
    console.log(' ************* handle_protocol_request ***********');
    
    let app_protocol = app.app_protocol;
    console.log(app);

    if (Array.isArray(url)) {
        url = url.length ? url[0] : '';
    }

    if (url.indexOf(app_protocol + '://') === 0) {
        console.log('handle_protocol_request - SUCCESS: ', url)

        let url_object = new URL(url);
        console.log(url_object);

        if (url_object.protocol === app_protocol + ':') {
            let search_items = url_object.search.substr(1).split('&');
            
            let url_params = {};
            for(let i = 0; i < search_items.length; i++) {
                search_segments = search_items[i].split('=');
                url_params[search_segments[0]] = search_segments[1]
            }

            swal({
                title: 'External URL trigger',
                text: `
                    URL: ${url_object.href}
                    HOST: ${url_object.host}
                    REST XML: ${'http(s)://' + url_object.host + '/xapi/archive' + url_object.pathname.substr(0, url_object.pathname.length - 4) + '/xml'}
                    ALIAS: ${url_params.a}
                    SECRET: ${url_params.s}
                `,
                icon: "success"
            });
        }

    } else {
        console.log('handle_protocol_request - FAIL!!! ', url)
    }
  

})
