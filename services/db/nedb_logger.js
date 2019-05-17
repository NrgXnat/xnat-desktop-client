const Logger = require('nedb-logger')

const path = require('path')

const settings = require('electron-settings')
const auth = require('../auth')
const sha1 = require('sha1')

const app = require('electron').remote ? require('electron').remote.app : require('electron').app


let db_filename = `nedb-logger`;
let db_path = path.join(app.getPath('userData'), `db.${db_filename}.json`);
let db_logger = new Logger({ filename: db_path });


module.exports.debug = (transfer_id, type, message, details_object = '') => {
    insert_log(transfer_id, type, 'debug', message, details_object)
}
module.exports.info = (transfer_id, type, message, details_object = '') => {
    insert_log(transfer_id, type, 'info', message, details_object)
}
module.exports.error = (transfer_id, type, message, details_object = '') => {
    insert_log(transfer_id, type, 'error', message, details_object)
}
module.exports.success = (transfer_id, type, message, details_object = '') => {
    insert_log(transfer_id, type, 'success', message, details_object)
}


function insert_log(transfer_id, type, level, message, details_object) {
    let xnat_server = settings.get('xnat_server');
    let username = auth.get_current_user();

    let insert_data = {
        user_server: sha1(`${xnat_server}-${username}`),
        type: type, // upload/download
        transfer_id: transfer_id,
        level: level, // debug, info, error, success ?
        message: message, // '... string' 
        details: JSON.stringify(details_object),
        timestamp: new Date()
    };

    db_logger.insert(insert_data, function (err) {
        // err will not be null if the object is not well formatted for NeDB
        // meaning one of the keys contains a dot or begins with a dollar sign
        if (err) {
            insert_data.details = '/';
            db_logger.insert(insert_data)
        }
    });
}

