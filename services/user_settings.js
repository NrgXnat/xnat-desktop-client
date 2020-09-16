module.exports.get = get;
module.exports.set = set;
module.exports.unset = unset;
module.exports.push = push;
module.exports.pop = pop;

const store = require('store2');
const ElectronStore = require('electron-store');
const settings = new ElectronStore();
const sha1 = require('sha1');
const auth = require('./auth');


function get(filter = false) {
    let user_hash = get_username_hash();

    if (user_hash) {
        /*******************/
        if (!store.has(user_hash)) {
            store.set(user_hash, {});
        }
        
        let user_settings = store.get(user_hash);

        if (filter === false) {
            return user_settings;
        } else {
            return user_settings.hasOwnProperty(filter) ? user_settings[filter] : undefined;
        }
        /*******************/
    } else {
        throw new Error('User not set')
    }
}

function set(filter, value) {
    let user_hash = get_username_hash();

    if (user_hash) {
        /*******************/
        let data = store.has(user_hash) ? store.get(user_hash) : {};
        data[filter] = value;
        
        store.set(user_hash, data);
        /*******************/
    } else {
        throw new Error('User not set')
    }
}

function unset(filter) {
    let user_hash = get_username_hash();

    if (user_hash) {
        /*******************/
        let user_settings = store.has(user_hash) ? store.get(user_hash) : {};
        if (user_settings.hasOwnProperty(filter)) {
            delete user_settings[filter]
        }
        
        store.set(user_hash, user_settings);
        /*******************/
    } else {
        throw new Error('User not set')
    }
}

function push(filter, value, unique = true) {
    let user_hash = get_username_hash();

    if (user_hash) {
        /*******************/
        let user_settings = store.has(user_hash) ? store.get(user_hash) : {};
        user_settings[filter] = Array.isArray(user_settings[filter]) ? user_settings[filter] : [];

        if (!unique || user_settings[filter].indexOf(value) === -1) {
            user_settings[filter].push(value)
        }
        
        store.set(user_hash, user_settings);
        /*******************/
    } else {
        throw new Error('User not set')
    }
}


function pop(filter, search) {
    let user_hash = get_username_hash();

    if (user_hash) {
        /*******************/
        let user_settings = store.has(user_hash) ? store.get(user_hash) : {};
        user_settings[filter] = Array.isArray(user_settings[filter]) ? user_settings[filter] : [];

        user_settings[filter] = user_settings[filter].filter(item => item !== search);
        
        store.set(user_hash, user_settings);
        /*******************/
    } else {
        throw new Error('User not set')
    }
}


function get_username_hash() {
    let current_user = auth.get_current_user();

    if (current_user) {
        let current_xnat_server = settings.get('xnat_server');
        return 'user.' + sha1(current_user + current_xnat_server)
    } else {
        return false;
    }
    
}