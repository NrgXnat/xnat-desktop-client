# XNAT Desktop Client

For dev, run `yarn install && yarn dev`

For publish, run `yarn dist-$target`, where `$target` is `win-x64`, `mac`, or `linux-x64`. There are 32-bit builds available but we don't currently provide
these because the 32-bit restrictions on sizes of data objects could cause issues with large upload and download sessions.

> Note:

> It ends up being fairly pointless (turns out it always tries to use an external JDK, esp the one installed on the build machine; long story), so I'd guess
> you can probably put anything you want in there as long as they’re in the appropriate folders:
>
> * `build_resources/jre/linux-x64`
> * `build_resources/jre/mac`
> * `build_resources/jre/win-x64`
>
> Use the Zulu 8 build pinned as `JAVA_VERSION` in [.github/workflows/build.yml](.github/workflows/build.yml), the one CI bundles. Builds before
> 8.98.0.107 trust the compromised eMudhra intermediate CAs. Download `https://cdn.azul.com/zulu/bin/<JAVA_VERSION>-<suffix>`, where _suffix_ is
> `linux_x64.tar.gz`, `macosx_x64.tar.gz`, `macosx_aarch64.tar.gz` or `win_x64.zip`, and check it against the matching `JRE_SHA256_*` value pinned
> next to `JAVA_VERSION`.


> Anyway, the big issue there is that the java package uses a couple of packages, find-java-home, bindings, and node-gyp to build bindings to native code libraries.
> Along the way it builds a file named jvm_dll_path.json that hard-codes the location of the JRE. In the installed app, you can see this file but not the version 
> that the app uses, which is actually in the packed app archive app.asar, which can’t be modified without breaking the signature securing the code from tampering .

## Build environment

### Software Requirements

Make sure you have installed the applications on your build machine:

* Node v14._x_
* Yarn v1.22._x_
* JDK 1.8.0._xxx_

For Node and Yarn, you just need to make sure that the appropriate version is available on your path:

```bash
# node --version
v14.20.0

# yarn --version
1.22.19
```

