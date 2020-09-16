const Datastore = require('nedb');
const path = require('path')

const ElectronStore = require('electron-store');
const settings = new ElectronStore();
const auth = require('../auth');
const sha1 = require('sha1');

let db_cache = [];

module.exports = (db_id, user_specific = true) => {
    // db.uploads.<sha1(server + username)>.json
    // db.uploads_archive.<sha1(server + username)>.json
    // db.downloads.<sha1(server + username)>.json
    // db.downloads_archive.<sha1(server + username)>.json

    let db_sha1 = '';
    if (user_specific) {
        let xnat_server = settings.get('xnat_server');
        let username = auth.get_current_user();

        db_sha1 = sha1(xnat_server + username)
    }

    let db_index = db_cache.findIndex(instance => instance.id === db_id);

    if (db_index >= 0) {
        if (db_cache[db_index].sha1 === db_sha1) { // return from cache
            return db_cache[db_index].instance;
        } else { // remove from cache, free up memory
            db_cache.splice(db_index, 1);
        }
    }

    const app = require('electron').remote ? require('electron').remote.app : require('electron').app

    let db_filename = user_specific ? `${db_id}.${db_sha1}` : db_id;
    let db_path = path.join(app.getPath('userData'), `db.${db_filename}.json`);
    let db_instance = new Datastore({ filename: db_path, autoload: true });
    
    // append to cache
    db_cache.push({
        id: db_id,
        sha1: db_sha1,
        instance: db_instance
    });

    return db_instance;
}