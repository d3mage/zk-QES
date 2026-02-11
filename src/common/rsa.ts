// Shared RSA helpers for fingerprint serialization

const LIMB_BITS = 120n;
const LIMB_MASK = (1n << LIMB_BITS) - 1n;

export function modulusToLimbsBigint(modulusBytes: Uint8Array): bigint[] {
    let modulus = 0n;
    for (let i = 0; i < modulusBytes.length; i++) {
        modulus = (modulus << 8n) | BigInt(modulusBytes[i]);
    }

    const limbs: bigint[] = [];
    for (let i = 0; i < 18; i++) {
        limbs.push(modulus & LIMB_MASK);
        modulus = modulus >> LIMB_BITS;
    }

    return limbs;
}

export function limbsToStrings(limbs: bigint[]): string[] {
    return limbs.map((limb) => limb.toString());
}

export function serializeRsaFingerprintBytes(limbs: bigint[], exponent: number): Uint8Array {
    if (limbs.length !== 18) {
        throw new Error(`Expected 18 RSA limbs, got ${limbs.length}`);
    }
    if (!Number.isInteger(exponent) || exponent < 0 || exponent > 0xffffffff) {
        throw new Error(`RSA exponent must fit in u32. Got ${exponent}.`);
    }

    const out = new Uint8Array(18 * 16 + 4);

    for (let i = 0; i < 18; i++) {
        let v = limbs[i];
        for (let j = 0; j < 16; j++) {
            out[i * 16 + (15 - j)] = Number(v & 0xffn);
            v >>= 8n;
        }
    }

    out[288] = (exponent >>> 24) & 0xff;
    out[289] = (exponent >>> 16) & 0xff;
    out[290] = (exponent >>> 8) & 0xff;
    out[291] = exponent & 0xff;

    return out;
}
