// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as fs from "fs";
import * as path from "path";
import * as serialport from "serialport";
import * as vscode from "vscode";

import { Logger } from "./logger";
import { Rpc } from "./rpc";
import { getRandomString } from "./utils";

let rpc: Rpc;

const writeEmitter = new vscode.EventEmitter<string>();
const logger = new Logger(writeEmitter);
let terminal: vscode.Terminal | null;
let hubStatusBarItem: vscode.StatusBarItem;
const programTypes: Array<vscode.QuickPickItem & { type: "python" | "scratch" }> = [
    {
        label: "Python (standard)",
        detail: "Works similar to python programs in the Mindstorms app. ",
        type: "python",
    },
    {
        label: "Python (advanced)",
        detail: "This allows more advanced features like event notifications and async code executions. Has to follow specific program template. Refer to the readme for more details. ",
        type: "scratch",
    },
];

const enum Command {
    ConnectToHub = "lego-spikeprime-mindstorms-vscode.connectToHub",
    DisconnectFromHub = "lego-spikeprime-mindstorms-vscode.disconnectFromHub",
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    hubStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    hubStatusBarItem.show();
    updateHubStatusBarItem();

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
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

                rpc = new Rpc(
                    location,
                    logger,
                    async () => {
                        await updateHubStatusBarItem();
                    }
                );
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
            vscode.window.showErrorMessage(e);
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
    });

    const uploadProgramCommand = vscode.commands.registerCommand("lego-spikeprime-mindstorms-vscode.uploadProgram", async () => {
        if (!rpc?.isOpenIn) {
            vscode.window.showErrorMessage("LEGO Hub not connected! Please connect first!");
            return;
        }

        try {
            await vscode.commands.executeCommand("workbench.action.files.save");

            const typeSelection = await vscode.window.showQuickPick(programTypes);
            if (!typeSelection) {
                return;
            }

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

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Uploading Program to Hub (Slot ${slotSelection.label})...`,
                },
                (progress) => performUploadProgram(+slotSelection.label, typeSelection.type, progress),
            );
            await vscode.window.showInformationMessage("Program uploaded!");
        }
        catch (e) {
            vscode.window.showErrorMessage(e);
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

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Starting Program in Slot #${slotSelection.label}...`,
                },
                () => rpc.sendMessage("program_execute", { slotid: +slotSelection.label }),
            );
        }
        catch (e) {
            vscode.window.showErrorMessage(e);
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
            vscode.window.showErrorMessage(e);
        }
    });

    const showTerminalCommand = vscode.commands.registerCommand("lego-spikeprime-mindstorms-vscode.showTerminal", showTerminal);

    context.subscriptions.push(connectToHubCommand);
    context.subscriptions.push(disconnectFromHubCommand);
    context.subscriptions.push(uploadProgramCommand);
    context.subscriptions.push(startProgramCommand);
    context.subscriptions.push(terminateProgramCommand);
    context.subscriptions.push(showTerminalCommand);

    context.subscriptions.push(hubStatusBarItem);
}

// this method is called when your extension is deactivated
export function deactivate() {
    if (rpc?.isOpenIn) {
        rpc.close();
    }
}

async function performUploadProgram(slotId: number, type: "python" | "scratch", progress?: vscode.Progress<{ increment: number }>) {
    const currentlyOpenTabFilePath = vscode.window.activeTextEditor?.document.fileName;

    if (currentlyOpenTabFilePath) {
        const currentlyOpenTabFileName = path.basename(currentlyOpenTabFilePath).replace(path.extname(currentlyOpenTabFilePath), "");
        const stats = fs.statSync(currentlyOpenTabFilePath);
        const uploadProgramResult = await rpc.sendMessage(
            "start_write_program",
            {
                slotid: slotId,
                size: stats.size,
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
        const stream = fs.createReadStream(currentlyOpenTabFilePath, { highWaterMark: blockSize });
        const increment = (1 / Math.ceil(stats.size / blockSize)) * 100;
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

function showTerminal() {
    if (!terminal) {
        terminal = vscode.window.createTerminal({
            name: "LEGO Hub Terminal",
            pty: {
                onDidWrite: writeEmitter.event,
                open: () => {
                    logger.info("Welcome to the LEGO Hub Log Terminal!\n");
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
        setTimeout(async () => {
            const hubInfo = await rpc.sendMessage("get_hub_info");
            const { firmware, runtime } = hubInfo;

            hubStatusBarItem.text = `$(repl) LEGO Hub: Connected (${firmware.version.join(".")} / ${runtime.version.join(".")})`;
            hubStatusBarItem.command = Command.DisconnectFromHub;
        }, 1000);
    }
    else {
        hubStatusBarItem.text = "$(debug-disconnect) LEGO Hub: Disconnected";
        hubStatusBarItem.command = Command.ConnectToHub;
    }

}