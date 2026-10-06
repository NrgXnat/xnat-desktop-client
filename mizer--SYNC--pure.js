const mizer = exports;
const path = require('path');


const _app_path = __dirname;

let java, jarDir, importClass, appendClasspath, mizerService;

let initJava = false

if (path.extname(_app_path) === '.asar') {
  const java_node_modules_dir = path.resolve(_app_path, '..', 'app.asar.unpacked', 'node_modules', 'java')
  java = require(java_node_modules_dir)
  jarDir = path.resolve(_app_path, '..', 'app.asar.unpacked', 'libs') + "/"
} else {
  ensureJvm = require('java-bridge').ensureJvm

  try {
    ensureJvm({
        isPackagedElectron: true
    });
    initJava = true
  } catch (err) {
    console.log(err);
  }
  
  importClass = require('java-bridge').importClass
  appendClasspath = require('java-bridge').appendClasspath
  jarDir = _app_path + "/libs/"
}

console.log(jarDir);

if (initJava) {
    const jarClassPaths = ["classes",
        "antlr-runtime-3.5.2.jar",
        "antlr4-runtime-4.7.1.jar",
        "commons-compress-1.20.jar",
        "commons-codec-1.10.jar",
        "commons-io-2.6.jar",
        "commons-lang3-3.11.jar",
        "dcm4che-core-2.0.29.jar",
        "dcm4che-iod-2.0.29.jar",
        "dcm4che-net-2.0.29.jar",
        "dicom-edit4-1.1.0.jar",
        "dicom-edit6-6.5.0.jar",
        "dicomtools-1.8.8.jar",
        "framework-1.8.8.jar",
        "guava-20.0.jar",
        "jai-imageio-core-1.3.0.jar",
        "jai-imageio-jpeg2000-1.3.0.jar",
        "java-uuid-generator-3.1.4.jar",
        "jcl-over-slf4j-1.7.30.jar",
        "log4j-1.2.17.jar",
        "mizer-1.2.4.jar",
        "pixelEditor-1.3.0.jar",
        "pixelmed-nrg-20200327.jar",
        "pixelmed-codec-20200328.jar",
        "pixelmed-imageio-20200328.jar",
        "reflections-0.9.11.jar",
        "slf4j-api-1.7.30.jar",
        "slf4j-log4j12-1.7.30.jar",
        "spring-core-4.3.30.RELEASE.jar",
        "transaction-1.8.8.jar"].map(jar => jarDir + jar);

    appendClasspath(jarClassPaths);


    const mizersClass = importClass("java.util.ArrayList");
    const mizers = new mizersClass()

    const de4MizerClass = importClass("org.nrg.dcm.edit.mizer.DE4Mizer")
    mizers.addSync(new de4MizerClass());

    const scriptFactoryClass = importClass("org.nrg.dicom.dicomedit.DE6ScriptFactory");
    const scriptFactory = new scriptFactoryClass()
    const de6MizerClass = importClass("org.nrg.dicom.dicomedit.mizer.DE6Mizer")
    mizers.addSync(new de6MizerClass(scriptFactory));

    // console.log({ROOT__mizers: mizers});

    const mizerServiceClass = importClass("org.nrg.dicom.mizer.service.impl.BaseMizerService")
    mizerService = new mizerServiceClass(mizers);

    // console.log({ROOT__mizerService: mizerService});
}



/**
 * Creates a Java Properties object from a hash of values. This object is what the Mizer service expects for
 * variables and values to be used during anonymization.
 *
 * Add more variables to the return from this function by calling:
 *
 * variables.setProperty('variableName', 'variableValue');
 *
 * @param variables A hash of variable names and values.
 *
 * @return A Java Properties object containing the submitted names and values.
 */
mizer.getVariables = (variables) => {
    const PropertiesClass = importClass("java.util.Properties");
    const properties = new PropertiesClass()

    // console.log({getVariables__properties: properties});
    // console.log('-----------------------------------');
    // console.log(variables);
    // console.log('-----------------------------------');
    
    if (variables) {
        for (let key in variables) {
            // console.log(`${key} => ${variables[key]}`);
            properties.setPropertySync(key, variables[key]);
        }
        // Object.keys(variables).forEach(key => {
        //     properties.setPropertySync(key, variables[key]);
        // });
    }

    return properties;
};

