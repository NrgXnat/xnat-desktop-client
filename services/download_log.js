const fs = require('fs')
const { dialog, app, shell } = require('electron')
const electron_log = require('./electron_log');
const moment = require('moment');
const archiver = require('archiver');
const path = require('path')

module.exports = function() {
    let date_string = moment().format('YYYY-MM-DD--HH-mm-ss')
    dialog.showSaveDialog({
        title: 'Save Log File',
        defaultPath: `xnat-desktop-client--${date_string}.log.zip`
    }, dialog_callback)
}

function dialog_callback(filename) {
    if (filename !== undefined) {
        //fs.copyFileSync(electron_log.transports.file.findLogPath(), filename);

        var output = fs.createWriteStream(filename);

        var archive = archiver('zip', {
            zlib: { level: 6 } // Sets the compression level.
        });

        archive.pipe(output);

        // listen for all archive data to be written
        // 'close' event is fired only when a file descriptor is involved
        output.on('close', function () {
            //console.log(archive.pointer() + ' total bytes');
            //console.log('archiver has been finalized and the output file descriptor has closed.');
        });

        // This event is fired when the data source is drained no matter what was the data source.
        // It is not part of this library but rather from the NodeJS Stream API.
        output.on('end', function () {
            //console.log('Data has been drained');
        });
        
        archive.on('warning', function (err) {
            if (err.code === 'ENOENT') {
                // log warning
            } else {
                // throw error
                throw err;
            }
        });

        // good practice to catch this error explicitly
        archive.on('error', function (err) {
            throw err;
        });
        
        // Fires when the entry's input has been processed and appended to the archive.
        archive.on('entry', function (entry_data) {
            //console.log(entry_data)
        })

        let xlectric_log = path.join(app.getAppPath(), 'xlectric.log');

        archive.file(electron_log.transports.file.findLogPath(), { name: 'xnat-desktop-client.log' });
        archive.file(xlectric_log, { name: 'xlectric.log' });

        archive.finalize();

        //fs.writeFileSync(filename, fs.readFileSync(electron_log.transports.file.findLogPath()))

        shell.showItemInFolder(filename)
    }
}