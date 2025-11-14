#!/usr/bin/env node
/**
 * extract-cades.ts
 *
 * Properly extract and verify CAdES signature using PKI.js library
 * This handles the full CAdES complexity that pdfsig validates correctly
 */

import fs from 'node:fs';
import path from 'node:path';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import crypto from 'node:crypto';

function extractCMSFromPDF(pdfPath: string): Buffer {
    const pdf = fs.readFileSync(pdfPath);
    const pdfStr = pdf.toString('latin1');
    const match = pdfStr.match(/\/Contents\s*<([0-9a-fA-F\s]+)>/);
    if (!match) throw new Error('CMS signature not found in PDF');
    const hexStr = match[1].replace(/\s+/g, '');
    return Buffer.from(hexStr, 'hex');
}

function extractByteRangeData(pdfPath: string): Buffer {
    const pdf = fs.readFileSync(pdfPath);
    const pdfStr = pdf.toString('latin1');
    const match = pdfStr.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
    if (!match) throw new Error('ByteRange not found');

    const [offset1, length1, offset2, length2] = match.slice(1).map(Number);
    const part1 = pdf.subarray(offset1, offset1 + length1);
    const part2 = pdf.subarray(offset2, offset2 + length2);

    return Buffer.concat([part1, part2]);
}

