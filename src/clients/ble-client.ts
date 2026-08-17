import {
    Characteristic,
    Peripheral,
    withBindings,
} from "@stoprocent/noble";

import * as vscode from "vscode";

import { pack, unpack } from "../cobs";
import { MessageFrameDecoder } from "../message-frame-decoder";
import { GetHubNameRequestMessage } from "../messages/get-hub-name-request-message";
import { GetHubNameResponseMessage } from "../messages/get-hub-name-response-message";
import { InfoRequestMessage } from "../messages/info-request-message";
import { InfoResponseMessage } from "../messages/info-response-message";
import { formatBluetoothAddress, setTimeoutAsync } from "../utils";
import { BaseClient, HubQuickPickItem } from "./base-client";

// Auto-select based on platform
const noble = withBindings("default"); // 'hci', 'win', 'mac'

const SERVICE_UUID = "0000FD02-0000-1000-8000-00805F9B34FB";

// Note RX/TX are from the point of the hub!
const RX_CHAR_UUID = "0000FD02-0001-1000-8000-00805F9B34FB";
const TX_CHAR_UUID = "0000FD02-0002-1000-8000-00805F9B34FB";
const HUB_NAME_TIMEOUT_MS = 3000;

export class BleClient extends BaseClient {
    public get isConnectedIn(): boolean {
        return !!this._peripheral;
    }

    private _peripheral: Peripheral | undefined;
    private _rxCharacteristic: Characteristic | undefined;
    private _txCharacteristic: Characteristic | undefined;
    private readonly _messageFrameDecoder = new MessageFrameDecoder();

    public async list(
        onDidChange: (items: readonly HubQuickPickItem[]) => void,
        cancellationToken: vscode.CancellationToken,
    ) {
        const items = new Map<string, HubQuickPickItem>();
        let isScanning = false;
        let nameProbeQueue = Promise.resolve();

        const publishItems = () => onDidChange([...items.values()]);
        const onScanStart = () => { isScanning = true; };
        const onScanStop = () => { isScanning = false; };
        const startScanning = async () => {
            if (!isScanning && !cancellationToken.isCancellationRequested) {
                await noble.startScanningAsync([SERVICE_UUID], false);
            }
        };
        const stopScanning = async () => {
            if (isScanning) {
                await noble.stopScanningAsync();
            }
        };
        const onDiscover = (peripheral: Peripheral) => {
            if (items.has(peripheral.id)) {
                return;
            }

            const address = formatBluetoothAddress(
                peripheral.address && peripheral.address !== "unknown"
                    ? peripheral.address
                    : peripheral.id,
            );
            const item: HubQuickPickItem = {
                label: address,
                connectionId: peripheral.id,
            };
            items.set(peripheral.id, item);
            publishItems();

            nameProbeQueue = nameProbeQueue.then(async () => {
                if (cancellationToken.isCancellationRequested) {
                    return;
                }

                try {
                    const name = await this.probeHubName(peripheral, cancellationToken);
                    if (name) {
                        item.label = `${name} (${address})`;
                        publishItems();
                    }
                }
                catch (error) {
                    if (!cancellationToken.isCancellationRequested) {
                        this._logger.error(`Unable to read hub name from ${address}: ${error}`);
                    }
                }
                finally {
                    await startScanning();
                }
            });
        };

        noble.on("scanStart", onScanStart);
        noble.on("scanStop", onScanStop);
        noble.on("discover", onDiscover);
        try {
            await noble.waitForPoweredOnAsync();
            await startScanning();
            await new Promise<void>((resolve) => {
                if (cancellationToken.isCancellationRequested) {
                    resolve();
                    return;
                }

                cancellationToken.onCancellationRequested(resolve);
            });
        }
        finally {
            noble.removeListener("discover", onDiscover);
            noble.removeListener("scanStart", onScanStart);
            noble.removeListener("scanStop", onScanStop);
            await stopScanning();
            await nameProbeQueue;
        }

        return [...items.values()];
    }

