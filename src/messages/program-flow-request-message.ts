import { BaseMessage } from "./base-message";

export class ProgramFlowRequestMessage extends BaseMessage {
    public static readonly Id = 0x1E;

    constructor(public readonly slot: number, public readonly isStopIn: boolean) {
        super();
    }
    public serialize(): Uint8Array {
        const buffer = Buffer.alloc(3);

        buffer.writeUInt8(ProgramFlowRequestMessage.Id, 0);
        buffer.writeUInt8(this.isStopIn ? 1 : 0, 1);
        buffer.writeUInt8(this.slot, 2);

        return buffer;
    }
}