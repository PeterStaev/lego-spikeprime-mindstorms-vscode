import * as vscode from "vscode";

import { BaseClient } from "../../clients/base-client";
import { InfoRequestMessage } from "../../messages/info-request-message";
import { InfoResponseMessage } from "../../messages/info-response-message";
import { getLogger } from "../../shared-extension";
import { MessageTransformer } from "../message-transformer";

const VENDOR_ID = 0x0694;
const PRODUCT_ID = 0x0009;

export class WebUsbClient extends BaseClient {
    private _port: SerialPort | undefined;
    private _writer: WritableStreamDefaultWriter | undefined;
    private _reader: ReadableStreamDefaultReader | undefined;

    public get isConnectedIn(): boolean {
        return this._port?.readable !== undefined && this._port?.writable !== undefined;
    }

    public list(): Promise<vscode.QuickPickItem[]> {
        throw new Error("Method not implemented.");
    }

    public async connect(peripheralUuid: string): Promise<void> {
        const portInfo: SerialPortInfo | undefined = await vscode.commands.executeCommand("workbench.experimental.requestSerialPort", { filters: [{ usbVendorId: VENDOR_ID, usbProductId: PRODUCT_ID }] });
        const ports = await navigator.serial.getPorts();
        this._port = ports.find((port) => {
            const info = port.getInfo();
            return info.vendorId === portInfo?.vendorId
                && info.productId === portInfo?.productId
                && info.locationId === portInfo?.locationId;
        });

        if (!this._port) {
            throw new Error("No USB device found with the specified vendor and product ID.");
        }

        await this._port.open({ baudRate: 115200 });

        this._port.ondisconnect = this.disconnect.bind(this);

        void this.readerLoop();

        this._writer = this._port.writable.getWriter();

        return new Promise<void>((resolve, reject) => {
            setTimeout(() => {
                this.sendMessage(new InfoRequestMessage(), InfoResponseMessage).then(
                    (response) => {
                        this._infoResponse = response as InfoResponseMessage;
                        resolve();
                    },
                    (error) => {
                        reject(error);
                    },
                );
            }, 250); // This is needed to make sure the device is fully inited.
        });
    }

    public async disconnect(): Promise<void> {
        try {
            await this._reader?.cancel();
            this._reader?.releaseLock();
            await this._port?.readable?.cancel();
        }
        catch {
            // DO NOTHING
        }

        await this._writer?.close();
        this._writer?.releaseLock();

        await this._port?.close();

        this.onDisconnect();
    }

    protected writeData(data: Buffer): Promise<void> | undefined {
        return this._writer?.write(data);
    }

    protected onDisconnect() {
        this._reader = undefined;
        this._writer = undefined;
        this._port = undefined;

        super.onDisconnect();
    }

    private async readerLoop() {
        while (this._port?.readable && !this._port.readable.locked) {
            this._reader = this._port?.readable.pipeThrough(new TransformStream(new MessageTransformer())).getReader();
            try {
                while (true) {
                    const { value, done } = await this._reader.read();
                    if (done) {
                        break;
                    }

                    this.onData(value);
                }
            }
            catch (error) {
                getLogger().error(`Error reading from USB port:${error instanceof Error ? ` ${error.message}` : error}`);
            }
            finally {
                this._reader.releaseLock();
            }
        }
    }
}