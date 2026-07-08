require('dotenv').config();
const { notarize } = require('@electron/notarize');


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
    const teamId = process.env.APPLETEAMID;
    if (isBlank(appleId) || isBlank(appleIdPassword) || isBlank(teamId)) {
        console.info('Please check if all of the following variables are set: APPLEID, APPLEIDPASS and APPLETEAMID. Skipping notarization step.');
        return;
    }

    const appName = context.packager.appInfo.productFilename;

    try {
        console.log('Attempting Notarization...')

        await notarize({
            appBundleId: 'com.xnatapp.app',
            appPath: `${appOutDir}/${appName}.app`,
            appleId,
            appleIdPassword,
            teamId
        });
        
        console.log(`App "${appName}" successfully notarized!`)
    }  catch (error) {
        console.error('Error during notarization:', error);

        if (error.response) {
            console.error('Notarization response:', error.response);
        }
        throw error;
    }
    
};

