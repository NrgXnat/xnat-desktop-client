const ElectronStore = require('electron-store')
const settings = new ElectronStore()

const isPlainObject = require('lodash/isPlainObject')

const auth = {
    allow_insecure_ssl: () => {
        return settings.has('allow_insecure_ssl') ? settings.get('allow_insecure_ssl') : false;
    },
    get_current_user: () => {
        const user_auth = settings.get('user_auth')
        return user_auth && isPlainObject(user_auth) && user_auth.hasOwnProperty('username') ? user_auth.username : ''
    }
}

module.exports = auth;