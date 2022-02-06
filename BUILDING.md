# Compiling the plugin locally

There are couple of caveats related to the native node bindings before you can compile and run the plugin locally in your VSCode developer instance.

After you have pulled the source code from git, you need to first install the node module dependencies. So open the source code folder and issue the following command in your environment shell:

```shell
$ npm install
```

Next you need to compile the native bindings for your platform. In order to do so, in the source folder issue the following shell command:
```shell
$ npm run build.binding
```

> NOTE: Compiling requires different native dependencies/libraries to be installed for different platforms. Please follow the shell errors you might get and install anything that you might be missing. 

Once you complete all the steps you can open the folder in VSCode and run it by pressing F5. This should launch a new instance of VSCode developer instance with the plugin loaded.

> NOTE: In case the bindings have not been built correctly you will get errors that the plugin cannot be loaded. 