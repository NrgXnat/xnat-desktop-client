const settings = require('electron-settings')
const ipc = require('electron').ipcRenderer
const app = require('electron').remote.app
const shell = require('electron').shell
const swal = require('sweetalert');


const fs = require('fs');
const sudo = require('sudo-prompt');





// ===============
$(document).on('click', '#allow_local_lib_access', function(e) {
    fix_mac_local_lib_path();
});

function fix_mac_local_lib_path() {
    const my_app = require('electron').app;

    let options = {
        name: 'XNAT Desktop Client'
    };

    let usr_local_lib_path = '/usr/local/lib';

    let new_commands = [
        `chown $USER:admin ${usr_local_lib_path}`,
        `chmod 0755 ${usr_local_lib_path}`
    ];

    let my_sudo = new_commands.join(' && ');
    let sudo_command = `sh -c "${my_sudo}"`;

    alert(sudo_command);

    sudo.exec(sudo_command, options, function (error, stdout, stderr) {
        if (error) {
            alert('GRESKA: ' + error.code);
            throw error;
        }

        alert('Sve OK');

        ipc.send('relaunch_app', {});

        // my_app.relaunch({ args: process.argv.slice(1).concat(['--relaunch']) });
        // my_app.exit(0);
    });
}




$(document).on('click', '#quit_app', function(e) {
    app.quit();
})

// ===============
$(document).on('click', 'a.logo-header', function(e){
    e.preventDefault();
})



function throw_new_error(title, message) {
    var err_msg = JSON.stringify({
        title: title,
        body: message
    });

    throw new Error(err_msg);
}

function parse_error_message(err) {
    var msg;
    try {
        msg = JSON.parse(err.message);
    } catch (e) {
        msg = {
            title: err.name,
            body: err.message
        }
    }

    return msg;
}
