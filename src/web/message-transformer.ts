export class MessageTransformer {
    private _buffer = Uint8Array.from([]);

    public transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>) {
        this._buffer = new Uint8Array([...this._buffer, ...chunk]);

        let messageEndIndex = this._buffer.findIndex((byte) => byte === 0x02);
        while (messageEndIndex !== -1) {
            const message = this._buffer.slice(0, messageEndIndex + 1);
            controller.enqueue(message);
            this._buffer = this._buffer.slice(messageEndIndex + 1);
            messageEndIndex = this._buffer.findIndex((byte) => byte === 0x02);
        }
    }

    public flush(controller: TransformStreamDefaultController<Uint8Array>) {
        controller.enqueue(this._buffer);
    }
}