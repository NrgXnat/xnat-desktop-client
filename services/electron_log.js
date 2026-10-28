const log = require('electron-log')

const { isDevEnv } = require('./app_utils');
const { redact, redactText } = require('./redact');

log.transports.console.level = false
log.transports.file.level = isDevEnv() ? 'debug' : 'warn'
log.transports.file.maxSize = 10 * 1024 * 1024

// Help > Save Log File sends this log to support, so keep credentials out of
// it (see services/redact.js). electron-log writes an Error as its stack, so an
// Error stays an Error; it is only copied when its text needs redacting.
log.hooks.push(message => Object.assign({}, message, {
    data: message.data.map(item => item instanceof Error ? redactError(item) : redact(item))
}))

function redactError(err) {
    const stack = redactText(err.stack)
    const errMessage = redactText(err.message)
    if (stack === err.stack && errMessage === err.message) {
        return err
    }
    const copy = new Error(errMessage)
    copy.name = err.name
    copy.stack = stack
    return copy
}

// in order clear() to work
// log.transports.file.file = log.transports.file.findLogPath()

log.silly('Electron Log silly');
log.debug('Electron Log debug');
log.info('Electron Log info');
log.warn('Electron Log warn');
log.error('Electron Log error');

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