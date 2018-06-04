const settings = require('electron-settings');
const path = require('path');

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
            let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },
    uuidv4_crypto: () => {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        )
    },

    unix_timestamp: () => {
        return Math.round((new Date()).getTime() / 1000);
    },
    
    date_time: (UNIX_timestamp = false, show_time = true) => {
        let UT = (UNIX_timestamp === false) ? Helper.unix_timestamp() : UNIX_timestamp;
        let a = new Date(UT * 1000);
        let year = a.getFullYear();
        let date_range = Helper.range(1, 12);
        let month = date_range[a.getMonth()] < 10 ? '0' + date_range[a.getMonth()] : date_range[a.getMonth()];
        let date = a.getDate() < 10 ? '0' + a.getDate() : a.getDate();

        let hour, min, sec;
        if (show_time) {
            hour = a.getHours() < 10 ? '0' + a.getHours() : a.getHours();
            min = a.getMinutes() < 10 ? '0' + a.getMinutes() : a.getMinutes();
            sec = a.getSeconds() < 10 ? '0' + a.getSeconds() : a.getSeconds();
        }

        return year + '/' + month + '/' + date + (show_time ? ' ' + hour + ':' + min + ':' + sec : '');
    },

    date: (UNIX_timestamp = false) => {
        let UT = (UNIX_timestamp === false) ? Helper.unix_timestamp() : UNIX_timestamp;
        return Helper.date_time(UT, false);
    },

    notify: (body, title, icon) => {
        // Notification code        
        let real_icon = icon == undefined ? path.join(__dirname, '../icons/png/icon.png') : icon;
        let real_title = title == undefined ? 'XNAT Desktop Client' : title;
        
        const notification = {
            title: real_title,
            body: body,
            icon: real_icon
        };

        function notify() {
            const myNotification = new window.Notification(notification.title, notification);
        }

        notify();
    },

    capitalizeFirstLetter: (str) => {
        return str.charAt(0).toUpperCase() + str.slice(1);
    },

    range: (start, stop, step) => {
        let a = [start], b = start;
        while (b < stop) { 
            b += (step || 1); 
            a.push(b);
        }
        return a;
    }
}



module.exports = Helper;