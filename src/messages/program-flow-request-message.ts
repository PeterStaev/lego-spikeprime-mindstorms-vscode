import { BaseMessage } from "./base-message";

export class ProgramFlowRequestMessage extends BaseMessage {
    public static readonly Id = 0x1E;

    constructor(public readonly slot: number, public readonly isStopIn: boolean) {
        super();
    }
    public serialize(): Uint8Array {
        const result = new Uint8Array(3);
        const view = new DataView(result.buffer);

        view.setUint8(0, ProgramFlowRequestMessage.Id);
        view.setUint8(1, this.isStopIn ? 1 : 0);
        view.setUint8(2, this.slot);

        return result;
    }
}