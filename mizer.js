const mizer = exports;
const path = require('path');


// const { app } = require('@electron/remote');
const appIsPackaged = path.extname(__dirname) === '.asar'

const basePath = appIsPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked')
  : __dirname;

const jarDir = path.join(basePath, 'libs/');

// DicomEdit's alterPixels[] locates its pixel-edit handler through
// java.util.ServiceLoader, which resolves against the *thread context*
// classloader. appendClasspath() puts these jars in java-bridge's own
// URLClassLoader, which that lookup never consults - so no handler was found,
// alterPixels failed, and DicomEdit wrote a 0-byte file. Passing the same jars
// as -Djava.class.path puts them on the system classloader, which is the
// default context classloader on every thread (including the worker threads
// java-bridge uses for async calls).
//
// This regressed in commit 3a8a4f3 ("Initial migration", 2024-02-14), which
// swapped node-java's java.classpath.push() - a pre-JVM-start classpath that
// the system classloader saw - for java-bridge's appendClasspath(). Passing
// -Djava.class.path restores the behaviour node-java had. appendClasspath() is
// kept as well so java-bridge resolves importClass() through its own loader.
// See mizer--ORIG.js for the pre-migration original.
const JAR_CLASSPATH = ["classes",
        "antlr-runtime-3.5.3.jar",
        "antlr4-runtime-4.9.3.jar",
        "commons-compress-1.26.0.jar",
        "commons-codec-1.10.jar",
        "commons-io-2.15.1.jar",
        "commons-lang3-3.11.jar",
        "dcm4che-core-2.0.29.jar",
        "dcm4che-iod-2.0.29.jar",
        "dcm4che-net-2.0.29.jar",
        "dicom-edit4-1.9.3.jar",
        "dicom-edit6-6.8.0.jar",
        "dicomtools-1.9.3.jar",
        "framework-1.9.3.jar",
        "guava-32.1.3-jre.jar",
        "jai-imageio-core-1.3.0.jar",
        "jai-imageio-jpeg2000-1.3.0.jar",
        "java-uuid-generator-3.1.4.jar",
        "jcl-over-slf4j-1.7.30.jar",
        "log4j-1.2.17.jar",
        "mizer-1.9.3.jar",
        "pixelmed-nrg-20200327.jar",
        "pixelmed-codec-20200328.jar",
        "pixelmed-imageio-20200328.jar",
        "reflections-0.10.2.jar",
        "slf4j-api-1.7.30.jar",
        "slf4j-log4j12-1.7.30.jar",
        "spring-core-5.3.39.jar",
        "transaction-1.9.3.jar"].map(jar => jarDir + jar);


const javaBridge = appIsPackaged ? require(path.join(basePath, 'node_modules', 'java-bridge')) : require('java-bridge');
const { importClass, appendClasspath, ensureJvm, getJavaLibPath, JavaVersion } = javaBridge;
// const { importClass, appendClasspath, ensureJvm, getJavaLibPath, JavaVersion } = require('java-bridge');





const { simpleLog } = require('./services/app_utils');

function console_log(log_this) {
    simpleLog(log_this, 'xdc--log-custom-fixed');
    console.log('Logging: ', log_this);
}



let mizerService;
let initJava = false
// Retained so the failure can be reported instead of silently disabling
// anonymization. See assertJavaReady() and mizer.isJavaAvailable() below.
let javaInitError = null

console_log(__filename)

