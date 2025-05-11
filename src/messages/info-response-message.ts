import { BaseMessage } from "./base-message";

export class InfoResponseMessage extends BaseMessage {
    public static readonly Id = 0x01;

    public rpcMajor: number | undefined;
    public rpcMinor: number | undefined;
    public rpcBuild: number | undefined;
    public firmwareMajor: number | undefined;
    public firmwareMinor: number | undefined;
    public firmwareBuild: number | undefined;
    public maxPacketSize: number | undefined;
    public maxMessageSize: number | undefined;
    public maxChunkSize: number | undefined;
    public productGroupDevice: number | undefined;

    public deserialize(data: Uint8Array) {
        const buffer = Buffer.from(data);

        this.rpcMajor = buffer.readUInt8(1);
        this.rpcMinor = buffer.readUInt8(2);
        this.rpcBuild = buffer.readUInt16LE(3);
        this.firmwareMajor = buffer.readUInt8(5);
        this.firmwareMinor = buffer.readUInt8(6);
        this.firmwareBuild = buffer.readUInt16LE(7);
        this.maxPacketSize = buffer.readUInt16LE(9);
        this.maxMessageSize = buffer.readUInt16LE(11);
        this.maxChunkSize = buffer.readUInt16LE(13);
        this.productGroupDevice = buffer.readUInt16LE(15);
    }
}