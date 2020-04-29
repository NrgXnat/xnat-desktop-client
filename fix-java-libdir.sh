#!/usr/bin/env bash

sed -i '.bak' 's#lib_dir="${jre_dir}/jli"#lib_dir="/Applications/XNAT-Desktop-Client.app/Contents/Resources/jre/lib/jli"#' node_modules/java/find_java_libdir.sh

