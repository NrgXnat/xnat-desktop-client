### XNAT Desktop Client
For dev, run `npm install && npm start`

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
