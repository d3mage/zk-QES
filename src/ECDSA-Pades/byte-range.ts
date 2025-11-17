import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from './utils.ts';

function parseByteRange(pdfBuffer: Buffer): number[] | null {
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

export async function getByteRangeHash(pdfBuffer: Buffer, isDump: boolean = false, outDir: string): Promise<string> {

    const byteRange = parseByteRange(pdfBuffer);
    if (!byteRange) {
        throw new Error('Error: /ByteRange not found in PDF');
    }

    const [offset1, length1, offset2, length2] = byteRange;
    console.log(`ByteRange: [${offset1} ${length1} ${offset2} ${length2}]`);
    console.log(`  Part 1: bytes ${offset1} to ${offset1 + length1 - 1} (length ${length1})`);
    console.log(`  Part 2: bytes ${offset2} to ${offset2 + length2 - 1} (length ${length2})`);

    const part1 = pdfBuffer.subarray(offset1, offset1 + length1);
    const part2 = pdfBuffer.subarray(offset2, offset2 + length2);

    const combined = Buffer.concat([part1, part2]);
    console.log(`Combined length: ${combined.length} bytes`);

    const digest = sha256(combined);
    const digestHex = Buffer.from(digest).toString('hex');
    console.log(`\nSHA-256 digest: ${digestHex}`);

    if (isDump) {
        const binPath = path.join(outDir, 'doc_hash.bin');
        // const hexPath = path.join(outDir, 'doc_hash.hex');

        fs.writeFileSync(binPath, digest);
        // fs.writeFileSync(hexPath, digestHex);

        console.log(`\nOutputs written:`);
        console.log(`  Binary: ${binPath}`);
        // console.log(`  Hex:    ${hexPath}`);
    }
    return digestHex;
}