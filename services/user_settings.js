module.exports.get = get;
module.exports.set = set;
module.exports.unset = unset;
module.exports.push = push;
module.exports.pop = pop;

const store = require('store2');
const sha1 = require('sha1');
const auth = require('./auth');


function get(filter = false) {
    let current_user = auth.get_current_user();
    if (current_user) {
        /*******************/
        let user_hash = get_username_hash(current_user);
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
    let current_user = auth.get_current_user();

    if (current_user) {
        /*******************/
        let user_hash = get_username_hash(current_user);

        let settings = store.has(user_hash) ? store.get(user_hash) : {};
        settings[filter] = value;
        
        store.set(user_hash, settings);
        /*******************/
    } else {
        throw new Error('User not set')
    }
}

function unset(filter) {
    let current_user = auth.get_current_user();

    if (current_user) {
        /*******************/
        let user_hash = get_username_hash(current_user);

        let settings = store.has(user_hash) ? store.get(user_hash) : {};
        if (settings.hasOwnProperty(filter)) {
            delete settings[filter]
        }
        
        store.set(user_hash, settings);
        /*******************/
    } else {
        throw new Error('User not set')
    }
}

function push(filter, value, unique = true) {
    let current_user = auth.get_current_user();

    if (current_user) {
        /*******************/
        let user_hash = get_username_hash(current_user);

        let settings = store.has(user_hash) ? store.get(user_hash) : {};
        settings[filter] = Array.isArray(settings[filter]) ? settings[filter] : [];

        if (!unique || settings[filter].indexOf(value) === -1) {
            settings[filter].push(value)
        } 
        
        
        store.set(user_hash, settings);
        /*******************/
    } else {
        throw new Error('User not set')
    }
}


function pop(filter, search) {
    let current_user = auth.get_current_user();

    if (current_user) {
        /*******************/
        let user_hash = get_username_hash(current_user);

        let settings = store.has(user_hash) ? store.get(user_hash) : {};
        settings[filter] = Array.isArray(settings[filter]) ? settings[filter] : [];

        settings[filter] = settings[filter].filter(function(item){
            return item !== search;
        });
        
        store.set(user_hash, settings);
        /*******************/
    } else {
        throw new Error('User not set')
    }
}


function get_username_hash(username) {
    return 'user.' + sha1(username)
}