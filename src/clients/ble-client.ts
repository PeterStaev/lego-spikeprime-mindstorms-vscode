import * as noble from "@abandonware/noble";

import { QuickPickItem } from "vscode";
import * as vscode from "vscode";

import { pack, unpack } from "../cobs";
import { Logger } from "../logger";
import { BaseMessage } from "../messages/base-message";
import { ConsoleNotificationMessage } from "../messages/console-notification-message";
import { InfoRequestMessage } from "../messages/info-request-message";
import { InfoResponseMessage } from "../messages/info-response-message";
import { ProgramFlowNotificationMessage } from "../messages/program-flow-notification-message";
import { ProgramFlowRequestMessage } from "../messages/program-flow-request-message";
import { ProgramFlowResponseMessage } from "../messages/program-flow-response-message";
import { setTimeoutAsync } from "../utils";

const SERVICE_UUID = "0000FD02-0000-1000-8000-00805F9B34FB";

// Note RX/TX are from the point of the hub!
const RX_CHAR_UUID = "0000FD02-0001-1000-8000-00805F9B34FB";
const TX_CHAR_UUID = "0000FD02-0002-1000-8000-00805F9B34FB";
const TIMEOUT_SECONDS = 5; // TODO: make this configurable

export class BleClient {
    public onClosed: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public onProgramRunningChanged: vscode.EventEmitter<boolean> = new vscode.EventEmitter<boolean>();
    public get isConnectedIn(): boolean {
        return !!this._peripheral;
    }
    public get firmwareVersion() {
        if (!this._infoResponse) {
            return undefined;
        }

        return `${this._infoResponse.firmwareMajor}.${this._infoResponse.firmwareMinor}.${this._infoResponse.firmwareBuild}`;
    }
    public get rpcVersion() {
        if (!this._infoResponse) {
            return undefined;
        }

        return `${this._infoResponse.rpcMajor}.${this._infoResponse.rpcMinor}.${this._infoResponse.rpcBuild}`;
    }

    private _logger: Logger;
    private _peripheral: noble.Peripheral | undefined;
    private _rxCharacteristic: noble.Characteristic | undefined;
    private _txCharacteristic: noble.Characteristic | undefined;
    private _pendingMessagesPromises = new Map<number, [(result: BaseMessage | PromiseLike<BaseMessage>) => void, (e: string) => void]>();
    private _infoResponse: InfoResponseMessage | undefined;

    constructor(logger: Logger) {
        this._logger = logger;
    }

    public async list() {
        const result: QuickPickItem[] = [];

        noble.on("discover", async (peripheral) => {
            result.push({
                label: peripheral.advertisement.localName,
                description: peripheral.uuid,
            });
        });
        await noble.startScanningAsync([SERVICE_UUID]);

        await setTimeoutAsync(() => {
            noble.stopScanningAsync();
            noble.removeAllListeners("discover");
        }, TIMEOUT_SECONDS * 1000);

        return result;
    }

    public async connect(peripheralUuid: string) {
        return new Promise<void>((resolve, reject) => {
            noble.on("discover", async (peripheral) => {
                try {
                    if (peripheral.uuid !== peripheralUuid) {
                        return;
                    }
                    await noble.stopScanningAsync();

                    this._peripheral = peripheral;
                    this._peripheral.on("disconnect", this.onDisconnect.bind(this));

                    await this._peripheral.connectAsync();

                    const { characteristics } = await this._peripheral.discoverSomeServicesAndCharacteristicsAsync(
                        [SERVICE_UUID],
                        [RX_CHAR_UUID, TX_CHAR_UUID],
                    );

                    if (characteristics.length !== 2) {
                        await this._peripheral.disconnectAsync();
                        reject(new Error("Invalid number of characteristics"));
                        return;
                    }

                    this._txCharacteristic = characteristics[0];
                    this._rxCharacteristic = characteristics[1];

                    this._rxCharacteristic.subscribe();
                    this._rxCharacteristic.on("data", this.onData.bind(this));

                    this._infoResponse = await this.sendMessage<InfoRequestMessage, InfoResponseMessage>(new InfoRequestMessage(), InfoResponseMessage);

                    noble.removeAllListeners("discover");

                    resolve();
                }
                catch (e) {
                    reject(e);
                }
            });

            void noble.startScanningAsync([SERVICE_UUID]);

            setTimeout(async () => {
                if (!this._peripheral) {
                    await noble.stopScanningAsync();
                    reject(new Error("Hub connection timed out"));
                }
            }, TIMEOUT_SECONDS * 1000);
        });

    }

    public async disconnect() {
        if (this._peripheral) {
            await this._peripheral.disconnectAsync();
        }
    }

    public async startStopProgram(slot: number, isStopIn = false) {
        const response = await this.sendMessage<ProgramFlowRequestMessage, ProgramFlowResponseMessage>(new ProgramFlowRequestMessage(slot, isStopIn), ProgramFlowResponseMessage);
        return response.IsAckIn;
    }

    private async sendMessage<T extends BaseMessage, U extends BaseMessage>(message: T, result: typeof BaseMessage): Promise<U> {
        const payload = pack(message.serialize());
        const resultPromise = new Promise<BaseMessage>((resolve, reject) => {
            this._pendingMessagesPromises.set(result.Id, [resolve, reject]);
        });

        // Split data in chunks based on maxPacketSize. If none, assume it is small enough to send in one go.
        const packetSize = this._infoResponse?.maxPacketSize ?? payload.length;
        for (let loop = 0; loop < payload.length; loop += packetSize) {
            await this._txCharacteristic?.writeAsync(Buffer.from(payload.slice(loop, loop + packetSize)), true);
        }

        return resultPromise as Promise<U>;
    }

    private onData(data: Buffer) {
        try {
            const unpacked = unpack(data);
            const [messageId, resultMessage] = deserializeMessage(unpacked);
            const pendingMessage = this._pendingMessagesPromises.get(messageId);
            if (pendingMessage) {
                const [resolve] = pendingMessage;
                resolve(resultMessage);
                this._pendingMessagesPromises.delete(messageId);
            }
            else if (resultMessage instanceof ProgramFlowNotificationMessage) {
                this.onProgramRunningChanged.fire(!resultMessage.isStopIn!);
            }
            else if (resultMessage instanceof ConsoleNotificationMessage) {
                this._logger.log(resultMessage.message ?? "");
            }
        }
        catch (e) {
            this._logger.error(`Error deserializing message: ${e}`);
        }
    }

    private onDisconnect() {
        this._rxCharacteristic?.unsubscribe();
        this._rxCharacteristic?.removeAllListeners("data");

        this._peripheral = undefined;
        this._rxCharacteristic = undefined;
        this._txCharacteristic = undefined;
        this._infoResponse = undefined;
        this._pendingMessagesPromises.clear();

        this.onClosed.fire();
    }
}

function deserializeMessage(data: Uint8Array): [id: number, message: BaseMessage] {
    const messageId = data[0];
    let message: BaseMessage;

    switch (messageId) {
        case InfoResponseMessage.Id:
            message = new InfoResponseMessage();
            break;

        case ProgramFlowNotificationMessage.Id:
            message = new ProgramFlowNotificationMessage();
            break;

        case ProgramFlowResponseMessage.Id:
            message = new ProgramFlowResponseMessage();
            break;

        case ConsoleNotificationMessage.Id:
            message = new ConsoleNotificationMessage();
            break;

        default:
            throw new Error(`Unknown message ID: ${messageId}`);
    }

    message.deserialize(data);

    return [messageId, message];
}