    public async connect(peripheralUuid: string) {
        this._messageFrameDecoder.reset();
        this._peripheral = await noble.connectAsync(peripheralUuid);
        this._peripheral.on("disconnect", this.onDisconnect.bind(this));

        const { characteristics } = await this._peripheral.discoverSomeServicesAndCharacteristicsAsync(
            [SERVICE_UUID],
            [RX_CHAR_UUID, TX_CHAR_UUID],
        );

        if (characteristics.length !== 2) {
            await this._peripheral.disconnectAsync();
            throw new Error("Invalid number of characteristics");
        }

        this._txCharacteristic = characteristics[0];
        this._rxCharacteristic = characteristics[1];

        this._rxCharacteristic.subscribe();
        this._rxCharacteristic.on("data", this.onBleData.bind(this));

        await setTimeoutAsync(() => { /* noop */ }, 250); // HACK: This seems to be needed on Windows to wait for the BLE stack to be ready
        this._infoResponse = await this.sendMessage<InfoRequestMessage, InfoResponseMessage>(new InfoRequestMessage(), InfoResponseMessage);
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
        this._messageFrameDecoder.reset();
        this._rxCharacteristic?.unsubscribe();
        this._rxCharacteristic?.removeAllListeners("data");

        this._peripheral = undefined;
        this._rxCharacteristic = undefined;
        this._txCharacteristic = undefined;

        super.onDisconnect();
    }

    private onBleData(data: Uint8Array) {
        for (const frame of this._messageFrameDecoder.decode(data)) {
            this.onData(frame);
        }
    }

    private async probeHubName(
        peripheral: Peripheral,
        cancellationToken: vscode.CancellationToken,
    ): Promise<string | undefined> {
        const decoder = new MessageFrameDecoder();
        let notificationCharacteristic: Characteristic | undefined;
        let timeout: NodeJS.Timeout | undefined;
        let cancellationSubscription: vscode.Disposable | undefined;
        let onData: ((data: Buffer) => void) | undefined;

        try {
            await peripheral.connectAsync();

            const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
                [SERVICE_UUID],
                [RX_CHAR_UUID, TX_CHAR_UUID],
            );
            const writeCharacteristic = characteristics.find(
                characteristic => normalizeUuid(characteristic.uuid) === normalizeUuid(RX_CHAR_UUID),
            );
            notificationCharacteristic = characteristics.find(
                characteristic => normalizeUuid(characteristic.uuid) === normalizeUuid(TX_CHAR_UUID),
            );

            if (!writeCharacteristic || !notificationCharacteristic) {
                throw new Error("Hub communication characteristics not found");
            }

            const responseCharacteristic = notificationCharacteristic;
            await responseCharacteristic.subscribeAsync();
            await setTimeoutAsync(() => { /* noop */ }, 250);

            const responsePromise = new Promise<string | undefined>((resolve, reject) => {
                onData = (data: Buffer) => {
                    for (const frame of decoder.decode(data)) {
                        const payload = unpack(frame);
                        if (payload[0] === GetHubNameResponseMessage.Id) {
                            const response = new GetHubNameResponseMessage();
                            response.deserialize(payload);
                            resolve(response.name);
                        }
                    }
                };
                responseCharacteristic.on("data", onData);
                timeout = setTimeout(
                    () => reject(new Error("Timed out waiting for hub name")),
                    HUB_NAME_TIMEOUT_MS,
                );
                cancellationSubscription = cancellationToken.onCancellationRequested(
                    () => reject(new Error("Hub name lookup cancelled")),
                );
            });

            await writeCharacteristic.writeAsync(
                Buffer.from(pack(new GetHubNameRequestMessage().serialize())),
                true,
            );
            return await responsePromise;
        }
        finally {
            if (timeout) {
                clearTimeout(timeout);
            }
            cancellationSubscription?.dispose();
            if (notificationCharacteristic && onData) {
                notificationCharacteristic.removeListener("data", onData);
            }
            await notificationCharacteristic?.unsubscribeAsync().catch(() => { /* noop */ });
            if (peripheral.state !== "disconnected") {
                await peripheral.disconnectAsync().catch(() => { /* noop */ });
            }
        }
    }
}

function normalizeUuid(uuid: string): string {
    return uuid.replace(/-/g, "").toLowerCase();
}