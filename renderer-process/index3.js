const settings = require('electron-settings')
const ipc = require('electron').ipcRenderer
const axios = require('axios');
const isOnline = require('is-online');

const swal = require('sweetalert');



const links = document.querySelectorAll('link[rel="import"]')

let active_page, logins;
if (!settings.has('user_auth') || !settings.has('xnat_server')) {
    active_page = 'login.html'
} else {
    active_page = settings.has('active_page') ? settings.get('active_page') : 'login.html';
}

logins = settings.has('logins') ? settings.get('logins') : [];
settings.set('logins', logins);


window.$ = window.jQuery = require('jquery');

if (!settings.has('user_auth')) {
    $('.hidden-by-default').each(function(){
        $(this).addClass('hidden');
    })
} else {
    $('.hidden-by-default').each(function(){
        $(this).removeClass('hidden');
    })
    $("#menu--server").html(settings.get('xnat_server'));
    $("#menu--username").html(settings.get('user_auth').username);
    $('#menu--username-server').html(settings.get('user_auth').username + '@' + settings.get('xnat_server'));
}

//let active_page = settings.has('active_page') ? settings.get('active_page') : 'login.html';



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
            console.log(clone);
            contentContainer.appendChild(clone)

            settings.set('active_page', page); 

            return;
        }

    });

    if (settings.get('active_page') !== page) {
        //settings.delete('active_page');
    }

}

// ===============
$(document).on('click', 'a', function(e){
    const href = $(this).attr('href');
    if (href.indexOf('http') !== 0 && href !== '#') {
        e.preventDefault();
        loadPage(href);
    }
})

$(document).on('click', '#menu--logout', function(){
    logout();
})

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

    $('.hidden-by-default').each(function(){
        $(this).addClass('hidden');
    })

    loadPage('login.html');
    //ipc.send('redirect', 'login.html');
}

ipc.on('load:page',function(e, item){
    console.log('Loading page ... ' + item)
    loadPage(item)
});


