const settings = require('electron-settings');
const path = require('path');
const axios = require('axios');
require('promise.prototype.finally').shim();
const store = require('store2');
const sha1 = require('sha1');
const ipc = require('electron').ipcRenderer

const {URL} = require('url');
const remote = require('electron').remote;

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

    save_login_data: (xnat_server, user_auth, allow_insecure_ssl = false, old_user_data = false) => {
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
                username: user_auth.username,
                allow_insecure_ssl: allow_insecure_ssl
            });
        } else if (found == 0) { // found first
            // do nothing
        } else { // found, but not first
            logins.splice(found, 1); // remove
            // add at the beginning
            logins.unshift({ 
                server: xnat_server,
                username: user_auth.username,
                allow_insecure_ssl: allow_insecure_ssl
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
        ipc.send('print_global')
    },

    remove_user_auth: () => {
        remote.getGlobal('user_auth').username = null;
        remote.getGlobal('user_auth').password = null;
        ipc.send('print_global')
    },

    set_allow_insecure_ssl: (new_status) => {
        settings.set('allow_insecure_ssl', new_status);
    },

    allow_insecure_ssl: () => {
        return settings.has('allow_insecure_ssl') ? settings.get('allow_insecure_ssl') : false;
    },

    is_insecure_ssl_allowed: (url) => {
        let url_object = new URL(url);
        let xnat_server_origin = url_object.origin;

        let logins = settings.get('logins');
        let allow_insecure_ssl = false;

        for (let i = 0; i < logins.length; i++) {
            if (logins[i].server.indexOf(xnat_server_origin) == 0 && logins[i].allow_insecure_ssl) {
                allow_insecure_ssl = true;
            }
        }
        
        return allow_insecure_ssl;
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

    get_csrf_token: (xnat_server, user_auth, created_offset = 120) => {
        const now = () => parseInt(new Date() / 1000);

        return new Promise(function (resolve, reject) {
            if (!store.has('csrf_token_cache')) {
                store.set('csrf_token_cache', [])
            }
            let csrf_token_cache = store.get('csrf_token_cache')
    
            let token_id = sha1(xnat_server + user_auth.username);
            let token_match = csrf_token_cache.filter(token => token_id === token.id)
    
            if (token_match.length && token_match[0].created + created_offset > now()) {
                resolve(token_match[0].token)
            } else {
                // if there are cached tokens with same id => remove them
                if (token_match.length) {
                    csrf_token_cache = csrf_token_cache.filter(token => token_id !== token.id)
                }

                axios.get(xnat_server + '/', {
                    auth: user_auth
                }).then(resp => {
                    let csrfTokenRequestData = resp.data
                    let m, csrfToken = false
                    const regex = /var csrfToken = '(.+?)';/g
    
                    while ((m = regex.exec(csrfTokenRequestData)) !== null) {
                        // This is necessary to avoid infinite loops with zero-width matches
                        if (m.index === regex.lastIndex) {
                            regex.lastIndex++
                        }
    
                        csrfToken = m[1]
                    }
                    
                    csrf_token_cache.push({
                        id: token_id,
                        created: now(),
                        token: csrfToken
                    })

                    store.set('csrf_token_cache', csrf_token_cache)

                    resolve(csrfToken)
                }).catch(err => {
                    resolve(false)
                })
            }
            
        })
    }
}



module.exports = auth;