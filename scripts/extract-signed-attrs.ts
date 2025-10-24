#!/usr/bin/env node
/**
 * extract-signed-attrs.ts
 *
 * Extracts the SignedAttributes from CMS and computes the hash that was actually signed.
 * In PAdES, the signature is over DER-encoded SignedAttributes, not the document hash directly.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

function extractSignatureFromPDF(pdfBuffer: Buffer): Buffer | null {
    const pdfStr = pdfBuffer.toString('latin1');
    const match = pdfStr.match(/\/Contents\s*<([0-9a-fA-F\s]+)>/);
    if (!match) return null;
    const hexStr = match[1].replace(/\s+/g, '');
    return Buffer.from(hexStr, 'hex');
}

function findSignedAttributes(cmsBuffer: Buffer): Buffer | null {
    // SignedAttributes are tagged with [0] (context-specific, tag 0)
    // Look for: A0 [length] [SignedAttributes as SET]

    for (let i = 0; i < cmsBuffer.length - 100; i++) {
        if (cmsBuffer[i] === 0xA0) {
            const len = cmsBuffer[i + 1];
            if (len & 0x80) {
                // Long form - skip for now, look for short form
                continue;
            }

            // Next should be SET (0x31)
            if (cmsBuffer[i + 2] === 0x31) {
                const setLen = cmsBuffer[i + 3];
                if (setLen & 0x80) continue;

                // Extract the SignedAttributes
                // For signing, we use 0x31 (SET) instead of 0xA0
                const signedAttrs = Buffer.concat([
                    Buffer.from([0x31, setLen]),
                    cmsBuffer.slice(i + 4, i + 4 + setLen)
                ]);

                // Verify it contains the messageDigest attribute (OID 1.2.840.113549.1.9.4)
                const mdOID = Buffer.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x04]);
                if (signedAttrs.includes(mdOID)) {
                    return signedAttrs;
                }
            }
        }
    }

    return null;
}

function extractMessageDigest(signedAttrs: Buffer): Buffer | null {
    // Find messageDigest OID and extract its value
    const mdOID = Buffer.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x04]);

    const oidPos = signedAttrs.indexOf(mdOID);
    if (oidPos === -1) return null;

    // After OID, there's a SET containing an OCTET STRING with the digest
    let pos = oidPos + mdOID.length;

    // Expect SET (0x31)
    if (signedAttrs[pos] !== 0x31) return null;
    pos++;
    const setLen = signedAttrs[pos++];

    // Expect OCTET STRING (0x04)
    if (signedAttrs[pos] !== 0x04) return null;
    pos++;
    const digestLen = signedAttrs[pos++];

    return signedAttrs.slice(pos, pos + digestLen);
}

async function main() {
    const pdfPath = process.argv[2] || 'test_files/sample_signed.pdf';

    console.log(`Reading PDF: ${pdfPath}`);
    const pdfBuffer = fs.readFileSync(pdfPath);

    const cmsBuffer = extractSignatureFromPDF(pdfBuffer);
    if (!cmsBuffer) {
        console.error('Error: CMS signature not found');
        process.exit(1);
    }

    console.log(`CMS length: ${cmsBuffer.length} bytes`);

    const signedAttrs = findSignedAttributes(cmsBuffer);
    if (!signedAttrs) {
        console.error('Error: SignedAttributes not found');
        process.exit(1);
    }

    console.log(`\nSignedAttributes found (${signedAttrs.length} bytes)`);
    console.log(`Hex: ${signedAttrs.toString('hex')}`);

    // Compute SHA-256 of SignedAttributes
    const signedAttrsHash = crypto.createHash('sha256').update(signedAttrs).digest();
    console.log(`\nSHA-256(SignedAttributes): ${signedAttrsHash.toString('hex')}`);

    // Extract the embedded messageDigest
    const embeddedDigest = extractMessageDigest(signedAttrs);
    if (embeddedDigest) {
        console.log(`Embedded messageDigest:    ${embeddedDigest.toString('hex')}`);

        // Compare with our computed document hash
        const docHash = fs.readFileSync('out/doc_hash.hex', 'utf-8').trim();
        console.log(`Document hash (ByteRange): ${docHash}`);

        if (embeddedDigest.toString('hex') === docHash) {
            console.log('✓ Embedded digest matches document hash!');
        } else {
            console.log('✗ Digest mismatch!');
        }
    }

    // Save the hash that was actually signed
    const outDir = 'out';
    fs.writeFileSync(path.join(outDir, 'signed_attrs.bin'), signedAttrs);
    fs.writeFileSync(path.join(outDir, 'signed_attrs_hash.bin'), signedAttrsHash);
    fs.writeFileSync(path.join(outDir, 'signed_attrs_hash.hex'), signedAttrsHash.toString('hex'));

    console.log(`\nOutputs written:`);
    console.log(`  out/signed_attrs.bin - The actual SignedAttributes`);
    console.log(`  out/signed_attrs_hash.bin - Hash that was signed (use this for proof!)`);
    console.log(`  out/signed_attrs_hash.hex`);
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
