#!/usr/bin/env node
/**
 * e2e-test.ts
 *
 * End-to-end test for ZK Qualified Signature with artifact binding.
 * Tests the complete pipeline and basic tamper detection.
 *
 * Usage: yarn e2e-test
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

function run(cmd: string, description: string): void {
    console.log(`\n[Running] ${description}...`);
    try {
        execSync(cmd, { stdio: 'inherit' });
        console.log(`✅ ${description} - SUCCESS`);
    } catch (err) {
        console.error(`❌ ${description} - FAILED`);
        throw err;
    }
}

function verifyFile(filePath: string, description: string): void {
    if (!fs.existsSync(filePath)) {
        throw new Error(`${description} not found: ${filePath}`);
    }
    console.log(`✅ ${description} exists`);
}

async function main() {
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║   ZK Qualified Signature - E2E Test                ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    // Prerequisites
    console.log('📋 Checking Prerequisites...');
    verifyFile('test_files/sample_signed.pdf', 'Sample signed PDF');
    verifyFile('test_files/sample.pdf', 'Sample unsigned PDF');
    console.log('');

    // Test 1: Full Pipeline
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: Complete Pipeline');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    run('yarn hash-byte-range -- test_files/sample_signed.pdf', 'Extract ByteRange hash');
    verifyFile('out/doc_hash.bin', 'Document hash');
    verifyFile('out/doc_hash.hex', 'Document hash (hex)');

    run('yarn extract-cms -- test_files/sample_signed.pdf test_files/EU-6669243D2B04331D0400000014EB9900F741B404.cer', 'Extract CMS signature');
    verifyFile('out/VERIFIED_pubkey.json', 'Public key');
    verifyFile('out/VERIFIED_sig.json', 'Signature');

    run('yarn merkle:build -- allowlist.json --out out', 'Build Merkle tree');
    verifyFile('out/tl_root.hex', 'Trust list root');

    run('yarn encrypt-upload -- test_files/sample.pdf --to out/VERIFIED_pubkey.json', 'Encrypt file');
    verifyFile('out/cipher_hash.bin', 'Cipher hash');
    verifyFile('out/encrypted-file.bin', 'Encrypted file');

    run('yarn prove', 'Generate ZK proof');
    verifyFile('out/proof.bin', 'Proof');
    verifyFile('out/manifest.json', 'Manifest');

    run('yarn verify', 'Verify proof');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: Manifest Validation');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const manifest = JSON.parse(fs.readFileSync('out/manifest.json', 'utf-8'));

    console.log('Checking manifest structure...');
    if (manifest.version !== 1) throw new Error('Invalid version');
    if (!manifest.doc_hash || manifest.doc_hash.length !== 64) throw new Error('Invalid doc_hash');
    if (!manifest.artifact.artifact_hash || manifest.artifact.artifact_hash.length !== 64) throw new Error('Invalid artifact_hash');
    if (!manifest.signer.fingerprint || manifest.signer.fingerprint.length !== 64) throw new Error('Invalid signer fingerprint');
    if (!manifest.tl_root || manifest.tl_root.length !== 64) throw new Error('Invalid tl_root');
    console.log('✅ Manifest structure valid');

    console.log('\nVerifying artifact binding...');
    const cipherData = fs.readFileSync('out/encrypted-file.bin');
    const computedHash = crypto.createHash('sha256').update(cipherData).digest('hex');
    if (computedHash !== manifest.artifact.artifact_hash) {
        throw new Error('Artifact hash mismatch!');
    }
    console.log('✅ Artifact hash matches encrypted file');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: Tamper Detection (Ciphertext)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('Creating tampered ciphertext...');
    const originalCipher = fs.readFileSync('out/encrypted-file.bin');
    fs.copyFileSync('out/encrypted-file.bin', 'out/encrypted-file.bin.backup');

    const tamperedCipher = Buffer.from(originalCipher);
    tamperedCipher[50] ^= 0xFF; // Flip one byte
    fs.writeFileSync('out/encrypted-file.bin', tamperedCipher);

    console.log('Attempting verification with tampered file...');
    try {
        execSync('yarn verify', { stdio: 'pipe' });
        fs.copyFileSync('out/encrypted-file.bin.backup', 'out/encrypted-file.bin');
        fs.unlinkSync('out/encrypted-file.bin.backup');
        throw new Error('Verification should have failed!');
    } catch (err: any) {
        if (err.message === 'Verification should have failed!') {
            throw err;
        }
        console.log('✅ Tampered ciphertext detected');
    }

    fs.copyFileSync('out/encrypted-file.bin.backup', 'out/encrypted-file.bin');
    fs.unlinkSync('out/encrypted-file.bin.backup');

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║              ✅ ALL TESTS PASSED! ✅               ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    console.log('Summary:');
    console.log('  ✓ Full pipeline executed successfully');
    console.log('  ✓ Manifest structure validated');
    console.log('  ✓ Artifact binding verified');
    console.log('  ✓ Tamper detection working');
    console.log('\n🎉 ZK Qualified Signature system is operational!\n');
}

main().catch(err => {
    console.error('\n❌ Test failed:', err.message);
    process.exit(1);
});