if (appIsPackaged) {
    try {
        console_log('PACKAGED App')

        let libPath;

        switch (require('os').platform()) {
            case 'win32':
                libPath = path.join(process.resourcesPath, 'jre', 'bin', 'server', 'jvm.dll')
                break
            case 'darwin':
                libPath = path.join(process.resourcesPath, 'jre', 'lib', 'server', 'libjvm.dylib')
                break
            case 'linux':
                libPath = path.join(process.resourcesPath, 'jre', 'lib', 'amd64', 'server', 'libjvm.so')
                break
        }

        console_log(`${require('os').platform()} jvm: ${libPath}`)
        
        ensureJvm({
            isPackagedElectron: true,
            libPath: libPath,
            version: JavaVersion.VER_1_8,
            opts: [
                '-Xms2048m',     // 2GB initial heap
                '-Xmx4096m',     // 4GB max heap
                '-XX:+UseG1GC',  // G1 Garbage Collector - better for large heaps
                // Required for alterPixels[] - see JAR_CLASSPATH above.
                `-Djava.class.path=${JAR_CLASSPATH.join(path.delimiter)}`,
                // PixelMed's image handling pulls in AWT; there is no display here.
                '-Djava.awt.headless=true'
            ],
        });

        // ensureJvm({
        //     isPackagedElectron: true,
        //     libPath: 'C:\\Program Files\\XNAT-Desktop-Client\\resources\\jre\\bin\\server\\jvm.dll',
        //     version: JavaVersion.VER_1_8
        // });

        initJava = true

        console_log('initJava PACKAGED: true')
    } catch (err) {
        javaInitError = err
        console_log('initJava PACKAGED: false')
        let errorString = JSON.stringify(err, Object.getOwnPropertyNames(err));
        console_log(errorString)
    }

} else {
    // ensureJvm()
    // console_log(`libPath: ${path.join(__dirname, 'build_resources', 'jre', 'win-x64', 'bin', 'server', 'jvm.dll')}`)
    try {
        ensureJvm({
            // isPackagedElectron: false,
            // libPath: 'C:\\Program Files\\XNAT-Desktop-Client\\resources\\jre\\bin\\server\\jvm.dll',
            // libPath: path.join(__dirname, 'build_resources', 'jre', 'win-x64', 'bin', 'server', 'jvm.dll'),
            // version: JavaVersion.VER_1_8
            opts: [
                // Required for alterPixels[] - see JAR_CLASSPATH above.
                `-Djava.class.path=${JAR_CLASSPATH.join(path.delimiter)}`,
                '-Djava.awt.headless=true'
            ]
        });
        initJava = true
    } catch (err) {
        javaInitError = err
        console_log('initJava UNPACKAGED: false')
        console_log(JSON.stringify(err, Object.getOwnPropertyNames(err)))
    }
}

console_log('jarDir: ' + jarDir)

async function getAndStoreJavaVersion() {
    try {
        const javaVersion = await javaBridge.getJavaVersion();
        console_log(`getJavaLibPath: ${getJavaLibPath()}`)
        console_log(`Java version: ${javaVersion}`);
    } catch (err) {
        let errorString = JSON.stringify(err, Object.getOwnPropertyNames(err));
        console_log(`Error getting Java version: ${errorString}`);
    }
}

// Call the function
getAndStoreJavaVersion();


if (initJava) {
    // importClass()/appendClasspath() reach into the JVM. If any of this
    // fails, mizerService is left undefined and every anonymization call
    // downstream fails in a way that does not surface, so record it here.
    try {
        const jarClassPaths = JAR_CLASSPATH;

        appendClasspath(jarClassPaths);


        const mizersClass = importClass("java.util.ArrayList");
        const mizers = new mizersClass()

        const de4MizerClass = importClass("org.nrg.dcm.edit.mizer.DE4Mizer")
        mizers.addSync(new de4MizerClass());

        // DicomEdit 6.8 removed DE6ScriptFactory and ScriptApplicatorFactory.
        // DE6Mizer now builds its own applicator and takes no constructor
        // arguments; before 6.8 it required a ScriptApplicatorFactory.
        const de6MizerClass = importClass("org.nrg.dicom.dicomedit.mizer.DE6Mizer")
        mizers.addSync(new de6MizerClass());

        // console.log({ROOT__mizers: mizers});

        // Secondary guard for the calling thread, in case a future java-bridge
        // version stops honouring -Djava.class.path.
        try {
            const Thread = importClass('java.lang.Thread')
            Thread.currentThreadSync().setContextClassLoaderSync(javaBridge.getClassLoader())
        } catch (tcclErr) {
            console_log(`could not set the thread context classloader: ${tcclErr.message}`)
        }

        const mizerServiceClass = importClass("org.nrg.dicom.mizer.service.impl.BaseMizerService")
        mizerService = new mizerServiceClass(mizers);

        // console.log({ROOT__mizerService: mizerService});
    } catch (err) {
        javaInitError = err
        initJava = false
        mizerService = undefined
        console_log('mizer service init FAILED')
        console_log(JSON.stringify(err, Object.getOwnPropertyNames(err)))
    }

} else {
    console_log('initJava is FALSE')
}



