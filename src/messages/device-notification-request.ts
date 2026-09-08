import { BaseMessage } from "./base-message";

export class DeviceNotificationRequestMessage extends BaseMessage {
    public static readonly Id = 0x28;

    constructor(private intervalMs: number) {
        super();
    }

    public serialize(): Uint8Array {
        const buffer = new ArrayBuffer(3);
        const view = new DataView(buffer);

        view.setUint8(0, DeviceNotificationRequestMessage.Id);
        view.setUint16(1, this.intervalMs, true); // little endian

        return new Uint8Array(buffer);
    }
}