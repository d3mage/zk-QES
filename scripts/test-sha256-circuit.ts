#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { Noir } from '@noir-lang/noir_js';
import { UltraPlonkBackend } from '@aztec/bb.js';

const outDir = 'out';

async function main() {
    console.log('=== SHA-256 Circuit Test (Baseline) ===\n');

    console.log('[1/3] Loading SHA-256 circuit...');
    const circuit = JSON.parse(fs.readFileSync('circuits/pades_ecdsa/target/pades_ecdsa.json', 'utf-8'));
    const noir = new Noir(circuit);
    console.log('  ✓ Circuit loaded');

    console.log('\n[2/3] Loading inputs...');
    const doc_hash = new Uint8Array(fs.readFileSync(path.join(outDir, 'VERIFIED_signed_attrs_hash.bin')));
    const sig = JSON.parse(fs.readFileSync(path.join(outDir, 'VERIFIED_sig.json'), 'utf-8'));
    const pubkey = JSON.parse(fs.readFileSync(path.join(outDir, 'VERIFIED_pubkey.json'), 'utf-8'));
    const rootData = JSON.parse(fs.readFileSync(path.join(outDir, 'tl_root.json'), 'utf-8'));
    const proofData = JSON.parse(fs.readFileSync(path.join(outDir, 'paths/06a02856c08dde5c6679377c06f6fe7be1855d586bd1448343db2736b1473cd3.json'), 'utf-8'));

    const signature = new Uint8Array(Buffer.from(sig.r + sig.s, 'hex'));
    const pub_key_x = new Uint8Array(Buffer.from(pubkey.x, 'hex'));
    const pub_key_y = new Uint8Array(Buffer.from(pubkey.y, 'hex'));

    const signer_fpr = new Uint8Array(Buffer.from('06a02856c08dde5c6679377c06f6fe7be1855d586bd1448343db2736b1473cd3', 'hex'));
    const tl_root = new Uint8Array(Buffer.from(rootData.root, 'hex'));
    const merkle_path = proofData.path.map((p: string) => Array.from(Buffer.from(p, 'hex')));

    const inputs = {
        doc_hash: Array.from(doc_hash),
        pub_key_x: Array.from(pub_key_x),
        pub_key_y: Array.from(pub_key_y),
        signature: Array.from(signature),
        signer_fpr: Array.from(signer_fpr),
        tl_root: Array.from(tl_root),
        eu_trust_enabled: false,
        tl_root_eu: Array(32).fill(0),
        merkle_path,
        index: proofData.index.toString(),
        eu_merkle_path: Array(8).fill(Array(32).fill(0)),
        eu_index: '0'
    };

    console.log('  ✓ Inputs prepared');

    console.log('\n[3/3] Generating proof with SHA-256 circuit...');
    console.log('  (This may take 5-10 minutes...)');

    const startTime = Date.now();
    const { witness } = await noir.execute(inputs);
    console.log(`  ✓ Witness generated in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    const backend = new UltraPlonkBackend(circuit.bytecode);
    const proof = await backend.generateProof(witness);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`  ✓ Proof generated in ${duration}s`);
    console.log(`  Proof size: ${proof.proof.length} bytes`);

    const isValid = await backend.verifyProof(proof);
    console.log(`  ✓ Proof verification: ${isValid ? '✅ VALID' : '❌ INVALID'}`);

    fs.writeFileSync(path.join(outDir, 'proof-sha256.bin'), proof.proof);
    console.log(`\n✅ Test complete!`);
    console.log(`  Total time: ${duration}s`);

    process.exit(0);
}

main().catch((err) => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
});
