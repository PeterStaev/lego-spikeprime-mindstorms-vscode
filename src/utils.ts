import * as crypto from "crypto";

const randomStringChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-".split("");

export function getRandomString(length: number) {
    const randomBytes = crypto.randomBytes(length);
    const result: string[] = [];

    for (const byte of randomBytes) {
        result.push(randomStringChars[byte % randomStringChars.length]);
    }

    return result.join("");
}