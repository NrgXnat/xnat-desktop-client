const { clearDefaultTempFiles } = require("../../app_utils")
const electron_log = require('../../electron_log');


module.exports = () => {
    try {
        let msg = clearDefaultTempFiles()
        console.log(msg)
    } catch (err) {
        electron_log.error(err)
    }
}