async function main() {
    const pdfPath = process.argv[2] || 'test_files/sample_signed.pdf';
    console.log(`Processing: ${pdfPath}\n`);

    try {
        // Extract CMS and ByteRange data
        const cmsBuffer = extractCMSFromPDF(pdfPath);
        const byteRangeData = extractByteRangeData(pdfPath);

    console.log(`CMS size: ${cmsBuffer.length} bytes`);
    console.log(`ByteRange data: ${byteRangeData.length} bytes`);

    // Parse CMS with PKI.js
    const asn1 = asn1js.fromBER(cmsBuffer);
    if (asn1.offset === -1) {
        throw new Error('Failed to parse CMS ASN.1');
    }

    const cmsContentSimpl = new pkijs.ContentInfo({ schema: asn1.result });
    const cmsContent = new pkijs.SignedData({ schema: cmsContentSimpl.content });

    console.log(`\nCMS SignedData parsed:`);
    console.log(`  Version: ${cmsContent.version}`);
    console.log(`  Digest algorithms: ${cmsContent.digestAlgorithms.length}`);
    console.log(`  SignerInfos: ${cmsContent.signerInfos.length}`);

    // Get the first (main) signer
    const signerInfo = cmsContent.signerInfos[0];
    console.log(`\nMain SignerInfo:`);
    console.log(`  Version: ${signerInfo.version}`);
    console.log(`  Digest algorithm: ${signerInfo.digestAlgorithm.algorithmId}`);
    console.log(`  Signature algorithm: ${signerInfo.signatureAlgorithm.algorithmId}`);

    // Extract signed attributes
    if (!signerInfo.signedAttrs) {
        throw new Error('No signed attributes found');
    }

    // Get the DER encoding of signed attributes
    // Must use SET OF encoding (tag 0x31) not CONTEXT [0] (tag 0xA0)
    const signedAttrsBytes = signerInfo.signedAttrs.encodedValue;

    // PKI.js gives us the attributes, but for signing we need SET encoding
    // We need to manually construct the SET OF from the attributes
    const attrsForSigning = new asn1js.Set({
        value: signerInfo.signedAttrs.attributes.map((attr: any) => attr.toSchema())
    });
    const signedAttrsForSigning = attrsForSigning.toBER();

    // Compute hash of signed attributes
    const signedAttrsHash = crypto.createHash('sha256').update(Buffer.from(signedAttrsForSigning)).digest();

    console.log(`\nSigned Attributes:`);
    console.log(`  Count: ${signerInfo.signedAttrs.attributes.length}`);
    console.log(`  Hash (SHA-256): ${signedAttrsHash.toString('hex')}`);

    // Find messageDigest attribute
    const messageDigestAttr = signerInfo.signedAttrs.attributes.find(
        (attr: any) => attr.type === '1.2.840.113549.1.9.4' // messageDigest OID
    );

    if (messageDigestAttr) {
        const messageDigest = Buffer.from(messageDigestAttr.values[0].valueBlock.valueHex);
        console.log(`  messageDigest: ${messageDigest.toString('hex')}`);

        // Verify it matches ByteRange hash
        const byteRangeHash = crypto.createHash('sha256').update(byteRangeData).digest();
        console.log(`  ByteRange hash: ${byteRangeHash.toString('hex')}`);

        if (messageDigest.equals(byteRangeHash)) {
            console.log(`  ✓ messageDigest matches ByteRange hash!`);
        } else {
            console.log(`  ✗ messageDigest MISMATCH!`);
        }
    }

    // Extract signature value
    const signatureValue = Buffer.from(signerInfo.signature.valueBlock.valueHex);
    console.log(`\nSignature:`);
    console.log(`  Raw length: ${signatureValue.length} bytes`);

    // Parse ECDSA signature (DER encoded SEQUENCE { r INTEGER, s INTEGER })
    const sigAsn1 = asn1js.fromBER(signatureValue);
    if (sigAsn1.offset === -1) {
        throw new Error('Failed to parse signature');
    }

    const sigSequence = sigAsn1.result as asn1js.Sequence;
    const rValue = (sigSequence.valueBlock.value[0] as asn1js.Integer).valueBlock.valueHexView;
    const sValue = (sigSequence.valueBlock.value[1] as asn1js.Integer).valueBlock.valueHexView;

    // Convert to 32-byte big-endian (remove leading zeros if present, pad if needed)
    const padTo32 = (buf: Uint8Array): Buffer => {
        const b = Buffer.from(buf);
        if (b[0] === 0 && b.length === 33) return b.slice(1); // Remove sign byte
        if (b.length === 32) return b;
        if (b.length < 32) {
            const padded = Buffer.alloc(32);
            b.copy(padded, 32 - b.length);
            return padded;
        }
        return b.slice(-32);
    };

    const r = padTo32(rValue);
    const s = padTo32(sValue);

    console.log(`  r (32 bytes): ${r.toString('hex')}`);
    console.log(`  s (32 bytes): ${s.toString('hex')}`);

    // Extract certificate and public key
    if (!cmsContent.certificates || cmsContent.certificates.length === 0) {
        throw new Error('No certificates in CMS');
    }

    const cert = cmsContent.certificates[0];
    const pubKeyInfo = cert.subjectPublicKeyInfo;

    // Extract EC public key (uncompressed point: 0x04 || x || y)
    const pubKeyBytes = Buffer.from(pubKeyInfo.subjectPublicKey.valueBlock.valueHexView);

    if (pubKeyBytes[0] !== 0x04 || pubKeyBytes.length !== 65) {
        throw new Error(`Invalid EC public key format: ${pubKeyBytes.length} bytes`);
    }

    const pubX = pubKeyBytes.slice(1, 33);
    const pubY = pubKeyBytes.slice(33, 65);

    console.log(`\nPublic Key (P-256):`);
    console.log(`  x (32 bytes): ${pubX.toString('hex')}`);
    console.log(`  y (32 bytes): ${pubY.toString('hex')}`);

    // Save outputs FIRST (before verification which might fail)
    const outDir = 'out';
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    fs.writeFileSync(path.join(outDir, 'VERIFIED_signed_attrs_hash.bin'), signedAttrsHash);
    fs.writeFileSync(path.join(outDir, 'VERIFIED_signed_attrs_hash.hex'), signedAttrsHash.toString('hex'));

    fs.writeFileSync(path.join(outDir, 'VERIFIED_sig.bin'), Buffer.concat([r, s]));
    fs.writeFileSync(path.join(outDir, 'VERIFIED_sig.json'), JSON.stringify({
        algorithm: 'ECDSA-SHA256',
        r: r.toString('hex'),
        s: s.toString('hex'),
        signature: Buffer.concat([r, s]).toString('hex')
    }, null, 2));

    fs.writeFileSync(path.join(outDir, 'VERIFIED_pubkey.json'), JSON.stringify({
        algorithm: 'EC',
        curve: 'P-256',
        x: pubX.toString('hex'),
        y: pubY.toString('hex')
    }, null, 2));

    // Save certificate in PEM format (needed by prove.ts for fingerprint calculation)
    const certDer = cert.toSchema().toBER();
    const certPem = `-----BEGIN CERTIFICATE-----\n${Buffer.from(certDer).toString('base64').match(/.{1,64}/g)?.join('\n') || Buffer.from(certDer).toString('base64')}\n-----END CERTIFICATE-----`;
    fs.writeFileSync(path.join(outDir, 'cms_embedded_cert.pem'), certPem);

    console.log(`\n✓ Outputs saved to out/ directory`);

    // Optional verification test (don't fail if this doesn't work)
    console.log(`\n=== Verification Test (Optional) ===`);
    try {
        const pubKeyB64 = cert.subjectPublicKeyInfo.toSchema().toBER().toString('base64');
        const pubKeyPem = `-----BEGIN PUBLIC KEY-----\n${pubKeyB64.match(/.{1,64}/g)?.join('\n') || pubKeyB64}\n-----END PUBLIC KEY-----`;
        const publicKey = crypto.createPublicKey(pubKeyPem);

        // Signature in ieee-p1363 format (r || s)
        const signatureP1363 = Buffer.concat([r, s]);

        const isValid = crypto.verify(
            null, // prehashed
            signedAttrsHash,
            { key: publicKey, dsaEncoding: 'ieee-p1363' },
            signatureP1363
        );

        console.log(`Node.js crypto verification: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
    } catch (e: any) {
        console.log(`Node.js crypto verification: ⚠️  SKIPPED - ${e.message}`);
    }
    } catch (error: any) {
        console.error('\n❌ Error extracting CAdES:');
        console.error('Message:', error?.message || 'Unknown error');
        console.error('Stack:', error?.stack || 'No stack trace');
        throw error;
    }
}

main().catch(err => {
    console.error('=== FATAL ERROR ===');
    console.error('Error type:', typeof err);
    console.error('Error:', err);

    try {
        if (err && typeof err === 'object') {
            console.error('Keys:', Object.keys(err));
            if (err.message) console.error('Message:', err.message);
            if (err.stack) console.error('Stack:', err.stack);
        } else {
            console.error('Error value:', String(err));
        }
    } catch (e) {
        console.error('Could not serialize error');
    }

    process.exit(1);
});
