#!/usr/bin/env bash

echo "Preparing to fix Java directory"
ostype="$(echo "${OSTYPE}" | tr '[:upper:]' '[:lower:]')"
case ${ostype} in
    darwin*)
        [[ ! -d /Applications/XNAT-Desktop-Client.app/Contents/Resources/jre/lib/jli ]] && { echo "You should have an OS X JDK installed as /Applications/XNAT-Desktop-Client.app, with the Contents/Home folder copied to Contents/Resources and the paths in Contents/_CodeSignature/CodeResources modified to reference Resources rather than Home. It's likely that this build will fail due to this."; }
        rm -f node_modules/java/binding.gyp node_modules/java/postInstall.js
        cp java-binding.gyp node_modules/java/binding.gyp
        cp java-postInstall.js node_modules/java/postInstall.js
        echo "Found Mac platform \"${OSTYPE}\", applied monkey patch to binding.gyp and postInstall.js";;
    linux*)
        echo "Found Linux platform \"${OSTYPE}\", skipping monkey patch script for now";;
    *)
        echo "Found non-Mac platform \"${OSTYPE}\", skipping monkey patch script for now";;
esac

