const ipc = require('electron').ipcRenderer;
const shell = require('electron').shell;

const fs = require('fs');
var fx = require('mkdir-recursive');

const path = require('path');
const settings = require('electron-settings');

const axios = require('axios');
require('promise.prototype.finally').shim();

const xml2js = require('xml2js');
const swal = require('sweetalert');

const remote = require('electron').remote;

const FileSaver = require('file-saver');
const zlib = require('zlib');

const unzipper = require('unzipper');
const sha1 = require('sha1');


let xnat_server, user_auth, default_local_storage;
let manifest_urls = new Map();


const NProgress = require('nprogress');
NProgress.configure({ 
    trickle: false,
    easing: 'ease',
    speed: 1,
    minimum: 0.03
});

$(document).on('click', 'button[data-href]', function() {
    ipc.send('redirect', $(this).data('href'));
});

$(document).on('click', 'button[data-manifest]', function() {
    if (!xnat_server) {
        swal('You must log in before you choose file');
        return;
    }
    if (!default_local_storage) {
        swal({
            title: 'Warning',
            text: 'Before attempting image download, you must set default local storage first!',
            icon: 'warning'
        });
        ipc.send('redirect', 'settings.html');

        setTimeout(function(){
            $('#nav-profile-tab').trigger('click');
        }, 40);
        return;
    }

    $('#xnt_manifest_file').trigger('click');
    
});

$(document).on('change', '#xnt_manifest_file', function(e){
    if (this.files.length) {
        console.log(this.files[0]);
        let file_path = this.files[0].path;
    
        let parser = new xml2js.Parser({
            explicitArray: false,
            normalizeTags: true,
            tagNameProcessors: [
                function(str) {
                    var prefixMatch = new RegExp(/(?!xmlns)^.*:/);
                    return str.replace(prefixMatch, '');
                }
            ]
        });
    
        fs.readFile(file_path, function(err, data) {
            parser.parseString(data,
                function (err, result) {
                    console.dir(result);
                    
                    let catalog_description = result.catalog.$.description ? result.catalog.$.description : '';
                    let has_project = catalog_description.indexOf('projectIncludedInPath') !== -1;
                    let has_subject = has_project || catalog_description.indexOf('subjectIncludedInPath') !== -1;
                    
                    
                    manifest_urls = new Map();
                    
                    let my_sets = result.catalog.sets.entryset;

                    for (let i = 0; i < my_sets.length; i++) {
                        console.log('=====================================')
                        let entries = my_sets[i].sets.entryset.entries.entry;
                        
                        for (let j = 0; j < entries.length; j++) {
                            let uri_data = entries[j].$;
                            let real_uri = uri_data.URI.replace(/^\/archive\//, '/data/') + '?format=zip';
                            console.log(uri_data.name);
                            manifest_urls.set(uri_data.name, real_uri)
                        }
                    }
    
                    //console.log(manifest_urls);
                    //console.log(manifest_urls.size);

                    NProgress.start();
                    $.blockUI();
                    
                    download_items(xnat_server, manifest_urls, manifest_urls.size, true);
    
                });
        });
    }

    // reset upload field
    $(this).val('');
});

$(document).on('page:load', '#home-section', function(e){
    console.log('HOME page:load triggered');
    _init_variables();
});

function _init_variables() {
    xnat_server = settings.get('xnat_server');
    user_auth = settings.get('user_auth');
    default_local_storage = settings.get('default_local_storage')
}

function download_items(xnat_server, manifest_urls, manifest_urls_count, create_dir_structure = false) {
    console.log('SIZE: ' + manifest_urls.size);

    let temp_zip_path = path.resolve(default_local_storage, '_temp');
    let real_path = path.resolve(default_local_storage, xnat_server.split('//')[1]);
    
    if (manifest_urls.size == 0) {
        NProgress.done();
        $.unblockUI();
        
        swal({
            title: `Download successful`,
            text: `Files downloaded: ${manifest_urls_count}`,
            icon: 'success'
        });

        shell.openItem(real_path)
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
    NProgress.set(progress);

    $('#block_message').text(`Downloading images (${processed_count}/${manifest_urls_count})`);
    

    let dir = manifest_urls.keys().next().value;
    let uri = manifest_urls.get(dir);

    console.log(dir, uri);

    axios.get(xnat_server + uri, {
        auth: user_auth,
        responseType: 'arraybuffer'
    })
    .then(resp => {
        //console.log(resp)
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
        download_items(xnat_server, manifest_urls, manifest_urls_count);
    })
    .catch(err => {
        console.log(Helper.errorMessage(err));
        
        NProgress.done();
        $.unblockUI();
        swal({
            title: `Error`,
            text: Helper.errorMessage(err),
            icon: "error",
            dangerMode: true
        })
    })
    .finally(() => {
        // NProgress.done();
        // $.unblockUI();        
        // swal('All Done');
    });
}

