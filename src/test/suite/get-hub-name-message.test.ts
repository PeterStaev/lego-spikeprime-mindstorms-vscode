import * as assert from "assert";

import { GetHubNameRequestMessage } from "../../messages/get-hub-name-request-message";
import { GetHubNameResponseMessage } from "../../messages/get-hub-name-response-message";

suite("Get Hub Name Message Test Suite", () => {
    test("Serializes the request message ID", () => {
        assert.deepStrictEqual(
            new GetHubNameRequestMessage().serialize(),
            Uint8Array.from([0x18]),
        );
    });

    test("Deserializes a null-terminated hub name", () => {
        const message = new GetHubNameResponseMessage();

        message.deserialize(Uint8Array.from([
            0x19,
            ...new TextEncoder().encode("My Hub"),
            0x00,
            0x41,
        ]));

        assert.strictEqual(message.name, "My Hub");
    });
});