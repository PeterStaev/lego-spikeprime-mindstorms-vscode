
import { ReadlineParser } from "@serialport/parser-readline";

import { SerialPort } from "serialport";
import * as vscode from "vscode";

import { Logger } from "./logger";
import { getRandomString } from "./utils";

export class Rpc {
    public onClosed: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public get isOpenIn(): boolean {
        return this._serialPort?.isOpen;
    }

    private _serialPort: SerialPort;
    private _parser: ReadlineParser;
    private _pendingMessagesPromises = new Map<string, [(result: any) => void, (e: string) => void]>();

    constructor(location: string, logger: Logger) {
        this._serialPort = new SerialPort({
            path: location,
            baudRate: 115200,
            autoOpen: false,
        });
        this._serialPort.setDefaultEncoding("utf-8");
        this._parser = this._serialPort.pipe(new ReadlineParser({ delimiter: "\r" }));
        this._parser.on("data", (data: string) => {
            let json: { [key: string]: any };
            let isPlainPrintIn: boolean = false;

            try {
                json = JSON.parse(data);

                // Case for simple printof a number: `print(123)`
                if (typeof json === "number") {
                    isPlainPrintIn = true;
                }
            }
            catch {
                // When data cannot be JSON parsed we re probably getting text from user's `print` command so we log it
                isPlainPrintIn = true;
            }

            if (isPlainPrintIn) {
                logger?.log(data.replace(/^\n/gi, "").replace(/\n/gi, "\r\n"));
                logger?.log("\r\n");
                return;
            }

            try {
                const id = json!["i"];
                const message = json!["m"];
                if (id && this._pendingMessagesPromises.has(id)) {
                    const [resolve, reject] = this._pendingMessagesPromises.get(id) ?? [];

                    if (json!["e"] && reject) {
                        reject(Buffer.from(json!["e"], "base64").toString());
                    }
                    else if (resolve) {
                        resolve(json!["r"]);
                    }

                    this._pendingMessagesPromises.delete(id);
                }
                else if (message) {
                    switch (message) {
                        case "userProgram.print":
                            logger?.log(Buffer.from(json!["p"]["value"], "base64").toString().replace(/\n/gi, "\r\n"));
                            this.sendResponse(json!["i"]);
                            break;

                        case "user_program_error":
                            logger?.error(Buffer.from(json!["p"][3], "base64").toString().replace(/\n/gi, "\r\n"));
                            logger?.error(Buffer.from(json!["p"][4], "base64").toString().replace(/\n/gi, "\r\n"));
                            logger?.info("\r\n");
                            break;

                        case "runtime_error":
                            logger?.error(Buffer.from(json!["p"][3], "base64").toString().replace(/\n/gi, "\r\n"));
                            logger?.info("\r\n");
                            break;
                    }
                }
            }
            catch (e) {
                console.error(e);
            }
        });
        this._serialPort.on("close", () => {
            this.onClosed.fire();
        });
    }

    public open(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this._serialPort.open((err) => {
                if (err) {
                    reject(err);
                    clearTimeout(timeout);
                }
                else {
                    const checkIsReady = (data: string) => {
                        try {
                            JSON.parse(data);
                            this._parser.off("data", checkIsReady);
                            clearTimeout(timeout);
                            resolve();
                        }
                        catch {
                            // DO NOTHING
                        }
                    };

                    this._parser.on("data", checkIsReady);
                }
            });

            // Command timeout
            const timeout = setTimeout(() => {
                reject("Connection timed out!");
                void this.close();
            }, (vscode.workspace.getConfiguration().get<number>("legoSpikePrimeMindstorms.commandTimeoutSeconds") || 30) * 1000);
        });
    }

    public close(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this._serialPort.close((err) => {
                this._parser.removeAllListeners();
                this._serialPort.removeAllListeners();

                this._serialPort.destroy();

                resolve();
            });
        });
    }

    public sendMessage(action: string, params: any = {}): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = getRandomString(4);
            const msg = { "m": action, "p": params, "i": id };

            while (this._serialPort.read()) {
                // DO NOTHING
            }
            this._pendingMessagesPromises.set(id, [resolve, reject]);
            this._serialPort.write(Buffer.from(JSON.stringify(msg)));
            this._serialPort.write(Buffer.from("\r"));
            this._serialPort.drain();

            // Command timeout
            setTimeout(() => {
                this._pendingMessagesPromises.delete(id);
                reject("Command timed out!");
            }, (vscode.workspace.getConfiguration().get<number>("legoSpikePrimeMindstorms.commandTimeoutSeconds") || 30) * 1000);
        });
    }

    public sendResponse(id: string, response: any = {}) {
        const msg = { "i": id, "r": response };

        while (this._serialPort.read()) {
            // DO NOTHING
        }

        this._serialPort.write(Buffer.from(JSON.stringify(msg)));
        this._serialPort.write(Buffer.from("\r"));
        this._serialPort.drain();
    }
}