const path = require('path')

// test_multiple_commands();

// const mizer = require('./mizer');
const glob = require('glob')
const fs = require('fs');
const electron = require('electron')

const auth = require('./services/auth');

const {app, BrowserWindow, ipcMain, shell, Tray, dialog, protocol} = electron;

const electron_log = require('./services/electron_log')

const { isDevEnv } = require('./services/app_utils');


const ElectronStore = require('electron-store');
const app_config = new ElectronStore();


//electron_log.transports.file.clear();

electron_log.info('App starting...');

app.commandLine.appendSwitch('remote-debugging-port', '9222')

const appMetaData = require('./package.json');
electron.crashReporter.start({
    companyName: appMetaData.author,
    productName: appMetaData.name,
    productVersion: appMetaData.version,
    submitURL: appMetaData.extraMetadata.submitUrl,
    uploadToServer: app_config.get('send_crash_reports', false)
});


const {autoUpdater} = require("electron-updater");

// windows
let mainWindow = null, downloadWindow = null, uploadWindow = null;

let startupExternalUrl;

if (isSecondInstance()){
  app.quit()
} else {
  if (is_usr_local_lib_writable()) {
    fix_java_path();
    initialize();
  } else {
    initialize_usr_local_lib_app()
  }
}


function initialize_usr_local_lib_app() {
  devToolsLog('initialize_usr_local_lib_app triggered')

  let iconSource = process.platform === 'linux' ? 'assets/icons/png/XDC.png' : 'assets/icons/png/XDC-tray-256.png';
  const iconPath = path.join(__dirname, iconSource);

  function createWindow() {
    var windowOptions = {
      width: 800,
      minWidth: 768,
      height: 640,
      title: app.getName(),
      icon: iconPath,
      show: true,
      frame: false
    };

    mainWindow = new BrowserWindow(windowOptions);
    mainWindow.loadURL(path.join('file://', __dirname, '/index_alt.html'));
    updateUserAgentString(mainWindow);

    if (isDevEnv()) {
      mainWindow.webContents.openDevTools()
      mainWindow.maximize()
      require('devtron').install()
    }

    mainWindow.on('closed', function () {
      mainWindow = null
    });

    // handle crash events
    mainWindow.webContents.on('crashed', (e) => {
      mainWindow.webContents.reload()
      electron_log.error('mainWindow crashed')
    });
  }


  app.on('ready', () => {
    createWindow();
  })

  app.on('window-all-closed', () => {
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

}



function initialize () {
  devToolsLog('initialize triggered')

  initialTasks()
  prepareAutoUpdate()
  requireMainProcessAdditional()

  let iconSource = process.platform === 'linux' ? 'assets/icons/png/XDC.png' : 'assets/icons/png/XDC-tray-256.png';
  const iconPath = path.join(__dirname, iconSource);

  function createWindow() {
    var windowOptions = {
      width: 1080,
      minWidth: 788,
      minHeight: 480,
      height: 840,
      title: app.getName(),
      icon: iconPath,
      show: true
    };
    
    mainWindow = new BrowserWindow(windowOptions);
    mainWindow.loadURL(path.join('file://', __dirname, '/index.html'));
    updateUserAgentString(mainWindow);

    var childOptions = {
      width: 1200,
      height: 700,
      alwaysOnTop: false,
      show: false,
      top: mainWindow
    };

    // Upload window
    uploadWindow = new BrowserWindow(childOptions)
    uploadWindow.on('closed', function () {
      uploadWindow = null
    });
    uploadWindow.loadURL(path.join('file://', __dirname, '/sections/_upload.html'));
    updateUserAgentString(uploadWindow);

    // Download window
    downloadWindow = new BrowserWindow(childOptions)
    downloadWindow.on('closed', function () {
      downloadWindow = null
    });
    downloadWindow.loadURL(path.join('file://', __dirname, '/sections/_download.html'));
    updateUserAgentString(downloadWindow);

    

    // Launch fullscreen with DevTools open, usage: yarn dev
    if (isDevEnv()) {
      mainWindow.webContents.openDevTools()
      mainWindow.maximize()
      require('devtron').install()

      // uploadWindow.show()
      // uploadWindow.webContents.openDevTools()
      // uploadWindow.maximize()

      // downloadWindow.show()
      // downloadWindow.webContents.openDevTools()
      // downloadWindow.maximize()
    }


    // handle crash events
    mainWindow.webContents.on('crashed', (e) => {
      mainWindow.webContents.reload()
      uploadWindow.webContents.reload()
      downloadWindow.webContents.reload()
      electron_log.error('mainWindow crashed')
    });

    uploadWindow.webContents.on('crashed', (e) => {
      uploadWindow.webContents.reload()
      electron_log.error('uploadWindow crashed')
    });

    downloadWindow.webContents.on('crashed', (e) => {
      downloadWindow.webContents.reload()
      electron_log.error('downloadWindow crashed')
    });

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
    
    // Protocol handler for win32
    if (process.platform == 'win32' || process.platform == 'linux') {
      // Keep only command line / deep linked arguments
      startupExternalUrl = process.argv.slice(1)
    }
    
    handle_protocol_request(startupExternalUrl, 'createWindow')
    
  }

  function prepareAutoUpdate() {
    autoUpdater.autoDownload = false;
    // debugging with autoUpdater.logger not required but still useful
    autoUpdater.logger = electron_log;
    //autoUpdater.logger.transports.file.level = 'info';

    autoUpdater.on('checking-for-update', () => {
      devToolsLog('Checking for update...');
    })
    autoUpdater.on('update-available', (info) => {
      devToolsLog('Update available.');
      post_message('update-available', info);
    })
    autoUpdater.on('update-not-available', (info) => {
      devToolsLog('Update not available.');
      post_message('update-not-available', info);
    })
    autoUpdater.on('error', (err) => {
      post_message('update-error', err);
      devToolsLog('Error in auto-updater. ' + err);
      electron_log.error(`Auto-updater error.`, err);
    })
    autoUpdater.on('download-progress', (progressObj) => {
      post_message('download-progress', progressObj);
      let log_message = "Download speed: " + progressObj.bytesPerSecond;
      log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
      log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
      devToolsLog(log_message);
    })
    autoUpdater.on('update-downloaded', (info) => {
      // post_message('update-downloaded', info);
      devToolsLog('Update downloaded');
      autoUpdater.quitAndInstall();
    });
  }

  app.on('ready', () => {
    if (!isDevEnv()) {
      //autoUpdater.checkForUpdatesAndNotify();
      autoUpdater.checkForUpdates()
    }

    //app.setName('XNAT Desktop Client v' + app.getVersion());

    devToolsLog('app.ready triggered')
    createWindow();

    /*
    let log_paths = {
      getAppPath: app.getAppPath(),
      home: app.getPath('home'),
      appData: app.getPath('appData'),
      userData: app.getPath('userData'),
      temp: app.getPath('temp'),
      desktop: app.getPath('desktop'),
      logs: app.getPath('logs'),
      documents: app.getPath('documents')
    };
    log(log_paths)
    */
    devToolsLog('app.ready DONE')
  })

  app.on('window-all-closed', () => {
    //showErrorBox('All Closed', 'All windows closed!');
    //if (process.platform !== 'darwin') {
      app.quit()
    //}
  })

  // only MacOS
  app.on('activate', (event, hasVisibleWindows) => {
    if (mainWindow === null) {
      createWindow()
    }
  })

  app.on('will-finish-launching', () => {

  });

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

  
  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    // On certificate error we disable default behaviour (stop loading the page)
    // and we then say "it is all fine - true" to the callback
    log('***** CERT ERROR ******', auth.allow_insecure_ssl(), app.allow_insecure_ssl);
    
    if (app.allow_insecure_ssl || auth.allow_insecure_ssl()) {
      event.preventDefault();
      callback(true);
      //post_message('custom_error', 'Certificate OK', 'All OK');
    } else {
      let msg = `The specified server "${url}" supports HTTPS, but uses an unverified SSL certificate.

      You can allow this by checking the "Allow unverified certificates" option on the server definition. Note that this may expose sensitive information if the connection has been compromised. Please check with your system administrator if you're unsure how to proceed.`
      post_message('custom_error', 'Certificate Error', msg);

      //callback(false);
    }
  });
  
}


