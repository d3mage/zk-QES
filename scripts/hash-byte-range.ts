#!/usr/bin/env node
/**
 * hash-byte-range.ts
 *
 * Extracts and computes the SHA-256 hash of a PAdES-signed PDF's ByteRange.
 * The ByteRange indicates which bytes of the PDF were signed.
 *
 * Usage: yarn hash-byte-range <pdf-path>
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

function sha256(buf: Uint8Array): Uint8Array {
    return new Uint8Array(crypto.createHash('sha256').update(buf).digest());
}

function parseByteRange(pdfBuffer: Buffer): number[] | null {
    // Convert to latin1 string for regex matching
    const pdfStr = pdfBuffer.toString('latin1');

    // Find /ByteRange [offset length offset length]
    // Support both space-separated and comma-separated formats
    const match = pdfStr.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);

    if (!match) {
        return null;
    }

    return [
        parseInt(match[1], 10),
        parseInt(match[2], 10),
        parseInt(match[3], 10),
        parseInt(match[4], 10)
    ];
}

async function main() {
    const pdfPath = process.argv[2];

    if (!pdfPath) {
        console.error('Usage: yarn hash-byte-range <pdf-path>');
        console.error('Example: yarn hash-byte-range test_files/sample_signed.pdf');
        process.exit(1);
    }

    if (!fs.existsSync(pdfPath)) {
        console.error(`Error: File not found: ${pdfPath}`);
        process.exit(1);
    }

    console.log(`Reading PDF: ${pdfPath}`);
    const pdfBuffer = fs.readFileSync(pdfPath);

    // Parse ByteRange
    const byteRange = parseByteRange(pdfBuffer);
    if (!byteRange) {
        console.error('Error: /ByteRange not found in PDF');
        process.exit(1);
    }

    const [offset1, length1, offset2, length2] = byteRange;
    console.log(`ByteRange: [${offset1} ${length1} ${offset2} ${length2}]`);
    console.log(`  Part 1: bytes ${offset1} to ${offset1 + length1 - 1} (length ${length1})`);
    console.log(`  Part 2: bytes ${offset2} to ${offset2 + length2 - 1} (length ${length2})`);

    // Extract the two byte ranges
    const part1 = pdfBuffer.subarray(offset1, offset1 + length1);
    const part2 = pdfBuffer.subarray(offset2, offset2 + length2);

    // Concatenate
    const combined = Buffer.concat([part1, part2]);
    console.log(`Combined length: ${combined.length} bytes`);

    // Compute SHA-256
    const digest = sha256(combined);
    const digestHex = Buffer.from(digest).toString('hex');

    console.log(`\nSHA-256 digest: ${digestHex}`);

    // Ensure output directory exists
    const outDir = 'out';
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    // Write outputs
    const binPath = path.join(outDir, 'doc_hash.bin');
    const hexPath = path.join(outDir, 'doc_hash.hex');

    fs.writeFileSync(binPath, digest);
    fs.writeFileSync(hexPath, digestHex);

    console.log(`\nOutputs written:`);
    console.log(`  Binary: ${binPath}`);
    console.log(`  Hex:    ${hexPath}`);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
