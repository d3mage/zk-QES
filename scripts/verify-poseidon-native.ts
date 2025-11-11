#!/usr/bin/env node
/**
 * verify-poseidon-native.ts
 *
 * Verify Poseidon proof using native bb CLI
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

async function main() {
    console.log('=== Verifying Poseidon Proof with Native bb CLI ===\n');

    const outDir = 'out';

    // Check if proof and vk exist
    const proofPath = path.join(outDir, 'proof-poseidon');
    const vkPath = path.join(outDir, 'vk-poseidon');

    if (!fs.existsSync(proofPath)) {
        throw new Error(`Proof not found: ${proofPath}`);
    }

    if (!fs.existsSync(vkPath)) {
        throw new Error(`Verification key not found: ${vkPath}`);
    }

    console.log('[1/1] Verifying proof with bb CLI...');

    try {
        const cmd = `bb verify -p ${proofPath} -k ${vkPath}`;
        console.log(`  Running: ${cmd}`);
        execSync(cmd, { stdio: 'inherit' });
        console.log('\n✅ SUCCESS! Poseidon proof verified!');
    } catch (error) {
        console.error('\n❌ Verification failed!');
        throw error;
    }
}

main().catch(err => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
});