// ---------------------------------------------------------------------------
// Java runtime availability
//
// When the bundled JRE is missing from the package, ensureJvm() throws, this
// module still loads, and mizerService is never created. Every anonymization
// call then fails in the main process without the rejection reaching the
// renderer, so the UI simply hangs. Anonymization is a PHI-removal feature:
// failing silently is the worst possible outcome, so make it loud and explicit.
// ---------------------------------------------------------------------------

function javaInitErrorMessage() {
    if (!javaInitError) return 'The Java runtime was not initialized.'
    return javaInitError.message || String(javaInitError)
}

// Synchronous, so callers (including renderers, over @electron/remote) can
// check availability without awaiting a call that may never settle.
mizer.isJavaAvailable = () => initJava && mizerService !== undefined

mizer.getJavaInitError = () => (initJava && mizerService !== undefined) ? null : javaInitErrorMessage()

// Throws a plain Error (serializable across @electron/remote) rather than
// letting the call disappear into an unresolved promise.
function assertJavaReady(operation) {
    if (initJava && mizerService !== undefined) return

    const message =
        `Anonymization is unavailable: the Java runtime failed to initialize, so "${operation}" cannot run. ` +
        `This usually means the bundled JRE is missing from the application package. ` +
        `Underlying error: ${javaInitErrorMessage()}`

    console_log(`assertJavaReady FAILED (${operation}): ${javaInitErrorMessage()}`)

    throw new Error(message)
}

