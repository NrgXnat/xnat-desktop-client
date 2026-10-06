const { getAppInfo } = require('../../app_utils')
const migrateSettings = require('./settings_to_store_migration')

module.exports = async () => {
    const appInfo = await getAppInfo()
    migrateSettings(appInfo.userDataPath)

    return true
}