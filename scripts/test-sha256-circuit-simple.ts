#!/usr/bin/env node
/**
 * test-sha256-circuit-simple.ts
 * Simple test to isolate SHA-256 circuit issues
 */

import fs from 'node:fs';
import path from 'node:fs/promises';
import { Noir } from '@noir-lang/noir_js';
import { UltraPlonkBackend } from '@aztec/bb.js';

async function main() {
    console.log('=== Simple SHA-256 Circuit Test ===\n');

    // Load circuit
    const circuit = JSON.parse(fs.readFileSync('circuits/pades_ecdsa/target/pades_ecdsa.json', 'utf-8'));
    const noir = new Noir(circuit);

    // Use existing VERIFIED data (known good from Poseidon test)
    const doc_hash = fs.readFileSync('out/VERIFIED_signed_attrs_hash.bin');
    const sig = JSON.parse(fs.readFileSync('out/VERIFIED_sig.json', 'utf-8'));
    const pubkey = JSON.parse(fs.readFileSync('out/VERIFIED_pubkey.json', 'utf-8'));

    // Use existing SHA-256 Merkle data
    const tl_root = Buffer.from(fs.readFileSync('out/tl_root.hex', 'utf-8').trim(), 'hex');
    const signerFpr = '06a02856c08dde5c6679377c06f6fe7be1855d586bd1448343db2736b1473cd3';
    const proofData = JSON.parse(fs.readFileSync(`out/paths/${signerFpr}.json`, 'utf-8'));

    const inputs = {
        doc_hash: Array.from(doc_hash),
        artifact_hash: Array.from(new Uint8Array(32).fill(0)), // Placeholder
        pub_key_x: Array.from(Buffer.from(pubkey.x, 'hex')),
        pub_key_y: Array.from(Buffer.from(pubkey.y, 'hex')),
        signer_fpr: Array.from(Buffer.from(signerFpr, 'hex')),
        tl_root: Array.from(tl_root),
        eu_trust_enabled: false,
        tl_root_eu: Array.from(new Uint8Array(32).fill(0)),
        signature: Array.from(Buffer.from(sig.signature, 'hex')),
        merkle_path: proofData.path.map((hex: string) => Array.from(Buffer.from(hex, 'hex'))),
        index: proofData.index.toString(),
        eu_merkle_path: Array(8).fill(Array(32).fill(0)),
        eu_index: '0'
    };

    console.log('Inputs prepared:');
    console.log(`  doc_hash: ${Buffer.from(inputs.doc_hash).toString('hex').substring(0,32)}...`);
    console.log(`  signature: ${Buffer.from(inputs.signature).toString('hex').substring(0,32)}...`);
    console.log(`  index: ${inputs.index}`);

    try {
        console.log('\n### Generating witness...');
        const { witness } = await noir.execute(inputs);
        console.log('  ✓ Witness generated successfully!');

        console.log('\n### Generating proof...');
        const backend = new UltraPlonkBackend(circuit.bytecode);
        const proof = await backend.generateProof(witness);
        console.log(`  ✓ Proof generated! Size: ${proof.proof.length} bytes`);

        console.log('\n✅ SHA-256 CIRCUIT TEST PASSED!');
    } catch (error: any) {
        console.error('\n❌ TEST FAILED:');
        console.error(error.message);
        console.error('\nFull error:', error);
        process.exit(1);
    }
}

main();
