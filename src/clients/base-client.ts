import * as vscode from "vscode";

import { pack, unpack } from "../cobs";
import { Logger } from "../logger";
import { BaseMessage } from "../messages/base-message";
import { ConsoleNotificationMessage } from "../messages/console-notification-message";
import { InfoResponseMessage } from "../messages/info-response-message";
import { ProgramFlowNotificationMessage } from "../messages/program-flow-notification-message";
import { ProgramFlowRequestMessage } from "../messages/program-flow-request-message";
import { ProgramFlowResponseMessage } from "../messages/program-flow-response-message";
import { StartFileUploadRequestMessage } from "../messages/start-file-upload-request-message";
import { StartFileUploadResponseMessage } from "../messages/start-file-upload-response-message";
import { TransferChunkRequestMessage } from "../messages/transfer-chunk-request-message";
import { TransferChunkResponseMessage } from "../messages/transfer-chunk-response-message";

export abstract class BaseClient {
    public onClosed: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public onProgramRunningChanged: vscode.EventEmitter<boolean> = new vscode.EventEmitter<boolean>();
    public abstract get isConnectedIn(): boolean;
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
    public get maxChunkSize() {
        if (!this._infoResponse) {
            return undefined;
        }
        return this._infoResponse.maxChunkSize;
    }

    protected _logger: Logger;
    protected _pendingMessagesPromises = new Map<number, [(result: BaseMessage | PromiseLike<BaseMessage>) => void, (e: string) => void]>();
    protected _infoResponse: InfoResponseMessage | undefined;

    constructor(logger: Logger) {
        this._logger = logger;
    }

    public abstract list(): Promise<vscode.QuickPickItem[]>;

    public abstract connect(peripheralUuid: string): Promise<void>;

    public abstract disconnect(): Promise<void>;

    public async startStopProgram(slot: number, isStopIn = false) {
        const response = await this.sendMessage<ProgramFlowRequestMessage, ProgramFlowResponseMessage>(new ProgramFlowRequestMessage(slot, isStopIn), ProgramFlowResponseMessage);
        return response.IsAckIn;
    }

    public async startFileUpload(fileName: string, slot: number, crc: number) {
        const uploadResponse = await this.sendMessage<StartFileUploadRequestMessage, StartFileUploadResponseMessage>(
            new StartFileUploadRequestMessage(fileName, slot, crc),
            StartFileUploadResponseMessage,
        );

        if (!uploadResponse.IsAckIn) {
            throw new Error("Failed to start file upload");
        }
    }

    public async transferChunk(chunk: Uint8Array, runningCrc: number) {
        const response = await this.sendMessage<TransferChunkRequestMessage, TransferChunkResponseMessage>(
            new TransferChunkRequestMessage(runningCrc, chunk),
            TransferChunkResponseMessage,
        );

        if (!response.IsAckIn) {
            throw new Error("Failed to transfer chunk");
        }
    }

    protected abstract writeData(data: Buffer): Promise<void> | undefined;

    protected async sendMessage<T extends BaseMessage, U extends BaseMessage>(message: T, result: typeof BaseMessage): Promise<U> {
        const payload = pack(message.serialize());
        const resultPromise = new Promise<BaseMessage>((resolve, reject) => {
            this._pendingMessagesPromises.set(result.Id, [resolve, reject]);
        });

        // Split data in chunks based on maxPacketSize. If none, assume it is small enough to send in one go.
        const packetSize = this._infoResponse?.maxPacketSize ?? payload.length;
        for (let loop = 0; loop < payload.length; loop += packetSize) {
            await this.writeData(Buffer.from(payload.slice(loop, loop + packetSize)));
        }

        return resultPromise as Promise<U>;
    }

    protected onData(data: Buffer) {
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

    protected onDisconnect() {
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

        case StartFileUploadResponseMessage.Id:
            message = new StartFileUploadResponseMessage();
            break;

        case TransferChunkResponseMessage.Id:
            message = new TransferChunkResponseMessage();
            break;

        default:
            throw new Error(`Unknown message ID: ${messageId}`);
    }

    message.deserialize(data);

    return [messageId, message];
}