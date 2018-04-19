const ipc = require('electron').ipcRenderer;
const fs = require('fs');
var fx = require('mkdir-recursive');

const path = require('path');
const settings = require('electron-settings');

const axios = require('axios');

const xml2js = require('xml2js');
const swal = require('sweetalert');

const remote = require('electron').remote;


let xnat_server, user_auth, default_local_storage;
let manifest_urls = new Map();

let manifest_urls_count;


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
    if (xnat_server) {
        $('#xnt_manifest_file').trigger('click');
    } else {
        swal('You must log in before you choose file')
    }
    
});

$(document).on('change', '#xnt_manifest_file', function(e){
    console.log(this.files[0]);
    let file_path = this.files[0].path;

    let parser = new xml2js.Parser({
        explicitArray: false,
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

                manifest_urls = new Map();
                
                let my_sets = result.Catalog.sets.entrySet;
                
                for (let i = 0; i < my_sets.length; i++) {
                    console.log('=====================================')
                    let entries = my_sets[i].sets.entrySet.entries.entry;
                    
                    for (let j = 0; j < entries.length; j++) {
                        let uri_data = entries[j].$;
                        let real_uri = uri_data.URI.replace(/^\/archive\//, '/data/') + '?format=zip';
                        manifest_urls.set(uri_data.name, real_uri)
                    }
                }

                console.log(manifest_urls);
                console.log(manifest_urls.size);

                manifest_urls_count = manifest_urls.size;

                NProgress.start();
                $.blockUI();
                
                download_items();
                
                // manifest_urls.forEach(function(uri, dir){
                //     console.log(dir + ' ====> ' + uri);
                // });


                // let first_dir = manifest_urls.keys().next().value;
                // let first_url = manifest_urls.get(first_dir);


            });
    });

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

function download_items() {
    if (manifest_urls.size == 0) {
        NProgress.done();
        $.unblockUI();        
        swal('All Done');
    }

    let progress = (manifest_urls_count - manifest_urls.size) / manifest_urls_count;
    NProgress.set(progress);
    

    let dir = manifest_urls.keys().next().value;
    let uri = manifest_urls.get(dir);

    manifest_urls.delete(dir);

    console.log(dir, uri);
    

    axios.get(xnat_server + uri, {
        auth: user_auth
    })
    .then(resp => {
        //console.log(resp)

        let real_path = path.resolve(default_local_storage, xnat_server.split('//')[1], dir);

        fx.mkdirSync(real_path, function(err) {
            if (err) throw err;

            console.log('--done--');
        });

        let zip_path = path.resolve(real_path, 'file.zip');

        //res.type('application/zip');
        //res.end( response.data, 'binary' );

        fs.writeFileSync(zip_path, resp.data, function(err) {
            if (err) throw err;
            console.log(`${zip_path} has been saved!`);
        });

        download_items();
    })
    .catch(err => {
        console.log(err.message)

        download_items();
    })
}

