/* eslint-disable no-bitwise */
const DELIMITER = 0x02;
const NO_DELIMITER = 0xFF;
const COBS_CODE_OFFSET = DELIMITER;
const MAX_BLOCK_SIZE = 84;
const XOR = 3;

export function encode(data: Uint8Array): Uint8Array {
    const buffer: number[] = [];
    let codeIndex = 0;
    let block = 0;

    const beginBlock = () => {
        codeIndex = buffer.length;
        buffer.push(NO_DELIMITER); // placeholder
        block = 1;
    };

    beginBlock();

    for (const byte of data) {
        if (byte > DELIMITER) {
            buffer.push(byte);
            block++;
        }

        if (byte <= DELIMITER || block > MAX_BLOCK_SIZE) {
            if (byte <= DELIMITER) {
                const delimiterBase = byte * MAX_BLOCK_SIZE;
                const blockOffset = block + COBS_CODE_OFFSET;
                buffer[codeIndex] = delimiterBase + blockOffset;
            }
            beginBlock();
        }
    }

    buffer[codeIndex] = block + COBS_CODE_OFFSET;

    return Uint8Array.from(buffer);
}

export function decode(data: Uint8Array): Uint8Array {
    const buffer: number[] = [];

    let [value, block] = unescape(data[0]);

    for (let i = 1; i < data.length; i++) {
        const byte = data[i];
        block--;

        if (block > 0) {
            buffer.push(byte);
        }
        else {
            if (value !== null) {
                buffer.push(value);
            }
            [value, block] = unescape(byte);
        }
    }

    return Uint8Array.from(buffer);
}

export function pack(data: Uint8Array): Uint8Array {
    const buffer = encode(data);

    for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= XOR;
    }

    const result = new Uint8Array(buffer.length + 1);
    result.set(buffer);
    result[buffer.length] = DELIMITER;

    return result;
}

export function unpack(frame: Uint8Array): Uint8Array {
    let start = 0;
    if (frame[0] === 0x01) {
        start = 1;
    }

    const unframed = frame.slice(start, -1).map(byte => byte ^ XOR);
    return decode(unframed);
}

function unescape(code: number): [number | null, number] {
    if (code === NO_DELIMITER) return [null, MAX_BLOCK_SIZE + 1];

    let [value, block] = [Math.floor((code - COBS_CODE_OFFSET) / MAX_BLOCK_SIZE), (code - COBS_CODE_OFFSET) % MAX_BLOCK_SIZE];
    if (block === 0) {
        block = MAX_BLOCK_SIZE;
        value -= 1;
    }
    return [value, block];
}