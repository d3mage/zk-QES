import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { execSync } from 'node:child_process';

interface SignatureData {
    r: Buffer;
    s: Buffer;
}

interface PublicKeyData {
    x: Buffer;
    y: Buffer;
}

function extractCMSfromPDF(pdfBuffer: Buffer): Buffer | null {
    const pdfStr = pdfBuffer.toString('latin1');

    // Find /Contents <hex_string>
    const match = pdfStr.match(/\/Contents\s*<([0-9a-fA-F\s]+)>/);
    if (!match) {
        return null;
    }

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
    let r = derSig.subarray(offset, offset + rLen);
    offset += rLen;

    // Remove leading zero if present (for positive integers)
    if (r[0] === 0x00 && r.length > 1) {
        r = r.subarray(1);
    }

    // Parse s
    if (derSig[offset++] !== 0x02) {
        throw new Error('Invalid DER signature: expected INTEGER for s');
    }
    let sLen = derSig[offset++];
    let s = derSig.subarray(offset, offset + sLen);

    // Remove leading zero if present
    if (s[0] === 0x00 && s.length > 1) {
        s = s.subarray(1);
    }

    // Pad to 32 bytes (P-256)
    const padTo32 = (buf: Buffer): Buffer => {
        if (buf.length === 32) return buf;
        if (buf.length < 32) {
            const padded = Buffer.alloc(32);
            buf.copy(padded, 32 - buf.length);
            return padded;
        }
        return buf.subarray(-32); // Take last 32 bytes if longer
    };

    return {
        r: padTo32(r),
        s: padTo32(s)
    };
}

function extractSignatureFromCMS(cmsBuffer: Buffer): SignatureData {
    // Look for signature algorithm OID
    const ecdsaWithSHA256OID = Buffer.from([0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02]);
    if (!cmsBuffer.includes(ecdsaWithSHA256OID)) {
        throw new Error('Error: CMS is not ECDSA');
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
    const derSig = cmsBuffer.subarray(sigStart, sigStart + 2 + sigLen);

    const { r, s } = parseECDSASignature(derSig);

    return {
        r,
        s
    };
}

function extractCertificateFromCMS(cmsBuffer: Buffer): Buffer {
    // Use openssl to extract certificate from PKCS7/CMS structure
    // This is more reliable than manual parsing
    const tempCmsFile = '/tmp/cms_temp.der';
    const tempCertFile = '/tmp/cert_temp.pem';
    const tempCertDerFile = '/tmp/cert_temp.der';

    try {
        fs.writeFileSync(tempCmsFile, cmsBuffer);

        // Extract certificate using openssl
        execSync(`openssl pkcs7 -inform DER -in ${tempCmsFile} -print_certs -out ${tempCertFile} 2>/dev/null`);
        
        // Convert PEM to DER
        execSync(`openssl x509 -in ${tempCertFile} -outform DER -out ${tempCertDerFile} 2>/dev/null`);
        
        const certBuffer = fs.readFileSync(tempCertDerFile);

        fs.unlinkSync(tempCmsFile);
        fs.unlinkSync(tempCertFile);
        fs.unlinkSync(tempCertDerFile);

        return certBuffer;
    } catch (error) {
        try {
            if (fs.existsSync(tempCmsFile)) fs.unlinkSync(tempCmsFile);
            if (fs.existsSync(tempCertFile)) fs.unlinkSync(tempCertFile);
            if (fs.existsSync(tempCertDerFile)) fs.unlinkSync(tempCertDerFile);
        } catch {}
        
        throw new Error(`Failed to extract certificate from CMS: ${error}`);
    }
}

function extractPublicKey(certBuffer: Buffer): PublicKeyData {
    const certPem = `-----BEGIN CERTIFICATE-----\n${certBuffer.toString('base64').match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`;

    const x509 = new crypto.X509Certificate(certPem);

    const pubKeyObj = x509.publicKey;
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

    const uncompressed = pubKeyDer.subarray(keyStart, keyStart + 65);
    if (uncompressed[0] !== 0x04 || uncompressed.length !== 65) {
        throw new Error('Invalid EC public key format');
    }

    const x = uncompressed.subarray(1, 33);
    const y = uncompressed.subarray(33, 65);

    return {
        x,
        y
    };
}

export async function extractSignatureFromPDF(pdfBuffer: Buffer, outDir: string) {
    const cmsBuffer = extractCMSfromPDF(pdfBuffer);
    if (!cmsBuffer) {
        throw new Error('Error: CMS not found in PDF');
    }

    console.log(`CMS length: ${cmsBuffer.length} bytes`);

    const sigData = extractSignatureFromCMS(cmsBuffer);
    console.log(`  r (32 bytes): ${sigData.r.toString('hex')}`);
    console.log(`  s (32 bytes): ${sigData.s.toString('hex')}`);

    console.log(`\nExtracting certificate from CMS...`);
    const certBuffer = extractCertificateFromCMS(cmsBuffer);
    console.log(`Certificate extracted (${certBuffer.length} bytes)`);

    const pubKeyData = extractPublicKey(certBuffer);
    console.log(`  x (32 bytes): ${pubKeyData.x.toString('hex')}`);
    console.log(`  y (32 bytes): ${pubKeyData.y.toString('hex')}`);

    // Write outputs
    const sigJsonPath = path.join(outDir, 'sig.json');
    const pubkeyJsonPath = path.join(outDir, 'pubkey.json');
    const sigBinPath = path.join(outDir, 'sig.bin');
    const pubkeyBinPath = path.join(outDir, 'pubkey.bin');
    const certDerPath = path.join(outDir, 'cert.der');
    const certPemPath = path.join(outDir, 'cert.pem');

    fs.writeFileSync(sigJsonPath, JSON.stringify({
        r: sigData.r.toString('hex'),
        s: sigData.s.toString('hex'),
        signature: Buffer.concat([sigData.r, sigData.s]).toString('hex')
    }, null, 2));

    fs.writeFileSync(pubkeyJsonPath, JSON.stringify({
        x: pubKeyData.x.toString('hex'),
        y: pubKeyData.y.toString('hex')
    }, null, 2));

    fs.writeFileSync(sigBinPath, Buffer.concat([sigData.r, sigData.s]));
    fs.writeFileSync(pubkeyBinPath, Buffer.concat([pubKeyData.x, pubKeyData.y]));

    fs.writeFileSync(certDerPath, certBuffer);
    const certPem = `-----BEGIN CERTIFICATE-----\n${certBuffer.toString('base64').match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`;
    fs.writeFileSync(certPemPath, certPem);

    console.log(`\nOutputs written:`);
    console.log(`  ${sigJsonPath}`);
    console.log(`  ${pubkeyJsonPath}`);
    console.log(`  ${sigBinPath} (r || s, 64 bytes)`);
    console.log(`  ${pubkeyBinPath} (x || y, 64 bytes)`);
    console.log(`  ${certDerPath} (certificate in DER format)`);
    console.log(`  ${certPemPath} (certificate in PEM format)`);
}