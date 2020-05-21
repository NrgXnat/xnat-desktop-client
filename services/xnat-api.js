const axios = require('axios');
const { sortAlpha } = require('./app_utils');


class XNATAPI {
    constructor(xnat_server, user_auth) {
        this.xnat_server = xnat_server
        this.user_auth = user_auth
    }



    //******** axios helpers ********* */
    axios_get(url_path) {
        const {xnat_server, user_auth} = this

        return axios.get(xnat_server + url_path, {
            auth: user_auth
        })
    }

    catch_handler(err, resolve, reject) {
        reject({
            type: 'axios',
            data: err
        })
    }


    //******** SITEWIDE ********* */

    async sitewide_pet_tracers() {
        const res = await this.axios_get('/data/config/tracers/tracers?contents=true&accept-not-found=true')

        const pet_tracers_str = res.data.trim();

        return pet_tracers_str.length ? pet_tracers_str.split(/\s+/) : []

        
        /* ** PROMISE based ** */
        return new Promise((resolve, reject) => {
            this.axios_get('/data/config/tracers/tracers?contents=true&accept-not-found=true')
            .then(resp => {
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

    

    async sitewide_series_import_filter() {
        try {
            const res = await this.axios_get('/data/config/seriesImportFilter?contents=true&accept-not-found=true')

            const global_filter_enabled = res.data.ResultSet.Result[0].status == 'disabled' ? false : true;
            const global_filter = res.data.ResultSet.Result[0].contents;

            return global_filter_enabled ? global_filter : false
            
        } catch (err) {
            if (err.response && err.response.status === 404) {
                return false   
            }
        }
        

        /* ** PROMISE based ** */
        return new Promise((resolve, reject) => {
            this.axios_get('/data/config/seriesImportFilter?contents=true&accept-not-found=true')
            .then(resp => {
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

    async sitewide_allow_create_subject() {
        const res = await this.axios_get('/data/config/applet/allow-create-subject?contents=true&accept-not-found=true')

        return typeof res.data === 'boolean' ? res.data : (res.data === '' || res.data.toLowerCase() === 'true')

        /* ** PROMISE based ** */
        return new Promise((resolve, reject) => {
            this.axios_get('/data/config/applet/allow-create-subject?contents=true&accept-not-found=true')
            .then(res => {
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

    async sitewide_require_date() {
        const res = await this.axios_get('/data/config/applet/require-date?contents=true&accept-not-found=true')

        return (typeof res.data === 'boolean') ? res.data : (res.data.toLowerCase() !== 'false' && res.data !== '')

        /* ** PROMISE based ** */
        return new Promise((resolve, reject) => {
            this.axios_get('/data/config/applet/require-date?contents=true&accept-not-found=true')
            .then(res => {
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

    async sitewide_anon_script() {
        try {
            const res = await this.axios_get('/data/config/anon/script?format=json')

            // console.log('sitewide_anon_script', resp.data.ResultSet.Result);
    
            const global_anon_script_enabled = res.data.ResultSet.Result[0].status == 'disabled' ? false : true;
            const global_anon_script = res.data.ResultSet.Result[0].contents;
    
            return global_anon_script_enabled ? global_anon_script : false

        } catch(err) {
            if (err.response && err.response.status === 404) {
                return false   
            } else {
                throw err
            }
        }


        /* ** PROMISE based ** */
        return new Promise((resolve, reject) => {
            this.axios_get('/data/config/anon/script?format=json')
            .then(resp => {
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



    //************************** */
    //******** PROJECT ********* */
    //************************** */

    async project_subjects(project_id) {
        const res = await this.axios_get(`/data/projects/${project_id}/subjects?columns=group,insert_date,insert_user,project,label`)

        return res.data.ResultSet.Result.sort(sortAlpha('label'))

        /* ** PROMISE based ** */
        return new Promise((resolve, reject) => {
            this.axios_get('/data/projects/' + project_id + '/subjects?columns=group,insert_date,insert_user,project,label')
            .then(resp => {
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

    async project_anon_script(project_id) {
        try {
            const res = await this.axios_get(`/data/projects/${project_id}/config/anon/projects/${project_id}?format=json`)

            //console.log('project_anon_script', resp.data.ResultSet.Result);
                    
            const project_anon_script_enabled = res.data.ResultSet.Result[0].status == 'disabled' ? false : true;
            const project_anon_script = res.data.ResultSet.Result[0].contents;

            return project_anon_script_enabled ? project_anon_script : false

        } catch(err) {
            if (err.response && err.response.status === 404) {
                return false
            } else {
                throw err
            }
        }


        /* ** PROMISE based ** */
        return new Promise((resolve, reject) => {
            this.axios_get('/data/projects/' + project_id + '/config/anon/projects/' + project_id + '?format=json')
            .then(resp => {
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

    async project_allow_create_subject(project_id) {
        const res = await this.axios_get(`/data/config/projects/${project_id}/applet/allow-create-subject?contents=true&accept-not-found=true`)
        
        return typeof res.data === 'boolean' ? res.data : (res.data === '' || res.data.toLowerCase() === 'true')


        /* ** PROMISE based ** */
        return new Promise((resolve, reject) => {
            this.axios_get(`/data/config/projects/${project_id}/applet/allow-create-subject?contents=true&accept-not-found=true`)
            .then(res => {
                const result = (typeof res.data === 'boolean') ? res.data : (res.data === '' || res.data.toLowerCase() === 'true')
                
                resolve(result)
            }).catch(err => {
                reject({
                    type: 'axios',
                    data: err
                })
            });  
        });

    }

    async project_require_date(project_id) {
        const res = await this.axios_get(`/data/config/projects/${project_id}/applet/require-date?contents=true&accept-not-found=true`)

        return typeof res.data === 'boolean' ? res.data : (res.data.toLowerCase() !== 'false' && res.data !== '')
    }

    async project_sessions(project_id) {
        const res = await this.axios_get(`/data/projects/${project_id}/experiments?columns=ID,label&format=json`)

        return res.data.ResultSet.Result


        /* ** PROMISE based ** */
        return new Promise((resolve, reject) => {
            this.axios_get('/data/projects/' + project_id + '/experiments?columns=ID,label&format=json')
            .then(resp => {
                console.log({sessions: resp.data.ResultSet.Result});
                resolve(resp.data.ResultSet.Result);
            }).catch(err => {
                reject({
                    type: 'axios',
                    data: err
                })
            });
        });
    }

    async project_series_import_filter(project_id) {
        try {
            const res = await this.axios_get(`/data/projects/${project_id}/config/seriesImportFilter/config?format=json`)

            const filter_data = res.data.ResultSet.Result[0];
            return filter_data.status === 'disabled' ? false : JSON.parse(filter_data.contents)

        } catch(err) {
            if (err.response && err.response.status === 404) {
                return false
            } else {
                throw err
            }
        }


        /* ** PROMISE based ** */
        return new Promise((resolve, reject) => {
            this.axios_get(`/data/projects/${project_id}/config/seriesImportFilter/config?format=json`)
            .then(resp => {
                let filter_data = resp.data.ResultSet.Result[0];
                let filter_value = filter_data.status === 'disabled' ? false : JSON.parse(filter_data.contents)
    
                resolve(filter_value);
                
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

    async project_upload_destination(project_id) {
        const res = await this.axios_get(`/data/projects/${project_id}/prearchive_code`)

        switch (res.data) {
            case 0: 
                return "PREARCHIVE"

            case 4: 
                return "ARCHIVE (Reject duplicates)"

            case 5: 
            default:
                return "ARCHIVE (Overwrite duplicates)"
        }


        /* ** PROMISE based ** */
        return new Promise((resolve, reject) => {
            this.axios_get(`/data/projects/${project_id}/prearchive_code`)
            .then(resp => {
                let upload_destination;
                console.log({resp_data: resp.data});
                switch (resp.data) {
                    case 0:
                        upload_destination = "PREARCHIVE";
                        break;
                    case 4:
                        upload_destination = "ARCHIVE (Reject duplicates)";
                        break;
                    case 5:
                        upload_destination = "ARCHIVE (Overwrite duplicates)"
                        break;
                }
    
                resolve(upload_destination);
                
            }).catch(err => {
                reject({
                    type: 'axios',
                    data: err
                })
            });
        });
    }

    async project_data(project_id) {
        const res = await this.axios_get(`/data/projects/${project_id}?format=json`)

        return res.data.items[0].data_fields

        /* ** PROMISE based ** */
        return new Promise((resolve, reject) => {
            this.axios_get(`/data/projects/${project_id}?format=json`)
            .then(resp => {
                console.log({project_data: resp.data});
    
                resolve(resp.data.items[0].data_fields);
                
            }).catch(err => {
                reject({
                    type: 'axios',
                    data: err
                })
            });
        });
    }

    async project_pet_tracers(project_id) {
        const resp = await this.axios_get(`/data/projects/${project_id}/config/tracers/tracers?contents=true&accept-not-found=true`)
    
        if (resp.status === 200) {
            const pet_tracers_str = resp.data.trim()

            return pet_tracers_str.length ? pet_tracers_str.split(/\s+/) : []

        } else {
            return false
        }


        /* ** PROMISE based ** */
        return new Promise((resolve, reject) => {
            this.axios_get(`/data/projects/${project_id}/config/tracers/tracers?contents=true&accept-not-found=true`)
            .then(resp => {
                let pet_tracers
    
                if (resp.status === 200) {
                    let pet_tracers_str = resp.data.trim()
    
                    if (pet_tracers_str.length) {
                        pet_tracers = pet_tracers_str.split(/\s+/)
                    } else {
                        pet_tracers = []
                    }
                } else {
                    pet_tracers = false
                }
    
                resolve(pet_tracers)
                
            }).catch(err => {
                reject({
                    type: 'axios',
                    data: err
                })
            });
        });
    }





    /* OTHER */

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