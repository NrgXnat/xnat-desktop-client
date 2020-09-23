const path = require('path');
const axios = require('axios');
const sha1 = require('sha1');
require('promise.prototype.finally').shim();

let api = {
    test: () => {
        console.log('api.test() radi');
    },

    set_logo_path: async (xnat_server, user_auth) => {
        try {
            console.log(`------------- set_logo_path --------------`);
            
            let home_page = axios.get(xnat_server + '/', {
                auth: user_auth
            });
            
            let resp = await home_page; // wait till the promise resolves (*)

            // create a virtual document to avoid image download
            let newDocument = document.implementation.createHTMLDocument('virtual');

            let $img = $(resp.data, newDocument).find('#header_logo img');

            if ($img.length) {
                var image = new Image();
    
                image.onload = function () {
                    var canvas = document.createElement('canvas');
                    canvas.width = this.naturalWidth; // or 'width' if you want a special/scaled size
                    canvas.height = this.naturalHeight; // or 'height' if you want a special/scaled size
            
                    canvas.getContext('2d').drawImage(this, 0, 0);
            
                    // ... or get as Data URI
                    store.set(api.get_server_str(xnat_server),  canvas.toDataURL('image/png'));
                };
                console.log($img.attr('src'));
                
                let origin = new URL(xnat_server).origin;
                image.src = origin + $img.attr('src');
                
            } else {
                store.remove(api.get_server_str(xnat_server));
            }

        } catch(err) {
            console.log(err);
        }
    },
    
    get_logo_path: (xnat_server) => {
        if (store.has(api.get_server_str(xnat_server))) {
            return store.get(api.get_server_str(xnat_server));
        } else {
            return 'assets/images/xnat-avatar.jpg'
        }
    },

    get_server_str(xnat_server) {
        return 'logo.' + sha1(xnat_server);
    },

}



module.exports = api;