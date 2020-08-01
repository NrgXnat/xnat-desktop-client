const path = require('path');
const fs = require('fs');
const checksum = require('checksum');
const FileSaver = require('file-saver');

exports.isDevEnv = () => {
    // return process.argv && process.argv.length >= 3 && /--debug/.test(process.argv[2]);

    // console.log(process.argv)
    // console.log(process.mainModule.filename);
    // alternative
    return process.mainModule.filename.indexOf('app.asar') === -1;
}


function objArrayToCSV(objArray) {
    function isObject (value) {
        return value && typeof value === 'object' && value.constructor === Object;
    }

    function replaceAll(str, find, replace) {
        return str.replace(new RegExp(find, 'g'), replace);
    }

    const replacer = (key, value) => value === null ? '' : value; // handle null values here

    const header = Object.keys(objArray[0]);

    // let csv = objArray.map(row => header.map(fieldName => JSON.stringify(row[fieldName], replacer)).join(','));

    let csv = objArray.map(row => {
        return header.map(fieldName => {
            let str = JSON.stringify(row[fieldName], replacer);

            if (isObject(row[fieldName])) {
                return `"${replaceAll(str, '"', '""')}"`;
            } else {
                return str;
            }
            
        }).join(',')
    });

    csv.unshift(header.join(','));
    csv = csv.join('\r\n');

    return csv;
}

exports.objArrayToCSV = objArrayToCSV

exports.saveAsCSV = (data, filename) => {
    let csv = objArrayToCSV(data);

    var file = new File([csv], filename, {type: "text/csv;charset=utf-8"});
    FileSaver.saveAs(file);
}

exports.isReallyWritable = (_path) => {
    let new_dir = '__TEST__'  + Date.now();
    let write_test_path = path.join(_path, new_dir)

    // using a workaround since fs.accessSync(_path, fs.constants.R_OK | fs.constants.W_OK) does not work
    // check if it works for built version
    try {
        fs.mkdirSync(write_test_path);
        fs.rmdirSync(write_test_path);
        return true;
    } catch(err) {
        return false;
    }
}

exports.uuidv4 = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

exports.uuidv4_crypto = () => {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    )
}


exports.random_string = (length, include_lowercase = false) => {
    let rand_str = "";
    let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    if (include_lowercase) {
        chars += "abcdefghijklmnopqrstuvwxyz";
    }

    for (let i = 0; i < length; i++) {
        rand_str += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return rand_str;
};

exports.file_checksum = async (file_path) => {
    return new Promise((resolve, reject) => {
        checksum.file(file_path, {algorithm: 'md5'}, function(checksum_err, checksum) {
            if (checksum_err) {
                reject(checksum_err)
            } else {
                resolve(checksum)
            }
        })
    })
}

// sort alphabetically (if attr is set, sort objects by attr alphabetically)
// string_arr.sort(sortAlpha())
// obj_arr.sort(sortAlpha('name'))
exports.sortAlpha = (attr = false) => {
    return function (a, b) {
        var aValue = attr === false ? a : a[attr].toLowerCase();
        var bValue = attr === false ? b : b[attr].toLowerCase(); 
        return ((aValue < bValue) ? -1 : ((aValue > bValue) ? 1 : 0));
    }
}



