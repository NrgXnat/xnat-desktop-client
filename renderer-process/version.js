const { require: nodeRequire, app } = require('@electron/remote')

const { autoUpdater } = nodeRequire("electron-updater")
const store = require('store2')
const { getUpdateChannel, setUpdateChannel } = require('../services/app_utils')

const dom_context = '#version-section'
const { $on } = require('./../services/selector_factory')(dom_context)

$on('page:load', '#version-section', async function(e){
    await updateChannelSelectionDropdown()
    await getAutoUpdateInfo()

    $('#semver').text('XXX: ' + app.getVersion())
})

$on('change', '#auto_update_channel', async function(e) {
    const newAutoUpdateValue = $(this).val()

    autoUpdater.channel = newAutoUpdateValue
    // setting "channel" sets "allowDowngrade" to true, so change allowDowngrade after the channel property is set
    autoUpdater.allowDowngrade = newAutoUpdateValue === 'latest'

    setUpdateChannel(newAutoUpdateValue)
    await checkForUpdates()
})

$on('click', '#check_for_updated_verision', checkForUpdates)

async function getAutoUpdateInfo() {
    if (store.has('version-info-update')) {
        const channel = await getUpdateChannel()
        const channelLabel = channel === 'latest' ? 'Stable' : Helper.capitalizeFirstLetter(channel)
        $('#version_info').html(`Update Channel <b>${channelLabel}</b>: ${store.get('version-info-update')}`)
    } else {
        $('#version_info').text('No Auto-Update Info.')
    }
}

async function checkForUpdates() {
    try {
        console.log({getFeedURL: autoUpdater.getFeedURL()})
        await autoUpdater.checkForUpdates();
        // Wait for a short time to allow update check to process
        await new Promise(resolve => setTimeout(resolve, 1000));
        await getAutoUpdateInfo();
    } catch (error) {
        console.error('Error checking for updates:', error);
        throw error;
    }
}

async function updateChannelSelectionDropdown() {
    const channel = await getUpdateChannel()
    $(`#auto_update_channel option[value="${channel}"]`).prop('selected', true)
}
