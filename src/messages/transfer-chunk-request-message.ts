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
        const result = new Uint8Array(1 + 4 + 2 + this.payload.length);
        const view = new DataView(result.buffer);

        view.setUint8(0, TransferChunkRequestMessage.Id);
        view.setInt32(1, this.runningCrc, true);
        view.setUint16(5, this.payload.length, true);
        result.set(this.payload, 7);

        return result;
    }
}