import { BaseMessage } from "./base-message";

const MAX_HUB_NAME_BYTES = 29;

export class SetHubNameRequestMessage extends BaseMessage {
    public static readonly Id = 0x16;

    constructor(public readonly name: string) {
        super();
    }

    public serialize(): Uint8Array {
        const encodedName = new TextEncoder().encode(this.name);
        if (encodedName.length > MAX_HUB_NAME_BYTES) {
            throw new Error("Hub name must be 29 bytes or fewer");
        }

        const result = new Uint8Array(1 + encodedName.length + 1);
        result[0] = SetHubNameRequestMessage.Id;
        result.set(encodedName, 1);
        return result;
    }
}