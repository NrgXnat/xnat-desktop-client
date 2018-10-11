const path = require('path')

fix_java_path();

const mizer = require('./mizer');
const glob = require('glob')
const electron = require('electron')

const auth = require('./services/auth');

const {app, BrowserWindow, ipcMain, shell, Tray, dialog, protocol} = electron;

const electron_log = require('electron-log');
const {autoUpdater} = require("electron-updater");
autoUpdater.autoDownload = false;

//-------------------------------------------------------------------
// Logging
//
// THIS SECTION IS NOT REQUIRED
//
// This logging setup is not required for auto-updates to work,
// but it sure makes debugging easier :)
//-------------------------------------------------------------------
autoUpdater.logger = electron_log;
autoUpdater.logger.transports.file.level = 'info';
electron_log.info('App starting...');


autoUpdater.on('checking-for-update', () => {
  devToolsLog('Checking for update...');
})
autoUpdater.on('update-available', (info) => {
  devToolsLog('Update available.');
  delayed_notification('update-available', info);
})
autoUpdater.on('update-not-available', (info) => {
  devToolsLog('Update not available.');
})
autoUpdater.on('error', (err) => {
  delayed_notification('update-error', err);
  devToolsLog('Error in auto-updater. ' + err);
})
autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  devToolsLog(log_message);
  delayed_notification('download-progress', progressObj);
})
autoUpdater.on('update-downloaded', (info) => {
  //delayed_notification('update-downloaded', info);
  devToolsLog('Update downloaded');
  autoUpdater.quitAndInstall();
});






//SET ENV
//process.env.NODE_ENV = 'production';
log(process.env);


const debug = /--debug/.test(process.argv[2])
const iconPath = path.join(__dirname, 'assets/icons/png/tray-icon-256.png');
app.setName('XNAT Desktop Client v' + app.getVersion());

log(process);

//process.mas - A Boolean. For Mac App Store build, this property is true, for other builds it is undefined.
if (process.mas) app.setName('XNAT Desktop Client v' + app.getVersion())

var mainWindow = null

var downloadWindow = null;
var uploadWindow = null;


app.isReallyReady = false;
app.app_protocol = 'xnat';

// used only to test login requests
app.allow_insecure_ssl = false;

let startupExternalUrl;

app.setAsDefaultProtocolClient(app.app_protocol);
app.setAsDefaultProtocolClient(app.app_protocol + 's');


app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  // On certificate error we disable default behaviour (stop loading the page)
  // and we then say "it is all fine - true" to the callback
  log('***** CERT ERROR ******', auth.allow_insecure_ssl(), app.allow_insecure_ssl);
  
  if (app.allow_insecure_ssl || auth.allow_insecure_ssl()) {
    event.preventDefault();
    callback(true);
    //mainWindow.webContents.send('custom_error', 'Certificate OK', 'All OK');
  } else {
    let msg = `The specified server "${url}" supports HTTPS, but uses an unverified SSL certificate.

    You can allow this by checking the "Allow unverified certificates" option on the server definition. Note that this may expose sensitive information if the connection has been compromised. Please check with your system administrator if you're unsure how to proceed.`
    mainWindow.webContents.send('custom_error', 'Certificate Error', msg);
  }

});


