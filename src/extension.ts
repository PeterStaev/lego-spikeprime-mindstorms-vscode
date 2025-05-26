import * as mpy from "@pybricks/mpy-cross-v6";

import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as shellQuote from "shell-quote";
import { v7 } from "uuid";
import * as vscode from "vscode";

import { BleClient } from "./clients/ble-client";
import { UsbClient } from "./clients/usb-client";
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
} from "./shared-extension";
import { Command } from "./utils";

let mpyWasm: Uint8Array | undefined;
const supportedClients: vscode.QuickPickItem[] = [
    { label: Client.Ble },
    { label: Client.Usb },
];

const enum Client {
    Ble = "Bluetooth",
    Usb = "USB"
}

export function activate(context: vscode.ExtensionContext) {
    // HACK: This is a workaround for https://github.com/pybricks/support/issues/2185
    const wasmFilePath = path.join(__dirname, "mpy-cross-v6.wasm");
    mpyWasm = fs.readFileSync(wasmFilePath);

    initHubStatusBarItems(context);

    registerSharedCommands(context);

    const connectToHubCommand = vscode.commands.registerCommand(Command.ConnectToHub, async () => {
        try {
            const clientSelection = await vscode.window.showQuickPick(supportedClients, { canPickMany: false });
            if (!clientSelection) {
                return;
            }

            switch (clientSelection.label) {
                case Client.Ble:
                    initClient(BleClient);
                    break;

                case Client.Usb:
                    initClient(UsbClient);
                    break;

                default:
                    throw new Error("Unsupported client");

            }

            const selection = await vscode.window.showQuickPick(getClient()!.list(), { canPickMany: false });

            if (!selection) {
                return;
            }

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: "Connecting to Hub...",
                },
                () => getClient()!.connect(selection.description!),
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
    const currentlyOpenTabFileUri = vscode.window.activeTextEditor?.document.uri;
    const currentlyOpenTabFilePath = vscode.window.activeTextEditor?.document.fileName;
    const config = vscode.workspace.getConfiguration();

    if (currentlyOpenTabFilePath && currentlyOpenTabFileUri) {
        const logger = getLogger();
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
        await uploadProgramToHub(
            data,
            slotId,
            !!compileResult?.mpy,
            progress,
        );

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
