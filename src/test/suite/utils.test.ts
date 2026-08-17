import * as assert from "assert";

import { formatBluetoothAddress } from "../../utils";

suite("Utils Test Suite", () => {
    test("Formats a compact Bluetooth address", () => {
        assert.strictEqual(
            formatBluetoothAddress("aabbccddeeff"),
            "AA:BB:CC:DD:EE:FF",
        );
    });

    test("Normalizes an already separated Bluetooth address", () => {
        assert.strictEqual(
            formatBluetoothAddress("aa:bb:cc:dd:ee:ff"),
            "AA:BB:CC:DD:EE:FF",
        );
    });
});