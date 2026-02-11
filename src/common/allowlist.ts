import fs from 'node:fs';
import { sha256 } from './utils.ts';

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

export function fingerprintCertificateBytes(certBytes: Uint8Array): string {
    const digest = sha256(certBytes);
    return Buffer.from(digest).toString('hex').toLowerCase();
}

export function fingerprintCertificateFile(certPath: string): string {
    const bytes = readCertificateBytes(certPath);
    return fingerprintCertificateBytes(bytes);
}

export function buildAllowlistFromCertificates(
    certPaths: string[],
    options?: { sort?: boolean },
): { cert_fingerprints: string[] } {
    const fingerprints = certPaths.map(fingerprintCertificateFile);

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
