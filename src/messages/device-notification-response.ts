import { BaseMessage } from "./base-message";

export class DeviceNotificationResponseMessage extends BaseMessage {
    public static readonly Id = 0x29;

    public IsAckIn: boolean | undefined;

    public deserialize(data: Uint8Array) {
        const view = new DataView(data.buffer);

        this.IsAckIn = (view.getUint8(1) === 0x00);
    }
}