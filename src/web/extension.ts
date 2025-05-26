
import * as mpy from "@pybricks/mpy-cross-v6";

import * as vscode from "vscode";

import {
    getClient,
    getLogger,
    getProgramInfo,
    initClient,
    initHubStatusBarItems,
    onDeactivate,
    onHubConnected,
    registerSharedCommands,
    startProgramInSlot,
    uploadProgramToHub,
} from "../shared-extension";
import { Command } from "../utils";
import { WebUsbClient } from "./clients/web-usb-client";

let wasmUri: vscode.Uri;

export async function activate(context: vscode.ExtensionContext) {
    wasmUri = vscode.Uri.joinPath(context.extensionUri, "dist/mpy-cross-v6.wasm");

    initHubStatusBarItems(context);

    registerSharedCommands(context);

    const connectToHubCommand = vscode.commands.registerCommand(Command.ConnectToHub, async () => {
        try {
            initClient(WebUsbClient);

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: "Connecting to Hub...",
                },
                () => getClient()!.connect(""),
            );

            await onHubConnected();
        }
        catch (e) {
            console.error(e);
            vscode.window.showErrorMessage("Connecting to Hub Failed!" + (e instanceof Error ? ` ${e.message}` : ""));
        }
    });

    const uploadProgramCommand = vscode.commands.registerCommand(Command.UploadProgram, async () => {
        if (!getClient()?.isConnectedIn) {
            vscode.window.showErrorMessage("LEGO Hub not connected! Please connect first!");
            return;
        }

        try {
            const programInfo = await getProgramInfo();
            if (!programInfo) {
                return;
            }


            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Uploading Program to Hub (Slot #${programInfo.slotId})...`,
                },
                (progress) => performUploadProgram(programInfo.slotId, progress),
            );

            vscode.window.showInformationMessage("Program uploaded!");

            if (programInfo.isAutostartIn) {
                setTimeout(() => {
                    void startProgramInSlot(programInfo.slotId);
                }, 250);
            }
        }
        catch (e) {
            console.error(e);
            vscode.window.showErrorMessage("Program Upload Failed!" + (e instanceof Error ? ` ${e.message}` : ""));
        }
    });
    context.subscriptions.push(
        connectToHubCommand,
        uploadProgramCommand,
    );
}

// this method is called when your extension is deactivated
export async function deactivate() {
    await onDeactivate();
}

async function performUploadProgram(slotId: number, progress?: vscode.Progress<{ increment: number }>) {
    const editor = vscode.window.activeTextEditor;
    const config = vscode.workspace.getConfiguration();
    const logger = getLogger();

    if (!editor) {
        vscode.window.showInformationMessage("Please open a file");
        return;
    }

    const document = editor.document;
    const documentContent = document.getText();

    let compileResult: mpy.CompileResult | undefined;
    if (config.get("legoSpikePrimeMindstorms.compileBeforeUpload")) {
        compileResult = await mpy.compile(
            document.fileName,
            documentContent,
            [],
            wasmUri.toString(),
        );

        if (compileResult?.status !== 0) {
            logger?.error(compileResult.err.join("\r\n"));
            logger?.error("\r\n");
            throw new Error("Compilation Failed!");
        }
    }

    const data = compileResult?.mpy ?? new TextEncoder().encode(documentContent);
    await uploadProgramToHub(
        data,
        slotId,
        !!compileResult?.mpy,
        progress,
    );
}