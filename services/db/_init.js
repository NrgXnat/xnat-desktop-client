const Datastore = require('nedb');
const path = require('path')

const settings = require('electron-settings');
const auth = require('../auth');
const sha1 = require('sha1');

module.exports = (db_file, user_specific = true) => {
    // allow loading from main process
    const app = require('electron').remote ? require('electron').remote.app : require('electron').app

    // db.uploads.<sha1(server + username)>.json
    // db.uploads_archive.<sha1(server + username)>.json
    // db.downloads.<sha1(server + username)>.json
    // db.downloads_archive.<sha1(server + username)>.json
    
    let file_name = `db.${db_file}.json`;

    if (user_specific) {
        let xnat_server = settings.get('xnat_server');
        let username = auth.get_current_user();
    
        file_name = `db.${db_file}.${sha1(xnat_server + username)}.json`;
    }

    let db_path = path.join(app.getPath('userData'), file_name);


    return new Datastore({ filename: db_path, autoload: true });
}