import crypto from 'crypto';
import { FIELD_MODULUS } from './constants.ts';

export function sha256(buf: Uint8Array): Uint8Array {
    return new Uint8Array(crypto.createHash('sha256').update(buf).digest());
}

// Convert hex string to Field (bigint)
// Applies modulo to handle SHA-256 hashes that exceed BN254 field modulus
export function hexToField(hex: string): bigint {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const value = BigInt('0x' + cleanHex);
    // Apply modulo to ensure value fits in field
    return value % FIELD_MODULUS;
}

// Convert Field to hex string (32 bytes, big-endian)
export function fieldToHex(field: bigint): string {
    return field.toString(16).padStart(64, '0');
}

// Convert Field to decimal string (for Noir inputs)
export function fieldToDecimal(field: bigint): string {
    return field.toString(10);
}

// Bigint to 32-byte Uint8Array (big-endian)
export function bigintToUint8Array(value: bigint): Uint8Array {
    const bytes = new Uint8Array(32);
    let num = value;
    for (let i = 31; i >= 0; i--) {
        bytes[i] = Number(num & 0xFFn);
        num = num >> 8n;
    }
    return bytes;
}

// 32-byte Uint8Array to bigint (big-endian)
export function uint8ArrayToBigint(bytes: Uint8Array): bigint {
    let result = 0n;
    for (let i = 0; i < bytes.length; i++) {
        result = (result << 8n) | BigInt(bytes[i]);
    }
    return result;
}