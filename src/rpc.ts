// eslint-disable-next-line @typescript-eslint/no-var-requires
import * as SerialPort from "serialport";

import { Logger } from "./logger";
import { getRandomString } from "./utils";

export class Rpc {
    public get isOpenIn(): boolean {
        return this._serialPort?.isOpen;
    }

    private _serialPort: SerialPort;
    private _parser: SerialPort.parsers.Readline;
    private _pendingMessagesPromises = new Map<string, [(result: any) => void, (e: string) => void]>();

    constructor(location: string, logger: Logger) {
        this._serialPort = new SerialPort(location, {
            baudRate: 115200,
            autoOpen: false,
        });
        this._serialPort.setDefaultEncoding("utf-8");
        this._parser = this._serialPort.pipe(new SerialPort.parsers.Readline({ delimiter: "\r" }));
        this._parser.on("data", (data: string) => {
            // if (!data.match(/"m":0/gi)
            //     && !data.match(/"m":2/gi)) {
            //     console.log(data);
            // }

            try {
                const json = JSON.parse(data);
                const id = json["i"];
                const message = json["m"];
                if (id && this._pendingMessagesPromises.has(id)) {
                    const [resolve, reject] = this._pendingMessagesPromises.get(id) ?? [];

                    if (json["e"] && reject) {
                        reject(Buffer.from(json["e"], "base64").toString());
                    }
                    else if (resolve) {
                        resolve(json["r"]);
                    }

                    this._pendingMessagesPromises.delete(id);
                }
                else if (message) {
                    switch (message) {
                        case "userProgram.print":
                            logger?.log(Buffer.from(json["p"]["value"], "base64").toString());
                            break;

                        case "user_program_error":
                            logger?.error(Buffer.from(json["p"][3], "base64").toString().replace(/\n/gi, "\n\r"));
                            logger?.error(Buffer.from(json["p"][4], "base64").toString().replace(/\n/gi, "\n\r"));
                            break;

                        case "runtime_error":
                            logger?.error(Buffer.from(json["p"][3], "base64").toString().replace(/\n/gi, "\n\r"));
                            break;
                    }
                }
            }
            catch (e) {
                // DO NOTHING
            }
        });
    }

    public open(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this._serialPort.open((err) => {
                if (err) {
                    reject(err);
                }
                else {
                    const checkIsReady = (data: string) => {
                        try {
                            JSON.parse(data);
                            this._parser.off("data", checkIsReady);
                            resolve();
                        }
                        catch (e) {
                            // DO NOTHING
                        }
                    };

                    this._parser.on("data", checkIsReady);
                }
            });
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
        });
    }
}