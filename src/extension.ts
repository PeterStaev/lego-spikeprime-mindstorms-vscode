import * as mpy from "@pybricks/mpy-cross-v6";

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { SerialPort } from "serialport";
import * as vscode from "vscode";

import { BleClient } from "./clients/ble-client";
import { Logger } from "./logger";
import { Rpc } from "./rpc";
import { crc32WithAlignment } from "./utils";

let rpc: Rpc;

const writeEmitter = new vscode.EventEmitter<string>();
const logger = new Logger(writeEmitter);
let terminal: vscode.Terminal | null;
let hubStatusBarItem: vscode.StatusBarItem;
let currentStartedProgramSlotId: number | undefined;
let currentStartedProgramResolve: (() => void) | undefined;

const enum Command {
    ConnectToHub = "lego-spikeprime-mindstorms-vscode.connectToHub",
    DisconnectFromHub = "lego-spikeprime-mindstorms-vscode.disconnectFromHub",
}

const client = new BleClient(logger);

export function activate(context: vscode.ExtensionContext) {
    hubStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    hubStatusBarItem.show();
    updateHubStatusBarItem();

    client.onClosed.event(() => {
        void updateHubStatusBarItem();
        currentStartedProgramSlotId = undefined;
        currentStartedProgramResolve = undefined;
    });

    client.onProgramRunningChanged.event((isRunningIn) => {
        if (isRunningIn && currentStartedProgramSlotId !== undefined) {
            void vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Running Program #${currentStartedProgramSlotId}...`,
                    cancellable: true,
                },
                (progress, token) => new Promise<void>((resolve, reject) => {
                    currentStartedProgramResolve = resolve;
                    token.onCancellationRequested(() => {
                        void terminateCurrentProgram();
                        resolve();
                    });
                }),
            );
        }

        if (!isRunningIn && currentStartedProgramResolve) {
            currentStartedProgramResolve();
            currentStartedProgramResolve = undefined;
        }
    });

    const connectToHubCommand = vscode.commands.registerCommand(Command.ConnectToHub, async () => {
        try {
            const selection = await vscode.window.showQuickPick(client.list(), { canPickMany: false });

            if (!selection) {
                return;
            }

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: "Connecting to Hub...",
                },
                () => client.connect(selection.description!),
            );

            await updateHubStatusBarItem();
            showTerminal();
        }
        catch (e) {
            console.error(e);
            vscode.window.showErrorMessage("Connecting to Hub Failed!" + (e instanceof Error ? ` ${e.message}` : ""));
        }
    });

    const disconnectFromHubCommand = vscode.commands.registerCommand(Command.DisconnectFromHub, async () => {
        if (!client.isConnectedIn) {
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Disconnecting from Hub...",
            },
            () => client.disconnect(),
        );
    });

    const uploadProgramCommand = vscode.commands.registerCommand("lego-spikeprime-mindstorms-vscode.uploadProgram", async () => {
        if (!client.isConnectedIn) {
            vscode.window.showErrorMessage("LEGO Hub not connected! Please connect first!");
            return;
        }

        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            vscode.window.showErrorMessage("Please open a file");
            return;
        }

        try {
            await vscode.commands.executeCommand("workbench.action.files.save");

            const header = editor?.document.lineAt(0).text;
            let slotId: number = NaN;
            let isAutostartIn: boolean = false;

            // Header sample:
            // # LEGO slot:3
            if (header?.startsWith("# LEGO")) {
                const split = header.split(/[:\s]/gi);
                for (let loop = 0; loop < split.length; loop++) {
                    const element = split[loop];

                    if (element === "slot") {
                        slotId = +split[loop + 1];
                    }

                    if (element === "autostart") {
                        isAutostartIn = true;
                    }
                }
            }

            // Prompt for slot
            if (isNaN(slotId)
                || slotId < 0
                || slotId > 19) {
                slotId = await promptForSlot();
                if (isNaN(slotId)) {
                    return;
                }
            }

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Uploading Program to Hub (Slot #${slotId})...`,
                },
                (progress) => performUploadProgram(+slotId, progress),
            );

            vscode.window.showInformationMessage("Program uploaded!");

            if (isAutostartIn) {
                setTimeout(() => {
                    void startProgramInSlot(slotId);
                }, 250);
            }
        }
        catch (e) {
            console.error(e);
            vscode.window.showErrorMessage("Program Upload Failed!" + (e instanceof Error ? ` ${e.message}` : ""));
        }
    });

    const startProgramCommand = vscode.commands.registerCommand("lego-spikeprime-mindstorms-vscode.startProgram", async () => {
        if (!client.isConnectedIn) {
            vscode.window.showErrorMessage("LEGO Hub not connected! Please connect first!");
            return;
        }

        try {
            const slotId = await promptForSlot();

            await startProgramInSlot(slotId);
        }
        catch (e) {
            console.error(e);
            vscode.window.showErrorMessage("Starting Program Failed!" + (e instanceof Error ? ` ${e.message}` : ""));
        }
    });

    const terminateProgramCommand = vscode.commands.registerCommand("lego-spikeprime-mindstorms-vscode.terminateProgram", terminateCurrentProgram);

    const showTerminalCommand = vscode.commands.registerCommand("lego-spikeprime-mindstorms-vscode.showTerminal", showTerminal);

    const addFileHeaderCommand = vscode.commands.registerCommand("lego-spikeprime-mindstorms-vscode.addFileHeader", async () => {
        try {
            const editor = vscode.window.activeTextEditor;

            if (!editor) {
                vscode.window.showErrorMessage("Please open a file");
                return;
            }

            // Prompt for slot
            const slotId = await promptForSlot(1, 2);
            if (isNaN(slotId)) {
                return;
            }

            // Prompt for auto start
            const isAutostart = await new Promise<boolean | undefined>(resolve => {
                const input = vscode.window.createQuickPick();

                input.title = "Autostart";
                input.step = 3;
                input.totalSteps = 3;
                input.placeholder = "Should the program start automatically when uploaded?";
                input.items = [
                    { label: "yes" },
                    { label: "no" },
                ];

                input.onDidAccept(() => {
                    const selectedItem = input.selectedItems[0];
                    resolve(selectedItem.label === "yes");
                    input.hide();
                });
                input.onDidHide(() => {
                    input.dispose();
                    resolve(undefined);
                });

                input.show();
            });

            if (isAutostart === undefined) {
                return;
            }

            editor.edit((editBuilder) => {
                editBuilder.insert(
                    new vscode.Position(0, 0),
                    `# LEGO slot:${slotId}${(isAutostart ? " autostart" : "")}\n\n`,
                );
            });
        }
        catch (e) {
            console.error(e);
            vscode.window.showErrorMessage("Adding File Header Failed!" + (e instanceof Error ? ` ${e.message}` : ""));
        }
    });

    context.subscriptions.push(
        connectToHubCommand,
        disconnectFromHubCommand,
        uploadProgramCommand,
        startProgramCommand,
        terminateProgramCommand,
        showTerminalCommand,
        addFileHeaderCommand,

        hubStatusBarItem,
    );
}

