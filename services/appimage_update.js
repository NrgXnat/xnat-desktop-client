const fs = require('fs')
const path = require('path')

const RELEASES_URL = 'https://github.com/NrgXnat/xnat-desktop-client/releases'

// electron-updater installs an AppImage update by deleting the running file and
// moving the new one into the same folder, so the user needs write access to
// that folder. A copy an administrator installed (e.g. in /opt) can't be
// updated that way: the install fails with EACCES after the download.
//
// Returns why the update can't be installed, or null when it can (or when this
// is not an AppImage and the check doesn't apply).
function appImageUpdateBlocker(platform = process.platform, appImage = process.env.APPIMAGE) {
    if (platform !== 'linux' || !appImage) {
        return null
    }

    const folder = path.dirname(appImage)
    try {
        fs.accessSync(folder, fs.constants.W_OK | fs.constants.X_OK)
    } catch (err) {
        return `You don't have permission to change ${folder}, where this copy of XNAT Desktop Client is installed.`
    }

    return null
}

function releaseUrl(version) {
    return version ? `${RELEASES_URL}/tag/v${version}` : RELEASES_URL
}

module.exports = { appImageUpdateBlocker, releaseUrl }
