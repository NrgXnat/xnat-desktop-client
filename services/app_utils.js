const path = require('path');
const fs = require('fs');

exports.isDevEnv = () => {
    // return process.argv && process.argv.length >= 3 && /--debug/.test(process.argv[2]);

    // console.log(process.argv)
    // console.log(process.mainModule.filename);
    // alternative
    return process.mainModule.filename.indexOf('app.asar') === -1;
}


exports.objArrayToCSV = (objArray) => {
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

exports.isEmptyObject = (myObj) => {
    return JSON.stringify(myObj) === '{}'
}

exports.promiseSerial = (funcs) => {
    const reducer = (promise, func) => {
        return promise.then(result => {
            return func().then(resp => {
                //return Array.prototype.concat.bind(result)(resp)
                return (resp !== false) ? result.concat(resp) : result
            })
        })
    }

    return funcs.reduce(reducer, Promise.resolve([]))
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

function normalizeDateTimeString(date_string, time_string = false) {
    let date = normalizeDateString(date_string);
    if (date) {
        let time = normalizeTimeString(time_string)
        if (!time) {
            time = '00:00:00'
        }

        return `${date} ${time}`;
    } else {
        return false
    }
}
exports.normalizeDateTimeString = normalizeDateTimeString

function normalizeDateString(date_string) {
    if (!date_string) {
        return false;
    } else {
        let only_numbers = date_string.replace(/[^\d]/g, '');

        return only_numbers.length == 8 ? `${only_numbers.substr(0, 4)}-${only_numbers.substr(4, 2)}-${only_numbers.substr(6, 2)}` : false
    }
}
exports.normalizeDateString = normalizeDateString

function normalizeTimeString(only_numbers) {
    if (!only_numbers) {
        return false;
    } else {
        only_numbers = only_numbers.replace(/[^\d]/g, '');

        // time is sometimes stored with decimal point so ">= 6" instead of "== 6"
        return only_numbers.length >= 6 ? `${only_numbers.substr(0, 2)}:${only_numbers.substr(2, 2)}:${only_numbers.substr(4, 2)}` : false;
    }
}
exports.normalizeTimeString = normalizeTimeString