// this method is called when your extension is deactivated
export async function deactivate() {
    if (client.isConnectedIn) {
        await client.disconnect();
    }
}

async function performUploadProgram(slotId: number, progress?: vscode.Progress<{ increment: number }>) {
    const currentlyOpenTabFileUri = vscode.window.activeTextEditor?.document.uri;
    const currentlyOpenTabFilePath = vscode.window.activeTextEditor?.document.fileName;
    const config = vscode.workspace.getConfiguration();

    if (currentlyOpenTabFilePath && currentlyOpenTabFileUri) {
        const currentlyOpenTabFileName = path.basename(currentlyOpenTabFilePath).replace(path.extname(currentlyOpenTabFilePath), "");
        const assembledFile = assembleFile(currentlyOpenTabFileUri.fsPath);

        let assembledFilePath;
        if (config.get("legoSpikePrimeMindstorms.saveFileToUpload")) {
            assembledFilePath = path.join(path.dirname(currentlyOpenTabFilePath), currentlyOpenTabFileName + ".assembled.py");
        }
        else {
            assembledFilePath = path.join(os.tmpdir(), currentlyOpenTabFileName + ".assembled.py");
        }

        fs.writeFileSync(assembledFilePath, assembledFile, "utf8");

        let compileResult: mpy.CompileResult | undefined;

        if (config.get("legoSpikePrimeMindstorms.compileBeforeUpload")) {
            // TODO: This doesn't seem to work as it fails to load the WASM module for some reason.
            compileResult = await mpy.compile(path.basename(assembledFilePath),
                fs.readFileSync(assembledFilePath).toString("utf-8"),
                ["-municode"],
                "node_modules/@pybricks/mpy-cross-v6/build/mpy-cross-v6.wasm"
            );

            if (compileResult?.status !== 0) {
                logger?.error(compileResult.err.join("\r\n"));
                logger?.error("\r\n");
                throw new Error("Compilation Failed!");
            }
        }

        const data = compileResult?.mpy ?? fs.readFileSync(assembledFilePath);
        const uploadSize = data.length;

        await client.startFileUpload("program.py", slotId, crc32WithAlignment(data));

        const blockSize: number = client.maxChunkSize!;
        const increment = (1 / Math.ceil(uploadSize / blockSize)) * 100;
        let runningCrc = 0;

        for (let loop = 0; loop < uploadSize; loop += blockSize) {
            const chunk = data.slice(loop, loop + blockSize);
            runningCrc = crc32WithAlignment(chunk, runningCrc);

            await client.transferChunk(chunk, runningCrc);

            progress?.report({ increment });
        }
    }
}

