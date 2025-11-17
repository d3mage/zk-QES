import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getByteRangeHash } from "./byte-range.ts";
import { extractSignatureFromPDF } from './signature.ts';
import { createMerkleTreeFromAllowlist } from './tree.ts';

// BN254 field modulus (same as in Noir circuit)
const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

async function main() {
    console.log('=== ECDSA PAdES Signature Preparation ===\n');

    const pdfPath = '../../examples/ECDSA/Test.pdf';
    console.log(`[1/5] Reading PDF: ${pdfPath}`);

    if (!fs.existsSync(pdfPath)) {
        throw new Error(`File not found: ${pdfPath}`);
    }
    const pdfBuffer = fs.readFileSync(pdfPath);

    const is_timestamp = false;
    let outDir = 'out';
    if (is_timestamp) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0];
        outDir = `out-${timestamp}`;
    }

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    console.log(`\n[2/5] Computing document hash (ByteRange)...`);
    const byteRangeHash = await getByteRangeHash(pdfBuffer, true, outDir);

    console.log(`\n[3/5] Extracting signature and certificate...`);
    const extractedData = await extractSignatureFromPDF(pdfBuffer, outDir);

    console.log(`\n[4/5] Computing signer fingerprint...`);
    const signer_fpr_bytes = crypto.createHash('sha256').update(extractedData.certificate).digest();
    const signer_fpr_hex = signer_fpr_bytes.toString('hex');

    const signer_fpr_raw = BigInt('0x' + signer_fpr_hex);
    const signer_fpr = (signer_fpr_raw % FIELD_MODULUS).toString();

    console.log(`  Fingerprint (hex):     ${signer_fpr_hex}`);
    console.log(`  Fingerprint (decimal): ${signer_fpr}`);

    console.log(`\n[5/5] Building Merkle tree from allowlist...`);
    const allowlistPath = 'allowlist.json';
    if (!fs.existsSync(allowlistPath)) {
        throw new Error(`File not found: ${allowlistPath}`);
    }

    const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf-8'));
    await createMerkleTreeFromAllowlist(allowlist, outDir);

    console.log(`\n[6/6] Loading Merkle proof for signer...`);
    const proofPath = path.join(outDir, 'tree-poseidon', `${signer_fpr_hex}.json`);
    
    if (!fs.existsSync(proofPath)) {
        console.error(`\n❌ ERROR: Signer not found in allowlist!`);
        console.error(`   Signer fingerprint: ${signer_fpr_hex}`);
        console.error(`   Expected proof at:  ${proofPath}`);
        console.error(`\n   The certificate used to sign this PDF is not in the allowlist.`);
        process.exit(1);
    }

    const proofData = JSON.parse(fs.readFileSync(proofPath, 'utf-8'));
    console.log(`  ✓ Signer found in allowlist (index ${proofData.index})`);
    console.log(`  ✓ Merkle proof loaded`);

    const pathsPoseidonDir = path.join(outDir, 'paths-poseidon');
    if (!fs.existsSync(pathsPoseidonDir)) {
        fs.mkdirSync(pathsPoseidonDir, { recursive: true });
    }
    fs.copyFileSync(proofPath, path.join(pathsPoseidonDir, `${signer_fpr_hex}.json`));
}

main().catch(err => {
    console.error('\n❌ ERROR:', err.message);
    if (err.stack) {
        console.error(err.stack);
    }
    process.exit(1);
});
