const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('promise.prototype.finally').shim();
const settings = require('electron-settings');
const ipc = require('electron').ipcRenderer;


ipc.send('log', __filename)
ipc.send('log', store.getAll())


