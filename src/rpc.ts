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

    constructor(
        location: string,
        logger: Logger,
        onCloseCallback: () => void,
    ) {
        this._serialPort = new SerialPort(location, {
            baudRate: 115200,
            autoOpen: false,
            highWaterMark: 1024,
        });
        this._serialPort.setDefaultEncoding("utf-8");
        this._parser = this._serialPort.pipe(new SerialPort.parsers.Readline({ delimiter: "\r" }));
        this._parser.on("data", (data: string) => {
            if (!data.match(/"m":0/gi)
                && !data.match(/"m":2/gi)) {
                console.log(data);
            }
            try {
                const json = JSON.parse(data);
                const id = json["i"];
                if (id && this._pendingMessagesPromises.has(id)) {
                    const [resolve, reject] = this._pendingMessagesPromises.get(id) ?? [];
                    if (json["r"] !== undefined && resolve) {
                        resolve(json["r"]);
                        return;
                    }

                    if (json["e"] && reject) {
                        reject(Buffer.from(json["e"], "base64").toString());
                        return;
                    }

                    this._pendingMessagesPromises.delete(id);
                }

                if (json["m"] && json["m"] === "userProgram.print") {
                    logger?.log(Buffer.from(json["p"]["value"], "base64").toString());
                }

                if (json["m"] && json["m"] === "user_program_error") {
                    logger?.error(Buffer.from(json["p"][3], "base64").toString().replace(/\n/gi, "\n\r"));
                    logger?.error(Buffer.from(json["p"][4], "base64").toString().replace(/\n/gi, "\n\r"));
                }

                if (json["m"] && json["m"] === "runtime_error") {
                    logger?.error(Buffer.from(json["p"][3], "base64").toString().replace(/\n/gi, "\n\r"));
                }
            }
            catch (e) {
                // DO NOTHING
            }
        });
        this._serialPort.on("close", onCloseCallback);
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
                this._parser.removeAllListeners();
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