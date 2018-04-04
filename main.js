const path = require('path')

fix_java_path();

const mizer = require('./mizer');
const glob = require('glob')
const electron = require('electron')
//const autoUpdater = require('./auto-updater')

const {app, BrowserWindow, ipcMain, shell, Tray} = electron;

//SET ENV
//process.env.NODE_ENV = 'production';



const debug = /--debug/.test(process.argv[2])

const iconPath = path.join(__dirname, 'assets/icons/png/tray-icon-256.png');

app.setName('XNAT Desktop Client v' + app.getVersion());

//process.mas - A Boolean. For Mac App Store build, this property is true, for other builds it is undefined.
if (process.mas) app.setName('XNAT Desktop Client v' + app.getVersion())

var mainWindow = null

function initialize () {
  var shouldQuit = makeSingleInstance()
  if (shouldQuit) return app.quit()

  loadDemos()

  function createWindow () {
    var windowOptions = {
      width: 1080,
      minWidth: 768,
      height: 840,
      title: app.getName(),
      icon: iconPath
    }

    

    if (process.platform === 'linux') {
      windowOptions.icon = path.join(__dirname, '/assets/icons/png/icon.png');
    }

    mainWindow = new BrowserWindow(windowOptions)
    mainWindow.loadURL(path.join('file://', __dirname, '/index4.html'))

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

initialize();

// Catch Item Add
ipcMain.on('redirect', (e, item) =>{
  mainWindow.webContents.send('load:page', item);
})

exports.anonymize = (source, script, variables) => {
  mizer.anonymize(source, script, variables);
};

function fix_java_path() {
  const fs = require('fs');
  const glob = require('glob');

  const _app_path = __dirname;
  const jre_search_base = path.resolve(_app_path, '..', 'jre');

  let java_config_path, java_jre_path;
  let jvm_file, jre_search_path;

  if (path.extname(_app_path) === '.asar') {
    java_config_path = path.resolve(_app_path, '..', 'app.asar.unpacked', 'node_modules', 'java', 'build', 'jvm_dll_path.json');

    if (process.platform === 'win32') {
      jre_search_path = jre_search_base + '/**/jvm.dll';
      jvm_file = glob.sync(jre_search_path)[0];
      java_jre_path = path.resolve(jvm_file, '..');

    } else if (process.platform === 'darwin') {
      jre_search_path = jre_search_base + '/**/libjvm.dylib';
      jvm_file = glob.sync(jre_search_path)[0];
      java_jre_path = path.resolve(jvm_file, '..');

    } else { // linux
      if (process.arch === 'x64') {
        jre_search_path = jre_search_base + '/lib/amd64/**/libjvm.so';
      } else {
        jre_search_path = jre_search_base + '/lib/i386/**/libjvm.so';
      }
      
      jvm_file = glob.sync(jre_search_path)[0];
      java_jre_path = path.resolve(jvm_file, '..');
    }

    /*
    fs.writeFileSync(path.resolve(_app_path, '..', 'jvm_file.txt'), jre_search_path+"\n"+'jvm_file:'+jvm_file+"\n"+java_jre_path, (err) => {
        if (err) throw err;
        console.log('The file has been saved!');
    });
    */

    //java_jre_path = path.resolve(_app_path, '..', 'jre', 'bin', 'client');

    java_jre_path = '";' + java_jre_path.replace(/\\/g, '\\\\') + '"';
    
    fs.writeFileSync(java_config_path, java_jre_path, (err) => {
        if (err) throw err;
        console.log('The file has been saved!');
    });

  }
}