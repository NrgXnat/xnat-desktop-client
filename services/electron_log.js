const log = require('electron-log')

log.transports.console.level = false
log.transports.file.level = 'warn'
log.transports.file.maxSize = 10 * 1024 * 1024

// in order clear() to work
log.transports.file.file = log.transports.file.findLogPath()

log.error('Electron Log SINGLETON');

module.exports = log

/*
const log = require('electron-log')
const fs = require('fs')

log.transports.console.level = false
log.transports.file.level = 'warn'
log.transports.file.maxSize = 10 * 1024 * 1024


// log.transports.file.clear = function() {
//     const filePath = log.transports.file.findLogPath();
//     try {
//         if (fs.existsSync(filePath)) {
//             fs.unlinkSync(filePath);
//         }
//     } catch (e) {
//         log.error(`Could not clear log file ${filePath}`, e);
//     }
// }


module.exports = log
*/