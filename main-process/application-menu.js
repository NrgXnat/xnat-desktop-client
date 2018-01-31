const electron = require('electron');
const path = require('path')
const {app, BrowserWindow, Menu, shell, Tray} = electron;

const version = app.getVersion();

//create menu template
let template = [
    {
        label: 'File',
        submenu: [
            // {
            //     label: 'Add Item',
            //     click(){
            //         createNewWindow();
            //     }
            // },
            // {
            //     label: 'Clear Items',
            //     click: function(){
            //         mainWindow.webContents.send('item:clear');
            //     }
            // },
            {
                label: 'Visit XNAT.ORG',
                click: function() {
                    shell.openExternal('https://www.xnat.org/');
                }
            }, 
            {
                type: 'separator'
            },
            {
                label: `Version ${version}`,
                enabled: false
            },
            {
                label: 'Quit',
                accelerator: isMac() ? 'Command+Q' : 'Ctrl+Q',
                click: function(){
                    app.quit();
                }
            }
        ]
    }
];

// If Mac add empty object to menu
if(isMac()){
    template.unshift({});
}

// add dev tools in production
if (process.env.NODE_ENV !== 'production') {
    template.push({
        label: 'DevTools',
        submenu: [
            {
                label: 'Toggle DevTools',
                accelerator: isMac() ? 'Command+I' : 'Ctrl+I',
                click: function(item, focusedWindow){
                    focusedWindow.toggleDevTools();
                }
            },
            {
                role: 'reload'
            }
        ]
    })
}

// =======================
// helpers
function isMac() {
    return process.platform === 'darwin';
}

app.on('ready', function () {
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);


    const iconPath = path.join(__dirname, '../assets/icons/png/tray-icon.png');
    // Tray icon and menu
    let appIcon = new Tray(iconPath);
    appIcon.setToolTip("XNAT app");
    appIcon.setContextMenu(menu);
})