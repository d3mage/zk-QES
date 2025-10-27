#!/usr/bin/env node
/**
 * test-poseidon-circuit.ts
 *
 * Tests the Poseidon2 circuit with Field-based Merkle inputs
 */

import fs from 'node:fs';
import path from 'node:path';
import { Noir } from '@noir-lang/noir_js';
import { UltraPlonkBackend } from '@aztec/bb.js';

const outDir = 'out';

async function main() {
    console.log('=== Poseidon2 Circuit Test ===\n');

    // 1. Load compiled Poseidon2 circuit
    console.log('[1/5] Loading Poseidon2 circuit...');
    const circuitPath = 'circuits/pades_ecdsa_poseidon/target/pades_ecdsa_poseidon.json';

    if (!fs.existsSync(circuitPath)) {
        throw new Error(`Circuit not found: ${circuitPath}. Run 'yarn compile:circuit:poseidon' first.`);
    }

    const circuit = JSON.parse(fs.readFileSync(circuitPath, 'utf-8'));
    const noir = new Noir(circuit);
    console.log('  ✓ Circuit loaded');

    // 2. Load Poseidon Merkle tree data
    console.log('\n[2/5] Loading Poseidon Merkle proof...');
    const rootPath = path.join(outDir, 'tl_root_poseidon.json');
    const rootData = JSON.parse(fs.readFileSync(rootPath, 'utf-8'));

    // Use the first signer (06a02856...)
    const signerFpr = '06a02856c08dde5c6679377c06f6fe7be1855d586bd1448343db2736b1473cd3';
    const proofPath = path.join(outDir, 'paths-poseidon', `${signerFpr}.json`);
    const proofData = JSON.parse(fs.readFileSync(proofPath, 'utf-8'));

    console.log(`  Signer fingerprint: ${signerFpr}`);
    console.log(`  Merkle root: ${rootData.root_decimal}`);
    console.log(`  Merkle path depth: ${proofData.merkle_path_decimal.length}`);

    // 3. Load signature data (from existing VERIFIED files)
    console.log('\n[3/5] Loading signature data...');
    const docHashPath = path.join(outDir, 'VERIFIED_signed_attrs_hash.bin');
    const sigPath = path.join(outDir, 'VERIFIED_sig.json');
    const pubkeyPath = path.join(outDir, 'VERIFIED_pubkey.json');

    if (!fs.existsSync(docHashPath) || !fs.existsSync(sigPath) || !fs.existsSync(pubkeyPath)) {
        throw new Error('VERIFIED signature files not found. Run extract-cms first.');
    }

    const doc_hash = new Uint8Array(fs.readFileSync(docHashPath));
    const sig = JSON.parse(fs.readFileSync(sigPath, 'utf-8'));
    const pubkey = JSON.parse(fs.readFileSync(pubkeyPath, 'utf-8'));

    // For testing, use a placeholder artifact hash
    const artifact_hash = new Uint8Array(32).fill(0);

    console.log(`  Doc hash: ${Buffer.from(doc_hash).toString('hex').substring(0, 16)}...`);
    console.log(`  Signature r: ${sig.r.substring(0, 16)}...`);
    console.log(`  Public key x: ${pubkey.x.substring(0, 16)}...`);

    // 4. Prepare circuit inputs (Field-based)
    console.log('\n[4/5] Preparing circuit inputs...');

    // Convert signer fingerprint to Field (decimal string)
    const signer_fpr = BigInt('0x' + signerFpr).toString(10);

    // Convert Merkle root to Field
    const tl_root = rootData.root_decimal;

    // Convert Merkle path to Field array
    const merkle_path = proofData.merkle_path_decimal;

    // Index as Field
    const index = proofData.index.toString();

    // Signature and public key (hex to bytes)
    const signature = new Uint8Array(Buffer.from(sig.r + sig.s, 'hex'));
    const pub_key_x = new Uint8Array(Buffer.from(pubkey.x, 'hex'));
    const pub_key_y = new Uint8Array(Buffer.from(pubkey.y, 'hex'));

    // For this test, disable EU trust
    const eu_trust_enabled = false;
    const tl_root_eu = "0"; // Dummy value when EU trust is disabled
    const eu_merkle_path = Array(8).fill("0"); // Dummy array
    const eu_index = "0"; // Dummy value

    const inputs = {
        doc_hash: Array.from(doc_hash),
        artifact_hash: Array.from(artifact_hash),
        pub_key_x: Array.from(pub_key_x),
        pub_key_y: Array.from(pub_key_y),
        signer_fpr,         // Field
        tl_root,            // Field
        eu_trust_enabled,   // bool
        tl_root_eu,         // Field (dummy)
        signature: Array.from(signature),
        merkle_path,        // [Field; 8]
        index,              // Field
        eu_merkle_path,     // [Field; 8] (dummy)
        eu_index            // Field (dummy)
    };

    console.log('  ✓ Inputs prepared (Field-based Merkle)');
    console.log(`  signer_fpr: ${signer_fpr}`);
    console.log(`  tl_root: ${tl_root}`);
    console.log(`  index: ${index}`);

    // 5. Generate witness and proof
    console.log('\n[5/5] Generating proof with Poseidon2 circuit...');
    console.log('  (This may take 5-10 minutes...)');

    const startTime = Date.now();
    const { witness } = await noir.execute(inputs);
    console.log(`  ✓ Witness generated in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    const backend = new UltraPlonkBackend(circuit.bytecode);
    const proof = await backend.generateProof(witness);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`  ✓ Proof generated in ${duration}s`);
    console.log(`  Proof size: ${proof.proof.length} bytes`);

    // Verify
    const isValid = await backend.verifyProof(proof);
    console.log(`  ✓ Proof verification: ${isValid ? '✅ VALID' : '❌ INVALID'}`);

    // Save proof
    const proofOutputPath = path.join(outDir, 'proof-poseidon.bin');
    fs.writeFileSync(proofOutputPath, proof.proof);
    console.log(`\n✅ Test complete!`);
    console.log(`  Proof saved to: ${proofOutputPath}`);
    console.log(`  Total time: ${duration}s`);

    if (!isValid) {
        console.error('\n❌ PROOF VERIFICATION FAILED!');
        process.exit(1);
    }

    process.exit(0);
}

main().catch((err) => {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
});