function initialize () {
  var shouldQuit = makeSingleInstance()
  if (shouldQuit) return app.quit()

  devToolsLog('initialize triggered')

  loadDemos()

  function createWindow () {
    var windowOptions = {
      width: 1080,
      minWidth: 768,
      height: 840,
      title: app.getName(),
      icon: iconPath,
      show: true
    };

    var childOptions = {
      width: 1200,
      height: 700,
      alwaysOnTop: false,
      show: false
    };

    

    if (process.platform === 'linux') {
      windowOptions.icon = path.join(__dirname, '/assets/icons/png/icon.png');
    }

    mainWindow = new BrowserWindow(windowOptions);

    devToolsLog('createWindow triggered')

    mainWindow.loadURL(path.join('file://', __dirname, '/index.html'));

    mainWindow.on('ready-to-show', () => {
      //mainWindow.show();
      //mainWindow.webContents.send('remove_current_session', true);
    })

    mainWindow.on('did-finish-load', () => {
      //mainWindow.webContents.send('remove_current_session', true);
    })

    
    childOptions.top = mainWindow;

    console.log(childOptions);
    
    
    uploadWindow = new BrowserWindow(childOptions)
    uploadWindow.on('closed', function () {
      uploadWindow = null
    });
    uploadWindow.loadURL(path.join('file://', __dirname, '/sections/_upload.html'));

   
    downloadWindow = new BrowserWindow(childOptions)
    downloadWindow.on('closed', function () {
      downloadWindow = null
    });
    downloadWindow.loadURL(path.join('file://', __dirname, '/sections/_download.html'));

    

    // Launch fullscreen with DevTools open, usage: npm run debug
    if (debug) {
      mainWindow.webContents.openDevTools()
      mainWindow.maximize()
      require('devtron').install()

      //uploadWindow.webContents.openDevTools()
          // downloadWindow.show()
          // downloadWindow.webContents.openDevTools()
          // uploadWindow.show()
          // uploadWindow.webContents.openDevTools()
      //uploadWindow.webContents.maximize()
    }

    mainWindow.on('closed', function () {
      //showErrorBox('mainWindow Closed', 'mainWindow closed!');
      if (uploadWindow) {
        uploadWindow.close();
      }
      if (downloadWindow) {
        downloadWindow.close();
      }
      
      mainWindow = null
    });

    
    // TODO: REMOVE!!!
    //mainWindow.webContents.openDevTools();
    
    // Protocol handler for win32
    if (process.platform == 'win32') {
      // Keep only command line / deep linked arguments
      startupExternalUrl = process.argv.slice(1)
    }
    
    handle_protocol_request(startupExternalUrl, 'createWindow')


  }

  app.on('ready', () => {
    //autoUpdater.checkForUpdatesAndNotify();
    autoUpdater.checkForUpdates()

    devToolsLog('app.ready triggered')
    createWindow();
    devToolsLog('app.ready DONE')
  })

  app.on('window-all-closed', () => {
    //showErrorBox('All Closed', 'All windows closed!');
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  // only MacOS
  app.on('activate', (event, hasVisibleWindows) => {
    if (mainWindow === null) {
      createWindow()
    }
  })

  app.on('will-finish-launching', () => {
    // TODO: add autoupdater
    //autoUpdater.initialize()

    // only MacOS - Protocol handler
    app.on('open-url', (event, url) => {
      event.preventDefault();

      if (app.isReady()) {
        handle_protocol_request(url, 'open-url');
      } else {
        startupExternalUrl = url
      }

      setTimeout(function () {
        // Required for protocol links opened from Chrome otherwise the confirmation dialog
        // that Chrome shows causes Chrome to steal back the focus.
        // Electron issue: https://github.com/atom/electron/issues/4338
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.show();
      }, 100)
    });
    
  });
}

// prints given message both in the terminal console and in the DevTools
function devToolsLog(s) {
  electron_log.info(s);
  console.log(s)
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.executeJavaScript(`console.log("${s}")`)
  }
}

// Make this app a single instance app.
//
// The main window will be restored and focused instead of a second window
// opened when a person attempts to launch a second instance.
//
// Returns true if the current version of the app should quit instead of
// launching.
function makeSingleInstance() {
  // if (process.mas) return false;

  return app.makeSingleInstance((argv, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()


      // Protocol handler for win32
      // argv: An array of the second instance’s (command line / deep linked) arguments
      if (process.platform == 'win32') {
        handle_protocol_request(argv.slice(1), 'app.makeSingleInstance');
      }
      
    }
  })
}

