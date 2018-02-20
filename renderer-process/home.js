const ipc = require('electron').ipcRenderer

$(document).on('click', 'button[data-href]', function() {
    ipc.send('redirect', $(this).data('href'));
})