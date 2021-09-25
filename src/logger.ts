import { EventEmitter } from "vscode";

export class Logger {
    constructor(private writeEvent: EventEmitter<string>) { }

    public info(text: string) {
        this.writeEvent.fire(`\u001b[36m${text}\u001b[0m`);
    }

    public error(text: string) {
        this.writeEvent.fire(`\u001b[31m${text}\u001b[0m`);
    }

    public log(text: string) {
        this.writeEvent.fire(text);
    }
}