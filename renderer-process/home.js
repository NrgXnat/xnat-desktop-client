const ipc = require('electron').ipcRenderer;
const shell = require('electron').shell;

const fs = require('fs');

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
            explicitArray: true,
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
                    console.log(result);

                    //result.catalog.sets[i].entryset[j].sets[k].entryset[l].entries[m].entry[n]
                    
                    
                    let catalog_description = result.catalog.$.description ? result.catalog.$.description : '';
                    let has_project = catalog_description.indexOf('projectIncludedInPath') !== -1;
                    let has_subject = has_project || catalog_description.indexOf('subjectIncludedInPath') !== -1;
                    
                    
                    manifest_urls = new Map();
                    
                    let my_sets = result.catalog.sets[0].entryset;

                    let download_digest = {
                        id: Helper.uuidv4(),
                        basename: path.basename(file_path),
                        server: xnat_server,
                        user: user_auth.username,
                        user_auth: user_auth,
                        transfer_start: Helper.ime_converter(),
                        sessions: []
                    }

store.transfers.set('downloads', []);

                    for (let i = 0; i < my_sets.length; i++) {
                        console.log('=====================================')

                        let session = {
                            name: my_sets[i].$.description,
                            id: Helper.uuidv4(),
                            files: []
                        }

                        let entrysets = my_sets[i].sets[0].entryset;

                        for (let k = 0; k < entrysets.length; k++) {
                            let entries = entrysets[k].entries[0].entry;
                            
                            for (let j = 0; j < entries.length; j++) {
                                let uri_data = entries[j].$;
                                let real_uri = uri_data.URI.replace(/^\/archive\//, '/data/') + '?format=zip';
                                //console.log(uri_data.name);
                                manifest_urls.set(uri_data.name, real_uri);
                                
                                session.files.push({
                                    name: uri_data.name,
                                    uri: real_uri,
                                    status: 0
                                })
                            }
                        }

                        download_digest.sessions.push(session)
                    }

                    console.log(download_digest);
                    let my_transfers = store.transfers.get('downloads');
                    my_transfers.push(download_digest);
                    store.transfers.set('downloads', my_transfers);
                    
    
                    console.log(manifest_urls);
                    console.log(manifest_urls.size);
//return;
                    ipc.send('start_download');

                    ipc.send('redirect', 'progress.html');
                    return;
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


