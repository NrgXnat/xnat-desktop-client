const Datastore = require('nedb');
const path = require('path')

const settings = require('electron-settings');
const auth = require('../auth');
const sha1 = require('sha1');


const app = require('electron').remote ? require('electron').remote.app : require('electron').app


let db_filename = `nedb-logger`;
let db_path = path.join(app.getPath('userData'), `db.${db_filename}.json`);
let db_logger = new Datastore({ filename: db_path });


module.exports.fetch_log = (transfer_id, callback) => {
    db_logger.loadDatabase();
    db_logger.find({transfer_id: transfer_id}, callback); // callback(err, docs)
}

