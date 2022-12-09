const db_init = require('./_init');
const lodashCloneDeep = require('lodash/cloneDeep')

module.exports = db;

function db() {
    return db_init('uploads', true)
}


module.exports.listAll = (callback) => { // callback(err, docs)
    db().find({}, callback);
}

module.exports._listAll = () => {
    return new Promise((resolve, reject) => {
        db().find({}, (err, doc) => {
            if (err) reject(err)
            resolve(doc)
        });
    })
}

module.exports.getById = (id, callback) => { // callback(err, doc)
    db().findOne({id: id}, callback);
}

module.exports._getById = (id) => { // callback(err, doc)
    return new Promise((resolve, reject) => {
        db().findOne({id: id}, (err, doc) => {
            if (err) reject(err)
            resolve(doc)
        });
    })
}

module.exports._getByIdCopy = (id) => { // callback(err, doc)
    return new Promise((resolve, reject) => {
        db().findOne({id: id}, (err, doc) => {
            if (err) reject(err)
            resolve(lodashCloneDeep(doc))
        });
    })
}


module.exports._replaceDoc = (id, doc) => { // callback(err, num)
    // just in case
    if (doc._id) {
        delete doc._id
    }

    let docClone = lodashCloneDeep(doc)

    return new Promise((resolve, reject) => {
        db().update({id: id}, docClone, {}, (err, num) => {
            if (err) reject(err)
            resolve(docClone)
        })
    })
    
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

module.exports._updateProperty = (id, property, value) => { 
    return new Promise((resolve, reject) => {
        db().update({ id: id }, { $set: { [property]: value } }, (err, num) => {
            if (err) reject(err)
            resolve(num)
        });
    });
}

module.exports._insertDoc = (data) => {
    return new Promise((resolve, reject) => {
        db().insert(data, (err, newItem) => {
            if (err) reject(err)
            resolve(newItem)
        });
    });
}

module.exports.compactDb = (onCompactionDone = null) => {
    db().persistence.compactDatafile()
    db().once('compaction.done', function() {
        // console.log('Database compaction is done - from uploads.js')
        if (onCompactionDone) {
            onCompactionDone()
        }
    })
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

