// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as mpy from "@pybricks/mpy-cross-v5";

import * as fs from "fs";
import * as path from "path";
import * as serialport from "serialport";
import { Readable } from "stream";
import * as vscode from "vscode";

import { Logger } from "./logger";
import { Rpc } from "./rpc";
import { getRandomString } from "./utils";

declare type TypeQuickPickItem = vscode.QuickPickItem & { systemType: "python" | "scratch", type: "standard" | "advanced" };

let rpc: Rpc;

const writeEmitter = new vscode.EventEmitter<string>();
const logger = new Logger(writeEmitter);
let terminal: vscode.Terminal | null;
let hubStatusBarItem: vscode.StatusBarItem;
const programTypes: TypeQuickPickItem[] = [
    {
        label: "Python (standard)",
        detail: "Works similar to python programs in the Mindstorms app. ",
        type: "standard",
        systemType: "python",
    },
    {
        label: "Python (advanced)",
        detail: "Allows for more advanced features like event notifications and async code execution.",
        type: "advanced",
        systemType: "scratch",
    },
];

const enum Command {
    ConnectToHub = "lego-spikeprime-mindstorms-vscode.connectToHub",
    DisconnectFromHub = "lego-spikeprime-mindstorms-vscode.disconnectFromHub",
}

export function activate(context: vscode.ExtensionContext) {
    hubStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    hubStatusBarItem.show();
    updateHubStatusBarItem();

    const connectToHubCommand = vscode.commands.registerCommand(Command.ConnectToHub, async () => {
        try {
            const ports = await serialport.list();
            let location = context.globalState.get<string>("lastLocation");
            const quickPickList = ports.filter((item) => item.path !== location).map((item) => ({ label: item.path }));
            if (location) {
                quickPickList.splice(0, 0, { label: location });
            }
            const selection = await vscode.window.showQuickPick(quickPickList, { canPickMany: false });

            if (selection) {
                location = selection.label;
                context.globalState.update("lastLocation", location);

                rpc = new Rpc(location, logger);
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: "Connecting to Hub...",
                    },
                    () => rpc.open(),
                );

                await updateHubStatusBarItem();
                showTerminal();
            }
        }
        catch (e) {
            console.error(e);
            vscode.window.showErrorMessage("Connecting to Hub Failed!" + (e instanceof Error ? ` ${e.message}` : ""));
        }
    });

    const disconnectFromHubCommand = vscode.commands.registerCommand(Command.DisconnectFromHub, async () => {
        if (!rpc?.isOpenIn) {
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Disconnecting from Hub...",
            },
            () => rpc.close(),
        );

        await updateHubStatusBarItem();
    });

    const uploadProgramCommand = vscode.commands.registerCommand("lego-spikeprime-mindstorms-vscode.uploadProgram", async () => {
        if (!rpc?.isOpenIn) {
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
            let typeSelection: TypeQuickPickItem | undefined;
            let isAutostartIn: boolean = false;

            // Header sample:
            // # LEGO type:advanced slot:3
            if (header?.startsWith("# LEGO")) {
                const split = header.split(/[:\s]/gi);
                for (let loop = 0; loop < split.length; loop++) {
                    const element = split[loop];

                    if (element === "type") {
                        typeSelection = programTypes.find((item) => item.type === split[loop + 1]);
                    }

                    if (element === "slot") {
                        slotId = +split[loop + 1];
                    }

                    if (element === "autostart") {
                        isAutostartIn = true;
                    }
                }
            }

            // Prompt for type
            if (!typeSelection) {
                typeSelection = await promptForProgramType();
                if (!typeSelection) {
                    return;
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
                (progress) => performUploadProgram(+slotId, typeSelection!.systemType, progress),
            );

            vscode.window.showInformationMessage("Program uploaded!");

            if (isAutostartIn) {
                void rpc.sendMessage("program_execute", { slotid: slotId });
            }
        }
        catch (e) {
            console.error(e);
            vscode.window.showErrorMessage("Program Upload Failed!" + (e instanceof Error ? ` ${e.message}` : ""));
        }
    });

    const startProgramCommand = vscode.commands.registerCommand("lego-spikeprime-mindstorms-vscode.startProgram", async () => {
        if (!rpc?.isOpenIn) {
            vscode.window.showErrorMessage("LEGO Hub not connected! Please connect first!");
            return;
        }

        try {
            const storageStatus = await rpc.sendMessage("get_storage_status");
            const slots = storageStatus.slots;
            const quickPickSlots: vscode.QuickPickItem[] = [];
            for (let index = 0; index < 20; index++) {
                quickPickSlots.push({
                    label: index.toString(),
                    description: slots[index] ? Buffer.from(slots[index].name, "base64").toString("utf-8") : "",
                });
            }

            const slotSelection = await vscode.window.showQuickPick(quickPickSlots);

            if (!slotSelection) {
                return;
            }

            const slotId = +slotSelection.label;
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Starting Program in Slot #${slotId}...`,
                },
                () => rpc.sendMessage("program_execute", { slotid: slotId }),
            );
        }
        catch (e) {
            console.error(e);
            vscode.window.showErrorMessage("Starting Program Failed!" + (e instanceof Error ? ` ${e.message}` : ""));
        }
    });

    const terminateProgramCommand = vscode.commands.registerCommand("lego-spikeprime-mindstorms-vscode.terminateProgram", async () => {
        if (!rpc?.isOpenIn) {
            vscode.window.showErrorMessage("LEGO Hub not connected! Please connect first!");
            return;
        }

        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: "Terminating Running Program...",
                },
                () => rpc.sendMessage("program_terminate"),
            );
        }
        catch (e) {
            console.error(e);
            vscode.window.showErrorMessage("Terminating Program Failed!" + (e instanceof Error ? ` ${e.message}` : ""));
        }
    });

    const showTerminalCommand = vscode.commands.registerCommand("lego-spikeprime-mindstorms-vscode.showTerminal", showTerminal);

    const addFileHeaderCommand = vscode.commands.registerCommand("lego-spikeprime-mindstorms-vscode.addFileHeader", async () => {
        try {
            const editor = vscode.window.activeTextEditor;

            if (!editor) {
                vscode.window.showErrorMessage("Please open a file");
                return;
            }

            // Prompt for type
            const typeSelection = await promptForProgramType(1, 3);
            if (!typeSelection) {
                return;
            }

            // Prompt for slot
            const slotId = await promptForSlot(2, 3);
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
                    `# LEGO type:${typeSelection?.type} slot:${slotId}${(isAutostart ? " autostart" : "")}\n\n`,
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
export function deactivate() {
    if (rpc?.isOpenIn) {
        rpc.close();
    }
}

async function performUploadProgram(slotId: number, type: "python" | "scratch", progress?: vscode.Progress<{ increment: number }>) {
    const currentlyOpenTabFilePath = vscode.window.activeTextEditor?.document.fileName;
    const config = vscode.workspace.getConfiguration();

    if (currentlyOpenTabFilePath) {
        const currentlyOpenTabFileName = path.basename(currentlyOpenTabFilePath).replace(path.extname(currentlyOpenTabFilePath), "");
        const stats = fs.statSync(currentlyOpenTabFilePath);

        let compileResult: mpy.CompileResult | undefined;

        if (config.get("legoSpikePrimeMindstorms.compileBeforeUpload")) {
            compileResult = await mpy.compile(path.basename(currentlyOpenTabFilePath),
                fs.readFileSync(currentlyOpenTabFilePath).toString("utf-8"),
                ["-municode"]
            );

            if (compileResult?.status !== 0) {
                logger?.error(compileResult.err.join("\r\n"));
                logger?.error("\r\n");
                throw new Error("Compilation Failed!");
            }
        }

        const uploadSize = compileResult?.mpy?.byteLength ?? stats.size;
        const uploadProgramResult = await rpc.sendMessage(
            "start_write_program",
            {
                slotid: slotId,
                size: uploadSize,
                filename: "__init__" + (compileResult ? ".mpy" : ".py"),
                meta: {
                    created: stats.birthtime.getTime(),
                    modified: stats.mtime.getTime(),
                    name: Buffer.from(currentlyOpenTabFileName, "utf-8").toString("base64"),
                    type,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    project_id: getRandomString(12),
                },
            },
        );

        const blockSize: number = uploadProgramResult.blocksize;
        const transferId: string = uploadProgramResult.transferid;
        const increment = (1 / Math.ceil(uploadSize / blockSize)) * 100;

        if (compileResult) {
            const stream: Readable = new Readable();
            stream.push(compileResult.mpy!);
            stream.push(null);

            let data: Buffer | undefined;
            while ((data = stream.read(blockSize)) != null) {
                progress?.report({ increment });
                await rpc.sendMessage(
                    "write_package",
                    {
                        data: data.toString("base64"),
                        transferid: transferId,
                    }
                );
            }
        }
        else {
            const stream = fs.createReadStream(currentlyOpenTabFilePath, { highWaterMark: blockSize });
            for await (const data of stream) {
                progress?.report({ increment });
                await rpc.sendMessage(
                    "write_package",
                    {
                        data: data.toString("base64"),
                        transferid: transferId,
                    }
                );
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
    if (rpc?.isOpenIn) {
        const hubInfo = await rpc.sendMessage("get_hub_info");
        const { firmware, runtime } = hubInfo;

        hubStatusBarItem.text = `$(repl) LEGO Hub: Connected (${firmware.version.join(".")} / ${runtime.version.join(".")})`;
        hubStatusBarItem.command = Command.DisconnectFromHub;
    }
    else {
        hubStatusBarItem.text = "$(debug-disconnect) LEGO Hub: Disconnected";
        hubStatusBarItem.command = Command.ConnectToHub;
    }

    vscode.commands.executeCommand("setContext", "lego-spikeprime-mindstorms-vscode.isConnectedIn", !!rpc?.isOpenIn);
}

async function promptForProgramType(currentStep?: number, totalSteps?: number): Promise<TypeQuickPickItem | undefined> {
    return new Promise<TypeQuickPickItem | undefined>((resolve, reject) => {
        const input = vscode.window.createQuickPick();

        input.title = "Program Type";
        input.step = currentStep;
        input.totalSteps = totalSteps;
        input.placeholder = "Choose program type";
        input.items = programTypes;

        input.onDidAccept(() => {
            resolve(input.selectedItems[0] as TypeQuickPickItem);
            input.hide();
        });
        input.onDidHide(() => {
            input.dispose();
            resolve(undefined);
        });

        input.show();
    });
}

async function promptForSlot(currentStep?: number, totalSteps?: number): Promise<number> {
    let slots: any[] | undefined;

    if (rpc?.isOpenIn) {
        const storageStatus = await rpc.sendMessage("get_storage_status");
        slots = storageStatus.slots;
    }

    return new Promise<number>((resolve, reject) => {
        const quickPickSlots: vscode.QuickPickItem[] = [];
        for (let index = 0; index < 20; index++) {
            quickPickSlots.push({
                label: index.toString(),
                description: slots && slots[index] ? Buffer.from(slots[index].name, "base64").toString("utf-8") : "",
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