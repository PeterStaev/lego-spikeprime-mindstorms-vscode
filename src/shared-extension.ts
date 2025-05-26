import * as vscode from "vscode";

import { BaseClient } from "./clients/base-client";
import { Logger } from "./logger";
import { Command, crc32WithAlignment } from "./utils";

const writeEmitter = new vscode.EventEmitter<string>();
const logger = new Logger(writeEmitter);
let terminal: vscode.Terminal | null;
let hubStatusBarItem: vscode.StatusBarItem;
let currentStartedProgramSlotId: number | undefined;
let currentStartedProgramResolve: (() => void) | undefined;
let client: BaseClient | undefined;

export function initClient<U extends BaseClient>(clientClass: new (logger: Logger) => U): void {
    client = new clientClass(logger);

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
}

export function getClient(): BaseClient | undefined {
    return client;
}

export function getLogger(): Logger {
    return logger;
}

export function registerSharedCommands(context: vscode.ExtensionContext): void {
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
        disconnectFromHubCommand,
        startProgramCommand,
        terminateProgramCommand,
        showTerminalCommand,
        addFileHeaderCommand,
    );
}

export function initHubStatusBarItems(context: vscode.ExtensionContext) {
    hubStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    hubStatusBarItem.show();
    updateHubStatusBarItem();

    context.subscriptions.push(hubStatusBarItem);
}

export async function getProgramInfo(): Promise<{ slotId: number, isAutostartIn: boolean } | undefined> {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
        vscode.window.showErrorMessage("Please open a file");
        return;
    }

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

    return { slotId, isAutostartIn };
}

export async function onHubConnected() {
    await updateHubStatusBarItem();
    showTerminal();
}

export async function onDeactivate() {
    if (client?.isConnectedIn) {
        await client.disconnect();
    }
}

export async function uploadProgramToHub(
    data: Uint8Array,
    slotId: number,
    isCompiledIn: boolean,
    progress?: vscode.Progress<{ increment: number }>,
) {
    const uploadSize = data.length;

    await client!.startFileUpload(`program.${isCompiledIn ? "mpy" : "py"}`, slotId, crc32WithAlignment(data));

    const blockSize: number = client!.maxChunkSize!;
    const increment = (1 / Math.ceil(uploadSize / blockSize)) * 100;
    let runningCrc = 0;

    for (let loop = 0; loop < uploadSize; loop += blockSize) {
        const chunk = data.slice(loop, loop + blockSize);
        runningCrc = crc32WithAlignment(chunk, runningCrc);

        await client!.transferChunk(chunk, runningCrc);

        progress?.report({ increment });
    }
}

export async function startProgramInSlot(slotId: number) {
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
