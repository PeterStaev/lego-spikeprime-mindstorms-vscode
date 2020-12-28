// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import { Rpc } from "./rpc";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand("lego-spikeprime-mindstorms-vscode.helloWorld", async () => {
		let location = context.globalState.get<string>("lastLocation");
		location = await vscode.window.showInputBox({ prompt: "Enter location (port, etc):", value: location });

		if (location) {
			context.globalState.update("lastLocation", location);

			const rpc = new Rpc(location);
			rpc.sendMessage("get_storage_status");
		}


	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() { }
