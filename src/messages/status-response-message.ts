import { BaseMessage } from "./base-message";

export class StatusResponseMessage extends BaseMessage {
    public IsAckIn: boolean | undefined;

    public deserialize(data: Uint8Array): void {
        const view = new DataView(data.buffer);

        this.IsAckIn = (view.getUint8(1) === 0x00);
    }
}