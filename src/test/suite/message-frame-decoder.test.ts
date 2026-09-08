import * as assert from "assert";

import { MessageFrameDecoder } from "../../message-frame-decoder";

suite("Message Frame Decoder Test Suite", () => {
    test("Emits a complete frame unchanged", () => {
        const decoder = new MessageFrameDecoder();

        assert.deepStrictEqual(decoder.decode(Uint8Array.from([0x10, 0x11, 0x02])), [
            Uint8Array.from([0x10, 0x11, 0x02]),
        ]);
    });

    test("Buffers a frame split across chunks", () => {
        const decoder = new MessageFrameDecoder();

        assert.deepStrictEqual(decoder.decode(Uint8Array.from([0x10])), []);
        assert.deepStrictEqual(decoder.decode(Uint8Array.from([0x11])), []);
        assert.deepStrictEqual(decoder.decode(Uint8Array.from([0x02])), [
            Uint8Array.from([0x10, 0x11, 0x02]),
        ]);
    });

    test("Emits multiple complete frames in order", () => {
        const decoder = new MessageFrameDecoder();

        assert.deepStrictEqual(decoder.decode(Uint8Array.from([0x10, 0x02, 0x20, 0x02])), [
            Uint8Array.from([0x10, 0x02]),
            Uint8Array.from([0x20, 0x02]),
        ]);
    });

    test("Emits a complete frame and retains a partial frame", () => {
        const decoder = new MessageFrameDecoder();

        assert.deepStrictEqual(decoder.decode(Uint8Array.from([0x10, 0x02, 0x20])), [
            Uint8Array.from([0x10, 0x02]),
        ]);
        assert.deepStrictEqual(decoder.decode(Uint8Array.from([0x21, 0x02])), [
            Uint8Array.from([0x20, 0x21, 0x02]),
        ]);
    });

    test("Completes a partial frame followed by another complete frame", () => {
        const decoder = new MessageFrameDecoder();

        assert.deepStrictEqual(decoder.decode(Uint8Array.from([0x10])), []);
        assert.deepStrictEqual(decoder.decode(Uint8Array.from([0x11, 0x02, 0x20, 0x02])), [
            Uint8Array.from([0x10, 0x11, 0x02]),
            Uint8Array.from([0x20, 0x02]),
        ]);
    });

    test("Reset discards an incomplete frame", () => {
        const decoder = new MessageFrameDecoder();

        assert.deepStrictEqual(decoder.decode(Uint8Array.from([0x10])), []);
        decoder.reset();
        assert.deepStrictEqual(decoder.decode(Uint8Array.from([0x20, 0x02])), [
            Uint8Array.from([0x20, 0x02]),
        ]);
    });

    test("Empty chunks do not emit frames or corrupt buffered data", () => {
        const decoder = new MessageFrameDecoder();

        assert.deepStrictEqual(decoder.decode(Uint8Array.from([0x10])), []);
        assert.deepStrictEqual(decoder.decode(new Uint8Array(0)), []);
        assert.deepStrictEqual(decoder.decode(Uint8Array.from([0x02])), [
            Uint8Array.from([0x10, 0x02]),
        ]);
    });
});