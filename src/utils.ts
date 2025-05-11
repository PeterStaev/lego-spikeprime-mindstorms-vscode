import CRC32 = require("crc-32");
import * as crypto from "crypto";

const CRC32_ALIGNMENT = 4;
const randomStringChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-".split("");

// TODO: Possibly remove this as it won't be used?
export function getRandomString(length: number) {
    const randomBytes = crypto.randomBytes(length);
    const result: string[] = [];

    for (const byte of randomBytes) {
        result.push(randomStringChars[byte % randomStringChars.length]);
    }

    return result.join("");
}

export function setTimeoutAsync(callback: () => void, delay: number) {
    return new Promise<void>((resolve) => {
        setTimeout(() => {
            callback();
            resolve();
        }, delay);
    });
}

export function crc32WithAlignment(data: Uint8Array, seed = 0): number {
    const remainder = data.length % CRC32_ALIGNMENT;
    const alignedData = new Uint8Array(data.length + (CRC32_ALIGNMENT - remainder) % CRC32_ALIGNMENT);
    alignedData.set(data);

    return CRC32.buf(alignedData, seed);
}