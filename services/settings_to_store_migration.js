const path = require('path')
const fs = require('fs');

const ElectronStore = require('electron-store');
const app_config = new ElectronStore();

// migrate electron-settings settings format to electron-store format
const migrate = (electron_settings_base_path) => {
    
    const settings_path = path.resolve(electron_settings_base_path, 'Settings');

    if (fs.existsSync(settings_path)) {
        try {
            const settings_data = JSON.parse(fs.readFileSync(settings_path))

            for (let prop in settings_data) {
                app_config.set(prop, settings_data[prop])
            }

            fs.unlinkSync(settings_path)
        } catch(err) {
            console.log(err);
        }
    } else {
        console.log(`NO Old Settings file [${settings_path}]`);
    }

    //console.log(app_config.store);
}

module.exports = migrate

