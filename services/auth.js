const ElectronStore = require('electron-store')
const settings = new ElectronStore()
const axios = require('axios')
const store = require('store2')
const sha1 = require('sha1')
const { ipcRenderer, remote } = require('electron')
const { URL } = require('url')
const lodashCloneDeep = require('lodash/cloneDeep')
const isPlainObject = require('lodash/isPlainObject')

const XNATAPI = require('./xnat-api')

const auth = {
    login_promise: (xnat_server, user_auth) => {
        return axios.get(xnat_server + '/data/auth', {
            auth: user_auth
        })
    },

    logout_promise: (xnat_server) => {
        return axios.get(xnat_server + '/app/action/LogoutUser');
    },

    current_login_data: () => {
        let xnat_server = settings.get('xnat_server') ? settings.get('xnat_server') : null
        let allow_insecure_ssl = xnat_server ? auth.is_insecure_ssl_allowed(xnat_server) : null
        let user_auth = settings.get('user_auth')

        let username = user_auth && user_auth.username ? user_auth.username : null
        
        return {
            server: xnat_server,
            username: username,
            allow_insecure_ssl: allow_insecure_ssl
        }
    },

    save_login_data: (xnat_server, user_auth, allow_insecure_ssl = false, old_user_data = false) => {
        let logins = settings.get('logins') || [];

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
        let logins = settings.get('logins') || [];
            
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
        // update globals only in main.js process!
        ipcRenderer.send('update_global_variable', 'user_auth', {
            username: user_auth.username,
            password: user_auth.password
        })

        ipcRenderer.send('log', 'set_user_auth', {user_auth__SET: remote.getGlobal('user_auth')})
    },

    remove_user_auth: () => {
        // update globals only in main.js process!
        ipcRenderer.send('update_global_variable', 'user_auth', {
            username: null,
            password: null
        })

        ipcRenderer.send('log', 'remove_user_auth', {user_auth__REMOVE: remote.getGlobal('user_auth')})
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

        let logins = settings.get('logins') || [];
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
        const user_auth = settings.get('user_auth')
        return user_auth && isPlainObject(user_auth) && user_auth.hasOwnProperty('username') ? user_auth.username : ''
    },

    get_csrf_token: async (xnat_server, user_auth, created_offset = 30) => {
        const now = () => parseInt(new Date() / 1000);

        if (!store.has('csrf_token_cache')) {
            store.set('csrf_token_cache', [])
        }
        let csrf_token_cache = store.get('csrf_token_cache')

        let token_id = sha1(xnat_server + user_auth.username);
        let token_match = csrf_token_cache.filter(token => token_id === token.id)

        if (token_match.length && token_match[0].created + created_offset > now()) {
            return token_match[0].token
        } else {
            // if there are cached tokens with same id => remove them
            if (token_match.length) {
                csrf_token_cache = csrf_token_cache.filter(token => token_id !== token.id)
            }
            
            try {
                const xnat_api = new XNATAPI(xnat_server, user_auth)
                const csrfToken = await xnat_api.get_csrf_token()

                csrf_token_cache.push({
                    id: token_id,
                    created: now(),
                    token: csrfToken
                })

                store.set('csrf_token_cache', csrf_token_cache)

                return csrfToken

            } catch (err) {
                console.log(err)
                return false
            }
        }
    },

    get_jsession_cookie: (xnat_url = false) => {
        return new Promise((resolve, reject) => {
            let xnat_server;

            if (xnat_url) {
                xnat_server = xnat_url
            } else if (settings.has('xnat_server')) {
                xnat_server = settings.get('xnat_server')
            } else {
                reject('get_jsession_cookie() error: no server URL provided')
            }

            let slash_url = xnat_server + '/';
            
            let jsession = {
                id: null,
                expiration: null
            }
            
            // Query cookies associated with a specific url.
            remote.session.defaultSession.cookies.get({url: slash_url}, (error, cookies) => {
                if (cookies.length) {
                    cookies.forEach(item => {
                        if (item.name === 'JSESSIONID') {
                            jsession.id = item.value
                        }
    
                        if (item.name === 'SESSION_EXPIRATION_TIME') {
                            jsession.expiration = item.value;
                        }
                    });
                    
                    if (jsession.id && jsession.expiration) {
                        resolve(`JSESSIONID=${jsession.id}; SESSION_EXPIRATION_TIME=${jsession.expiration};`);
                    } else {
                        reject(xnat_url + ' [No JSESSIONID Cookie]')
                    }
                    
                } else {
                    reject(xnat_url + ' [No Cookies]')
                }
                
            })
        });
    },

    anonymize_response: (response, anon = '***REMOVED***') => {
        let conf, data = lodashCloneDeep(response)

        if (data.config) {
            conf = data.config
        }

        if (data.error && data.error.config) {
            conf = data.error.config
        }

        if (conf) {
            if (conf.auth && conf.auth.password) {
                conf.auth.password = anon
            }

            if (conf.headers && conf.headers.Authorization) {
                conf.headers.Authorization = anon
            }
        }

        return data
    }
}

module.exports = auth;