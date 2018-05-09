const settings = require('electron-settings');

let Helper = {
    blockModal: (modal_id) => {
        $(modal_id).find('.modal-content').block()
    },
    unblockModal: (modal_id) => {
        $(modal_id).find('.modal-content').unblock()
    },
    pageLoadTrigger: (page_id) => {
        console.log(document.readyState);
    
        switch (document.readyState) {
            case 'complete':
                $(page_id).trigger('page:load');
                break;
    
            default:
                // page:load on DOM-ready
                $(function(){
                    $(page_id).trigger('page:load');
                });
        }
    },
    UI: {
        userMenuHide: () => {
            $('.hidden-by-default').each(function(){
                $(this).addClass('hidden');
            })
        },
        userMenuShow: () =>  {
            let server_name = settings.get('xnat_server').split('//')[1];
            $("#menu--server").html(server_name);
            $("#menu--username").html(settings.get('user_auth').username);
            $('#menu--username-server').html(settings.get('user_auth').username + '@' + server_name);
            
            $('.hidden-by-default').each(function(){
                $(this).removeClass('hidden');
            })
        }
    },
    errorMessage: (error) => {
        let msg;
        
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
                    msg = 'Invalid XNAT server address (' + settings.get('xnat_server') + ')';
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

        return msg;
    },
    uuidv4: () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },
    uuidv4_crypto: () => {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        )
    }
}



module.exports = Helper;