function initialTasks() {
  app.isReallyReady = false;
  app.app_protocol = 'xnat';

  // used only to test login requests
  app.allow_insecure_ssl = false;

  app.setAsDefaultProtocolClient(app.app_protocol);
  app.setAsDefaultProtocolClient(app.app_protocol + 's');
}

// Require each JS file in the main-process dir
function requireMainProcessAdditional () {
  var files = glob.sync(path.join(__dirname, 'main-process/**/*.js'))
  files.forEach(function (file) {
    require(file)
  })
}


// prints given message both in the terminal console and in the DevTools
function devToolsLog(s) {
  electron_log.info(s);
  console.log(s)
  log(s)
}


function log(...args) {
  post_message('log', ...args)
}

function post_message(type, ...args) {
  if (app.isReallyReady) {
    mainWindow.webContents.send(type, ...args)
  } else {
    ipcMain.once('appIsReady', () => {
      mainWindow.webContents.send(type, ...args);
    })
  }
}


// Make this app a single instance app.
//
// The main window will be restored and focused instead of a second window
// opened when a person attempts to launch a second instance.
//
// Returns true if the current version of the app should quit instead of
// launching.
function isSecondInstance() {
  // if (process.mas) return false;

  return app.makeSingleInstance((argv, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()


      // Protocol handler for win32
      // argv: An array of the second instance’s (command line / deep linked) arguments
      if (process.platform == 'win32' || process.platform == 'linux') {
        handle_protocol_request(argv.slice(1), 'app.makeSingleInstance');
      }
      
    }
  })
}

