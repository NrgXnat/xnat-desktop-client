module.exports = log
module.exports.error = error

/**
 * In the main electron process, we do not use console.log() statements because they do
 * not show up in a convenient location when running the packaged (i.e. production)
 * version of the app. Instead use this module, which sends the logs to the main window
 * where they can be viewed in Developer Tools.
 */

var electron = require('electron')
var windows = require('./windows')

var app = electron.app
const appMetaData = require('../package.json');

electron.crashReporter.start({
  companyName: appMetaData.author,
  productName: appMetaData.name,
  productVersion: appMetaData.version,
  submitURL: appMetaData.extraMetadata.submitUrl,
  uploadToServer: true
});

function log (...args) {
  if (app.ipcReady) {
    windows.main.send('log', ...args)
  } else {
    app.once('ipcReady', () => windows.main.send('log', ...args))
  }
}

function error (...args) {
  if (app.ipcReady) {
    windows.main.send('error', ...args)
  } else {
    app.once('ipcReady', () => windows.main.send('error', ...args))
  }
}
