import * as noble from "@abandonware/noble";

import * as vscode from "vscode";

import { InfoRequestMessage } from "../messages/info-request-message";
import { InfoResponseMessage } from "../messages/info-response-message";
import { setTimeoutAsync } from "../utils";
import { BaseClient } from "./base-client";

const SERVICE_UUID = "0000FD02-0000-1000-8000-00805F9B34FB";

// Note RX/TX are from the point of the hub!
const RX_CHAR_UUID = "0000FD02-0001-1000-8000-00805F9B34FB";
const TX_CHAR_UUID = "0000FD02-0002-1000-8000-00805F9B34FB";

export class BleClient extends BaseClient {
    public get isConnectedIn(): boolean {
        return !!this._peripheral;
    }

    private _peripheral: noble.Peripheral | undefined;
    private _rxCharacteristic: noble.Characteristic | undefined;
    private _txCharacteristic: noble.Characteristic | undefined;

    public async list() {
        const result: vscode.QuickPickItem[] = [];

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
        }, (vscode.workspace.getConfiguration().get<number>("legoSpikePrimeMindstorms.bleConnectionTimeoutSeconds") || 5) * 1000);

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
                    noble.removeAllListeners("discover");

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

                    await setTimeoutAsync(() => { /* noop */ }, 250); // HACK: This seems to be needed on Windows to wait for the BLE stack to be ready
                    this._infoResponse = await this.sendMessage<InfoRequestMessage, InfoResponseMessage>(new InfoRequestMessage(), InfoResponseMessage);

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
            }, (vscode.workspace.getConfiguration().get<number>("legoSpikePrimeMindstorms.bleConnectionTimeoutSeconds") || 5) * 1000);
        });

    }

    public async disconnect() {
        if (this._peripheral) {
            await this._peripheral.disconnectAsync();
        }
    }

    protected writeData(data: Buffer): Promise<void> | undefined {
        return this._txCharacteristic?.writeAsync(data, true);
    }

    protected onDisconnect() {
        this._rxCharacteristic?.unsubscribe();
        this._rxCharacteristic?.removeAllListeners("data");

        this._peripheral = undefined;
        this._rxCharacteristic = undefined;
        this._txCharacteristic = undefined;

        super.onDisconnect();
    }
}