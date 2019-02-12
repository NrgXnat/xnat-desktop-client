const ipc = require('electron').ipcRenderer
const app = require('electron').remote.app
const sudo = require('sudo-prompt')
const fs = require('fs')


// ===============
$(document).on('click', '#allow_local_lib_access', function(e) {
    fix_mac_local_lib_path();
});

function fix_mac_local_lib_path() {
    let options = {
        name: 'XNAT Desktop Client'
    };

    const usr_local_path = '/usr/local';
    const usr_local_lib_path = '/usr/local/lib';

    let shell_commands = [
        `chown $USER:admin ${usr_local_lib_path}`,
        `chmod 0755 ${usr_local_lib_path}`
    ];

    if (!fs.existsSync(usr_local_path)) {
        shell_commands = [
            `mkdir ${usr_local_path}`,
            `mkdir ${usr_local_lib_path}`,
            ...shell_commands
        ];
    } else if (!fs.existsSync(usr_local_lib_path)) {
        shell_commands = [
            `mkdir ${usr_local_lib_path}`,
            ...shell_commands
        ];
    }

    let my_sudo = shell_commands.join(' && ');
    let sudo_command = `sh -c "${my_sudo}"`;

    sudo.exec(sudo_command, options, function (error, stdout, stderr) {
        if (error) throw error;

        alert('Success! Application will relaunch now.');

        ipc.send('relaunch_app', {});
    });
    
}



$(document).on('click', '#quit_app', function(e) {
    app.quit();
})

// ===============
$(document).on('click', 'a.logo-header', function(e){
    e.preventDefault();
})
