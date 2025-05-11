import { BaseMessage } from "./base-message";

export class ConsoleNotificationMessage extends BaseMessage {
    public static readonly Id = 0x21;

    public message: string | undefined;

    public deserialize(data: Uint8Array): void {
        const buffer = Buffer.from(data);

        // Remove the first byte which is the message ID and any trailing null bytes
        const messageEnd = buffer.indexOf(0, 1);
        const messageLength = messageEnd === -1 ? buffer.length : messageEnd;

        this.message = buffer.slice(1, messageLength).toString("utf8");
    }
}