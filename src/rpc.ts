import * as vscode from "vscode";
import { v4 as uuidv4 } from "uuid";
import * as serialport from "serialport";

export class Rpc {
    private _serialPort: serialport;
    private _pendingMessagesPromises = new Map<string, [(result: any) => void, (e: string) => void]>();

    constructor(location: string) {
        this._serialPort = new serialport(location, {
            baudRate: 115200,
            autoOpen: false,
        });
        this._serialPort.setDefaultEncoding("utf-8");
        this._serialPort.addListener("data", (data) => {
            try {
                const json = JSON.parse(data.toString());
                const id = json["i"];
                if (id && this._pendingMessagesPromises.has(id)) {
                    const [resolve, reject] = this._pendingMessagesPromises.get(id) ?? [];
                    if (json["r"] && resolve) {
                        resolve(json["r"]);
                        return;
                    }

                    if (json["e"] && reject) {
                        reject(json["e"]);
                        return;
                    }

                    this._pendingMessagesPromises.delete(id);
                }
            }
            catch (e) {
                // DO NOTHING
            }
        });
        // this._serialPort.addListener("end", console.log);
        // this._serialPort.addListener("error", console.log);
    }

    public open(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this._serialPort.open((err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    }

    public close(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this._serialPort.close((err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }

                this._serialPort.removeAllListeners();
            });
        });
    }

    public sendMessage(action: string, params: any = {}): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = uuidv4();
            const msg = { "m": action, "p": params, "i": id };

            this._pendingMessagesPromises.set(id, [resolve, reject]);
            this._serialPort.write(Buffer.from(JSON.stringify(msg) + "\r", "utf-8"), (err) => {
                if (err) {
                    reject(err.message);
                    return;
                }
            });
        });
    }
}