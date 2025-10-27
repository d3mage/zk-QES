#!/usr/bin/env node
/**
 * verify-bb.ts
 *
 * Verify proof using native bb CLI
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';

async function main() {
    console.log('=== Verifying Proof with Native bb CLI ===\n');

    // Check files exist
    if (!fs.existsSync('out/proof')) {
        throw new Error('Proof not found: out/proof');
    }
    if (!fs.existsSync('out/vk')) {
        console.log('Verification key not found, generating...');
        execSync('bb write_vk -b circuits/pades_ecdsa/target/pades_ecdsa.json -o out', { stdio: 'inherit' });
    }

    console.log('Verifying proof...');
    execSync('bb verify -p out/proof -k out/vk', { stdio: 'inherit' });

    console.log('\n✅ Proof verified successfully!');
}

main().catch(err => {
    console.error('\n❌ Verification failed:', err.message);
    process.exit(1);
});