/**
 * Add variables, such as from {@link #getVariables()} above, to the return from this function by calling
 * context.add(variables).
 *
 * @param script The script for which a context should be created.
 *
 * @return A script context.
 */
mizer.getScriptContext = (script) => {
    const ContextClass = importClass("org.nrg.dicom.mizer.service.impl.MizerContextWithScript");
    const context = new ContextClass();

    // console.log({getScriptContext__context: context});

    // context.setScriptSync(script);
    context.setScriptSync(script);

    return context;
};

/**
 * Add variables, such as from {@link #getVariables()} above, to the return from this function by calling
 * context.add(variables).
 *
 * @param scripts The scripts for which contexts should be created.
 *
 * @return A list of script contexts.
 */
mizer.getScriptContexts = (scripts) => {
    const ArrayListClass = importClass("java.util.ArrayList");
    const arrayList = new ArrayListClass();

    // scripts.forEach(script => {
    //     const context = mizer.getScriptContext(script);
    //     arrayList.addSync(context);
    // });

    for (let i = 0; i < scripts.length; i++) {
        const context = mizer.getScriptContext(scripts[i]);
        arrayList.addSync(context);
    }

    return arrayList;
};

/**
 * Gets variables that are referenced in the contexts.
 */
mizer.getReferencedVariables = (contexts) => {
    const variableMap = {};
    const variables = mizerService.getReferencedVariablesSync(contexts);

    // console.log({contexts, variables});
    
    let itr = variables.iteratorSync();
    
    while (itr.hasNextSync()) {
        let variable = itr.nextSync();
        
        let initialValue = variable.getInitialValueSync();
        let variableValue = initialValue ? initialValue.asStringSync() : "";
        variableMap[variable.getNameSync()] = variableValue;
    }
    
    console.log('************* REFERENCED VARIABLES ************************');
    console.log({variableMap});
    
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
    const FileClass = importClass("java.io.File");
    const dicom = new FileClass(source);

    contexts.forEach(context => context.add(variables));
    mizerService.anonymize(dicom, contexts);
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
    const FileClass = importClass("java.io.File");
    const dicom = new FileClass(source);

    //console.log({CNTXTS_0: contexts})

    let itr = contexts.iteratorSync();
    while (itr.hasNextSync()) {
        let context = itr.nextSync();
        //console.log({context__0: context});
        context.addSync(variables);
    }

    try {
        console.log({mizerService});
        mizerService.anonymize(dicom, contexts);
        console.log(`Anonymized: ${source}`);
    } catch (err) {
        console.log(`==== ANON_ERR ====> ${source}`);
        console.log({ANON_ERR: err});
        throw err
    }
    
};

mizer.anonymize_single = (source, script, variables) => {
    const PropertiesClass = importClass("java.util.Properties");
    const properties = new PropertiesClass();

    if (variables) {
        Object.keys(variables).forEach(key => {
            properties.setProperty(key, variables[key]);
        });
    }

    const FileClass = importClass("java.io.File");
    const file = new FileClass(source);

    const ContextClass = importClass("org.nrg.dicom.mizer.service.impl.MizerContextWithScript");
    const context = new ContextClass(properties)
    context.setScript(script);

    // const list = java.callStaticMethod("java.util.Collections", "singletonList", context);
    const CollectionsClass = importClass("java.util.Collections")
    const collections = new CollectionsClass()
    const list = collections.singletonList(context);

    mizerService.anonymize(file, list);
};

mizer.get_scripts_anon_vars = (scripts) => {
    const contexts = mizer.getScriptContexts(scripts);
    return mizer.getReferencedVariables(contexts);
}

mizer.generateAlterPixelCode = (rectangles) => {
    let lines = rectangles.map(rect => {
      return `alterPixels["rectangle", "l=${Math.round(rect[0])}, t=${Math.round(rect[1])}, r=${Math.round(rect[2])}, b=${Math.round(rect[3])}", "solid", "v=100"]`;
    })
    
    if (lines.length) {
      lines.unshift(`version "6.1"`)
    }
    
    return lines.join("\n");
}

mizer.isMizerError = (error_message) => {
    return error_message && error_message.indexOf('org.nrg.dicom.mizer.exceptions.MizerException') >= 0
}
