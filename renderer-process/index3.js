const settings = require('electron-settings')
const ipc = require('electron').ipcRenderer
const axios = require('axios');
const isOnline = require('is-online');

const swal = require('sweetalert');

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

    // $("#menu--server").html(settings.get('xnat_server'));
    // $("#menu--username").html(settings.get('user_auth').username);
    // $('#menu--username-server').html(settings.get('user_auth').username + '@' + settings.get('xnat_server'));
    
}

console.log('ACTIVE PAGE: ', active_page);


loadPage(active_page)


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

    axios.get(xnat_server + '/app/action/LogoutUser')
    .then(res => {
        clearLoginSession();
    })
    .catch(error => {
        let msg;

        let error_check = new Promise(function(resove, reject){
            
        });


        isOnline()
            .then(onlineStatus => {
                console.log(onlineStatus);
                //=> true
                if (onlineStatus) {
                    if (error.response) {
                        // The request was made and the server responded with a status code
                        // that falls out of the range of 2xx
                        //console.log(error.response.status);
                        //console.log(error.response.data);
                        //console.log(error.response.headers);
                        switch (error.response.status) {
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
                        //console.log(error.request);
                        msg = 'XNAT server address (' + xnat_server + ') is not accessible.'
                    } else {
                        // Something happened in setting up the request that triggered an Error
                        console.log('Error', error.message);
                        msg = error.message;
                    }
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
            })
        
       

    });
}

function clearLoginSession() {
    settings.delete('user_auth')
    settings.delete('xnat_server')

    Helper.UI.userMenuHide();

    loadPage('login.html');
    //ipc.send('redirect', 'login.html');
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

function reset_user_data() {
    console.log('****************** reset_user_data **************');
    
    //settings.delete('user_auth');
    //settings.delete('xnat_server');

    //store.set('transfers.downloads', []);
    //store.set('transfers.uploads', []);
}


