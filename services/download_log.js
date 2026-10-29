const fs = require('fs')
const { dialog, app, shell } = require('electron')
const electron_log = require('./electron_log');
const moment = require('moment');
const archiver = require('archiver');
const path = require('path')

const nedb_log_reader = require('./db/nedb_log_reader');
const { transferLogCsv } = require('./db/utils');
const { redactText } = require('./redact');

module.exports = function() {
    let date_string = moment().format('YYYY-MM-DD--HH-mm-ss')
    // Electron 10 removed the callback form of dialog.showSaveDialog; it now
    // returns a Promise<{ canceled, filePath }>.
    dialog.showSaveDialog({
        title: 'Save Log File',
        defaultPath: `xnat-desktop-client--${date_string}.log.zip`
    }).then(result => {
        dialog_callback(result.canceled ? undefined : result.filePath)
    })
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

        // This zip goes to support. Redact both logs as they are added, in case
        // an older version left credentials in them (see services/redact.js).
        const log_path = electron_log.transports.file.findLogPath();
        if (fs.existsSync(log_path)) {
            archive.append(redactText(fs.readFileSync(log_path, 'utf8')), { name: 'xnat-desktop-client.log' });
        }
        archive.file(xlectric_log, { name: 'xlectric.log' });

        
        nedb_log_reader.fetch_user_log((err, docs) => {

            let csv = docs.length ? transferLogCsv(docs) : 'No data';

            // Added from memory: the temp file this used to write was never deleted.
            archive.append(csv, { name: 'user-transfer-log.csv' });

            archive.finalize();
            shell.showItemInFolder(filename)
        })
        
        
    }
}