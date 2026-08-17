import { MessageFrameDecoder } from "../message-frame-decoder";

export class MessageTransformer {
    private readonly _decoder = new MessageFrameDecoder();

    public transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>) {
        for (const frame of this._decoder.decode(chunk)) {
            controller.enqueue(frame);
        }
    }

    public flush() {
        this._decoder.reset();
    }
}