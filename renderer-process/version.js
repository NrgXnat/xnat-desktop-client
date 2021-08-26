const remote = require('electron').remote
const app = remote.app
const { autoUpdater } = remote.require("electron-updater")
const store = require('store2')
const { getUpdateChannel, setUpdateChannel } = require('../services/app_utils')

const dom_context = '#version-section'
const { $on } = require('./../services/selector_factory')(dom_context)

$on('page:load', '#version-section', function(e){
    updateChannelSelectionDropdown()
    getAutoUpdateInfo()

    $('#semver').text(app.getVersion())
})

$on('change', '#auto_update_channel', function(e) {
    const newAutoUpdateValue = $(this).val()

    autoUpdater.channel = newAutoUpdateValue
    setUpdateChannel(newAutoUpdateValue)
    checkForUpdates()
})

$on('click', '#check_for_updated_verision', checkForUpdates)

function getAutoUpdateInfo() {
    if (store.has('version-info-update')) {
        const channel = getUpdateChannel()
        const channelLabel = channel === 'latest' ? 'Stable' : Helper.capitalizeFirstLetter(channel)
        $('#version_info').html(`Update Channel <b>${channelLabel}</b>: ${store.get('version-info-update')}`)
    } else {
        $('#version_info').text('No Auto-Update Info.')
    }
}

function checkForUpdates() {
    autoUpdater.checkForUpdates()
    setTimeout(function() {
        getAutoUpdateInfo()
    }, 100)
}

function updateChannelSelectionDropdown() {
    const channel = getUpdateChannel()
    $(`#auto_update_channel option[value="${channel}"]`).prop('selected', true)
}
