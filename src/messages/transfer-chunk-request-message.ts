import { BaseMessage } from "./base-message";

export class TransferChunkRequestMessage extends BaseMessage {
    public static readonly Id = 0x10;

    constructor(
        public readonly runningCrc: number,
        public readonly payload: Uint8Array,
    ) {
        super();
    }

    public serialize(): Uint8Array {
        const buffer = Buffer.alloc(1 + 4 + 2 + this.payload.length);

        buffer.writeUInt8(TransferChunkRequestMessage.Id, 0);
        buffer.writeInt32LE(this.runningCrc, 1);
        buffer.writeUInt16LE(this.payload.length, 5);
        Buffer.from(this.payload).copy(buffer, 7);

        return buffer;
    }
}