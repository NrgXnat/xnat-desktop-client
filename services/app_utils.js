exports.isDevEnv = () => {
    // return process.argv && process.argv.length >= 3 && /--debug/.test(process.argv[2]);

    // console.log(process.argv)
    // console.log(process.mainModule.filename);
    // alternative
    return process.mainModule.filename.indexOf('app.asar') === -1;
}