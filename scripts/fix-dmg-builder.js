const DMG_BUILDER_FIX_VERSION = 21
const appMetaData = require('../package.json')
const os = require('os')
const fs = require('fs')
const path = require('path')

const dmgBuilderFile = path.join(path.dirname(__dirname), 'node_modules/dmg-builder/out/dmg.js')

if (os.platform() !== 'win32' && appMetaData.devDependencies.hasOwnProperty('electron-builder') && fs.existsSync(dmgBuilderFile)) {
    let electronBuilderVersion = parseInt(appMetaData.devDependencies['electron-builder'].split('.')[0].replace(/[^0-9]/g, ''))
    if (electronBuilderVersion <= DMG_BUILDER_FIX_VERSION) {
        let dmgBuilderContent = fs.readFileSync(dmgBuilderFile, 'utf8')
        
        // dmgBuilderContent = dmgBuilderContent.replace('"/usr/bin/python"', '(process.env.PYTHON_PATH || "/usr/bin/python")')
        dmgBuilderContent = dmgBuilderContent.replace('.exec)("/usr/bin/python",', '.exec)((process.env.PYTHON_PATH || "/usr/bin/python"),')

        fs.writeFileSync(dmgBuilderFile, dmgBuilderContent, 'utf8')

        console.log('Updated dmg-builder Python path')
    }
}
