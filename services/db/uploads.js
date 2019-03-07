const db_init = require('./_init');

module.exports = db;

function db() {
    return db_init('uploads', true)
}


module.exports.listAll = (callback) => { // callback(err, docs)
    db().find({}, callback);
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


module.exports._replaceDoc = (id, doc) => { // callback(err, num)
    // just in case
    if (doc._id) {
        delete doc._id
    }

    return new Promise((resolve, reject) => {
        db().update({id: id}, doc, {}, (err, num) => {
            if (err) reject(err)
            resolve(doc)
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