function showTerminal() {
    if (!terminal) {
        terminal = vscode.window.createTerminal({
            name: "LEGO Hub Terminal",
            pty: {
                onDidWrite: writeEmitter.event,
                open: () => {
                    logger.info("Welcome to the LEGO Hub Log Terminal!\r\n");
                },
                close: () => { terminal = null; },
                handleInput: (char: string) => {
                    return;
                },
            },
        });
    }

    terminal.show();
}

async function updateHubStatusBarItem() {
    if (client.isConnectedIn) {
        hubStatusBarItem.text = `$(repl) LEGO Hub: Connected (${client.firmwareVersion} / ${client.rpcVersion})`;
        hubStatusBarItem.command = Command.DisconnectFromHub;
    }
    else {
        hubStatusBarItem.text = "$(debug-disconnect) LEGO Hub: Disconnected";
        hubStatusBarItem.command = Command.ConnectToHub;
    }

    vscode.commands.executeCommand("setContext", "lego-spikeprime-mindstorms-vscode.isConnectedIn", !!rpc?.isOpenIn);
}

async function promptForSlot(currentStep?: number, totalSteps?: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        const quickPickSlots: vscode.QuickPickItem[] = [];
        for (let index = 0; index < 20; index++) {
            quickPickSlots.push({
                label: index.toString(),
            });
        }

        const input = vscode.window.createQuickPick();

        input.title = "Program Slot";
        input.step = currentStep;
        input.totalSteps = totalSteps;
        input.placeholder = "Choose program slot";
        input.items = quickPickSlots;

        input.onDidAccept(() => {
            const selectedItem = input.selectedItems[0];
            resolve(+selectedItem.label);
            input.hide();
        });
        input.onDidHide(() => {
            input.dispose();
            resolve(NaN);
        });

        input.show();
    });
}

async function terminateCurrentProgram() {
    if (!client.isConnectedIn) {
        vscode.window.showErrorMessage("LEGO Hub not connected! Please connect first!");
        return;
    }

    if (currentStartedProgramSlotId === undefined) {
        vscode.window.showErrorMessage("No program started! Please start a program first!");
        return;
    }

    try {
        const succeess = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Terminating Running Program...",
            },
            () => client.startStopProgram(currentStartedProgramSlotId!, true),
        );

        if (!succeess) {
            vscode.window.showErrorMessage("Terminating program not acknowledged from hub!");
            return;
        }

        currentStartedProgramSlotId = undefined;
    }
    catch (e) {
        console.error(e);
        vscode.window.showErrorMessage("Terminating Program Failed!" + (e instanceof Error ? ` ${e.message}` : ""));
    }
}

async function startProgramInSlot(slotId: number) {
    if (isNaN(slotId)) {
        return;
    }

    const success = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Starting Program in Slot #${slotId}...`,
        },
        () => client.startStopProgram(slotId),
    );

    if (!success) {
        vscode.window.showErrorMessage("Starting program not acknowledged from hub!");
        return;
    }

    currentStartedProgramSlotId = slotId;
}

/**
 * The provided file should be assembled by replacing the import statements with the content of the imported local python file.
 *
 * @param filePath The path to the file to be assembled.
 * @returns Uint8Array containing the assembled file content.
 */
function assembleFile(filePath: string): Uint8Array | undefined {
    try {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const assembledLines: string[] = fileContent.split("\n");
        const includedFiles: string[] = [];

        const pattern = /^from\s+([\w\d_]+)\s+import\s+\*/;

        let startLine = 0;

        for (let index = startLine; index < assembledLines.length; index++) {
            const line = assembledLines[index];

            const match = line.match(pattern);

            if (!match?.[1])
                continue;

            let includePath = match[1] + ".py";
            includePath = path.resolve(path.dirname(filePath), includePath);
            if (!fs.existsSync(includePath)) {
                vscode.window.showWarningMessage("File: " + includePath + " not found");
                continue;
            }
            assembledLines.splice(index, 1);
            if ((includedFiles.some(includedFile => includedFile === includePath)))
                continue;
            try {
                startLine = index;

                includedFiles.push(includePath);
                const includedContent = fs.readFileSync(includePath, "utf-8");
                const includedContentSplitted = includedContent.split("\n");
                assembledLines.splice(index, 0, ...includedContentSplitted);
                index--;
            }
            catch (includeError) {
                vscode.window.showErrorMessage("Error reading included file:" + includeError);
            }
        }

        const extendedContent = assembledLines.join("\n");
        const extendedBuffer = Buffer.from(extendedContent, "utf-8");

        return new Uint8Array(extendedBuffer);
    }
    catch (error) {
        console.error("Error extending file:", error);
        vscode.window.showErrorMessage("Error extending file: " + error);
        return undefined;
    }
}

