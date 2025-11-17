import fs from 'node:fs';
import { hashByteRange } from "./byte-range.ts";
import { extractSignatureFromPDF } from './extract-sig.ts';
import { createMerkleTreeFromAllowlist } from './build-tree.ts';

async function main() {
    console.log('Running');
    let isDump: boolean = false;

    const pdfPath = '../../examples/ECDSA/Test.pdf';
    console.log(`Reading PDF: ${pdfPath}`);

    if (!fs.existsSync(pdfPath)) {
        throw new Error(`File not found: ${pdfPath}`);
    }

    const pdfBuffer = fs.readFileSync(pdfPath);

    const outDir = 'out';
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    await hashByteRange(pdfBuffer, isDump, outDir);
    await extractSignatureFromPDF(pdfBuffer, outDir);

    const allowlistPath = 'allowlist.json';
    if (!fs.existsSync(allowlistPath)) {
        throw new Error(`File not found: ${allowlistPath}`);
    }

    const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf-8'));
    await createMerkleTreeFromAllowlist(allowlist, outDir);
}

main().catch((err) => {
    console.error('\n❌ Failed:');
    console.error(err.message);
    console.error('\nStack trace:');
    console.error(err.stack);
    process.exit(1);
});
