import CRC32 = require("crc-32");

const CRC32_ALIGNMENT = 4;


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