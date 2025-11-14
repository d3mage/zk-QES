#!/usr/bin/env node
/**
 * extract-cms.ts
 *
 * Extracts ECDSA signature (r, s) and public key (x, y) from a PAdES-signed PDF.
 * Parses the CMS SignedData structure and extracts the certificate's SubjectPublicKeyInfo.
 *
 * Usage: yarn extract-cms <pdf-path> <cert-path>
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

interface SignatureData {
    algorithm: string;
    r: Buffer;
    s: Buffer;
    isRSA: boolean;
}

interface PublicKeyData {
    algorithm: string;
    curve: string;
    x: Buffer;
    y: Buffer;
}

function extractSignatureFromPDF(pdfBuffer: Buffer): Buffer | null {
    const pdfStr = pdfBuffer.toString('latin1');

    // Find /Contents <hex_string>
    const match = pdfStr.match(/\/Contents\s*<([0-9a-fA-F\s]+)>/);
    if (!match) {
        return null;
    }

    // Remove whitespace and convert hex to buffer
    const hexStr = match[1].replace(/\s+/g, '');
    return Buffer.from(hexStr, 'hex');
}

function parseECDSASignature(derSig: Buffer): { r: Buffer; s: Buffer } {
    // ECDSA signature in DER format: SEQUENCE { r INTEGER, s INTEGER }
    // 0x30 [length] 0x02 [r-length] [r-bytes] 0x02 [s-length] [s-bytes]

    let offset = 0;

    // Check SEQUENCE tag
    if (derSig[offset++] !== 0x30) {
        throw new Error('Invalid DER signature: expected SEQUENCE');
    }

    // Skip sequence length
    const seqLen = derSig[offset++];
    if (seqLen & 0x80) {
        // Long form length
        const lenBytes = seqLen & 0x7f;
        offset += lenBytes;
    }

    // Parse r
    if (derSig[offset++] !== 0x02) {
        throw new Error('Invalid DER signature: expected INTEGER for r');
    }
    let rLen = derSig[offset++];
    let r = derSig.slice(offset, offset + rLen);
    offset += rLen;

    // Remove leading zero if present (for positive integers)
    if (r[0] === 0x00 && r.length > 1) {
        r = r.slice(1);
    }

    // Parse s
    if (derSig[offset++] !== 0x02) {
        throw new Error('Invalid DER signature: expected INTEGER for s');
    }
    let sLen = derSig[offset++];
    let s = derSig.slice(offset, offset + sLen);

    // Remove leading zero if present
    if (s[0] === 0x00 && s.length > 1) {
        s = s.slice(1);
    }

    // Pad to 32 bytes (P-256)
    const padTo32 = (buf: Buffer): Buffer => {
        if (buf.length === 32) return buf;
        if (buf.length < 32) {
            const padded = Buffer.alloc(32);
            buf.copy(padded, 32 - buf.length);
            return padded;
        }
        return buf.slice(-32); // Take last 32 bytes if longer
    };

    return {
        r: padTo32(r),
        s: padTo32(s)
    };
}

function extractSignatureFromCMS(cmsBuffer: Buffer): SignatureData {
    // Parse CMS SignedData to extract signature
    // For simplicity, we'll use a basic approach to find the signature value

    // Look for signature algorithm OID
    const ecdsaWithSHA256OID = Buffer.from([0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02]);
    const isECDSA = cmsBuffer.includes(ecdsaWithSHA256OID);

    if (!isECDSA) {
        return {
            algorithm: 'RSA',
            r: Buffer.alloc(0),
            s: Buffer.alloc(0),
            isRSA: true
        };
    }

    // Find the OCTET STRING containing the signature
    // CMS structure has SignerInfo with a signature field
    // We need to locate the DER-encoded ECDSA signature

    // Search for OCTET STRING tag (0x04) followed by SEQUENCE (0x30) which is the ECDSA sig
    let sigStart = -1;
    for (let i = cmsBuffer.length - 100; i >= 0; i--) {
        // Look for a 64-70 byte signature (typical ECDSA P-256 signature in DER)
        if (cmsBuffer[i] === 0x04) {
            const len = cmsBuffer[i + 1];
            if (len >= 64 && len <= 72 && cmsBuffer[i + 2] === 0x30) {
                sigStart = i + 2;
                break;
            }
        }
    }

    if (sigStart === -1) {
        throw new Error('ECDSA signature not found in CMS data');
    }

    const sigLen = cmsBuffer[sigStart + 1];
    const derSig = cmsBuffer.slice(sigStart, sigStart + 2 + sigLen);

    const { r, s } = parseECDSASignature(derSig);

    return {
        algorithm: 'ECDSA-SHA256',
        r,
        s,
        isRSA: false
    };
}

function extractPublicKey(certBuffer: Buffer): PublicKeyData {
    // Use crypto module to parse X.509 certificate
    const certPem = `-----BEGIN CERTIFICATE-----\n${certBuffer.toString('base64').match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`;

    const x509 = new crypto.X509Certificate(certPem);

    // Extract public key
    const pubKeyObj = x509.publicKey;

    // Export as DER to parse the key
    const pubKeyDer = pubKeyObj.export({ type: 'spki', format: 'der' });

    // For EC keys, the public key is in uncompressed format: 0x04 || x || y
    // Find the BIT STRING in the SubjectPublicKeyInfo
    let keyStart = -1;
    for (let i = 0; i < pubKeyDer.length - 65; i++) {
        if (pubKeyDer[i] === 0x03 && pubKeyDer[i + 1] === 0x42 && pubKeyDer[i + 2] === 0x00 && pubKeyDer[i + 3] === 0x04) {
            keyStart = i + 3;
            break;
        }
    }

    if (keyStart === -1) {
        throw new Error('EC public key not found in certificate');
    }

    const uncompressed = pubKeyDer.slice(keyStart, keyStart + 65);
    if (uncompressed[0] !== 0x04 || uncompressed.length !== 65) {
        throw new Error('Invalid EC public key format');
    }

    const x = uncompressed.slice(1, 33);
    const y = uncompressed.slice(33, 65);

    return {
        algorithm: 'EC',
        curve: 'P-256',
        x,
        y
    };
}

async function main() {
    const pdfPath = process.argv[2];
    const certPath = process.argv[3];

    if (!pdfPath || !certPath) {
        console.error('Usage: yarn extract-cms <pdf-path> <cert-path>');
        console.error('Example: yarn extract-cms test_files/sample_signed.pdf test_files/signer_cert.der');
        process.exit(1);
    }

    console.log(`Reading PDF: ${pdfPath}`);
    const pdfBuffer = fs.readFileSync(pdfPath);

    console.log(`Reading certificate: ${certPath}`);
    const certBuffer = fs.readFileSync(certPath);

    // Extract CMS data from PDF
    const cmsBuffer = extractSignatureFromPDF(pdfBuffer);
    if (!cmsBuffer) {
        console.error('Error: CMS signature not found in PDF');
        process.exit(1);
    }

    console.log(`CMS signature length: ${cmsBuffer.length} bytes`);

    // Extract signature
    const sigData = extractSignatureFromCMS(cmsBuffer);
    console.log(`Signature algorithm: ${sigData.algorithm}`);

    if (sigData.isRSA) {
        console.warn('WARNING: Signature is RSA, not ECDSA!');
        console.warn('For ZK proof, you will need to use a separate ECDSA signature.');
    } else {
        console.log(`  r (32 bytes): ${sigData.r.toString('hex')}`);
        console.log(`  s (32 bytes): ${sigData.s.toString('hex')}`);
    }

    // Extract public key
    const pubKeyData = extractPublicKey(certBuffer);
    console.log(`\nPublic key algorithm: ${pubKeyData.algorithm}`);
    console.log(`Curve: ${pubKeyData.curve}`);
    console.log(`  x (32 bytes): ${pubKeyData.x.toString('hex')}`);
    console.log(`  y (32 bytes): ${pubKeyData.y.toString('hex')}`);

    // Ensure output directory exists
    const outDir = 'out';
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    // Write outputs
    const sigJsonPath = path.join(outDir, 'VERIFIED_sig.json');
    const pubkeyJsonPath = path.join(outDir, 'VERIFIED_pubkey.json');
    const sigBinPath = path.join(outDir, 'sig.bin');
    const pubkeyBinPath = path.join(outDir, 'pubkey.bin');

    fs.writeFileSync(sigJsonPath, JSON.stringify({
        algorithm: sigData.algorithm,
        isRSA: sigData.isRSA,
        r: sigData.r.toString('hex'),
        s: sigData.s.toString('hex'),
        signature: Buffer.concat([sigData.r, sigData.s]).toString('hex')
    }, null, 2));

    fs.writeFileSync(pubkeyJsonPath, JSON.stringify({
        algorithm: pubKeyData.algorithm,
        curve: pubKeyData.curve,
        x: pubKeyData.x.toString('hex'),
        y: pubKeyData.y.toString('hex')
    }, null, 2));

    fs.writeFileSync(sigBinPath, Buffer.concat([sigData.r, sigData.s]));
    fs.writeFileSync(pubkeyBinPath, Buffer.concat([pubKeyData.x, pubKeyData.y]));

    // Save certificate in PEM format (needed by prove.ts for fingerprint calculation)
    const certPemPath = path.join(outDir, 'cms_embedded_cert.pem');
    const certPem = `-----BEGIN CERTIFICATE-----\n${certBuffer.toString('base64').match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`;
    fs.writeFileSync(certPemPath, certPem);

    console.log(`\nOutputs written:`);
    console.log(`  ${sigJsonPath}`);
    console.log(`  ${pubkeyJsonPath}`);
    console.log(`  ${sigBinPath} (r || s, 64 bytes)`);
    console.log(`  ${pubkeyBinPath} (x || y, 64 bytes)`);
    console.log(`  ${certPemPath}`);
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
