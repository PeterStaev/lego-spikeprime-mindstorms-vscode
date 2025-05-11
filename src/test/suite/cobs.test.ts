/* eslint-disable no-undef */
import * as assert from "assert";
import { TextEncoder } from "util";
import * as vscode from "vscode";

import { decode, encode, pack, unpack } from "../../cobs";

const TEST_CASES: Array<[Uint8Array, Uint8Array]> = [
    [
        new Uint8Array([
            0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 84, 234, 54, 0, 45, 23, 12,
        ]),
        new Uint8Array([
            0, 84, 168, 4, 0, 7, 6, 5, 84, 168, 10, 0, 7, 6, 87, 233, 53, 5, 46,
            20, 15, 2,
        ]),
    ],
    [
        new Uint8Array([
            255, 254, 223, 213, 125, 175, 100, 97, 54, 21, 65, 45,
        ]),
        new Uint8Array([
            12, 252, 253, 220, 214, 126, 172, 103, 98, 53, 22, 66, 46, 2,
        ]),
    ],
    [
        new Uint8Array([
            10, 3, 0, 61, 91, 151, 0, 185, 217, 87, 112, 195, 221, 207, 216, 40,
            63, 220, 253, 42, 248, 85, 195, 175, 6, 126, 181, 50, 23, 174, 250,
            255, 3, 183, 30, 224, 14, 2, 199, 86, 57, 227, 0, 242, 234, 255, 194,
            243, 107, 162, 105, 235, 251, 177, 77, 73, 93, 187, 122, 149, 235,
            171, 213, 7, 93, 177, 79, 179, 43, 244, 0, 49, 243, 10, 46, 211, 18,
            98, 107, 69, 134, 138, 196, 19, 134, 96, 95, 140, 54, 149, 187, 149,
            27, 70, 216, 79, 117, 5, 123, 237, 249, 196, 207, 167, 114, 54, 231,
            166, 213, 205, 203, 118, 61, 224, 118, 89, 107, 44, 11, 141, 68, 108,
            23, 91, 25, 18, 71, 42, 50, 212, 151, 74, 76, 136, 150, 152, 28, 45,
            145, 190, 172, 224, 129, 163, 82, 162, 237, 181, 71, 111, 92, 154,
            178, 208, 0, 101, 108, 80, 11, 173, 33, 94, 5, 253, 183, 192, 14, 215,
            22, 218, 127, 245, 41, 117, 107, 31, 117, 44,
        ]),
        new Uint8Array([
            6, 9, 0, 5, 62, 88, 148, 202, 186, 218, 84, 115, 192, 222, 204, 219,
            43, 60, 223, 254, 41, 251, 86, 192, 172, 5, 125, 182, 49, 20, 173,
            249, 252, 0, 180, 29, 227, 13, 4, 196, 85, 58, 224, 29, 241, 233, 252,
            193, 240, 104, 161, 106, 232, 248, 178, 78, 74, 94, 184, 121, 150,
            232, 168, 214, 4, 94, 178, 76, 176, 40, 247, 85, 50, 240, 9, 45, 208,
            17, 97, 104, 70, 133, 137, 199, 16, 133, 99, 92, 143, 53, 150, 184,
            150, 24, 69, 219, 76, 118, 6, 120, 238, 250, 199, 204, 164, 113, 53,
            228, 165, 214, 206, 200, 117, 62, 227, 117, 90, 104, 47, 8, 142, 71,
            111, 20, 88, 26, 17, 68, 41, 49, 215, 148, 73, 79, 139, 149, 155, 31,
            46, 146, 189, 175, 227, 130, 160, 81, 161, 238, 182, 68, 108, 95, 153,
            177, 211, 25, 102, 111, 83, 8, 174, 34, 93, 6, 254, 180, 195, 13, 212,
            21, 217, 124, 246, 42, 118, 104, 28, 118, 47, 2,
        ]),
    ],
];

suite("COBS Test Suite", () => {
    vscode.window.showInformationMessage("Start COBS tests.");

    test("Encode and decode 'Hello, World!'", () => {
        const data = new TextEncoder().encode("Hello, World!");
        const encoded = encode(data);
        const decoded = decode(encoded);
        assert.deepStrictEqual(decoded, data);
    });

    test("Pack and unpack 'Hello, World!'", () => {
        const data = new TextEncoder().encode("Hello, World!");
        const packed = pack(data);
        const unpacked = unpack(packed);
        assert.deepStrictEqual(unpacked, data);
    });

    test("Match expected packed values for test cases'", () => {
        for (const [input, expected] of TEST_CASES) {
            const packed = pack(input);
            assert.deepStrictEqual(packed, expected);
        }
    });

    test("Match expected unpacked values for test cases'", () => {
        for (const [expected, packed] of TEST_CASES) {
            const unpacked = unpack(packed);
            assert.deepStrictEqual(unpacked, expected);
        }
    });
});
