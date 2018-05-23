const mizer = exports;
const path = require('path');
const fs = require('fs');

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
    "dicom-edit6-1.0.2-SNAPSHOT.jar",
    "dicomtools-1.7.4.jar",
    "framework-1.7.4.jar",
    "guava-20.0.jar",
    "log4j-1.2.17.jar",
    "lombok-1.16.18.jar",
    "mizer-1.0.2-SNAPSHOT.jar",
    "reflections-0.9.10.jar",
    "slf4j-api-1.7.25.jar",
    "slf4j-log4j12-1.7.25.jar",
    "spring-core-4.3.9.RELEASE.jar",
    "transaction-1.7.4.jar"].forEach(jar => java.classpath.push(jarDir + jar));



const mizers = java.newInstanceSync("java.util.ArrayList");
mizers.addSync(java.newInstanceSync("org.nrg.dcm.edit.mizer.DE4Mizer"));
mizers.addSync(java.newInstanceSync("org.nrg.dicom.dicomedit.mizer.DE6Mizer"));

const mizerService = java.newInstanceSync("org.nrg.dicom.mizer.service.impl.BaseMizerService", mizers);

mizer.anonymize = (source, script, variables) => {
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