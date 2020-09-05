require('dotenv').config();
const { notarize } = require('electron-notarize');

function isBlank(value) {
    return !value || 0 === value.trim().length;
}

exports.default = async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context;  
    if (electronPlatformName !== 'darwin') {
        return;
    }

    const appleId = process.env.APPLEID;
    const appleIdPassword = process.env.APPLEIDPASS;
    if (isBlank(appleId) || isBlank(appleIdPassword)) {
        console.info('One or both of APPLEID and APPLEIDPASS variables were blank. Skipping notarization step.');
        return;
    }

    const appName = context.packager.appInfo.productFilename;

    return await notarize({
        appBundleId: 'com.xnatapp.app',
        appPath: `${appOutDir}/${appName}.app`,
        appleId: process.env.APPLEID,
        appleIdPassword: process.env.APPLEIDPASS,
    });
};

