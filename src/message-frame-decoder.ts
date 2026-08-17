const MESSAGE_DELIMITER = 0x02;

export class MessageFrameDecoder {
    private _buffer = new Uint8Array(0);

    public decode(chunk: Uint8Array): Uint8Array[] {
        if (chunk.length > 0) {
            const newBuffer = new Uint8Array(this._buffer.length + chunk.length);
            newBuffer.set(this._buffer);
            newBuffer.set(chunk, this._buffer.length);
            this._buffer = newBuffer;
        }

        const frames: Uint8Array[] = [];
        let messageEndIndex = this._buffer.findIndex((byte) => byte === MESSAGE_DELIMITER);
        while (messageEndIndex !== -1) {
            frames.push(this._buffer.slice(0, messageEndIndex + 1));
            this._buffer = this._buffer.slice(messageEndIndex + 1);
            messageEndIndex = this._buffer.findIndex((byte) => byte === MESSAGE_DELIMITER);
        }

        return frames;
    }

    public reset(): void {
        this._buffer = new Uint8Array(0);
    }
}