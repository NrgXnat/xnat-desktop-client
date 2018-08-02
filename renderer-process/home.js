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

const app = require('electron').remote.app;


let xnat_server, user_auth, default_local_storage;
let manifest_urls = new Map();

let protocol_data;


const NProgress = require('nprogress');
NProgress.configure({ 
    trickle: false,
    easing: 'ease',
    speed: 1,
    minimum: 0.03
});


$(document).on('page:load', '#home-section', function(e){
    console.log('HOME page:load triggered');
    _init_variables();
});

$(document).on('show.bs.modal', '#download_modal', function(e) {
    if (default_local_storage) {
        $('#download_destination_text').val(default_local_storage)
        $('#yes_default_local_storage').show();
        $('#no_default_local_storage').hide();
    } else {
        $('#download_destination_text').val('');
        $('#yes_default_local_storage').hide();
        $('#no_default_local_storage').show();
    }
});

$(document).on('change', '#download_destination_file', function(e) {
    console.log(this.files);

    let $input = $('#download_destination_text');

    if (this.files.length) {
        $input.val(this.files[0].path);
    }

    $(this).val('');
});

$(document).on('change', '#xnt_manifest_file', function(e) {
    console.log(this.files);

    let $input = $('#xnt_manifest_text');

    if (this.files.length) {
        $input.val(this.files[0].path);
    }

    $(this).val('');
});

$(document).on('click', '.js_download_session_files', function(){
    // validate
    let error_message = '';
    let $alert = $(this).closest('.modal-content').find('.alert');

    let xnt_file = $.trim($('#xnt_manifest_text').val());
    let destination = $.trim($('#download_destination_text').val());

    if (xnt_file === '') {
        error_message = 'Please select a valid XNAT XML catalog file.';
    } else if (destination === '') {
        error_message = 'Please set a download destination path.';
    } else {
        try {
            attempt_download(xnt_file, destination)
        } catch(err) {
            error_message = err.message;
        }
        
    }

    if (error_message.length) {
        $alert.show().find('.error_message').text(error_message);
    } else {
        $alert.hide();
    }
});

async function attempt_download(file_path, destination) {
    let data;
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
    console.log(parser);  

    try {
        // add if (file_path starts with "xnat(s)://" and put THAT into data)
        if (file_path.indexOf(app.app_protocol + '://') === 0 || file_path.indexOf(app.app_protocol + 's://') === 0) {
            
            let xml_request = axios.get(protocol_data.REST_XML, {
                auth: {
                    username: protocol_data.ALIAS,
                    password: protocol_data.SECRET
                }
            });
            
            let xml_resp = await xml_request; // wait till the promise resolves (*)
            console.log('////////////////////////////////////////////////////////////////');
            console.log(xml_resp);
            
            data = xml_resp.data;
        } else {
            data = fs.readFileSync(file_path);
        }

    } catch (err) {
        console.log(err.message);
        throw new Error('File reading error. Please choose another XML manifest file.');
    }

    let parsing_error_message = 'An error occurred while parsing manifest file! Please try again or use another manifest file.';

    parser.parseString(data, function (err2, result) {
        console.log(err2, result);
        if (err2) {
            throw new Error(parsing_error_message);
        }
        
        try {
            let catalog_description = result.catalog.$.description ? result.catalog.$.description : '';
            let has_project = catalog_description.indexOf('projectIncludedInPath') !== -1;
            let has_subject = has_project || catalog_description.indexOf('subjectIncludedInPath') !== -1;
            
            manifest_urls = new Map();
            
            let my_sets = result.catalog.sets[0].entryset;

            let download_digest = {
                id: Helper.uuidv4(),
                basename: path.basename(file_path),
                destination: destination,
                server: xnat_server,
                user: user_auth.username,
                //user_auth: user_auth,
                transfer_start: Helper.unix_timestamp(),
                sessions: [],
                canceled: false
            }

            console.log('===================================== my_sets =====================================');
            console.log(my_sets);
            
            for (let i = 0; i < my_sets.length; i++) {
                if (my_sets[i].hasOwnProperty('sets')) {
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
                            
                            manifest_urls.set(uri_data.name, real_uri);
                            
                            session.files.push({
                                name: uri_data.name,
                                uri: real_uri,
                                status: 0
                            })
                        }
                    }

                    download_digest.sessions.push(session)
                } else {
                    console.log('SKIPPing ---------------');
                }
            }

            console.log(download_digest);
            
            let my_transfers = store.transfers.get('downloads');
            my_transfers.push(download_digest);
            store.transfers.set('downloads', my_transfers);
            
            console.log(manifest_urls);
            
            $('.modal').modal('hide');

            ipc.send('start_download');
            ipc.send('redirect', 'progress.html');

        } catch(parse_error) {
            console.log(parse_error.message);
            
            throw new Error(parsing_error_message);
        }

    });
}

function _init_variables() {
    console.log(':::::::::::::: >>> HOME _init_variables');
    console.log(remote.getGlobal('user_auth').password);
    
    
    xnat_server = settings.get('xnat_server');
    user_auth = settings.get('user_auth');
    default_local_storage = settings.get('default_local_storage')
}

ipc.on('launch_download_modal',function(e, data){
    console.log(':::::::::::::: >>> launch_download_modal');

    setTimeout(function(){
        console.log(data);
        protocol_data = data;

        $('#xnt_manifest_text').val(data.URL);
        
        $('#download_modal').modal('show');
    }, 300);
});
