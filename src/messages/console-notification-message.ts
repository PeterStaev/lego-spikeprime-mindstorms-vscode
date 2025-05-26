import { BaseMessage } from "./base-message";

export class ConsoleNotificationMessage extends BaseMessage {
    public static readonly Id = 0x21;

    public message: string | undefined;

    public deserialize(data: Uint8Array): void {
        // Remove the first byte which is the message ID and any trailing null bytes
        const messageEnd = data.indexOf(0, 1);
        const messageLength = messageEnd === -1 ? data.length : messageEnd;

        this.message = new TextDecoder().decode(data.slice(1, messageLength));
    }
}