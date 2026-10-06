const fs = require('fs')
const path = require('path')
const rimraf = require('rimraf')

const { getAppInfo } = require('../../app_utils')
const { CLEAR_APPLICATION_CACHE_FILENAME } = require('../../constants')

const skipThese = ['config.json', 'FirstRun', 'Local Storage']


module.exports = async () => {
    const appInfo = await getAppInfo()
    const appDataDir = appInfo.userDataPath

    const clear_cache_flag_file = path.join(appDataDir, CLEAR_APPLICATION_CACHE_FILENAME)

    if (fs.existsSync(clear_cache_flag_file)) {
        await clearFolder(appDataDir, skipThese)
    }
}

async function clearFolder(appDataDir, skipThese = []) {
    fs.readdir(appDataDir, async (err, files) => {
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        }

        console.log({files});

        for (const file of files) {
            const filePath = path.join(appDataDir, file)
            console.log({filePath});
            if (skipThese.includes(file)) {
                continue
            }

            const fStat = fs.lstatSync(filePath)

            const isDir = fStat.isDirectory() 
            const isFile = fStat.isFile()

            if (isFile) {
                try {
                    await fs.promises.unlink(filePath)
                } catch(err) {
                    console.log(err)
                }
            } else if (isDir) {
                await new Promise(resolve => rimraf(filePath, { disableGlob: true }, resolve))
                // rimraf(filePath, {disableGlob: true}, err => {
                //     if (err) console.log(err)
                // })
            }
        }

    })
}
