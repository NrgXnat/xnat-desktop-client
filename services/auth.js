const ElectronStore = require('electron-store')
const settings = new ElectronStore()
const axios = require('axios')
const store = require('store2')
const sha1 = require('sha1')
const { ipcRenderer } = require('electron')
if (process.type !== 'renderer') {
    console.trace("auth.js loaded in main:");
}
const { getGlobal, session } = require('@electron/remote');
const { URL } = require('url')
const lodashCloneDeep = require('lodash/cloneDeep')
const isPlainObject = require('lodash/isPlainObject')

const XNATAPI = require('./xnat-api')

// how long the app waits for the browser to hand back a login
const BROWSER_AUTH_TIMEOUT_MS = 15 * 60 * 1000

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
            allow_insecure_ssl: allow_insecure_ssl,
            auth_method: xnat_server ? auth.get_login_auth_method(xnat_server, username) : 'browser'
        }
    },

    // auth_method is 'password' or 'browser'. When it isn't specified, an existing entry keeps its
    // stored method and a new entry gets none (treated as 'password', the pre-browser-auth behavior).
    save_login_data: (xnat_server, user_auth, allow_insecure_ssl = false, old_user_data = false, auth_method = undefined) => {
        let logins = settings.get('logins') || [];

        if (!auth_method) {
            auth_method = auth.get_login_auth_method(xnat_server, user_auth.username, null) || undefined;
        }

        // A connection saved from the settings page may have only a server URL. Once a real user has logged
        // in to that server, that user's entry replaces it.
        if (user_auth.username) {
            logins = logins.filter(el => el.server !== xnat_server || el.username);
        }

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

        const login_entry = {
            server: xnat_server,
            username: user_auth.username,
            allow_insecure_ssl: allow_insecure_ssl
        };

        if (auth_method) {
            login_entry.auth_method = auth_method;
        }

        if (found == -1) { // not found
            logins.unshift(login_entry);
        } else if (found == 0) { // found first
            if (auth_method) {
                logins[0].auth_method = auth_method;
            }
        } else { // found, but not first
            logins.splice(found, 1); // remove
            // add at the beginning
            logins.unshift(login_entry);
        }

        // SAVE logins
        settings.set('logins', logins);  
    },

    get_login_auth_method: (xnat_server, username, default_method = 'password') => {
        const logins = settings.get('logins') || [];
        const login = logins.find(el => el.server === xnat_server && el.username === username);

        return login && login.auth_method ? login.auth_method : default_method;
    },

    // URL to open in the system browser. XNAT caches externalAuth in the HTTP session and, once the user
    // has authenticated, hands an alias token back through the xnat(s):// protocol (see protocol_request
    // in renderer-process/index3.js).
    browser_login_url: (xnat_server, username) => {
        const url = new URL(xnat_server.replace(/\/$/, '') + '/');
        url.searchParams.set('externalAuth', 'true');
        if (username) {
            url.searchParams.set('username', username);
        }
        return url.toString();
    },

    // Returns the server URL with a protocol. Like the password login, it tries https and falls back to
    // http when none is given. Any HTTP response counts as reachable, since there are no credentials to
    // test. Throws if the server can't be reached.
    resolve_server_url: async (entered_server, allow_insecure_ssl = false) => {
        const candidates = /^https?:\/\//i.test(entered_server) ? [entered_server] : ['https://' + entered_server, 'http://' + entered_server];
        const remote_app = require('@electron/remote').app;

        let last_error;
        remote_app.allow_insecure_ssl = allow_insecure_ssl;
        try {
            for (const candidate of candidates) {
                try {
                    await axios.get(candidate + '/', {
                        timeout: 10000,
                        validateStatus: () => true
                    });
                    return candidate;
                } catch (err) {
                    last_error = err;
                }
            }
        } finally {
            remote_app.allow_insecure_ssl = false;
        }

        throw last_error;
    },

    // A browser login request is recorded so that only an xnat(s)://.../auth callback the user actually
    // asked for is accepted. Otherwise any web page could log the app into an arbitrary server.
    start_pending_browser_auth: (xnat_server, allow_insecure_ssl) => {
        settings.set('pending_browser_auth', {
            server: xnat_server,
            allow_insecure_ssl: !!allow_insecure_ssl,
            started: Date.now()
        });
    },

    cancel_pending_browser_auth: () => {
        settings.delete('pending_browser_auth');
    },

    has_pending_browser_auth: () => {
        const pending = settings.get('pending_browser_auth');
        return !!pending && Date.now() - pending.started <= BROWSER_AUTH_TIMEOUT_MS;
    },

    // Returns and clears the pending request if it matches the callback's server, otherwise null. The
    // scheme is ignored: XNAT builds the callback from the request it received, which reports http behind
    // a TLS-terminating proxy. The returned pending.server keeps the scheme the user connected with.
    take_pending_browser_auth: (callback_server) => {
        const pending = settings.get('pending_browser_auth');

        if (!pending || Date.now() - pending.started > BROWSER_AUTH_TIMEOUT_MS) {
            settings.delete('pending_browser_auth');
            return null;
        }

        if (auth.server_identity(pending.server) !== auth.server_identity(callback_server)) {
            return null;
        }

        settings.delete('pending_browser_auth');
        return pending;
    },

    // host[:non-default port]/context-path, lowercased host, no trailing slash
    server_identity: (xnat_server) => {
        const url = new URL(xnat_server);
        return url.host.toLowerCase() + url.pathname.replace(/\/+$/, '');
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

        ipcRenderer.send('log', 'set_user_auth', {user_auth__SET: getGlobal('user_auth')})
    },

    remove_user_auth: () => {
        // update globals only in main.js process!
        ipcRenderer.send('update_global_variable', 'user_auth', {
            username: null,
            password: null
        })

        ipcRenderer.send('log', 'remove_user_auth', {user_auth__REMOVE: getGlobal('user_auth')})
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
        return getGlobal('user_auth');

        // if cached
        // return {
        //     username: getGlobal('user_auth').username,
        //     password: getGlobal('user_auth').password
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

    get_jsession_cookie: async (xnat_url = false) => {
        console.log('get_jsession_cookie 1');
        let xnat_server;
    
        if (xnat_url) {
            xnat_server = xnat_url;
        } else if (settings.has('xnat_server')) {
            xnat_server = settings.get('xnat_server');
        } else {
            throw new Error('get_jsession_cookie() error: no server URL provided');
        }
    
        let slash_url = xnat_server + '/';
    
        let jsession = {
            id: null,
            expiration: null
        };
    
        try {
            console.log('get_jsession_cookie 2');
            const cookies = await session.defaultSession.cookies.get({ url: slash_url });
            console.log('KOLACICI: ', cookies);
    
            if (cookies.length) {
                cookies.forEach(item => {
                    if (item.name === 'JSESSIONID') {
                        jsession.id = item.value;
                    }
    
                    if (item.name === 'SESSION_EXPIRATION_TIME') {
                        jsession.expiration = item.value;
                    }
                });
    
                if (jsession.id && jsession.expiration) {
                    return `JSESSIONID=${jsession.id}; SESSION_EXPIRATION_TIME=${jsession.expiration};`;
                } else {
                    throw new Error(xnat_url + ' [No JSESSIONID Cookie]');
                }
    
            } else {
                throw new Error(xnat_url + ' [No Cookies]');
            }
        } catch (error) {
            console.error('Error fetching cookies: ', error);
            throw error; // Propagate the error to the caller
        }
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