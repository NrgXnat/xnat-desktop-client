const settings = require('electron-settings');
const path = require('path');
const axios = require('axios');
require('promise.prototype.finally').shim();

let auth = {
    test: () => {
        console.log('auth.test() radi');
    },

    login_promise: (xnat_server, user_auth) => {
        return axios.get(xnat_server + '/data/auth', {
            auth: user_auth
        })
    },

    logout_promise: (xnat_server) => {
        return axios.get(xnat_server + '/app/action/LogoutUser');
    },

    save_login_data: (xnat_server, user_auth, old_user_data = false) => {
        let logins = settings.get('logins');

        // old user data is only used for testing connection
        if (old_user_data) {
            // REMOVE OLD
            let found_old = -1;
            logins.forEach(function(el, i) {
                if (el.server === old_user_data.server && el.username === old_user_data.username) {
                    found_old = i;
                }
            });

            if (found_old != -1) {
                logins.splice(found_old, 1)
            }
        }

        let found = -1;
        logins.forEach(function(el, i) {
            if (el.server === xnat_server && el.username === user_auth.username) {
                found = i;
            }
        });

        if (found == -1) { // not found
            logins.unshift({
                server: xnat_server,
                username: user_auth.username
            });
        } else if (found == 0) { // found first
            // do nothing
        } else { // found, but not first
            logins.splice(found, 1); // remove
            // add at the beginning
            logins.unshift({ 
                server: xnat_server,
                username: user_auth.username
            });
        }

        // SAVE logins
        settings.set('logins', logins);  
    },

    remove_login_data: (xnat_server, user_auth) => {
        let logins = settings.get('logins');
            
        let found = -1;
        logins.forEach(function(el, i) {
            if (el.server === xnat_server && el.username === user_auth.username) {
                found = i;
            }
        })

        if (found >= 0) {
            logins.splice(found, 1);
            settings.set('logins', logins);
        }
    },

    save_current_user: (xnat_server, user_auth) => {
        settings.set('xnat_server', xnat_server);
        settings.set('user_auth', user_auth);
    }
}



module.exports = auth;