You can get the latest Node.js v14._x_ release from the [Node.js releases page](https://nodejs.org/en/download/releases). As indicated above, the latest release in this
release line is [v14.20.0](https://nodejs.org/download/release/v14.20.0).

There are [multiple ways to install Yarn](https://classic.yarnpkg.com/lang/en/docs/install).

For Java, you need to ensure that `JAVA_HOME` points to the JDK that's on your path:

```bash
# echo ${JAVA_HOME}
/Library/Java/JavaVirtualMachines/zulu-8.jdk/Contents/Home

# java -version
openjdk version "1.8.0_322"
OpenJDK Runtime Environment (Zulu 8.60.0.21-CA-macosx) (build 1.8.0_322-b06)
OpenJDK 64-Bit Server VM (Zulu 8.60.0.21-CA-macosx) (build 25.322-b06, mixed mode)
```

You can set `JAVA_HOME` in Windows PowerShell with the following command:

```bash
[Environment]::SetEnvironmentVariable("JAVA_HOME", "<path>", "Process")
```

On Linux and OS X you need to make sure you export the variable value:

```bash
export JAVA_HOME=/usr/lib/jvm/zulu8-ca-amd64
```

> Note: The JDK version used for building _must_ match the JRE version used in `build_resources/jre/`_platform_ directory.

```bash
# build_resources/jre/mac/bin/java -version
openjdk version "1.8.0_322"
OpenJDK Runtime Environment (Zulu 8.60.0.21-CA-macosx) (build 1.8.0_322-b06)
OpenJDK 64-Bit Server VM (Zulu 8.60.0.21-CA-macosx) (build 25.322-b06, mixed mode)

# /Library/Java/JavaVirtualMachines/zulu-8.jdk/Contents/Home/bin/java -version
openjdk version "1.8.0_322"
OpenJDK Runtime Environment (Zulu 8.60.0.21-CA-macosx) (build 1.8.0_322-b06)
OpenJDK 64-Bit Server VM (Zulu 8.60.0.21-CA-macosx) (build 25.322-b06, mixed mode)
```

### Build instructions

#### Copy JRE to build resources

Copy the content of downloaded JRE to `build_resources/jre/`_platform_, where _platform_ is one of:

* `linux-x64`
* `mac`
* `win-x64`

For Mac, copy or move the JRE folder `zulu8.`_version_`-ca-jre8.0.`_xxx_`-macosx_x64/zulu-8.jre/Contents/Home` to `build_resources/jre/mac` (if you downloaded
the JDK instead of the JRE, the source directory is `zulu8.`_version_`-ca-jdk8.0.`_xxx_`-macosx_x64/zulu-8.jdk/Contents/Home/jre`).

For the other platforms, it’s more straightforward: just copy the contents of the top-level folder to the appropriate folder under `build_resources/jre` (if you
downloaded the JDK instead of the JRE, copy the contents of the `jre` folder under the top-level folder).

This should look something like:

```
PS C:\Users\username\xnat-desktop-client> ls .\build_resources\jre\win-x64\

    Directory: C:\Users\username\xnat-desktop-client\build_resources\jre\win-x64

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
d----           3/15/2022 11:18 AM                bin
d----           3/15/2022 11:18 AM                lib
-a---           3/15/2022 11:18 AM           1522 ASSEMBLY_EXCEPTION
-a---           3/15/2022 11:18 AM          19274 LICENSE
-a---           3/15/2022 11:18 AM         158075 THIRD_PARTY_README
```

#### Download dependencies

To download and install the application's dependencies, run:

```bash
yarn install
```

#### Configuring signing certificates

If you're building a release version of the application, you need to set a number of environment variables for signing the application. On Mac,
you also need to set credentials for notarizing the application.

The primary environment variables for signing are:

* `CSC_LINK` sets the signing certificate itself. This can be a URL from which the certificate can be retrieved, a path to the file on the local
drive, or the contents of the certificate as a base64-encoded string.
* `WIN_CSC_LINK` sets the signing certificate for Windows builds _only_. You can just use `CSC_LINK` if you're only building for Windows, but in
cases where the environment context is shared across multiple build environments (like on CircleCI for example), `WIN_CSC_LINK` lets you specify
the signing certificates for both platforms in a single context.
* `CSC_KEY_PASSWORD` indicates the password for the signing certificate specified in `CSC_LINK`.
* `WIN_CSC_KEY_PASSWORD` indicates the password for the signing certificate specified in `WIN_CSC_LINK`.

When building for Mac, you also need to specify Apple developer credentials for notarizing the application:

* `APPLEID` is the Apple developer account that generated the Apple signing certificate.
* `APPLEIDPASS` is an app-specific password for the Apple developer account. Note that this is _not_ the primary password for the account, but an
[app-specific password](https://support.apple.com/en-us/HT204397), which must be generated for this purpose.

These environment variables _must_ be exported when set on OS X or Linux:

```bash
export CSC_LINK="$(base64 --input=apple-cert.p12)"
export CSC_KEY_PASSWORD="foobar314"
export APPLEID="appledev@foobar.com"
export APPLEIDPASS="test-flan-flop-feel"
```

On Windows, you can set variables in PowerShell like so:

```bash
[Environment]::SetEnvironmentVariable("WIN_CSC_KEY_PASSWORD", "<password>", "Process")
[Environment]::SetEnvironmentVariable("WIN_CSC_LINK", "certificate.p12", "Process")
```

#### Building distributable application

To build a distributable application, run one of the following commands in your terminal:

```bash
yarn dist-linux-x64
yarn dist-mac
yarn dist-win-x64
```

Build artifacts can be found in the `dist` directory:

```bash
PS C:\Users\username\xnat-desktop-client> ls dist

    Directory: C:\Users\username\xnat-desktop-client\dist

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
d----           3/16/2022 11:02 AM                .cache
d----           7/13/2022  6:08 PM                win-unpacked
-a---           7/13/2022  6:10 PM            390 alpha.yml
-a---           7/13/2022  6:07 PM           1661 builder-effective-config.yaml
-a---           7/13/2022  6:10 PM       99574648 XNAT-Desktop-Client-Setup-3.1.0-alpha.2.exe
-a---           7/13/2022  6:10 PM         104602 XNAT-Desktop-Client-Setup-3.1.0-alpha.2.exe.blockmap
```

#### Troubleshooting

##### General

Occasionally you may get errors indicating that some resources in the build can't be timestamped. Timestamping is part of the overall
application signing process. Sometimes the default timestamp server(s) become overloaded and throttle incoming requests. When a particular
caller (e.g. you) requests too many timestamp operations within too short a time, the server may start rejecting those requests. To work
around this, you can configure alternative timestamp servers with options in `package.json`:

```
"build": {
  ...
  "win": {
    ...
    "rfc3161TimeStampServer": "http://time.certum.pl",
    "timeStampServer": "http://time.certum.pl",
  },
  ...
},
```

The server specified here is one example of an alternate server, but may not be available either, in which case you can try [one of the
servers listed here](https://gist.github.com/Manouchehri/fd754e402d98430243455713efada710), although some of these are already deprecated
or out of service.

##### Windows

If you run into errors, you might need to install Microsoft Visual C++ Redistributable (x64) package and potentially windows-build-tools.

After initial build setup, when building the application installer you only need to run `yarn dist-win-x64` command.

##### Mac

If you run `yarn install` on Mac and get a message that the build can't find something like `jni_md.h`, there are two possible fixes:

Edit the file `Info.plist` in the `Contents` folder of the JDK. This contains a section with the key `JVMCapabilities` and an array
of strings. If there's not a `<string>` entry for `JNI`, add that and save the file. The full section should look something like this:

```
<key>JavaVM</key>
<dict>
  <key>JVMCapabilities</key>
  <array>
    <string>CommandLine</string>
    <string>JNI</string>
  </array>
  ...
</dict>
```    

If this doesn't fix the problem, you can also try copying or linking the platform-specific copy of `jni_md.h` (usually located in the folder
`Contents/Home/include/darwin/jni_md.h` under your JDK installation) to the top-level `include` folder:

```bash
ln -s /Library/Java/JavaVirtualMachines/zulu-8.jdk/Contents/Home/include/darwin/jni_md.h \
      /Library/Java/JavaVirtualMachines/zulu-8.jdk/Contents/Home/include/jni_md.h
```

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

