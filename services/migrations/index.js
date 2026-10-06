const clearVersion2DbFiles = require('./migrate/clearVersion2DbFiles')
const migrateStorageFormat = require('./migrate/migrateStorageFormat')
const optimizeUploadDataFormat = require('./migrate/optimizeUploadDataFormat')
const clearApplicationCache = require('./migrate/clearApplicationCache')
const clearDefaultTempDir = require('./migrate/clearDefaultTempDir')

const { ipcMain } = require('electron')

exports.runMigrations = async () => {
    clearDefaultTempDir()
    await clearApplicationCache()

    const clearedDbFiles = await clearVersion2DbFiles()
    if (clearedDbFiles) {
        ipcMain.emit('clearVersion2DbFiles')
    }

    await migrateStorageFormat()
    
    await optimizeUploadDataFormat()
}