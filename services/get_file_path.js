// Electron 32 removed the non-standard File.path property. The supported
// replacement is webUtils.getPathForFile() (renderer process only). This
// helper keeps working on both older and newer Electron versions.
const electron = require('electron');

module.exports = function getFilePath(file) {
    if (!file) return undefined;
    // Older Electron (< 32) still exposes File.path directly.
    if (typeof file.path === 'string' && file.path.length > 0) {
        return file.path;
    }
    return electron.webUtils ? electron.webUtils.getPathForFile(file) : undefined;
};
