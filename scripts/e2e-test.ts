#!/usr/bin/env node
/**
 * e2e-test.ts
 *
 * End-to-end test for ZK Qualified Signature with EU Trust List.
 * Automatically fetches EU Trust List and tests both dual trust and local trust modes.
 *
 * Usage: yarn e2e-test
 *
 * Tests:
 *   1. Complete pipeline (signature extraction, ZK proof, verification)
 *   2. Manifest validation
 *   3. EU Trust List setup (fetch LOTL, generate Merkle roots)
 *   4. EU trust enabled mode (dual trust verification)
 *   5. Backward compatibility (local trust only mode)
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

    run('yarn merkle-poseidon:build -- test-data/allowlist.json --out out', 'Build Pedersen Merkle tree');
    verifyFile('out/tl_root_poseidon.txt', 'Trust list root (Poseidon)');

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
    // tl_root is now stored as decimal Field string (not hex), so check it's a valid number
    if (!manifest.tl_root || !/^\d+$/.test(manifest.tl_root)) throw new Error('Invalid tl_root (must be decimal Field string)');
    console.log('✅ Manifest structure valid');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: EU Trust List Setup');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('Fetching EU Trust List from official source...');
    run('yarn eutl:fetch', 'Fetch EU LOTL');
    verifyFile('tools/eutl/cache/lotl.xml', 'EU LOTL XML');
    verifyFile('tools/eutl/cache/qualified_cas.json', 'EU certificate fingerprints');

    console.log('\nGenerating EU Trust List Merkle root...');
    run('yarn eutl:root -- --snapshot tools/eutl/cache/snapshot.json --out out', 'Generate EU trust root (SHA-256)');
    verifyFile('out/tl_root_eu.hex', 'EU Trust List root (SHA-256)');
    verifyFile('out/eu_paths/06a02856c08dde5c6679377c06f6fe7be1855d586bd1448343db2736b1473cd3.json', 'EU Merkle proof');

    console.log('\nGenerating EU Trust List Poseidon Merkle root...');
    run('yarn merkle-poseidon:build -- tools/eutl/cache/qualified_cas.json --out out', 'Build EU Pedersen tree');

    // Copy Poseidon files to EU trust locations
    console.log('Setting up EU trust Poseidon files...');
    execSync('cp out/tl_root_poseidon.txt out/tl_root_eu_poseidon.txt', { stdio: 'inherit' });
    execSync('cp out/tl_root_poseidon.hex out/tl_root_eu_poseidon.hex', { stdio: 'inherit' });
    execSync('cp out/tl_root_poseidon.json out/tl_root_eu_poseidon.json', { stdio: 'inherit' });
    execSync('cp -r out/paths-poseidon out/eu_paths_poseidon', { stdio: 'inherit' });
    console.log('✅ EU Trust List Poseidon files ready');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 4: EU Trust Enabled Mode (Dual Trust)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    verifyFile('out/tl_root_eu_poseidon.txt', 'EU Trust List root (Poseidon)');
    verifyFile('out/eu_paths_poseidon/06a02856c08dde5c6679377c06f6fe7be1855d586bd1448343db2736b1473cd3.json', 'EU Merkle proof (Poseidon)');

    console.log('Generating proof with EU trust enabled...');
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
    // tl_root_eu is now stored as decimal Field string (not hex)
    if (!euManifest.eu_trust.tl_root_eu || !/^\d+$/.test(euManifest.eu_trust.tl_root_eu)) {
        throw new Error('Invalid EU trust root in manifest (must be decimal Field string)');
    }
    console.log('✅ EU trust manifest structure valid');
    console.log(`   eu_trust.enabled: ${euManifest.eu_trust.enabled}`);
    console.log(`   tl_root_eu: ${euManifest.eu_trust.tl_root_eu.substring(0, 16)}...`);

    console.log('\nVerifying proof with dual trust...');
    run('yarn verify', 'Verify proof with dual trust');
    console.log('✅ Dual trust verification passed');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 5: Backward Compatibility (Local Trust Only)');
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
    console.log('  ✓ TEST 1: Full pipeline executed successfully');
    console.log('  ✓ TEST 2: Manifest structure validated');
    console.log('  ✓ TEST 3: EU Trust List fetched and set up');
    console.log('  ✓ TEST 4: EU trust enabled mode (dual trust) working');
    console.log('  ✓ TEST 5: Backward compatibility maintained (local trust only)');
    console.log('\n🎉 ZK Qualified Signature system is fully operational!\n');
}

main().catch(err => {
    console.error('\n❌ Test failed:', err.message);
    process.exit(1);
});
