# XNAT Desktop Client
For dev, run `yarn install && yarn dev`

For publish, run `yarn dist-$target`, where `$target` is win, win-x64, mac, linux, or linux-x64.

Note:
```
Although it ends up being fairly pointless (turns out it always tries to use an external JDK, esp the one installed on the build machine; long story). I’d guess you can probably put anything you want in there as long as they’re in the appropriate folders: build_resources/jre/mac, build_resources/jre/win-x64, build_resources/jre/linux-x64.
Easy downloads are:
* https://cdn.azul.com/zulu/bin/zulu8.46.0.19-ca-jdk8.0.252-linux_x64.tar.gz
* https://cdn.azul.com/zulu/bin/zulu8.46.0.19-ca-jdk8.0.252-macosx_x64.tar.gz
* https://cdn.azul.com/zulu/bin/zulu8.46.0.19-ca-jdk8.0.252-win_x64.zip
For Mac, move the folder zulu8.46.0.19-ca-jdk8.0.252-macosx_x64/zulu-8.jdk/Contents/Home to build_resources/jre/mac. For the others I think it’s pretty straightforward.
Actually, you can d/l the JRE version and just extract that.

Anyway, the big issue there is that the java package uses a couple of packages, find-java-home, bindings, and node-gyp to build bindings to native code libraries. Along the way it builds a file named jvm_dll_path.json that hard-codes the location of the JRE. In the installed app, you can see this file but not the version that the app uses, which is actually in the packed app archive app.asar, which can’t be modified without breaking the signature securing the code from tampering 
```

## Windows build environment

### Software Requirements
Make sure you have installed these application on your Windows machine:
* Node v10
* Yarn v1.22.10
* JDK 1.8.0_xxx (environment variable that needs to be created is JAVA_HOME=C:\Program Files\Java\jdk1.8.0_xxx. This is usually done automatically.)

Note: JDK version has to match the JRE version that is used in `/build_resources/jre/win-x64` directory.



### Build instructions
1. Copy the content of JRE downloaded from one of these locations (make sure that the version is the same as the JDK installed on your machine):
- https://www.oracle.com/java/technologies/downloads/#jre8-windows
- https://cdn.azul.com/zulu/bin/zulu8.46.0.19-ca-jdk8.0.252-win_x64.zip

2. Extract the content of downloaded JRE to `/build_resources/jre/win-x64` (once that is done you will be able to see `bin` directory inside of that one, amongst the others)
3. Run `yarn dist-win-x64` command in your terminal

Additional notes: If you run into errors, you might need to install Microsoft Visual C++ Redistributable (x64) package and potentially windows-build-tools.

After initial build setup, when building the application installer you only need to run `yarn dist-win-x64` command.

Installation artifacts will be located in `/dist` directory.

## Channels, Build and Auto-update

Version number (defined in `package.json`) determines the release channel. There are 3 release channels:
1. latest (application is stable) - e.g.  `3.0.0` or `3.1.7`
2. beta (application works, but could have some bugs) - e.g. `3.0.0-beta.13` or `3.1.7-beta.4`
3. alpha (application is not stable and in active development) - e.g. `3.0.0-alpha.13` or `3.1.7-alpha.4`

More information: 
https://www.electron.build/tutorials/release-using-channels

### Building the application
When built on Windows, apart from the installer, up to three YML files are created - `latest.yml`, `beta.yml` and `alpha.yml`, depending on the app version. If the stable version is built, all 3 files are created. If `beta` version is built - `beta.yml` and `alpha.yml` are created. Finally, if `alpha` version is built, only `alpha.yml` is created.

Similar case is for MacOS and Linux platforms. 
The files created on MacOS are `latest-mac.yml`, `beta-mac.yml` and `alpha-mac.yml`
The files created on Linux are `latest-linux.yml`, `beta-linux.yml` and `alpha-linux.yml`

Depending on build automation process these files should be manually or automatically uploaded to application download server.

Currently (version 3.0.0), CircleCI uploads automatically these files for MacOS and Linux platforms (when the update is pushed to `master` branch). For windows, these files (along with installers) need to be manually uploaded to https://bitbucket.org/xnatdev/xnat-desktop-client/downloads/

### Code Signing
More info: https://www.electron.build/code-signing
