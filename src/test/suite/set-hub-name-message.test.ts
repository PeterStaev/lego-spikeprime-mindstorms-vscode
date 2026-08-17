import * as assert from "assert";

import { SetHubNameRequestMessage } from "../../messages/set-hub-name-request-message";

suite("Set Hub Name Message Test Suite", () => {
    test("Serializes a null-terminated hub name", () => {
        assert.deepStrictEqual(
            new SetHubNameRequestMessage("My Hub").serialize(),
            Uint8Array.from([
                0x16,
                ...new TextEncoder().encode("My Hub"),
                0x00,
            ]),
        );
    });

    test("Rejects a hub name longer than 29 UTF-8 bytes", () => {
        assert.throws(
            () => new SetHubNameRequestMessage("a".repeat(30)).serialize(),
            /29 bytes or fewer/,
        );
    });
});