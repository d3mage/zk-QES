#!/usr/bin/env node
/**
 * prove-native.ts
 *
 * Generate ZK proof using NATIVE bb binary (faster, no WASM issues)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { Noir } from '@noir-lang/noir_js';

async function loadInputs() {
    // Same as prove.ts
    const outDir = 'out';

    const docHashPath = path.join(outDir, 'VERIFIED_signed_attrs_hash.bin');
    let message_for_sig: Uint8Array;

    if (fs.existsSync(docHashPath)) {
        message_for_sig = new Uint8Array(fs.readFileSync(docHashPath));
        console.log('  Using CAdES signed_attrs_hash');
    } else {
        const fallbackPath = path.join(outDir, 'doc_hash.bin');
        message_for_sig = new Uint8Array(fs.readFileSync(fallbackPath));
        console.log('  Using doc_hash (PAdES)');
    }

    const pubkeyJson = JSON.parse(fs.readFileSync(path.join(outDir, 'VERIFIED_pubkey.json'), 'utf-8'));
    const pub_key_x = Buffer.from(pubkeyJson.x, 'hex');
    const pub_key_y = Buffer.from(pubkeyJson.y, 'hex');

    const certPem = fs.readFileSync(path.join(outDir, 'cms_embedded_cert.pem'), 'utf-8');
    const base64Content = certPem
        .replace(/-----BEGIN CERTIFICATE-----/, '')
        .replace(/-----END CERTIFICATE-----/, '')
        .replace(/\s/g, '');
    const certDer = Buffer.from(base64Content, 'base64');
    const signer_fpr_bytes = crypto.createHash('sha256').update(certDer).digest();
    const signer_fpr_hex = signer_fpr_bytes.toString('hex');
    const signer_fpr = BigInt('0x' + signer_fpr_hex).toString();

    const tlRootPath = path.join(outDir, 'tl_root_poseidon.txt');
    const tl_root = fs.readFileSync(tlRootPath, 'utf-8').trim();

    const proofPath = path.join(outDir, 'paths-poseidon', `${signer_fpr_hex}.json`);
    const proofData = JSON.parse(fs.readFileSync(proofPath, 'utf-8'));
    const merkle_path = proofData.merkle_path_decimal || [];
    while (merkle_path.length < 8) {
        merkle_path.push('0');
    }
    const index = proofData.index.toString();

    const sigJsonPath = path.join(outDir, 'VERIFIED_sig.json');
    const sigJson = JSON.parse(fs.readFileSync(sigJsonPath, 'utf-8'));
    const signature = Buffer.concat([
        Buffer.from(sigJson.r, 'hex'),
        Buffer.from(sigJson.s, 'hex')
    ]);

    const euTrustEnabled = process.argv.includes('--eu-trust');
    let euTrustData: any;

    if (euTrustEnabled) {
        throw new Error('EU trust not yet implemented for native bb');
    } else {
        euTrustData = {
            tl_root_eu: '0',
            eu_merkle_path: Array(8).fill('0'),
            eu_index: '0'
        };
    }

    return {
        doc_hash: message_for_sig,
        pub_key_x,
        pub_key_y,
        signer_fpr,
        tl_root,
        eu_trust_enabled: euTrustEnabled,
        tl_root_eu: euTrustData.tl_root_eu,
        signature,
        merkle_path,
        index,
        eu_merkle_path: euTrustData.eu_merkle_path,
        eu_index: euTrustData.eu_index
    };
}

async function main() {
    console.log('Loading inputs...');
    const inputs = await loadInputs();

    console.log(`  doc_hash:     ${Buffer.from(inputs.doc_hash).toString('hex')}`);
    console.log(`  pub_key_x:    ${Buffer.from(inputs.pub_key_x).toString('hex')}`);
    console.log(`  pub_key_y:    ${Buffer.from(inputs.pub_key_y).toString('hex')}`);
    console.log(`  signer_fpr:   ${inputs.signer_fpr} (Field)`);
    console.log(`  tl_root:      ${inputs.tl_root} (Field)`);
    console.log(`  index:        ${inputs.index}`);

    // Prepare inputs for Noir
    const noirInputs = {
        doc_hash: Array.from(inputs.doc_hash),
        pub_key_x: Array.from(inputs.pub_key_x),
        pub_key_y: Array.from(inputs.pub_key_y),
        signer_fpr: inputs.signer_fpr,
        tl_root: inputs.tl_root,
        eu_trust_enabled: inputs.eu_trust_enabled,
        tl_root_eu: inputs.tl_root_eu,
        signature: Array.from(inputs.signature),
        merkle_path: inputs.merkle_path,
        index: inputs.index,
        eu_merkle_path: inputs.eu_merkle_path,
        eu_index: inputs.eu_index
    };

    // Load circuit
    const circuitPath = 'circuits/pades_ecdsa_hybrid/target/pades_ecdsa_hybrid.json';
    const circuit = JSON.parse(fs.readFileSync(circuitPath, 'utf-8'));

    console.log('\nGenerating witness with Noir...');
    const noir = new Noir(circuit);
    const { witness } = await noir.execute(noirInputs);

    // Save witness (uncompressed for bb)
    const outDir = 'out';
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const witnessPath = path.join(outDir, 'witness');
    fs.writeFileSync(witnessPath, witness);
    console.log(`  Witness saved to ${witnessPath}`);

    // Use native bb to generate proof
    console.log('\nGenerating proof with native bb...');
    const bbPath = process.env.BB_PATH || `${process.env.HOME}/.bb/bb`;
    const proofPath = path.join(outDir, 'proof');

    const cmd = `${bbPath} prove --scheme ultra_honk -b ${circuitPath} -w ${witnessPath} -o ${proofPath} -v`;
    console.log(`  Running: ${cmd}`);

    try {
        const output = execSync(cmd, { encoding: 'utf-8', stdio: 'inherit' });
    } catch (error: any) {
        console.error('\nError generating proof:', error.message);
        throw error;
    }

    console.log(`\n✅ Proof generated: ${proofPath}`);

    // Generate manifest
    const manifest = {
        version: 1,
        doc_hash: Buffer.from(inputs.doc_hash).toString('hex'),
        signer: {
            pub_x: Buffer.from(inputs.pub_key_x).toString('hex'),
            pub_y: Buffer.from(inputs.pub_key_y).toString('hex'),
            fingerprint: BigInt(inputs.signer_fpr).toString(16).padStart(64, '0')
        },
        tl_root: inputs.tl_root,
        proof: fs.readFileSync(proofPath).toString('base64'),
        timestamp: new Date().toISOString(),
        notes: 'Generated by prove-native.ts (native bb)'
    };

    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`✅ Manifest saved: out/manifest.json`);
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
