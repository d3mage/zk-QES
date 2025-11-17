import crypto from 'crypto';

export function sha256(buf: Uint8Array): Uint8Array {
    return new Uint8Array(crypto.createHash('sha256').update(buf).digest());
}
