const path = require('path')
const glob = require('glob')
const electron = require('electron')
//const autoUpdater = require('./auto-updater')

const {app, BrowserWindow} = electron;

//SET ENV
//process.env.NODE_ENV = 'production';


const debug = /--debug/.test(process.argv[2])

const iconPath = path.join(__dirname, 'assets/icons/png/icon.png');

//process.mas - A Boolean. For Mac App Store build, this property is true, for other builds it is undefined.
if (process.mas) app.setName('XNAT App')

var mainWindow = null

function initialize () {
  var shouldQuit = makeSingleInstance()
  if (shouldQuit) return app.quit()

  loadDemos()

  function createWindow () {
    var windowOptions = {
      width: 1080,
      minWidth: 680,
      height: 840,
      title: app.getName(),
      icon: iconPath
    }

    

    if (process.platform === 'linux') {
      windowOptions.icon = path.join(__dirname, '/assets/icons/png/icon.png');
    }

    mainWindow = new BrowserWindow(windowOptions)
    mainWindow.loadURL(path.join('file://', __dirname, '/index.html'))

    // Launch fullscreen with DevTools open, usage: npm run debug
    if (debug) {
      mainWindow.webContents.openDevTools()
      mainWindow.maximize()
      require('devtron').install()
    }

    mainWindow.on('closed', function () {
      mainWindow = null
    })
  }

  app.on('ready', function () {
    createWindow()
    //autoUpdater.initialize()
  })

  app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('activate', function () {
    if (mainWindow === null) {
      createWindow()
    }
  })
}

// Make this app a single instance app.
//
// The main window will be restored and focused instead of a second window
// opened when a person attempts to launch a second instance.
//
// Returns true if the current version of the app should quit instead of
// launching.
function makeSingleInstance () {
  if (process.mas) return false

  return app.makeSingleInstance(function () {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
          mainWindow.restore()
      }
      mainWindow.focus()
    }
  })
}

// Require each JS file in the main-process dir
function loadDemos () {
  var files = glob.sync(path.join(__dirname, 'main-process/**/*.js'))
  files.forEach(function (file) {
    require(file)
  })
  //autoUpdater.updateMenu()
}

initialize()
