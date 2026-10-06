const fs = require('fs');
const path = require('path');

// electron-builder passes the arch as a numeric enum. builder-util is a
// transitive dependency, so fall back to a local table if it cannot be loaded.
const ARCH_NAMES = ['ia32', 'x64', 'armv7l', 'arm64', 'universal'];

function archName(arch) {
    try {
        return require('builder-util').Arch[arch];
    } catch (err) {
        return ARCH_NAMES[arch];
    }
}

// Keep in sync with the libPath switch in mizer.js - this is the exact file
// the app dlopen()s at runtime.
const JVM_LIBRARY = {
    win32: path.join('bin', 'server', 'jvm.dll'),
    darwin: path.join('lib', 'server', 'libjvm.dylib'),
    linux: path.join('lib', 'amd64', 'server', 'libjvm.so')
};

const PLATFORM_DIRS = {
    win32: 'win',
    darwin: 'mac',
    linux: 'linux'
};

/**
 * Fails the build when the bundled JRE is absent.
 *
 * package.json declares build_resources/jre/<platform>-<arch> as extraResources.
 * electron-builder skips a missing extraResources directory silently, producing
 * an installable app whose anonymization is dead on arrival - the JVM library is
 * simply not there. That has cost real debugging time, so refuse to package.
 */
exports.default = async function verifyJre(context) {
    const platform = context.electronPlatformName;
    const platformDir = PLATFORM_DIRS[platform];
    const arch = archName(context.arch);

    if (!platformDir) {
        console.warn(`verify-jre: unrecognized platform "${platform}", skipping JRE check.`);
        return;
    }

    if (!arch) {
        console.warn(`verify-jre: unrecognized arch "${context.arch}", skipping JRE check.`);
        return;
    }

    const jreDir = path.join(__dirname, '..', 'build_resources', 'jre', `${platformDir}-${arch}`);
    const jvmLibrary = path.join(jreDir, JVM_LIBRARY[platform]);

    if (fs.existsSync(jvmLibrary)) {
        console.log(`verify-jre: bundled JRE OK for ${platformDir}-${arch} (${jvmLibrary})`);
        return;
    }

    const reason = fs.existsSync(jreDir)
        ? `the directory exists but does not contain ${JVM_LIBRARY[platform]}`
        : 'the directory does not exist';

    throw new Error(
        `Bundled JRE missing for ${platformDir}-${arch}: ${reason}.\n\n` +
        `  Expected: ${jvmLibrary}\n\n` +
        `build_resources/jre is gitignored and must be populated before packaging.\n` +
        `CI does this in the "Download Zulu JRE" steps of .github/workflows/build.yml;\n` +
        `for a local build, stage the matching Zulu 8 JRE into that directory first.\n\n` +
        `Packaging without it produces an app that installs and launches but whose\n` +
        `DICOM anonymization silently does not work.`
    );
};
