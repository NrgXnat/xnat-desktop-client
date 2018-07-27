const mizer = exports;
const path = require('path');
const fs = require('fs');
const axios = require('axios');

console.log(__dirname);


const _app_path = __dirname;

/*
fs.writeFileSync('mizer.js.txt', "MizerLibs: [" + _app_path +  "]" + path.resolve(_app_path, '..', 'app.asar.unpacked', 'libs') + "/", (err) => {
    if (err) throw err;
    console.log('Error writing mizer.js.txt');
});
*/

let java;
let jarDir;

if (path.extname(_app_path) === '.asar') {
  const java_node_modules_dir = path.resolve(_app_path, '..', 'app.asar.unpacked', 'node_modules', 'java')
  java = require(java_node_modules_dir)
  jarDir = path.resolve(_app_path, '..', 'app.asar.unpacked', 'libs') + "/"
} else {
  java = require('java')
  jarDir = _app_path + "/libs/"
}

console.log(jarDir);

["classes",
    "antlr-runtime-3.5.2.jar",
    "antlr4-4.5.3.jar",
    "commons-io-2.5.jar",
    "commons-lang3-3.5.jar",
    "commons-logging-1.2.jar",
    "dcm4che-core-2.0.29.jar",
    "dcm4che-iod-2.0.29.jar",
    "dcm4che-net-2.0.29.jar",
    "dicom-edit4-1.0.2-SNAPSHOT.jar",
    "dicom-edit6-1.0.4-SNAPSHOT.jar",
    "dicomtools-1.7.4.jar",
    "framework-1.7.4.jar",
    "guava-20.0.jar",
    "log4j-1.2.17.jar",
    "lombok-1.16.18.jar",
    "nrg-mizer-1.0.4-SNAPSHOT.jar",
    "reflections-0.9.10.jar",
    "slf4j-api-1.7.25.jar",
    "slf4j-log4j12-1.7.25.jar",
    "spring-core-4.3.9.RELEASE.jar",
    "transaction-1.7.4.jar"].forEach(jar => java.classpath.push(jarDir + jar));



const mizers = java.newInstanceSync("java.util.ArrayList");
mizers.addSync(java.newInstanceSync("org.nrg.dcm.edit.mizer.DE4Mizer"));
mizers.addSync(java.newInstanceSync("org.nrg.dicom.dicomedit.mizer.DE6Mizer"));

const mizerService = java.newInstanceSync("org.nrg.dicom.mizer.service.impl.BaseMizerService", mizers);

/**
 * Creates a Java Properties object from a hash of values. This object is what the Mizer service expects for
 * variables and values to be used during anonymization.
 *
 * Add more variables to the return from this function by calling:
 *
 * variables.setPropertySync('variableName', 'variableValue');
 *
 * @param variables A hash of variable names and values.
 *
 * @return A Java Properties object containing the submitted names and values.
 */
mizer.getVariables = (variables) => {
    const properties = java.newInstanceSync("java.util.Properties");
    console.log('-----------------------------------');
    console.log(variables);
    
    console.log('-----------------------------------');
    
    if (variables) {
        Object.keys(variables).forEach(key => {
            properties.setPropertySync(key, variables[key]);
        });
    }

    return properties;
};

/**
 * Add variables, such as from {@link #getVariables()} above, to the return from this function by calling
 * context.addSync(variables).
 *
 * @param script The script for which a context should be created.
 *
 * @return A script context.
 */
mizer.getScriptContext = (script) => {
    const context = java.newInstanceSync("org.nrg.dicom.mizer.service.impl.MizerContextWithScript");

    context.setScriptSync(script);

    return context;
};

/**
 * Add variables, such as from {@link #getVariables()} above, to the return from this function by calling
 * context.addSync(variables).
 *
 * @param scripts The scripts for which contexts should be created.
 *
 * @return A list of script contexts.
 */
mizer.getScriptContexts = (scripts) => {
    const contexts = java.newInstanceSync("java.util.ArrayList");

    scripts.forEach(script => {
        const context = mizer.getScriptContext(script);
        contexts.addSync(context);
    });

    return contexts;
};

/**
 * Gets variables that are referenced in the contexts.
 */
mizer.getReferencedVariables = (contexts) => {
    //return mizerService.getReferencedVariablesSync(contexts);
    const variableMap = {};
    const variables = mizerService.getReferencedVariablesSync(contexts);
    
    let itr = variables.iteratorSync();
    
    while (itr.hasNextSync()) {
        variable = itr.nextSync();
        
        let initialValue = variable.getInitialValueSync();
        let variableValue = initialValue ? initialValue.asStringSync() : "";
        variableMap[variable.getNameSync()] = variableValue;
    }
    
    
    // for (let i = 0; i < variables.sizeSync(); i++) {
    //     console.log('***********************************', variables.sizeSync(), variables[i]);
    //     let variable = variables.getSync(i);
    //     let initialValue = variable.getInitialValueSync();
    //     let variableValue = initialValue ? initialValue.asStringSync() : "";
    //     variableMap.set(variable.getNameSync(), variableValue);
    // }

    
    console.log('************* REFERENCED VARIABLES ************************');
    console.log(variableMap);
    
    return variableMap;
};

/**
 * Anonymizes the DICOM object source using the supplied scripts. If variables have already been set on the script
 * contexts, the variables parameter can be omitted.
 *
 * @param source    The DICOM object to anonymize.
 * @param contexts  The script contexts to use for anonymization.
 * @param variables A Java Properties object to pass for variable substitution.
 */
