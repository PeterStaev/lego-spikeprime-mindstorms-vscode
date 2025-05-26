import { BaseMessage } from "./base-message";

export class ProgramFlowNotificationMessage extends BaseMessage {
    public static readonly Id = 0x20;

    public isStopIn: boolean | undefined;

    public deserialize(data: Uint8Array): void {
        const view = new DataView(data.buffer);

        this.isStopIn = !!view.getUint8(1);
    }
}