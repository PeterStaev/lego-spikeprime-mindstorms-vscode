import { BaseMessage } from "./base-message";

export class InfoRequestMessage extends BaseMessage {
    public static readonly Id = 0x00;

    public serialize(): Uint8Array {
        return new Uint8Array([InfoRequestMessage.Id]);
    }
}