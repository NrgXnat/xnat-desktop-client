

const remote = require('electron').remote
const app = remote.app;
const { autoUpdater } = remote.require("electron-updater");
const electron_log = remote.require('./services/electron_log');

const store = require('store2');

const ipc = require('electron').ipcRenderer

$(document).on('page:load', '#version-section', function(e){
    if (store.has('version-info-update')) {
        $('#version_info').text(store.get('version-info-update'))
    }
    $('#semver').text(app.getVersion())
});

$(document).on('click', '#check_for_updated_verision', function(e) {
    autoUpdater.checkForUpdates()
})

