import { BaseMessage } from "./base-message";

export class GetHubNameResponseMessage extends BaseMessage {
    public static readonly Id = 0x19;

    public name: string | undefined;

    public deserialize(data: Uint8Array): void {
        const nameEnd = data.indexOf(0, 1);
        const nameLength = nameEnd === -1 ? data.length : nameEnd;

        this.name = new TextDecoder().decode(data.slice(1, nameLength));
    }
}