function handle_protocol_request(url, place) {
  log(place, url);

  if (place === 'createWindow') {
    mainWindow.webContents.on('did-finish-load', (e) => {
      post_message('handle_protocol_request', url);
    });
  } else {
    post_message('handle_protocol_request', url);
  }
  
}

function updateUserAgentString(window) {
  let userAgentString = window.webContents.getUserAgent()
  userAgentString = userAgentString.replace(app.getName(), 'XNATDesktopClient');

  window.webContents.setUserAgent(userAgentString)
}

function is_usr_local_lib_writable() {
	if (process.platform === 'darwin') {
		try {
      const usr_local_lib_path = '/usr/local/lib';

		  fs.accessSync(usr_local_lib_path, fs.constants.F_OK | fs.constants.W_OK);
      
      // path exists, and it is writable - ALL OK
      return true;

		} catch (err) {
		  return false;
		}
	}
	
	return true;
}

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

      create_jre_symlink('libjvm.dylib', jre_search_base);
      create_jre_symlink('libjli.dylib', jre_search_base);

    } else { // linux
      // temporary fix until we resolve symlink issue
      return;

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

    if (process.platform === 'win32') {
      java_jre_path = '"' + path_separator + java_jre_path.replace(/\\/g, '\\\\') + '"';
      
      fs.writeFileSync(java_config_path, java_jre_path, (err) => {
        if (err) throw err;
        console.log('The file has been saved!');
      });
    }

  }
}

// filename = 'libjvm.dylib'
function create_jre_symlink(filename, jre_search_base, local_lib_path = '/usr/local/lib') {
  const isSymlink = require('is-symlink');

  let jre_search_path = jre_search_base + '/**/' + filename;
  let jvm_file = glob.sync(jre_search_path)[0];
  
  // to fix @rpath error on Mac
  let libjvm_symlink = local_lib_path + '/' + filename;
  if (isSymlink.sync(libjvm_symlink)) {
    fs.unlinkSync(libjvm_symlink);
  }
  fs.symlinkSync(jvm_file, libjvm_symlink);
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


ipcMain.on('download_and_install', (e) => {
  autoUpdater.downloadUpdate();
})

// Catch Item Add
ipcMain.on('redirect', (e, item) => {
  post_message('load:page', item);
})


ipcMain.on('launch_download_modal', (e, item) => {
  post_message('load:page', 'home.html');
  post_message('launch_download_modal', item);
})

ipcMain.on('log', (e, ...args) => {
  log(...args)
})


ipcMain.on('download_progress', (e, item) =>{
  post_message('download_progress', item);
})


ipcMain.on('upload_progress', (e, item) => {
  post_message('upload_progress', item);
})

ipcMain.on('progress_cell', (e, item) => {
  post_message('progress_cell', item);
})

ipcMain.on('xnat_cant_handle_stream_upload', (e, item) => {
  post_message('xnat_cant_handle_stream_upload', item);
})

ipcMain.on('global_pause_status', (e, new_status) => {
  post_message('global_pause_status', new_status);

  if (new_status === true) {
    uploadWindow.webContents.send('start_upload', new_status);
    uploadWindow.webContents.send('start_download', new_status);
  }
})

// ?
ipcMain.on('progress_alert', (e, item) => {
  post_message('progress_alert', item);
})

// ?
ipcMain.on('custom_error', (e, title, msg) => {
  post_message('custom_error', title, msg);
})


ipcMain.on('start_upload', (e, item) => {
  log('start_upload event (main.js)')
  uploadWindow.webContents.send('start_upload', item);
})

ipcMain.on('cancel_upload', (e, transfer_id) => {
  log('cancel_upload event (main.js)');
  uploadWindow.webContents.send('cancel_upload', transfer_id);
})

ipcMain.on('start_download', (e, item) => {
  log('start_download event (main.js)');
  downloadWindow.webContents.send('start_download', item);
})

ipcMain.on('cancel_download', (e, transfer_id) => {
  log('cancel_download event (main.js)');
  downloadWindow.webContents.send('cancel_download', transfer_id);
})


ipcMain.on('upload_finished', (e, transfer_id) => {
  post_message('upload_finished', transfer_id);
})


ipcMain.on('reload_upload_window', (e, item) => {
  uploadWindow.reload(true);
})
ipcMain.on('reload_download_window', (e, item) => {
  downloadWindow.reload(true);
})


ipcMain.on('relaunch_app', (e, data) => {
  app.relaunch({ args: process.argv.slice(1).concat(['--relaunch']) });
  app.exit(0);
})

ipcMain.on('update_global_variable', (e, varname, value) => {
  global[varname] = value;
})

ipcMain.on('force_reauthenticate', (e, login_data) => {
  if (login_data.server !== null) {
    post_message('force_reauthenticate', login_data);
  }
})



exports.log = log



global.user_auth = {
  username: null,
  password: null
};