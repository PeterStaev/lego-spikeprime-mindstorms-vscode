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

export function setTimeoutAsync(callback: () => void, delay: number) {
    return new Promise<void>((resolve) => {
        setTimeout(() => {
            callback();
            resolve();
        }, delay);
    });
}