import fs from 'node:fs';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { sha256 } from './utils.ts';
import { modulusToLimbsBigint, serializeRsaFingerprintBytes } from './rsa.ts';

const PEM_BEGIN = '-----BEGIN CERTIFICATE-----';
const PEM_END = '-----END CERTIFICATE-----';

export function readCertificateBytes(certPath: string): Buffer {
    const raw = fs.readFileSync(certPath);
    const text = raw.toString('utf-8');

    if (text.includes(PEM_BEGIN)) {
        const base64 = text
            .replace(PEM_BEGIN, '')
            .replace(PEM_END, '')
            .replace(/\s+/g, '');
        return Buffer.from(base64, 'base64');
    }

    return raw;
}

export function extractPublicKeyFingerprintBytes(certBytes: Uint8Array): Uint8Array {
    const asn1 = asn1js.fromBER(certBytes);
    if (asn1.offset === -1) {
        throw new Error('Failed to parse certificate ASN.1');
    }

    const cert = new pkijs.Certificate({ schema: asn1.result });
    const spki = cert.subjectPublicKeyInfo;
    const algOid = spki.algorithm.algorithmId;

    // ECDSA P-256: subjectPublicKey is uncompressed EC point 0x04 || X || Y
    if (algOid === '1.2.840.10045.2.1') {
        const pubKeyBytes = Buffer.from(spki.subjectPublicKey.valueBlock.valueHexView);
        if (pubKeyBytes.length !== 65 || pubKeyBytes[0] !== 0x04) {
            throw new Error(`Unexpected EC public key format: ${pubKeyBytes.length} bytes`);
        }
        return pubKeyBytes.slice(1); // X || Y (64 bytes)
    }

    // RSA: subjectPublicKey is a BIT STRING containing RSAPublicKey ::= SEQUENCE { n, e }
    if (algOid === '1.2.840.113549.1.1.1') {
        const pubAsn1 = asn1js.fromBER(spki.subjectPublicKey.valueBlock.valueHex);
        if (pubAsn1.offset === -1) {
            throw new Error('Failed to parse RSA public key');
        }

        const pubSeq = pubAsn1.result as asn1js.Sequence;
        const modulus = pubSeq.valueBlock.value[0] as asn1js.Integer;
        const exponent = pubSeq.valueBlock.value[1] as asn1js.Integer;

        let n = Buffer.from(modulus.valueBlock.valueHexView);
        if (n.length > 0 && n[0] === 0x00) {
            n = n.slice(1);
        }

        const eBuf = Buffer.from(exponent.valueBlock.valueHexView);
        const eBigInt = BigInt(`0x${eBuf.toString('hex')}`);
        if (eBigInt > BigInt(0xffffffff)) {
            throw new Error(`RSA exponent too large for u32: ${eBigInt.toString(10)}`);
        }
        const e = Number(eBigInt);

        const limbs = modulusToLimbsBigint(n);
        return serializeRsaFingerprintBytes(limbs, e);
    }

    throw new Error(`Unsupported public key algorithm OID: ${algOid}`);
}

export function fingerprintPublicKeyFile(certPath: string): string {
    const certBytes = readCertificateBytes(certPath);
    const pubKeyBytes = extractPublicKeyFingerprintBytes(certBytes);
    const digest = sha256(pubKeyBytes);
    return Buffer.from(digest).toString('hex').toLowerCase();
}

export function buildAllowlistFromCertificates(
    certPaths: string[],
    options?: { sort?: boolean },
): { cert_fingerprints: string[] } {
    const fingerprints = certPaths.map(fingerprintPublicKeyFile);

    if (options?.sort) {
        fingerprints.sort();
    }

    const unique = new Set(fingerprints);
    if (unique.size !== fingerprints.length) {
        throw new Error('Duplicate certificate fingerprints detected in allowlist input.');
    }

    return { cert_fingerprints: fingerprints };
}

export function writeAllowlistFile(allowlist: { cert_fingerprints: string[] }, outPath: string): void {
    fs.writeFileSync(outPath, JSON.stringify(allowlist, null, 2));
}
