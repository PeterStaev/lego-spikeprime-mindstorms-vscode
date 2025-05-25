import * as mpy from "@pybricks/mpy-cross-v6";

import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as shellQuote from "shell-quote";
import { v7 } from "uuid";
import * as vscode from "vscode";

import { BaseClient } from "./clients/base-client";
import { BleClient } from "./clients/ble-client";
import { UsbClient } from "./clients/usb-client";
import { Logger } from "./logger";
import { crc32WithAlignment } from "./utils";

const writeEmitter = new vscode.EventEmitter<string>();
const logger = new Logger(writeEmitter);
let terminal: vscode.Terminal | null;
let hubStatusBarItem: vscode.StatusBarItem;
let currentStartedProgramSlotId: number | undefined;
let currentStartedProgramResolve: (() => void) | undefined;
let mpyWasm: Uint8Array | undefined;
let client: BaseClient | undefined;
const supportedClients: vscode.QuickPickItem[] = [
    { label: Client.Ble },
    { label: Client.Usb },
];

const enum Command {
    ConnectToHub = "lego-spikeprime-mindstorms-vscode.connectToHub",
    DisconnectFromHub = "lego-spikeprime-mindstorms-vscode.disconnectFromHub",
}

const enum Client {
    Ble = "Bluetooth",
    Usb = "USB"
}

