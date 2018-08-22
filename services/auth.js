const settings = require('electron-settings');
const path = require('path');
const axios = require('axios');
require('promise.prototype.finally').shim();

const https = require('https');
console.log(https.globalAgent.options)
https.globalAgent.options.rejectUnauthorized = false;



const remote = require('electron').remote;

let auth = {
    test: () => {
        console.log('auth.test() radi');
    },

    login_promise_node: (xnat_server, user_auth) => {

        return new Promise(function (resolve, reject) {
            https.get(xnat_server + '/data/auth', {
                auth: user_auth
            }, (res) => {
                console.log('statusCode:', res.statusCode);
                console.log('headers:', res.headers);
    
                res.on('data', (d) => {
                    process.stdout.write(d);
                });

                resolve('All OK');
    
            }).on('error', (e) => {
                console.error(e);
                reject('Error X');
            });
    
            // At request level
            //let agent = new https.Agent({rejectUnauthorized: false});
        });
        
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
        
        auth.set_user_auth(user_auth);
        
        delete user_auth.password;
        settings.set('user_auth', user_auth);
    },

    remove_current_user: () => {
        settings.delete('user_auth');
        settings.delete('xnat_server');
        auth.remove_user_auth();
    },

    set_user_auth: (user_auth) => {
        remote.getGlobal('user_auth').username = user_auth.username;
        remote.getGlobal('user_auth').password = user_auth.password;
    },

    remove_user_auth: () => {
        remote.getGlobal('user_auth').username = null;
        remote.getGlobal('user_auth').password = null;
    },

    get_user_auth: () => {
        return remote.getGlobal('user_auth');

        // if cached
        // return {
        //     username: remote.getGlobal('user_auth').username,
        //     password: remote.getGlobal('user_auth').password
        // };
    },

    get_current_user: () => {
        return settings.has('user_auth') ? settings.get('user_auth').username : '';
    },


    get_csrf_token_old: (xnat_server, user_auth) => {
        return axios.get(xnat_server + '/', {
            auth: user_auth
        });
    },

    get_csrf_token: (xnat_server, user_auth) => {
        return new Promise(function (resolve, reject) {
            return axios.get(xnat_server + '/', {
                auth: user_auth
            }).then(resp => {
                let csrfTokenRequestData = resp.data;
                let m, csrfToken = false;
                const regex = /var csrfToken = '(.+?)';/g;

                while ((m = regex.exec(csrfTokenRequestData)) !== null) {
                    // This is necessary to avoid infinite loops with zero-width matches
                    if (m.index === regex.lastIndex) {
                        regex.lastIndex++;
                    }

                    csrfToken = m[1];
                }

                resolve(csrfToken);
            }).catch(err => {
                resolve(false);
            });
        });
    }
}



module.exports = auth;