mizer.anonymize_old = (source, contexts, variables) => {
    const dicom = java.newInstanceSync("java.io.File", source);

    contexts.forEach(context => context.addSync(variables));
    mizerService.anonymizeSync(dicom, contexts);
};

/**
 * Anonymizes the DICOM object source using the supplied scripts. If variables have already been set on the script
 * contexts, the variables parameter can be omitted.
 *
 * @param source    The DICOM object to anonymize.
 * @param contexts  The script contexts to use for anonymization.
 * @param variables A Java Properties object to pass for variable substitution.
 */
mizer.anonymize = (source, contexts, variables) => {
    const dicom = java.newInstanceSync("java.io.File", source);

    let itr = contexts.iteratorSync();
    while (itr.hasNextSync()) {
        context = itr.nextSync();
        context.addSync(variables);

        //console.log(context);
    }
    mizerService.anonymizeSync(dicom, contexts);
};

mizer.anonymize_single = (source, script, variables) => {
    const properties = java.newInstanceSync("java.util.Properties");

    if (variables) {
        Object.keys(variables).forEach(key => {
            properties.setPropertySync(key, variables[key]);
        });
    }

    const file = java.newInstanceSync("java.io.File", source);
    const context = java.newInstanceSync("org.nrg.dicom.mizer.service.impl.MizerContextWithScript", properties);
    context.setScriptSync(script);

    const list = java.callStaticMethodSync("java.util.Collections", "singletonList", context);

    mizerService.anonymizeSync(file, list);
};

// ================================================================================
// ================================================================================
// ================================================================================
mizer.get_mizer_scripts_old = (xnat_server, user_auth, project_id) => {
    return new Promise(function(resolve, reject) {
        let scripts = [];
        get_global_anon_script(xnat_server, user_auth).then(resp => {
            console.log('get_global_anon_script', resp.data.ResultSet.Result);
            
            let global_anon_script_enabled = resp.data.ResultSet.Result[0].status == 'disabled' ? false : true;
            let global_anon_script = resp.data.ResultSet.Result[0].contents;
        
            if (global_anon_script_enabled) {
                scripts.push(remove_commented_lines(global_anon_script));
            }
        
            get_project_anon_script(xnat_server, user_auth, project_id).then(resp => {
                console.log('get_project_anon_script', resp.data.ResultSet.Result);
                
                let project_anon_script_enabled = resp.data.ResultSet.Result[0].status == 'disabled' ? false : true;
                let project_anon_script = resp.data.ResultSet.Result[0].contents;
                
                if (project_anon_script_enabled) {
                    scripts.push(remove_commented_lines(project_anon_script));
                }

                console.log('============= SCRIPTS ================');
                console.log(scripts);
                console.log('=============================');
                

                resolve(scripts);
        
            }).catch(err => {
                reject(err);
            });  
        
        }).catch(err => {
            reject(err);
        });  

    });
}


mizer.get_mizer_scripts = (xnat_server, user_auth, project_id) => {
    let scripts = [];
    return Promise.all([get_global_anon_script(xnat_server, user_auth), get_project_anon_script(xnat_server, user_auth, project_id)]).then(values => {      
        console.log(values);
        
        values.forEach(function(script){
            if (script) {
                let parsed_script = remove_commented_lines(script);
                if (parsed_script) {
                    scripts.push(parsed_script)
                }
            }
        });
        console.log('================= SCRIPTS ====================');
        console.log(scripts);
        
        return scripts;
    })
}

// global anon script
function get_global_anon_script(xnat_server, user_auth) {
    return new Promise(function(resolve, reject) {
        axios.get(xnat_server + '/data/config/anon/script?format=json', {
            auth: user_auth
        }).then(resp => {
            console.log('get_global_anon_script', resp.data.ResultSet.Result);

            let global_anon_script_enabled = resp.data.ResultSet.Result[0].status == 'disabled' ? false : true;
            let global_anon_script = resp.data.ResultSet.Result[0].contents;

            if (global_anon_script_enabled) {
                resolve(global_anon_script);
            } else {
                resolve(false)
            }
            
        }).catch(err => {
            resolve(false)
            //reject(err);
        });
    })
    
}


function get_project_anon_script(xnat_server, user_auth, project_id) {

    return new Promise(function(resolve, reject) {
        axios.get(xnat_server + '/data/projects/' + project_id + '/config/anon/projects/' + project_id + '?format=json', {
            auth: user_auth
        }).then(resp => {
            console.log('get_project_anon_script', resp.data.ResultSet.Result);
            
            let project_anon_script_enabled = resp.data.ResultSet.Result[0].status == 'disabled' ? false : true;
            let project_anon_script = resp.data.ResultSet.Result[0].contents;
            
            if (project_anon_script_enabled) {
                resolve(project_anon_script);
            } else {
                resolve(false);
            }

    
        }).catch(err => {
            resolve(false);
            //reject(err);
        });  
    })
}


function remove_commented_lines(script) {
    let weeded_script_lines = [], 
        script_lines = script.split("\n");

    console.log(script_lines);
    for (let i = 0; i < script_lines.length; i++) {
        let line = $.trim(script_lines[i]);
        if (line.length && line.indexOf('//') !== 0) {
            weeded_script_lines.push(line);
        }
    }

    console.log(weeded_script_lines);

    return weeded_script_lines.join("\n");
}