export function activate(context: vscode.ExtensionContext) {
    // HACK: This is a workaround for https://github.com/pybricks/support/issues/2185
    const wasmFilePath = path.join(__dirname, "mpy-cross-v6.wasm");
    mpyWasm = fs.readFileSync(wasmFilePath);

    hubStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    hubStatusBarItem.show();
    updateHubStatusBarItem();

    const connectToHubCommand = vscode.commands.registerCommand(Command.ConnectToHub, async () => {
        try {
            const clientSelection = await vscode.window.showQuickPick(supportedClients, { canPickMany: false });
            if (!clientSelection) {
                return;
            }

            switch (clientSelection.label) {
                case Client.Ble:
                    client = new BleClient(logger);
                    break;

                case Client.Usb:
                    client = new UsbClient(logger);
                    break;

                default:
                    throw new Error("Unsupported client");

            }


            client?.onClosed.event(() => {
                void updateHubStatusBarItem();
                currentStartedProgramSlotId = undefined;
                currentStartedProgramResolve = undefined;
                client = undefined;
            });

            client?.onProgramRunningChanged.event((isRunningIn) => {
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

            const selection = await vscode.window.showQuickPick(client!.list(), { canPickMany: false });

            if (!selection) {
                return;
            }

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: "Connecting to Hub...",
                },
                () => client!.connect(selection.description!),
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
        if (!client?.isConnectedIn) {
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Disconnecting from Hub...",
            },
            () => client!.disconnect(),
        );
    });

    const uploadProgramCommand = vscode.commands.registerCommand("lego-spikeprime-mindstorms-vscode.uploadProgram", async () => {
        if (!client?.isConnectedIn) {
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
        if (!client?.isConnectedIn) {
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
                input.step = 2;
                input.totalSteps = 2;
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
    if (client?.isConnectedIn) {
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
        const isSaveFileToUploadIn = config.get<boolean>("legoSpikePrimeMindstorms.saveFileToUpload");
        const customPreprocessorPath = config.get<string>("legoSpikePrimeMindstorms.customPrepocessorPath");
        let assembledFilePath = isSaveFileToUploadIn
            ? path.join(path.dirname(currentlyOpenTabFilePath), `${currentlyOpenTabFileName}.assembled.py`)
            : path.join(os.tmpdir(), `${v7()}.py`);

        fs.writeFileSync(assembledFilePath, assembledFile!, "utf8");

        if (customPreprocessorPath) {
            const preprocessedFilePath = await executeCustomPreprocessor(customPreprocessorPath, assembledFilePath);

            if (preprocessedFilePath !== assembledFilePath) {
                if (!isSaveFileToUploadIn) {
                    // Remove previous temp assembled file
                    try {
                        fs.rmSync(assembledFilePath);
                    }
                    catch {
                        // Ignore error if error occurs while deleting the file
                    }
                }

                assembledFilePath = preprocessedFilePath;
            }
        }

        let compileResult: mpy.CompileResult | undefined;
        if (config.get("legoSpikePrimeMindstorms.compileBeforeUpload")) {
            compileResult = await mpy.compile(path.basename(assembledFilePath),
                fs.readFileSync(assembledFilePath).toString("utf-8"),
                [],
                undefined,
                mpyWasm,
            );

            if (compileResult?.status !== 0) {
                logger?.error(compileResult.err.join("\r\n"));
                logger?.error("\r\n");
                throw new Error("Compilation Failed!");
            }
        }

        const data = compileResult?.mpy ?? fs.readFileSync(assembledFilePath);
        const uploadSize = data.length;

        await client!.startFileUpload(`program.${compileResult?.mpy ? "mpy" : "py"}`, slotId, crc32WithAlignment(data));

        const blockSize: number = client!.maxChunkSize!;
        const increment = (1 / Math.ceil(uploadSize / blockSize)) * 100;
        let runningCrc = 0;

        for (let loop = 0; loop < uploadSize; loop += blockSize) {
            const chunk = data.slice(loop, loop + blockSize);
            runningCrc = crc32WithAlignment(chunk, runningCrc);

            await client!.transferChunk(chunk, runningCrc);

            progress?.report({ increment });
        }

        // Remove temp file if needed
        if (customPreprocessorPath || !isSaveFileToUploadIn) {
            try {
                fs.rmSync(assembledFilePath);
            }
            catch {
                // Ignore error if error occurs while deleting the file
            }
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
    if (client?.isConnectedIn) {
        hubStatusBarItem.text = `$(repl) LEGO Hub: Connected (${client.firmwareVersion} / ${client.rpcVersion})`;
        hubStatusBarItem.command = Command.DisconnectFromHub;
    }
    else {
        hubStatusBarItem.text = "$(debug-disconnect) LEGO Hub: Disconnected";
        hubStatusBarItem.command = Command.ConnectToHub;
    }

    vscode.commands.executeCommand("setContext", "lego-spikeprime-mindstorms-vscode.isConnectedIn", client?.isConnectedIn);
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
    if (!client?.isConnectedIn) {
        vscode.window.showErrorMessage("LEGO Hub not connected! Please connect first!");
        return;
    }

    if (currentStartedProgramSlotId === undefined) {
        vscode.window.showErrorMessage("No program started! Please start a program first!");
        return;
    }

    try {
        const success = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Terminating Running Program...",
            },
            () => client!.startStopProgram(currentStartedProgramSlotId!, true),
        );

        if (!success) {
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
        () => client!.startStopProgram(slotId),
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

/**
 * Executes a custom preprocessor script on a given file and returns the path to the preprocessed output file.
 *
 * This function spawns a child process to run the specified custom preprocessor, passing the input file via stdin
 * and writing the output to a temporary file. If the preprocessor exits with a non-zero code, the promise is rejected.
 * Any errors from the preprocessor's stderr are logged and shown to the user via VS Code notifications.
 *
 * @param customPreprocessorPath - The command line string specifying the path to the custom preprocessor executable, optionally with arguments.
 * @param filePath - The path to the input file to be preprocessed.
 * @returns A promise that resolves with the path to the preprocessed output file, or rejects if the preprocessor fails.
 */
function executeCustomPreprocessor(customPreprocessorPath: string, filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!customPreprocessorPath) {
            resolve(filePath);
            return;
        }

        const preprocessedFilePath = path.join(os.tmpdir(), `${v7()}.py`);
        const [executable, ...args] = shellQuote.parse(customPreprocessorPath);
        const child = cp.spawn(
            executable.toString(),
            args.map((arg) => arg.toString()),
            {
                stdio: [
                    fs.openSync(filePath, "r"), // stdin
                    fs.openSync(preprocessedFilePath, "w"),   // stdout
                    "pipe",   // stderr
                ],
            },
        );

        child.stderr?.on("data", (data) => {
            console.error(`Custom preprocessor error: ${data}`);
            vscode.window.showErrorMessage(`Custom preprocessor error: ${data}`);
        });
        child.on("close", (code) => {
            if (code !== 0) {
                console.error(`Custom preprocessor exited with code ${code}`);
                vscode.window.showErrorMessage(`Custom preprocessor exited with code ${code}`);
                reject(new Error(`Custom preprocessor exited with code ${code}`));
            }
            else {
                resolve(preprocessedFilePath);
            }
        });
    });
}
