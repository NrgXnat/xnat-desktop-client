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


