const axios = require('axios');
const { sortAlpha } = require('./app_utils');
const ElectronStore = require('electron-store');
const settings = new ElectronStore();
const https = require('https');


class XNATAPI {
    constructor(xnat_server, user_auth) {
        this.xnat_server = xnat_server
        this.user_auth = user_auth
    }

    axios_config() {
        let httpsOptions = { keepAlive: true };

        const allow_insecure_ssl = settings.has('allow_insecure_ssl') ? settings.get('allow_insecure_ssl') : false;
        
        // TODO resolve circular dependency and replace allow_insecure_ssl with method auth.allow_insecure_ssl()
        httpsOptions.rejectUnauthorized = !allow_insecure_ssl

        return {
            httpsAgent: new https.Agent(httpsOptions),
            auth: this.user_auth
        }
    }

    //******** axios helpers ********* */
    axios_get(url_path) {
        return axios.get(this.xnat_server + url_path, this.axios_config())
    }

    axios_put(url_path) {
        return axios.put(this.xnat_server + url_path, this.axios_config())
    }

    axios_post(url_path, params) {
        return axios.post(this.xnat_server + url_path, params, this.axios_config())
    }

    catch_handler(err, resolve, reject) {
        reject({
            type: 'axios',
            data: err
        })
    }

    async get_csrf_token() {
        const res = await this.axios_get('/')

        let csrfTokenRequestData = res.data
        let m, csrfToken = false
        const regex = /var csrfToken = ['"](.+?)['"];/g

        while ((m = regex.exec(csrfTokenRequestData)) !== null) {
            // This is necessary to avoid infinite loops with zero-width matches
            if (m.index === regex.lastIndex) {
                regex.lastIndex++
            }

            csrfToken = m[1]
        }

        return csrfToken
    }

    async create_project_subject(project_id, subject_label, group, csrfToken) {
        return await this.axios_put(`/data/projects/${project_id}/subjects/${subject_label}?group=${group}&event_reason=XNAT+Application&XNAT_CSRF=${csrfToken}`)
    }


    //******** SITEWIDE ********* */

    async sitewide_pet_tracers() {
        const res = await this.axios_get('/data/config/tracers/tracers?contents=true&accept-not-found=true')

        const pet_tracers_str = res.data.trim();

        return pet_tracers_str.length ? pet_tracers_str.split(/\s+/) : []
    }

    

    async sitewide_series_import_filter() {
        try {
            const res = await this.axios_get('/data/config/seriesImportFilter?contents=true&accept-not-found=true')

            let global_filter_enabled, global_filter

            if (res.data.ResultSet) {
                global_filter_enabled = res.data.ResultSet.Result[0].status == 'disabled' ? false : true;
                global_filter = res.data.ResultSet.Result[0].contents;
            } else {
                global_filter_enabled = false
            }

            return global_filter_enabled ? global_filter : false
            
        } catch (err) {
            if (err.response && err.response.status === 404) {
                return false   
            } else {
                throw err
            }
        }
    }

    async sitewide_allow_create_subject() {
        const res = await this.axios_get('/data/config/applet/allow-create-subject?contents=true&accept-not-found=true')

        return typeof res.data === 'boolean' ? res.data : (res.data === '' || res.data.toLowerCase() === 'true')
    }

    async sitewide_require_date() {
        const res = await this.axios_get('/data/config/applet/require-date?contents=true&accept-not-found=true')

        return (typeof res.data === 'boolean') ? res.data : (res.data.toLowerCase() !== 'false' && res.data !== '')
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
    }



    //************************** */
    //******** PROJECT ********* */
    //************************** */

    async project_subjects(project_id) {
        const res = await this.axios_get(`/data/projects/${project_id}/subjects?columns=group,insert_date,insert_user,project,label`)

        return res.data.ResultSet.Result.sort(sortAlpha('label'))
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
    }

    async project_allow_create_subject(project_id) {
        const res = await this.axios_get(`/data/projects/${project_id}/config/applet/allow-create-subject?contents=true&accept-not-found=true`)
        
        return typeof res.data === 'boolean' ? res.data : (res.data === '' || res.data.toLowerCase() === 'true')
    }

    /*
    async project_require_date(project_id) {
        const res = await this.axios_get(`/data/projects/${project_id}/config/applet/require-date?contents=true&accept-not-found=true`)

        return typeof res.data === 'boolean' ? res.data : (res.data.toLowerCase() !== 'false' && res.data !== '')
    }
    */

    async project_require_date(project_id) {
        const res = await this.axios_get(`/data/projects/${project_id}/config/applet/require-date?contents=true&accept-not-found=true`)

        if (res.data === '') {
            // return null;
            return await this.sitewide_require_date(); // use sitewide
        } else {
            return typeof res.data === 'boolean' ? res.data : (res.data.toLowerCase() !== 'false');
        }
    }

    async project_allow_bulk_upload(project_id) {
        const res = await this.axios_get(`/data/projects/${project_id}/config/applet/allow-bulk-upload?contents=true&accept-not-found=true`)

        if (res.data === '') {
            return true
            // return await this.sitewide_require_date(); // use sitewide
        } else {
            return typeof res.data === 'boolean' ? res.data : (res.data.toLowerCase() !== 'false');
        }
    }

    async project_default_subject_labeling_scheme(project_id) {
        const res = await this.axios_get(`/data/projects/${project_id}/config/applet/default-subject-labeling-scheme?contents=true&accept-not-found=true`)

        if (res.data === '') {
            return 'manual' // default
        } else {
            return res.data.toLowerCase()
        }
    }

    async project_default_session_labeling_scheme(project_id) {
        const res = await this.axios_get(`/data/projects/${project_id}/config/applet/default-session-labeling-scheme?contents=true&accept-not-found=true`)

        if (res.data === '') {
            return 'auto' // default
        } else {
            return res.data.toLowerCase()
        }
    }

    async project_sessions(project_id) {
        const res = await this.axios_get(`/data/projects/${project_id}/experiments?columns=ID,label&format=json`)

        return res.data.ResultSet.Result
    }

    async project_prearchived_sessions(project_id) {
        const res = await this.axios_get(`/data/prearchive/projects/${project_id}`)

        return res.data.ResultSet.Result
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
    }

    async project_data(project_id) {
        const res = await this.axios_get(`/data/projects/${project_id}?format=json`)

        return res.data.items[0].data_fields
    }

    async project_pet_tracers(project_id) {
        const resp = await this.axios_get(`/data/projects/${project_id}/config/tracers/tracers?contents=true&accept-not-found=true`)
    
        if (resp.status === 200) {
            const pet_tracers_str = resp.data.trim()

            return pet_tracers_str.length ? pet_tracers_str.split(/\s+/) : []

        } else {
            return false
        }
    }

    async get_projects() {
        let projects;
        const resp = await this.axios_get(`/data/projects?permissions=edit&dataType=xnat:subjectData`)

        let totalRecords = resp.data && resp.data.ResultSet ? resp.data.ResultSet.Result.length : 0;

        if (totalRecords === 0) {
            projects = []
        } else if (totalRecords === 1) {
            projects= [resp.data.ResultSet.Result[0]]
        } else {
            projects = resp.data.ResultSet.Result
        }

        return projects;
    }

    async project_subject_visits(project_id, subject_id) {
        const res = await this.axios_get(`/data/projects/${project_id}/subjects/${subject_id}/visits?open=true`)

        let visits = res.data;
        if (!visits || !Array.isArray(visits)) {
            visits = []
        }

        return visits.sort(sortAlpha('name'))
    }

    async project_visit_datatypes(project_id, visit_id) {
        const res = await this.axios_get(`/xapi/protocols/projects/${project_id}/visits/${visit_id}/datatypes?imagingOnly=true`)

        let types = res.data;
        if (!types || !Array.isArray(types)) {
            types = []
        }

        return types.sort(sortAlpha('name'))
    }

    async project_visit_subtypes(project_id, visit_id, datatype) {
        const res = await this.axios_get(`/xapi/protocols/projects/${project_id}/visits/${visit_id}/datatypes/${datatype}/subtypes`)

        let subtypes = res.data;
        if (!subtypes || !Array.isArray(subtypes)) {
            subtypes = []
        }

        console.log({xxx_subtypes: subtypes});

        return subtypes.sort(sortAlpha())
    }
    
    async project_experiment_label(project_id, subject_id, visit_id, subtype, session_date, modality) {
        let params = new URLSearchParams();
        params.append('visitid', visit_id);
        params.append('project', project_id);
        params.append('subject', subject_id);
        params.append('modality', modality);
        params.append('subtype', subtype);
        params.append('date', session_date);
        params.append('dateFormat', 'yyyy-MM-dd');

        const res = await this.axios_post(`/xapi/protocols/generate_label`, params)

        return res.data ? res.data : null
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