if (!initJava || mizerService === undefined) {
    const summary = `Java runtime unavailable - anonymization is disabled. ${javaInitErrorMessage()}`
    console_log(summary)
    console.error(summary)

    try {
        // Route it to the production log too; console output is not retained.
        require('./services/electron_log').error(`[mizer] ${summary}`)
    } catch (e) {
        // logging must never be the reason startup fails
    }
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
mizer.getVariables = async (variables) => {
    assertJavaReady('getVariables');

    const PropertiesClass = importClass("java.util.Properties");
    const properties = new PropertiesClass()

    // console.log({getVariables__properties: properties});
    // console.log('-----------------------------------');
    // console.log(variables);
    // console.log('-----------------------------------');
    
    if (variables) {
        for (let key in variables) {
            // console.log(`${key} => ${variables[key]}`);
            await properties.setPropertySync(key, variables[key]);
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
mizer.getScriptContext = async (script) => {
    assertJavaReady('getScriptContext');

    const ContextClass = importClass("org.nrg.dicom.mizer.service.impl.MizerContextWithScript");
    const context = new ContextClass();

    // console.log({getScriptContext__context: context});

    // context.setScriptSync(script);
    await context.setScriptSync(script);

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
mizer.getScriptContexts = async (scripts) => {
    assertJavaReady('getScriptContexts');

    const ArrayListClass = importClass("java.util.ArrayList");
    const arrayList = new ArrayListClass();

    // scripts.forEach(script => {
    //     const context = mizer.getScriptContext(script);
    //     arrayList.addSync(context);
    // });

    for (let i = 0; i < scripts.length; i++) {
        const context = await mizer.getScriptContext(scripts[i]);
        await arrayList.addSync(context);
    }

    return arrayList;
};

/**
 * Gets variables that are referenced in the contexts.
 */
mizer.getReferencedVariables = (contexts) => {
    assertJavaReady('getReferencedVariables');

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
    assertJavaReady('anonymize_old');

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
let isMizerAnonBusy = false;
mizer.anonymize = async (source, contexts, variables) => {
    assertJavaReady('anonymize');

    if (isMizerAnonBusy) {
        await waitForNotBusy();
    }
    isMizerAnonBusy = true
    
    const FileClass = importClass("java.io.File");
    const dicom = new FileClass(source);

    //console.log({CNTXTS_0: contexts})

    let itr = contexts.iteratorSync();
    while (itr.hasNextSync()) {
        let context = itr.nextSync();
        //console.log({context__0: context});
        await context.addSync(variables);
    }

    /*
    mizerService.anonymizeSync(dicom, contexts);
    isMizerAnonBusy = false
    */
    
    try {
        const resultX = await mizerService.anonymize(dicom, contexts);

        const anonMessages = resultX.getMessageSync().split("\n")

        for (const anonMsg of anonMessages) {
            if (anonMsg.startsWith("Rejected:")) {
                throw new Error(`AnonymizationRejected - ${anonMsg}`);
            }
        }

        simpleLog(`Anonymized: ${path.basename(source)}`);
        console.log(`Anonymized: ${path.basename(source)}`);
        isMizerAnonBusy = false
        return resultX
    } catch (err) {
        console.log(`==== ANON_ERR ====> ${source}`);
        console.log({ANON_ERR: err});
        isMizerAnonBusy = false
        throw err
    }
    
};

function waitForNotBusy() {
    return new Promise(resolve => {
        const interval = setInterval(() => {
            if (!isMizerAnonBusy) {
                clearInterval(interval);
                resolve();
            }
        }, 50);
    });
}

mizer.anonymizeSimple = async (source, contexts) => {
    assertJavaReady('anonymizeSimple');

    const FileClass = importClass("java.io.File");
    const dicom = new FileClass(source);

    try {
        const resultX = await mizerService.anonymize(dicom, contexts);
        console.log(`Anonymized: ${source}`);
    } catch (err) {
        console.log(`==== ANON_ERR ====> ${source}`);
        console.log({ANON_ERR: err});
        throw err
    }
    
};

mizer.anonymize_single = (source, script, variables) => {
    assertJavaReady('anonymize_single');

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

mizer.get_scripts_anon_vars = async (scripts) => {
    assertJavaReady('get_scripts_anon_vars');

    console.log('==========****** mizer.get_scripts_anon_vars ******===============')
    const contexts = await mizer.getScriptContexts(scripts);
    return mizer.getReferencedVariables(contexts);
}

mizer.generateAlterPixelCode = (rectangles) => {
    let lines = rectangles.map(rect => {
      return `alterPixels["rectangle", "l=${Math.round(rect[0])}, t=${Math.round(rect[1])}, r=${Math.round(rect[2])}, b=${Math.round(rect[3])}", "solid", "v=100"]`;
    })
    
    if (lines.length) {
      // alterPixels[] is documented as DicomEdit 6.3+, so declare 6.3 rather than
      // the 6.1 this used to emit. Note this was NOT the cause of the 0-byte
      // output - that was the ServiceLoader classpath problem described at
      // JAR_CLASSPATH; with that fixed, 6.1 works too. Declaring 6.3 simply
      // matches the documented minimum for the function being used.
      lines.unshift(`version "6.3"`)
    }
    
    return lines.join("\n");
}

mizer.isMizerError = (error_message) => {
    return error_message && error_message.indexOf('org.nrg.dicom.mizer.exceptions.MizerException') >= 0
}

mizer.isMizerRejected = (error_message) => {
    return error_message && error_message.indexOf('AnonymizationRejected') >= 0
}
