export abstract class BaseMessage {
    public static readonly Id: number;

    public serialize(): Uint8Array {
        throw new Error("Method not implemented.");
    }

    public deserialize(data: Uint8Array) {
        throw new Error("Method not implemented.");
    }
}