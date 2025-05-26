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
        const encodedFileName = new TextEncoder().encode(this.fileName);

        if (encodedFileName.length > 31) {
            throw new Error("File name is too long");
        }

        const result = new Uint8Array(1 + (encodedFileName.length + 1) + 1 + 4);
        const view = new DataView(result.buffer);
        view.setUint8(0, StartFileUploadRequestMessage.Id);
        result.set(encodedFileName, 1);
        // One 0x00 byte to terminate the string
        view.setUint8(encodedFileName.length + 2, this.slot);
        view.setInt32(encodedFileName.length + 3, this.crc, true);

        return result;
    }
}