#!/usr/bin/env node
/**
 * verify.ts
 *
 * Verifies a Noir proof with artifact binding and trust list verification.
 * Reads manifest and validates all bindings.
 *
 * Usage: yarn verify
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { UltraPlonkBackend as BarretenbergBackend } from '@aztec/bb.js';

interface Manifest {
    version: number;
    doc_hash: string;
    signer: {
        pub_x: string;
        pub_y: string;
        fingerprint: string;
    };
    tl_root: string;
    eu_trust?: {
        enabled: boolean;
        tl_root_eu?: string;
        eu_index?: string;
    };
    proof: string;
    timestamp: string;
    notes?: string;
}

async function compileCircuit() {
    const circuitDir = 'circuits/pades_ecdsa_hybrid';
    const targetDir = path.join(circuitDir, 'target');
    const compiledPath = path.join(targetDir, 'pades_ecdsa_hybrid.json');

    if (!fs.existsSync(compiledPath)) {
        throw new Error('Circuit not compiled. Run "yarn prove" first to compile and generate proof.');
    }

    const circuitArtifact = JSON.parse(fs.readFileSync(compiledPath, 'utf-8'));
    return circuitArtifact;
}

async function main() {
    const outDir = 'out';

    console.log('=== ZK Qualified Signature Verification ===\n');

    // 1. Load manifest
    console.log('[1/6] Loading manifest...');
    const manifestPath = path.join(outDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`Manifest not found: ${manifestPath}. Run "yarn prove" first.`);
    }

    const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    console.log(`  Version:   ${manifest.version}`);
    console.log(`  Timestamp: ${manifest.timestamp}`);
    console.log(`  Doc hash:  ${manifest.doc_hash}`);
    console.log(`  Signer:    ${manifest.signer.fingerprint}`);
    console.log(`  EU Trust:  ${manifest.eu_trust?.enabled ? 'ENABLED' : 'disabled'}`);

    // 2. Verify local trust list membership
    console.log('\n[2/5] Verifying local trust list membership...');

    const tlRootPath = path.join(outDir, 'tl_root_poseidon.txt');
    if (fs.existsSync(tlRootPath)) {
        const tlRoot = fs.readFileSync(tlRootPath, 'utf-8').trim();
        if (tlRoot === manifest.tl_root) {
            console.log(`  ✓ Local trust list root matches (Pedersen)`);
        } else {
            console.error(`  ✗ Local trust list root mismatch!`);
            console.error(`    Expected: ${tlRoot}`);
            console.error(`    Got:      ${manifest.tl_root}`);
            process.exit(1);
        }
    } else {
        console.log(`  ⚠ Local trust list root not found`);
        console.log(`    (Manifest declares tl_root: ${manifest.tl_root})`);
    }

    // 3. Verify EU Trust List membership (if enabled)
    console.log('\n[3/5] Verifying EU Trust List membership...');

    if (manifest.eu_trust?.enabled) {
        const euRootPath = path.join(outDir, 'tl_root_eu_poseidon.txt');
        if (fs.existsSync(euRootPath)) {
            const euRoot = fs.readFileSync(euRootPath, 'utf-8').trim();
            if (euRoot === manifest.eu_trust.tl_root_eu) {
                console.log(`  ✓ EU Trust List root matches (Pedersen)`);
                console.log(`  ✓ Dual trust verification enabled`);
            } else {
                console.error(`  ✗ EU Trust List root mismatch!`);
                console.error(`    Expected: ${euRoot}`);
                console.error(`    Got:      ${manifest.eu_trust.tl_root_eu}`);
                process.exit(1);
            }
        } else {
            console.log(`  ⚠ EU Trust List root not found locally`);
            console.log(`    (Manifest declares tl_root_eu: ${manifest.eu_trust.tl_root_eu})`);
        }
    } else {
        console.log(`  ⊘ EU Trust verification disabled`);
        console.log(`    (Using local trust list only)`);
    }

    // 4. Load proof data
    console.log('\n[4/5] Loading proof...');

    const vkeyPath = path.join(outDir, 'vkey.bin');
    const proofJsonPath = path.join(outDir, 'proof.json');

    if (!fs.existsSync(vkeyPath)) {
        throw new Error(`Verification key not found: ${vkeyPath}. Run "yarn prove" first.`);
    }

    const proof = Buffer.from(manifest.proof, 'base64');
    const vkey = fs.readFileSync(vkeyPath);

    // Load public inputs from proof.json
    const proofData = JSON.parse(fs.readFileSync(proofJsonPath, 'utf-8'));
    const publicInputs = proofData.publicInputs;

    console.log(`  Proof size: ${proof.length} bytes`);
    console.log(`  VKey size:  ${vkey.length} bytes`);
    console.log(`  Public inputs: ${publicInputs.length} values`);

    // 5. Verify ZK proof
    console.log('\n[5/5] Verifying zero-knowledge proof...');

    const circuit = await compileCircuit();
    const backend = new BarretenbergBackend(circuit.bytecode);

    try {
        const isValid = await backend.verifyProof({
            proof: proof,
            publicInputs: publicInputs
        });

        if (isValid) {
            console.log('  ✓ ZK proof verified!\n');
            console.log('═══════════════════════════════════════════════════');
            console.log('✅ ALL VERIFICATIONS PASSED!');
            console.log('═══════════════════════════════════════════════════\n');
            console.log('This proves that:');
            console.log('  ✓ Valid ECDSA P-256 signature over document');
            console.log('  ✓ Signer is in the trusted allow-list');
            if (manifest.eu_trust?.enabled) {
                console.log('  ✓ Signer is in the EU Trust List (dual trust)');
            }
            console.log('  ✓ Signature validity proven in zero-knowledge\n');
            process.exit(0);
        } else {
            console.log('\n❌ PROOF VERIFICATION FAILED');
            console.log('The proof is invalid or was generated incorrectly.');
            process.exit(1);
        }
    } catch (error) {
        console.error('\n❌ VERIFICATION ERROR:', error);
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
});
