#!/usr/bin/env node
/**
 * e2e-test.ts
 *
 * End-to-end test for ZK Qualified Signature with artifact binding and EU Trust List.
 * Tests the complete pipeline, tamper detection, EU trust mode, and backward compatibility.
 *
 * Usage: yarn e2e-test
 *
 * Tests:
 *   1. Complete pipeline (Task 2 baseline)
 *   2. Manifest validation
 *   3. Tamper detection
 *   4. EU trust enabled mode (Task 3)
 *   5. Backward compatibility (Task 2 mode still works)
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
    verifyFile('test-data/document_signed.pdf', 'Sample signed PDF');
    verifyFile('test-data/document.pdf', 'Sample unsigned PDF');
    console.log('');

    // Test 1: Full Pipeline
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: Complete Pipeline');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    run('yarn hash-byte-range -- test-data/document_signed.pdf', 'Extract ByteRange hash');
    verifyFile('out/doc_hash.bin', 'Document hash');
    verifyFile('out/doc_hash.hex', 'Document hash (hex)');

    run('yarn extract-cades -- test-data/document_signed.pdf', 'Extract CAdES signature with PKI.js');
    verifyFile('out/VERIFIED_pubkey.json', 'Public key');
    verifyFile('out/VERIFIED_sig.json', 'Signature');
    verifyFile('out/VERIFIED_signed_attrs_hash.bin', 'Signed attributes hash');

    run('yarn merkle:build -- allowlist.json --out out', 'Build Merkle tree');
    verifyFile('out/tl_root.hex', 'Trust list root');

    run('yarn encrypt-upload -- test-data/document.pdf --to out/VERIFIED_pubkey.json', 'Encrypt file');
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
    if (!manifest.signer.fingerprint || manifest.signer.fingerprint.length !== 64) throw new Error('Invalid signer fingerprint');
    if (!manifest.tl_root || manifest.tl_root.length !== 64) throw new Error('Invalid tl_root');
    console.log('✅ Manifest structure valid');

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

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 4: EU Trust Enabled Mode');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('Checking EU Trust List files...');
    verifyFile('out/tl_root_eu.hex', 'EU Trust List root');
    verifyFile('out/eu_paths/06a02856c08dde5c6679377c06f6fe7be1855d586bd1448343db2736b1473cd3.json', 'EU Merkle proof for test signer');
    console.log('✅ EU Trust List files present');

    console.log('\nGenerating proof with EU trust enabled...');
    run('yarn prove -- --eu-trust', 'Generate ZK proof with EU trust');
    verifyFile('out/proof.bin', 'Proof with EU trust');
    verifyFile('out/manifest.json', 'Manifest with EU trust');

    console.log('\nValidating EU trust manifest...');
    const euManifest = JSON.parse(fs.readFileSync('out/manifest.json', 'utf-8'));
    if (!euManifest.eu_trust) {
        throw new Error('EU trust object missing from manifest');
    }
    if (euManifest.eu_trust.enabled !== true) {
        throw new Error('EU trust should be enabled in manifest');
    }
    if (!euManifest.eu_trust.tl_root_eu || euManifest.eu_trust.tl_root_eu.length !== 64) {
        throw new Error('Invalid EU trust root in manifest');
    }
    console.log('✅ EU trust manifest structure valid');
    console.log(`   eu_trust.enabled: ${euManifest.eu_trust.enabled}`);
    console.log(`   tl_root_eu: ${euManifest.eu_trust.tl_root_eu.substring(0, 16)}...`);

    console.log('\nVerifying proof with dual trust...');
    run('yarn verify', 'Verify proof with dual trust');
    console.log('✅ Dual trust verification passed');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 5: Backward Compatibility');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('Generating proof WITHOUT EU trust (Task 2 mode)...');
    run('yarn prove', 'Generate ZK proof without EU trust');
    verifyFile('out/proof.bin', 'Proof without EU trust');
    verifyFile('out/manifest.json', 'Manifest without EU trust');

    console.log('\nValidating backward compatibility manifest...');
    const backCompatManifest = JSON.parse(fs.readFileSync('out/manifest.json', 'utf-8'));
    if (!backCompatManifest.eu_trust) {
        throw new Error('EU trust object missing from manifest');
    }
    if (backCompatManifest.eu_trust.enabled !== false) {
        throw new Error('EU trust should be disabled in manifest');
    }
    console.log('✅ Backward compatibility manifest valid');
    console.log(`   eu_trust.enabled: ${backCompatManifest.eu_trust.enabled}`);

    console.log('\nVerifying proof with local trust only...');
    run('yarn verify', 'Verify proof with local trust');
    console.log('✅ Task 2 compatibility maintained');

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║              ✅ ALL TESTS PASSED! ✅               ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    console.log('Summary:');
    console.log('  ✓ Full pipeline executed successfully');
    console.log('  ✓ Manifest structure validated');
    console.log('  ✓ Artifact binding verified');
    console.log('  ✓ Tamper detection working');
    console.log('  ✓ EU trust enabled mode working');
    console.log('  ✓ Backward compatibility maintained');
    console.log('\n🎉 ZK Qualified Signature system is operational!\n');
}

main().catch(err => {
    console.error('\n❌ Test failed:', err.message);
    process.exit(1);
});
