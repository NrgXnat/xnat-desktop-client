const settings = require('electron-settings');
const path = require('path');
const auth = require('./../../services/auth');

const stack_bar_bottom = {"dir1": "up", "dir2": "right", "spacing1": 5, "spacing2": 0};

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
            $("#menu--username").html(auth.get_current_user());
            $('#menu--username-server').html(auth.get_current_user() + '@' + server_name);
            
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
            
            error.response = auth.anonymize_response(error.response, '***ANON***')
            
            switch (error.response.status) {
                case 401:
                    msg = 'Invalid username or password!';
                    break;
                case 404:
                    msg = 'Invalid XNAT server address!';
                    break;
                default:
                try {
                    msg =  `An error occured. Please try again. (${JSON.stringify(error.response, undefined, 2)})`;
                } catch (e) {
                    console.log({helper_error: error})
                    msg =  `An error occured. Please try again. (${error.response.status})`;
                }
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

        return year + '-' + month + '-' + date + (show_time ? ' ' + hour + ':' + min + ':' + sec : '');
    },

    date: (UNIX_timestamp = false) => {
        let UT = (UNIX_timestamp === false) ? Helper.unix_timestamp() : UNIX_timestamp;
        return Helper.date_time(UT, false);
    },

    notify: (body, title, icon) => {
        // Notification code        
        let real_icon = icon == undefined ? path.join(__dirname, '../icons/png/XDC.png') : icon;
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
    },

    arrayBatch: (arr, batch_size = 10) => {

        return arr.reduce((accumulator, currentValue) => {
            if (accumulator.length === 0) {
                accumulator.push([currentValue]);
            } else {
                let last_arr_el = accumulator[accumulator.length - 1];
                if (last_arr_el.length < batch_size) {
                    last_arr_el.push(currentValue)
                } else {
                    accumulator.push([currentValue]);
                }
            }
            
            return accumulator;
        }, []);
    },

    promiseSerial: (funcs) => {
        const reducer = (promise, func) => {
            return promise.then(result => {
                return func().then(resp => {
                    //return Array.prototype.concat.bind(result)(resp)
                    return (resp !== false) ? result.concat(resp) : result
                })
            })
        }

        return funcs.reduce(reducer, Promise.resolve([]))
    },

    copy_obj: (obj) => JSON.parse(JSON.stringify(obj)),
           

    // types => success (green), info (blue), notice (yellow), error (red)
    pnotify: (title, text, type = 'success', delay = 7000) => {

        let options = {
            title: "Default Title",
            text: "Default message",
            type: "success",
            addclass: "stack-bar-bottom",
            cornerclass: "",
            width: "70%",
            stack: stack_bar_bottom,
            buttons: {
                closer_hover: false,
                sticker_hover: false,
                show_on_nonblock: true,
                classes: {
                    closer: 'fas fa-times',
                    pin_up: 'fas fa-pause',
                    pin_down: 'fas fa-play'
                }
            },
            nonblock: {
                nonblock: false
            }
        };

        options.title = title;
        options.text = text;
        options.type = type;
        options.delay = delay

        new PNotify(options);
    }
}



module.exports = Helper;