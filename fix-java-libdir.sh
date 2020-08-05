#!/usr/bin/env bash

ostype="$(echo "${OSTYPE}" | tr '[:upper:]' '[:lower:]')"
case ${ostype} in
    darwin*)
        [[ ! -d /Applications/XNAT-Desktop-Client.app/Contents/Resources/jre/lib/jli ]] && {
            mkdir -p /Applications/XNAT-Desktop-Client.app/Contents/Resources/jre/lib
            cp -R build_resources/jre/mac/lib/jli /Applications/XNAT-Desktop-Client.app/Contents/Resources/jre/lib
        }
        sed -i '.bak' 's#lib_dir="${jre_dir}/jli"#lib_dir="/Applications/XNAT-Desktop-Client.app/Contents/Resources/jre/lib/jli"#' node_modules/java/find_java_libdir.sh
        echo "Found Mac platform \"${OSTYPE}\", applied monkey patch to node_modules/java/find_java_libdir.sh";;
    linux*)
        echo "Found Linux platform \"${OSTYPE}\", skipping monkey patch script for now";;
    *)
        echo "Found non-Mac platform \"${OSTYPE}\", skipping monkey patch script for now";;
esac

