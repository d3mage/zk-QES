#!/usr/bin/env node
/**
 * prove-poseidon-native.ts
 *
 * Generate proof for Poseidon circuit using native bb CLI
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

async function main() {
    console.log('=== Generating Poseidon Proof with Native bb CLI ===\n');

    const outDir = 'out';
    const circuitDir = 'circuits/pades_ecdsa_poseidon';

    // Step 1: Load inputs
    console.log('[1/4] Loading inputs...');

    const docHashPath = path.join(outDir, 'VERIFIED_signed_attrs_hash.bin');
    const doc_hash = Array.from(fs.readFileSync(docHashPath));

    const cipherHashPath = path.join(outDir, 'cipher_hash.bin');
    const artifact_hash = fs.existsSync(cipherHashPath)
        ? Array.from(fs.readFileSync(cipherHashPath))
        : Array(32).fill(0);

    const pubkeyPath = path.join(outDir, 'VERIFIED_pubkey.json');
    const pubkey = JSON.parse(fs.readFileSync(pubkeyPath, 'utf-8'));
    const pub_key_x = Array.from(Buffer.from(pubkey.x, 'hex'));
    const pub_key_y = Array.from(Buffer.from(pubkey.y, 'hex'));

    const sigPath = path.join(outDir, 'VERIFIED_sig.json');
    const sig = JSON.parse(fs.readFileSync(sigPath, 'utf-8'));
    const signature = Array.from(Buffer.from(sig.r + sig.s, 'hex'));

    // Load Poseidon Merkle data
    const rootPath = path.join(outDir, 'tl_root_poseidon.json');
    const rootData = JSON.parse(fs.readFileSync(rootPath, 'utf-8'));
    const tl_root = rootData.root_decimal;

    // Use first signer fingerprint
    const signerFpr = '06a02856c08dde5c6679377c06f6fe7be1855d586bd1448343db2736b1473cd3';
    const signer_fpr = BigInt('0x' + signerFpr).toString(10);

    const proofPath = path.join(outDir, 'paths-poseidon', `${signerFpr}.json`);
    const proofData = JSON.parse(fs.readFileSync(proofPath, 'utf-8'));
    const merkle_path = proofData.merkle_path_decimal;
    const index = proofData.index.toString();

    console.log(`  ✓ Inputs loaded`);
    console.log(`    signer_fpr: ${signerFpr}`);
    console.log(`    tl_root: ${tl_root}`);
    console.log(`    index: ${index}`);

    // Step 2: Create Prover.toml
    console.log('\n[2/4] Creating Prover.toml...');

    const proverToml = `doc_hash = [${doc_hash.join(', ')}]
artifact_hash = [${artifact_hash.join(', ')}]
pub_key_x = [${pub_key_x.join(', ')}]
pub_key_y = [${pub_key_y.join(', ')}]
signer_fpr = "${signer_fpr}"
tl_root = "${tl_root}"
eu_trust_enabled = false
tl_root_eu = "0"
signature = [${signature.join(', ')}]
merkle_path = ["${merkle_path.join('", "')}"]
index = "${index}"
eu_merkle_path = ["${Array(8).fill('0').join('", "')}"]
eu_index = "0"
`;

    fs.writeFileSync(path.join(circuitDir, 'Prover.toml'), proverToml);
    console.log('  ✓ Prover.toml created');

    // Step 3: Generate witness with nargo
    console.log('\n[3/4] Generating witness with nargo...');

    try {
        // Use absolute path to avoid workspace issues
        const circuitAbsPath = path.resolve(circuitDir);
        execSync(`nargo execute witness --program-dir ${circuitAbsPath}`, { stdio: 'inherit' });
        console.log('  ✓ Witness generated');
    } catch (error) {
        console.error('  ✗ Witness generation failed');
        throw error;
    }

    // Step 4: Generate proof with native bb
    console.log('\n[4/4] Generating proof with bb CLI...');

    try {
        const cmd = `bb prove -b ${circuitDir}/target/pades_ecdsa_poseidon.json -w ${circuitDir}/target/witness.gz -o ${outDir}/proof-poseidon`;
        console.log(`  Running: ${cmd}`);
        execSync(cmd, { stdio: 'inherit' });
        console.log('  ✓ Proof generated!');

        // Verify the proof was created
        if (fs.existsSync(path.join(outDir, 'proof-poseidon'))) {
            const proofSize = fs.statSync(path.join(outDir, 'proof-poseidon')).size;
            console.log(`  ✓ Proof file created: ${proofSize} bytes`);
        }

        if (fs.existsSync(path.join(outDir, 'vk-poseidon'))) {
            console.log('  ✓ Verification key created');
        }

        console.log('\n✅ SUCCESS! Poseidon proof generated with native bb CLI');
        console.log('   Files created:');
        console.log('   - out/proof-poseidon');
        console.log('   - out/vk-poseidon');

    } catch (error) {
        console.error('  ✗ Proof generation failed');
        throw error;
    }
}

main().catch(err => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
});
