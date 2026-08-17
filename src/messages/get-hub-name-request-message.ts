import { BaseMessage } from "./base-message";

export class GetHubNameRequestMessage extends BaseMessage {
    public static readonly Id = 0x18;

    public serialize(): Uint8Array {
        return new Uint8Array([GetHubNameRequestMessage.Id]);
    }
}