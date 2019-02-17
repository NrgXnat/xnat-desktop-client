const Datastore = require('nedb');
const path = require('path')

const settings = require('electron-settings');
const auth = require('../auth');
const sha1 = require('sha1');

let current_db;

module.exports = db;

function db() {
    // allow loading from main process
    const app = require('electron').remote ? require('electron').remote.app : require('electron').app

    // db.uploads_archive.<sha1(server + username)>.json

    let xnat_server = settings.get('xnat_server');
    let username = auth.get_current_user();

    let file_name = `db.uploads_archive.${sha1(xnat_server + username)}.json`;
    let db_path = path.join(app.getPath('userData'), file_name);

    // console.log('db_path')

    if (current_db && current_db.filename === db_path) {
        return current_db;
    } else {
        current_db = new Datastore({ filename: db_path, autoload: true });
        return current_db;
    }
}

module.exports.listAll = (callback) => { // callback(err, docs)
    db().find({}, callback);
}

module.exports.getById = (id, callback) => { // callback(err, doc)
    db().findOne({id: id}, callback);
}

module.exports.replaceDoc = (id, doc, callback) => { // callback(err, num)
    // just in case
    if (doc._id) {
        delete doc._id
    }
    db().update({id: id}, doc, {}, callback)
}

module.exports.updateProperty = (id, property, value, callback) => { // callback(err, num)
    db().update({ id: id }, { $set: { [property]: value } }, callback);
}






module.exports.insert_one = (name, callback) => { // callback(err, newDoc)
    //db().insert({name: name}, callback);
}

module.exports.remove_by_id = (id, callback) => { // callback(err, numRemoved)
    //db().remove({ _id: id }, {}, callback);
}

/*
The modifiers create the fields they need to modify if they don't exist, 
and you can apply them to subdocs. Available field modifiers are $set to 
change a field's value, $unset to delete a field, $inc to increment a field's 
value and $min/$max to change field's value, only if provided value is less/greater 
than current value. To work on arrays, you have $push, $pop, $addToSet, $pull, and 
the special $each and $slice. See examples below for the syntax.
*/
module.exports.update_name = (id, newname, callback) => { // callback(err, num)
    //db().update({ _id: id }, { $set: { name: newname } }, callback);
}

