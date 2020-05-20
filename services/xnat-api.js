const axios = require('axios');
const { sortAlpha } = require('./app_utils');


class XNATAPI {
    constructor(xnat_server, user_auth) {
        this.xnat_server = xnat_server
        this.user_auth = user_auth
    }

    //******** SITEWIDE ********* */

    sitewide_pet_tracers() {
        const {xnat_server, user_auth} = this

        return new Promise((resolve, reject) => {
            axios.get(xnat_server + '/data/config/tracers/tracers?contents=true&accept-not-found=true', {
                auth: user_auth
            }).then(resp => {
                let pet_tracers, 
                    pet_tracers_str = resp.data.trim();
    
                if (pet_tracers_str.length) {
                    pet_tracers = pet_tracers_str.split(/\s+/);
                } else {
                    pet_tracers = [];
                }
    
                resolve(pet_tracers);
                
            }).catch(err => {
                reject({
                    type: 'axios',
                    data: err
                })
            });
        });
    }

    sitewide_series_import_filter() {
        const {xnat_server, user_auth} = this
        
        return new Promise((resolve, reject) => {
            axios.get(xnat_server + '/data/config/seriesImportFilter?contents=true&accept-not-found=true', {
                auth: user_auth
            }).then(resp => {
                let global_filter_enabled = resp.data.ResultSet.Result[0].status == 'disabled' ? false : true;
                let global_filter = resp.data.ResultSet.Result[0].contents;
    
                if (global_filter_enabled) {
                    resolve(global_filter);
                } else {
                    resolve(false);
                }
                
            }).catch(err => {
                if (err.response && err.response.status === 404) {
                    resolve(false);    
                } else {
                    reject({
                        type: 'axios',
                        data: err
                    })
                }
            });
        });
    }

    sitewide_allow_create_subject() {
        const {xnat_server, user_auth} = this

        return new Promise((resolve, reject) => {
            axios.get(xnat_server + '/data/config/applet/allow-create-subject?contents=true&accept-not-found=true', {
                auth: user_auth
            }).then(res => {
                const result = (typeof res.data === 'boolean') ? res.data : (res.data === '' || res.data.toLowerCase() === 'true')
                
                resolve(result);
            }).catch(err => {
                reject({
                    type: 'axios',
                    data: err
                })
            });
        });
    }

    sitewide_require_date() {
        const {xnat_server, user_auth} = this

        return new Promise((resolve, reject) => {
            axios.get(xnat_server + '/data/config/applet/require-date?contents=true&accept-not-found=true', {
                auth: user_auth
            }).then(res => {
                const result = (typeof res.data === 'boolean') ? res.data : (res.data.toLowerCase() !== 'false' && res.data !== '')
                resolve(result);
            }).catch(err => {
                reject({
                    type: 'axios',
                    data: err
                })
            });
        });
    }

    sitewide_anon_script() {
        const {xnat_server, user_auth} = this

        return new Promise((resolve, reject) => {
            axios.get(xnat_server + '/data/config/anon/script?format=json', {
                auth: user_auth
            }).then(resp => {
                console.log('sitewide_anon_script', resp.data.ResultSet.Result);

                const global_anon_script_enabled = resp.data.ResultSet.Result[0].status == 'disabled' ? false : true;
                const global_anon_script = resp.data.ResultSet.Result[0].contents;

                if (global_anon_script_enabled) {
                    resolve(global_anon_script)
                } else {
                    resolve(false)
                }
                
            }).catch(err => {
                if (err.response && err.response.status === 404) {
                    resolve(false)
                } else {
                    reject({
                        type: 'axios',
                        data: err
                    })
                }
            })
        })
        
    }



    //******** PROJECT ********* */

    project_subjects(project_id) {
        const {xnat_server, user_auth} = this

        return new Promise(function(resolve, reject) {
            axios.get(xnat_server + '/data/projects/' + project_id + '/subjects?columns=group,insert_date,insert_user,project,label', {
                auth: user_auth
            }).then(resp => {
                /*
                let subjects = resp.data.ResultSet.Result;
                let sorted_subjects = subjects.sort(sortAlpha('label'));
                resolve(sorted_subjects);
                */
                
                resolve(resp.data.ResultSet.Result.sort(sortAlpha('label')));
                
            }).catch(err => {
                reject({
                    type: 'axios',
                    data: err
                })
            });
        });
    }

    project_anon_script(project_id) {
        const {xnat_server, user_auth} = this

        return new Promise((resolve, reject) => {
            axios.get(xnat_server + '/data/projects/' + project_id + '/config/anon/projects/' + project_id + '?format=json', {
                auth: user_auth
            }).then(resp => {
                console.log('project_anon_script', resp.data.ResultSet.Result);
                
                const project_anon_script_enabled = resp.data.ResultSet.Result[0].status == 'disabled' ? false : true;
                const project_anon_script = resp.data.ResultSet.Result[0].contents;
                
                if (project_anon_script_enabled) {
                    resolve(project_anon_script);
                } else {
                    resolve(false);
                }
        
            }).catch(err => {
                if (err.response && err.response.status === 404) {
                    resolve(false);    
                } else {
                    reject({
                        type: 'axios',
                        data: err
                    })
                }
            });  
        });
    }

    anon_scripts(project_id){
        return new Promise((resolve, reject) => {
            Promise.all([
                this.sitewide_anon_script(), 
                this.project_anon_script(project_id)
            ]).then(anon_scripts => {
                let scripts = XNATAPI._aggregate_script(anon_scripts[0], anon_scripts[1]);
                
                resolve(scripts);
            }).catch(err => {
                reject(err);
            })
        });
    }



    //******** STATIC ********* */

    static _aggregate_script(server_script, project_script) {
        let scripts = []

        console.log({server_script, project_script});
    
        [server_script, project_script].forEach((script) => {
            if (script) { // false if not enabled
                let parsed_script = XNATAPI._remove_commented_lines(script);
                if (parsed_script) {
                    scripts.push(parsed_script)
                }
            }
        })
    
        return scripts;
    }

    static _remove_commented_lines(script) {
        let weeded_script_lines = [], 
            script_lines = script.split("\n");
    
        //console.log(script_lines);
        for (let i = 0; i < script_lines.length; i++) {
            let line = script_lines[i].trim();
            if (line.length && line.indexOf('//') !== 0) {
                weeded_script_lines.push(line);
            }
        }
    
        //console.log(weeded_script_lines);
        return weeded_script_lines.join("\n");
    }
}


module.exports = XNATAPI