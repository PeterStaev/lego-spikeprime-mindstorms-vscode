import { DelimiterParser, SerialPort } from "serialport";
import * as vscode from "vscode";

import { InfoRequestMessage } from "../messages/info-request-message";
import { InfoResponseMessage } from "../messages/info-response-message";
import { BaseClient } from "./base-client";

const VENDOR_ID = "0694";
const PRODUCT_ID = "0009";

export class UsbClient extends BaseClient {
    private _serialPort?: SerialPort;
    private _parser?: DelimiterParser;

    public get isConnectedIn(): boolean {
        return this._serialPort?.isOpen ?? false;
    }

    public async list() {
        const ports = await SerialPort.list();

        return ports
            .filter((port) => port.vendorId === VENDOR_ID && port.productId === PRODUCT_ID)
            .map((port) => {
                return {
                    label: port.path,
                    description: port.serialNumber,
                };
            }) satisfies vscode.QuickPickItem[];
    }

    public async connect(peripheralUuid: string) {
        const ports = await SerialPort.list();
        const port = ports.find((item) => item.serialNumber === peripheralUuid);

        if (!port) {
            throw new Error(`Port with serial number ${peripheralUuid} not found`);
        }

        this._serialPort = new SerialPort({
            path: port.path,
            baudRate: 115200,
            autoOpen: false,
        });
        this._serialPort.on("close", this.onDisconnect.bind(this));

        this._parser = this._serialPort.pipe(new DelimiterParser({ delimiter: [0x02], includeDelimiter: true }));
        this._parser.on("data", this.onData.bind(this));

        return new Promise<void>((resolve, reject) => {
            this._serialPort?.open((err) => {
                if (err) {
                    reject(err);
                }
                else {
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
                }
            });
        });
    }

    public async disconnect() {
        this._serialPort?.close();
    }

    protected async writeData(data: Buffer): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this._serialPort?.write(data);
            this._serialPort?.drain((err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    }

    protected onDisconnect() {
        this._serialPort?.removeAllListeners();
        this._parser?.removeAllListeners();
        this._serialPort?.destroy();

        this._serialPort = undefined;
        this._parser = undefined;

        super.onDisconnect();
    }
}