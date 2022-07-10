/* eslint-disable no-undef */
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log("Congratulations, your extension \"helloworld-web-sample\" is now active in the web extension host!");

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    const disposable = vscode.commands.registerCommand("lego-spikeprime-mindstorms-vscode.connectToHub", async () => {
        // The code you place here will be executed every time your command is executed
        await vscode.commands.executeCommand("workbench.experimental.requestSerialPort");
        const test = await navigator.serial.getPorts();
        const port = test[0];
        await port.open({ baudRate: 115200 });
        const info = await port.getInfo();
        while (port.readable) {
            const reader = port.readable.getReader();
            try {
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        break;
                    }
                    console.log(value);
                }
            }
            finally {
                reader.releaseLock();
            }
        }
        console.log(test);
        // Display a message box to the user
        vscode.window.showInformationMessage("Hello World from helloworld-web-sample in a web extension host!");
    });

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() { }