function handle_protocol_request(url, place) {
  log(place, url);

  // TODO - handle better initial delay (through events)
  if (place === 'createWindow') {
    setTimeout(function(){
      mainWindow.webContents.send('handle_protocol_request', url);
    }, 700)
  } else {
    mainWindow.webContents.send('handle_protocol_request', url);
  }
  
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

function log(...args) {
  if (app.isReallyReady) {
    mainWindow.send('log', ...args)
  } else {
    ipcMain.once('appIsReady', () => {
      mainWindow.send('log', ...args);
    })
  }
}

function delayed_notification(type, ...args) {
  if (app.isReallyReady) {
    mainWindow.send(type, ...args)
  } else {
    ipcMain.once('appIsReady', () => {
      mainWindow.send(type, ...args);
    })
  }
}

ipcMain.on('download_and_install', (e) => {
  autoUpdater.downloadUpdate();
})

// Catch Item Add
ipcMain.on('redirect', (e, item) =>{
  mainWindow.webContents.send('load:page', item);
})


ipcMain.on('launch_download_modal', (e, item) =>{
  mainWindow.webContents.send('load:page', 'home.html');
  mainWindow.webContents.send('launch_download_modal', item);
})

ipcMain.on('log', (e, item) =>{
  mainWindow.webContents.send('console:log', item);
})


ipcMain.on('download_progress', (e, item) =>{
  mainWindow.webContents.send('download_progress', item);
})


ipcMain.on('upload_progress', (e, item) =>{
  mainWindow.webContents.send('upload_progress', item);
})

ipcMain.on('progress_cell', (e, item) =>{
  mainWindow.webContents.send('progress_cell', item);
})

// ?
ipcMain.on('progress_alert', (e, item) =>{
  mainWindow.webContents.send('progress_alert', item);
})

// ?
ipcMain.on('custom_error', (e, title, msg) =>{
  mainWindow.webContents.send('custom_error', title, msg);
})



ipcMain.on('start_upload', (e, item) =>{
  uploadWindow.webContents.send('start_upload', item);
})


ipcMain.on('reload_upload_window', (e, item) =>{
  uploadWindow.reload(true);
})
ipcMain.on('reload_download_window', (e, item) =>{
  downloadWindow.reload(true);
})

ipcMain.on('start_download', (e, item) =>{
  mainWindow.webContents.send('console:log', 'start_download event (main.js)');
  downloadWindow.webContents.send('start_download', item);
})

ipcMain.on('print_global', () => {
  log(global.user_auth);
})



function fix_java_path() {
  const fs = require('fs');
  const isSymlink = require('is-symlink');
  const glob = require('glob');

  const _app_path = __dirname;
  const jre_search_base = path.resolve(_app_path, '..', 'jre');

  let java_config_path, java_jre_path;
  let jvm_file, jre_search_path;
  let path_separator = ':';


  if (path.extname(_app_path) === '.asar') {
    java_config_path = path.resolve(_app_path, '..', 'app.asar.unpacked', 'node_modules', 'java', 'build', 'jvm_dll_path.json');

    if (process.platform === 'win32') {
      path_separator = ';'
      jre_search_path = jre_search_base + '/**/jvm.dll';
      jvm_file = glob.sync(jre_search_path)[0];
      java_jre_path = path.resolve(jvm_file, '..');

    } else if (process.platform === 'darwin') {
      jre_search_path = jre_search_base + '/**/libjvm.dylib';
      jvm_file = glob.sync(jre_search_path)[0];
      java_jre_path = path.resolve(jvm_file, '..');
      
      // to fix @rpath error on Mac
      let libjvm_symlink = '/usr/local/lib/libjvm.dylib';
      if (!isSymlink.sync(libjvm_symlink)) {
        fs.symlinkSync(java_jre_path + '/libjvm.dylib', libjvm_symlink);
      }

    } else { // linux
      if (process.arch === 'x64') {
        jre_search_path = jre_search_base + '/lib/amd64/**/libjvm.so';
      } else {
        jre_search_path = jre_search_base + '/lib/i386/**/libjvm.so';
      }

      jvm_file = glob.sync(jre_search_path)[0];
      java_jre_path = path.resolve(jvm_file, '..');

      // attempt
      let libjvm_symlink = '/usr/local/lib/libjvm.so';
      if (!isSymlink.sync(libjvm_symlink)) {
        fs.symlinkSync(java_jre_path + '/libjvm.so', libjvm_symlink);
      }
    }

    /*
    fs.writeFileSync(path.resolve(_app_path, '..', 'jvm_file.txt'), jre_search_path+"\n"+'jvm_file:'+jvm_file+"\n"+java_jre_path, (err) => {
        if (err) throw err;
        console.log('The file has been saved!');
    });
    */
    //java_jre_path = path.resolve(_app_path, '..', 'jre', 'bin', 'client');

    java_jre_path = '"' + path_separator + java_jre_path.replace(/\\/g, '\\\\') + '"';

    if (process.platform === 'win32') {
      fs.writeFileSync(java_config_path, java_jre_path, (err) => {
        if (err) throw err;
        console.log('The file has been saved!');
      });
    }

  }
}

const showErrorBox = (title, msg) => {
  dialog.showErrorBox(title, msg)
};

// can be displayed only after app.ready
const showMessageBox = (options) => {
  let my_options = options ? options : {
    type: 'info',
    title: 'Naslov',
    message: 'message',
    detail: 'Detailed explanation',
    buttons: ['Okay', 'Nope']
  };

  dialog.showMessageBox(my_options);
};
/** RICK **/
exports.anonymize_single = (source, script, variables) => {
  return mizer.anonymize_single(source, script, variables);
};
/** RICK **/
exports.getReferencedVariables = (contexts) => {
  return mizer.getReferencedVariables(contexts);
};

exports.getScriptContexts = (scripts) => {
  return mizer.getScriptContexts(scripts);
};

exports.getScriptContext = (script) => {
  return mizer.getScriptContext(script);
};

exports.getVariables = (variables) => {
  return mizer.getVariables(variables);
};

exports.anonymize = (source, contexts, variables) => {
  return mizer.anonymize(source, contexts, variables);
};



global.user_auth = {
  username: null,
  password: null
};