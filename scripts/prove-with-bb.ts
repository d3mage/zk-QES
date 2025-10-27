#!/usr/bin/env node
/**
 * prove-with-bb.ts
 *
 * Generate proof using native bb CLI instead of bb.js
 * This avoids WASM limitations for the SHA-256 circuit
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

async function main() {
    console.log('=== Generating Proof with Native bb CLI ===\n');

    const outDir = 'out';
    const circuitDir = 'circuits/pades_ecdsa';

    // Step 1: Load inputs (same as prove.ts)
    console.log('[1/4] Loading inputs...');

    const docHashPath = path.join(outDir, 'VERIFIED_signed_attrs_hash.bin');
    const doc_hash = Array.from(fs.readFileSync(docHashPath));

    const cipherHashPath = path.join(outDir, 'cipher_hash.bin');
    const artifact_hash = Array.from(fs.readFileSync(cipherHashPath));

    const pubkeyPath = path.join(outDir, 'VERIFIED_pubkey.json');
    const pubkey = JSON.parse(fs.readFileSync(pubkeyPath, 'utf-8'));
    const pub_key_x = Array.from(Buffer.from(pubkey.x, 'hex'));
    const pub_key_y = Array.from(Buffer.from(pubkey.y, 'hex'));

    const sigPath = path.join(outDir, 'VERIFIED_sig.json');
    const sig = JSON.parse(fs.readFileSync(sigPath, 'utf-8'));
    const signature = Array.from(Buffer.from(sig.signature, 'hex'));

    // Compute signer fingerprint
    const certPath = 'test_files/EU-6669243D2B04331D0400000014EB9900F741B404.cer';
    const certDer = fs.readFileSync(certPath);
    const crypto = await import('node:crypto');
    const signer_fpr = Array.from(crypto.createHash('sha256').update(certDer).digest());

    const tlRootPath = path.join(outDir, 'tl_root.hex');
    const tl_root = Array.from(Buffer.from(fs.readFileSync(tlRootPath, 'utf-8').trim(), 'hex'));

    const signerFprHex = Buffer.from(signer_fpr).toString('hex');
    const proofPath = path.join(outDir, 'paths', `${signerFprHex}.json`);
    const proofData = JSON.parse(fs.readFileSync(proofPath, 'utf-8'));
    const merkle_path = proofData.path.map((hex: string) => Array.from(Buffer.from(hex, 'hex')));
    while (merkle_path.length < 8) {
        merkle_path.push(Array(32).fill(0));
    }
    const index = proofData.index.toString();

    console.log(`  ✓ Inputs loaded`);
    console.log(`    doc_hash: ${Buffer.from(doc_hash).toString('hex').substring(0, 32)}...`);
    console.log(`    signer_fpr: ${signerFprHex}`);
    console.log(`    index: ${index}`);

    // Step 2: Create Prover.toml for nargo
    console.log('\n[2/4] Creating Prover.toml...');

    const proverToml = `doc_hash = [${doc_hash.join(', ')}]
artifact_hash = [${artifact_hash.join(', ')}]
pub_key_x = [${pub_key_x.join(', ')}]
pub_key_y = [${pub_key_y.join(', ')}]
signer_fpr = [${signer_fpr.join(', ')}]
tl_root = [${tl_root.join(', ')}]
eu_trust_enabled = false
tl_root_eu = [${Array(32).fill(0).join(', ')}]
signature = [${signature.join(', ')}]
merkle_path = [${merkle_path.map(arr => `[${arr.join(', ')}]`).join(', ')}]
index = "${index}"
eu_merkle_path = [${Array(8).fill(Array(32).fill(0)).map(arr => `[${arr.join(', ')}]`).join(', ')}]
eu_index = "0"
`;

    fs.writeFileSync(path.join(circuitDir, 'Prover.toml'), proverToml);
    console.log('  ✓ Prover.toml created');

    // Step 3: Generate witness with nargo
    console.log('\n[3/4] Generating witness with nargo...');

    try {
        execSync(`cd ${circuitDir} && nargo execute witness`, { stdio: 'inherit' });
        console.log('  ✓ Witness generated');
    } catch (error) {
        console.error('  ✗ Witness generation failed');
        throw error;
    }

    // Step 4: Generate proof with native bb
    console.log('\n[4/4] Generating proof with bb CLI...');

    try {
        const cmd = `bb prove -b ${circuitDir}/target/pades_ecdsa.json -w ${circuitDir}/target/witness.gz -o ${outDir}`;
        console.log(`  Running: ${cmd}`);
        execSync(cmd, { stdio: 'inherit' });
        console.log('  ✓ Proof generated!');

        // Verify the proof was created
        if (fs.existsSync(path.join(outDir, 'proof'))) {
            const proofSize = fs.statSync(path.join(outDir, 'proof')).size;
            console.log(`  ✓ Proof file created: ${proofSize} bytes`);
        }

        if (fs.existsSync(path.join(outDir, 'vk'))) {
            console.log('  ✓ Verification key created');
        }

        console.log('\n✅ SUCCESS! Proof generated with native bb CLI');
        console.log('   Files created:');
        console.log('   - out/proof');
        console.log('   - out/vk');

    } catch (error) {
        console.error('  ✗ Proof generation failed');
        throw error;
    }
}

main().catch(err => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
});
