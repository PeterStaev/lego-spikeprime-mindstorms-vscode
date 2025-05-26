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
        const view = new DataView(data.buffer);

        this.rpcMajor = view.getUint8(1);
        this.rpcMinor = view.getUint8(2);
        this.rpcBuild = view.getUint16(3, true);
        this.firmwareMajor = view.getUint8(5);
        this.firmwareMinor = view.getUint8(6);
        this.firmwareBuild = view.getUint16(7, true);
        this.maxPacketSize = view.getUint16(9, true);
        this.maxMessageSize = view.getUint16(11, true);
        this.maxChunkSize = view.getUint16(13, true);
        this.productGroupDevice = view.getUint16(15, true);
    }
}