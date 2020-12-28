import * as vscode from "vscode";
import { getuid } from "process";
import * as SerialPort from "serialport";

export class Rpc {
    private _serialPort: SerialPort;

    constructor(location: string) {
        this._serialPort = new SerialPort(location, {
            baudRate: 115200
        });
        this._serialPort.setDefaultEncoding("utf-8");
        this._serialPort.addListener("data", console.log);
        this._serialPort.addListener("end", console.log);
        this._serialPort.addListener("error", console.log);
    }

    public sendMessage(action: string, params: any = {}) {
        const id = getuid();
        const msg = { "m": action, "p": params, "i": id };
        const msgString = JSON.stringify(msg) + "\n";
        this._serialPort.write(msgString, (err) => {
            if (err) {
                vscode.window.showErrorMessage(err.message);
                return;
            }
        });

    }
}