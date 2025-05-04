import { BaseMessage } from "./base-message";

export class ProgramFlowResponseMessage extends BaseMessage {
    public static readonly Id = 0x1F;

    public IsAckIn: boolean | undefined;

    public deserialize(data: Uint8Array): void {
        const buffer = Buffer.from(data);

        this.IsAckIn = (buffer.readUInt8(1) === 0x00);
    }
}