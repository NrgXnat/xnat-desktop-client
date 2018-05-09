const fs = require('fs');
const fx = require('mkdir-recursive');
const path = require('path');
const axios = require('axios');
require('promise.prototype.finally').shim();
const settings = require('electron-settings');
const ipc = require('electron').ipcRenderer;


const sha1 = require('sha1');
const unzipper = require('unzipper');
const shell = require('electron').shell;




let transfering = false;

console_log(__filename);
//ipc.send('log', store.getAll())

/*
const mile_watch = settings.watch('mile.test', function(newValue, oldValue){
    ipc.send('log', 'newValue: ' + newValue + ' || oldValue: ' + oldValue);
})

setTimeout(function(){
    mile_watch.dispose()
}, 5000);
*/

/*
const download_watch = settings.watch('transfers.downloads', function(newValue, oldValue){
    ipc.send('log', 'newValue: ' + newValue + ' || oldValue: ' + oldValue);
})
*/

function console_log(log_this) {
    console.log(log_this);
    ipc.send('log', log_this);
}

ipc.on('start_download',function(e, item){
    if (transfering) {
        return;
    }
    //transfering = true;

    let my_transfers = store.get('transfers.downloads');

    let xnat_server, user_auth, manifest_urls, transfer_id;
    my_transfers.forEach(function(transfer) {
        console_log(transfer);
        transfer_id = transfer.id;
        xnat_server = transfer.server;
        user_auth = transfer.user_auth;
        manifest_urls = new Map();

        transfer.sessions.forEach(function(session){
            session.files.forEach(function(file){
                if (file.status === 0) {
                    manifest_urls.set(file.name, file.uri)
                }
            });
        });

        console_log(manifest_urls);
        console_log('===================');

        // start download
        download_items(xnat_server, user_auth, transfer_id, manifest_urls, manifest_urls.size, true);
    });



    

});

function download_items(xnat_server, user_auth, transfer_id, manifest_urls, manifest_urls_count, create_dir_structure = false) {
    console.log('SIZE: ' + manifest_urls.size);

    let default_local_storage = settings.get('default_local_storage');

    let temp_zip_path = path.resolve(default_local_storage, '_temp');
    let real_path = path.resolve(default_local_storage, xnat_server.split('//')[1]);
    
    if (manifest_urls.size == 0) {
        // all done

        ipc.send('download_progress', {
            id: transfer_id,
            row: {
                status: 100
            }
        });
        return;
    }

    if (create_dir_structure) {
        fx.mkdirSync(temp_zip_path, function (err) {
            if (err) throw err;
            console.log('--done--');
        });
    }

    // progress calculation
    let processed_count = manifest_urls_count - manifest_urls.size;
    let progress = processed_count / manifest_urls_count;
    
    ipc.send('download_progress', {
        id: transfer_id,
        row: {
            status: progress * 100
        }
    });
    

    let dir = manifest_urls.keys().next().value;
    let uri = manifest_urls.get(dir);

    console.log(dir, uri);

    axios.get(xnat_server + uri, {
        auth: user_auth,
        responseType: 'arraybuffer'
    })
    .then(resp => {
        //console.log(resp.data.byteLength)
        let zip_path = path.resolve(temp_zip_path, sha1(xnat_server + uri) + '--' + Math.random() + '.zip');

        // create zip file
        fs.writeFileSync(zip_path, Buffer.from(new Uint8Array(resp.data)));

        fs.createReadStream(zip_path)
            .pipe(unzipper.Parse())
            .on('entry', function (entry) {
                // console.log(entry); // !important
                
                if (entry.type === 'File') {
                    // file basename
                    let basename = path.basename(entry.path);

                    // extract path where file will end up
                    let extract_path = path.resolve(real_path, dir);

                    // create directory structure recursively
                    fx.mkdirSync(extract_path, function (err) {
                        if (err) throw err;
                        console.log('--done--');
                    });

                    // write file to path
                    entry.pipe(fs.createWriteStream(path.resolve(extract_path, basename)));
                } else {
                    entry.autodrain();
                }
            })
            .on('finish', () => {
                console.log('************************');
                
                fs.unlink(zip_path, (err) => {
                    if (err) throw err;
                    console.log('----' + zip_path + ' was deleted');
                });
            });

        // delete item from url map
        manifest_urls.delete(dir);
        download_items(xnat_server, user_auth, transfer_id, manifest_urls, manifest_urls_count);
    })
    .catch(err => {
        console.log(Helper.errorMessage(err));
        // ERROR
        // Helper.errorMessage(err)
    })
    .finally(() => {      
        // All Done;
    });
}

window.onerror = function (errorMsg, url, lineNumber) {
    console_log(__filename + ':: ' +  errorMsg);
    return false;
}