// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as serialport from "serialport";

import { Rpc } from "./rpc";

let rpc: Rpc;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let connectToHubCommand = vscode.commands.registerCommand("lego-spikeprime-mindstorms-vscode.connectToHub", async () => {
		const ports = await serialport.list();
		let location = context.globalState.get<string>("lastLocation");
		const quickPickList = ports.map((item) => ({ label: item.path, picked: item.path === location }));
		const selection = await vscode.window.showQuickPick(quickPickList, { canPickMany: false });

		if (selection) {
			location = selection.label;
			context.globalState.update("lastLocation", location);

			rpc = new Rpc(location);
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: "Connecting to Hub...",
				},
				() => rpc.open(),
			);
		}
	});

	let disconnectFromHubCommand = vscode.commands.registerCommand("lego-spikeprime-mindstorms-vscode.disconnectFromHub", async () => {
		if (rpc) {
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: "Disconnecting from Hub...",
				},
				() => rpc.close(),
			);
		}
	});

	let getStorageStatusCommand = vscode.commands.registerCommand("lego-spikeprime-mindstorms-vscode.getStorageStatus", async () => {
		if (rpc) {
			try {
				const result = await rpc.sendMessage("get_storage_status");

				console.log(result);
			}
			catch (e) {
				vscode.window.showErrorMessage(e);
			}
		}
	});


	context.subscriptions.push(connectToHubCommand);
	context.subscriptions.push(disconnectFromHubCommand);
	context.subscriptions.push(getStorageStatusCommand);
}

// this method is called when your extension is deactivated
export function deactivate() { }
