import { BaseMessage } from "./base-message";

export class StartFileUploadRequestMessage extends BaseMessage {
    public static readonly Id = 0x0C;

    constructor(
        public readonly fileName: string,
        public readonly slot: number,
        public readonly crc: number,
    ) {
        super();
    }

    public serialize(): Uint8Array {
        const encodedFileName = Buffer.from(this.fileName, "utf8");

        if (encodedFileName.length > 31) {
            throw new Error("File name is too long");
        }

        const buffer = Buffer.alloc(1 + (encodedFileName.length + 1) + 1 + 4);
        buffer.writeUInt8(StartFileUploadRequestMessage.Id, 0);
        encodedFileName.copy(buffer, 1);
        // One 0x00 byte to terminate the string
        buffer.writeUInt8(this.slot, encodedFileName.length + 2);
        buffer.writeInt32LE(this.crc, encodedFileName.length + 3);

        return buffer;
    }
}