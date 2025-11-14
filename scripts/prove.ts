#!/usr/bin/env node
/**
 * prove.ts
 *
 * Generates a Noir proof for ECDSA P-256 signature verification.
 * Reads inputs from out/ directory and creates a ZK proof.
 *
 * Usage: yarn prove                  # Local trust list only
 *        yarn prove --eu-trust       # Enable EU Trust List verification
 *
 * Flags:
 *   --eu-trust    Enable dual trust verification (local allowlist + EU Trust List)
 */

import fs from 'node:fs';
import path from 'node:path';
import { Noir } from '@noir-lang/noir_js';
import { UltraPlonkBackend as BarretenbergBackend } from '@aztec/bb.js';

interface ProofInputs {
    doc_hash: Uint8Array;
    pub_key_x: Uint8Array;
    pub_key_y: Uint8Array;
    signer_fpr: string; // Field as decimal string (Pedersen leaf)
    tl_root: string; // Field as decimal string (Pedersen root)
    eu_trust_enabled: boolean; // Feature flag for EU trust verification
    tl_root_eu: string; // EU Trust List Merkle root (Field as decimal string)
    signature: Uint8Array;
    merkle_path: string[]; // Array of Field values as decimal strings
    index: string; // Field as decimal string
    eu_merkle_path: string[]; // EU Trust List Merkle path (Fields as decimal strings)
    eu_index: string; // EU tree leaf index
}

interface EUTrustData {
    tl_root_eu: string; // Field as decimal string
    eu_merkle_path: string[]; // Array of Field values as decimal strings
    eu_index: string;
}

function loadEUTrustData(signerFingerprint: string): EUTrustData {
    const outDir = 'out';

    // Load EU Trust List root (Pedersen/Poseidon - decimal format)
    const euRootPath = path.join(outDir, 'tl_root_eu_poseidon.txt');
    if (!fs.existsSync(euRootPath)) {
        throw new Error(`EU Trust List root not found: ${euRootPath}. Run 'yarn eutl:fetch' and 'yarn eutl:root' first.`);
    }
    const tl_root_eu = fs.readFileSync(euRootPath, 'utf-8').trim();

    // Load EU Merkle proof for this signer (Poseidon format)
    const euProofPath = path.join(outDir, 'eu_paths_poseidon', `${signerFingerprint}.json`);
    if (!fs.existsSync(euProofPath)) {
        throw new Error(`EU Merkle proof not found: ${euProofPath}\nSigner fingerprint: ${signerFingerprint}\nRun 'yarn eutl:root' to generate EU proofs.`);
    }

    const euProofData = JSON.parse(fs.readFileSync(euProofPath, 'utf-8'));

    // Use decimal Field values for Pedersen Merkle tree
    const eu_merkle_path = euProofData.merkle_path_decimal || [];

    // Ensure exactly 8 elements
    while (eu_merkle_path.length < 8) {
        eu_merkle_path.push('0');
    }

    const eu_index = euProofData.index.toString();

    return {
        tl_root_eu,
        eu_merkle_path,
        eu_index
    };
}

async function loadInputs(): Promise<ProofInputs> {
    const outDir = 'out';

    // 1. Read document hash (PDF ByteRange hash)
    const docHashPath = path.join(outDir, 'doc_hash.bin');
    if (!fs.existsSync(docHashPath)) {
        throw new Error(`Document hash not found: ${docHashPath}`);
    }
    const doc_hash = new Uint8Array(fs.readFileSync(docHashPath));
    if (doc_hash.length !== 32) {
        throw new Error(`Invalid doc_hash length: ${doc_hash.length} (expected 32)`);
    }

    // TEMP: CAdES signatures sign over signedAttrs, not doc_hash directly
    // Use signed_attrs_hash for ECDSA verification
    const signedAttrsHashPath = path.join(outDir, 'VERIFIED_signed_attrs_hash.bin');
    const message_for_sig = fs.existsSync(signedAttrsHashPath)
        ? new Uint8Array(fs.readFileSync(signedAttrsHashPath))
        : doc_hash;

    // 2. Read public key - use VERIFIED from PKI.js
    const pubkeyJsonPath = path.join(outDir, 'VERIFIED_pubkey.json');
    if (!fs.existsSync(pubkeyJsonPath)) {
        throw new Error(`Public key file not found: ${pubkeyJsonPath}. Run 'yarn extract-cms' first.`);
    }
    const pubkeyData = JSON.parse(fs.readFileSync(pubkeyJsonPath, 'utf-8'));
    const pub_key_x = new Uint8Array(Buffer.from(pubkeyData.x, 'hex'));
    const pub_key_y = new Uint8Array(Buffer.from(pubkeyData.y, 'hex'));

    if (pub_key_x.length !== 32 || pub_key_y.length !== 32) {
        throw new Error(`Invalid public key length`);
    }

    // 3. Compute signer fingerprint (SHA-256 of certificate DER)
    const certPath = path.join(outDir, 'cms_embedded_cert.pem');
    if (!fs.existsSync(certPath)) {
        throw new Error(`Certificate not found: ${certPath}`);
    }

    // Convert PEM to DER and compute SHA-256
    const crypto = await import('node:crypto');
    const { execSync } = await import('node:child_process');

    // Extract DER from PEM - properly extract only the base64 between BEGIN and END
    const certPem = fs.readFileSync(certPath, 'utf-8');
    const beginMarker = '-----BEGIN CERTIFICATE-----';
    const endMarker = '-----END CERTIFICATE-----';
    const beginIndex = certPem.indexOf(beginMarker);
    const endIndex = certPem.indexOf(endMarker);

    if (beginIndex === -1 || endIndex === -1) {
        throw new Error('Invalid PEM format: missing BEGIN or END marker');
    }

    const base64Content = certPem
        .substring(beginIndex + beginMarker.length, endIndex)
        .replace(/\s/g, '');

    const certDer = Buffer.from(base64Content, 'base64');

    const signer_fpr_bytes = crypto.createHash('sha256').update(certDer).digest();
    const signer_fpr_hex = signer_fpr_bytes.toString('hex');

    // Convert signer fingerprint to Field (decimal string for Pedersen)
    const signer_fpr = BigInt('0x' + signer_fpr_hex).toString();

    // 4. Read Pedersen Merkle tree root and proof
    const tlRootPath = path.join(outDir, 'tl_root_poseidon.txt');
    if (!fs.existsSync(tlRootPath)) {
        throw new Error(`Trust list root not found: ${tlRootPath}. Run 'yarn merkle-poseidon:build' first.`);
    }
    const tl_root = fs.readFileSync(tlRootPath, 'utf-8').trim();

    // Find the Merkle proof for this signer (Poseidon format)
    const proofPath = path.join(outDir, 'paths-poseidon', `${signer_fpr_hex}.json`);
    if (!fs.existsSync(proofPath)) {
        throw new Error(`Merkle proof not found: ${proofPath}\nSigner fingerprint: ${signer_fpr_hex}\nRun 'yarn merkle-poseidon:build' to generate proofs.`);
    }

    const proofData = JSON.parse(fs.readFileSync(proofPath, 'utf-8'));

    // Use decimal Field values for Pedersen Merkle tree
    const merkle_path = proofData.merkle_path_decimal || [];

    // Ensure exactly 8 elements
    while (merkle_path.length < 8) {
        merkle_path.push('0');
    }

    const index = proofData.index.toString();

    // 5. Read signature - use VERIFIED from PKI.js
    const sigJsonPath = path.join(outDir, 'VERIFIED_sig.json');
    if (!fs.existsSync(sigJsonPath)) {
        throw new Error(`Signature file not found: ${sigJsonPath}`);
    }
    const sigData = JSON.parse(fs.readFileSync(sigJsonPath, 'utf-8'));

    if (sigData.isRSA) {
        throw new Error('RSA signatures are not supported. Use ECDSA P-256.');
    }

    const signature = new Uint8Array(Buffer.from(sigData.signature, 'hex'));
    if (signature.length !== 64) {
        throw new Error(`Invalid signature length: ${signature.length} (expected 64)`);
    }

    // 6. Check for --eu-trust flag and load EU Trust List data
    const euTrustEnabled = process.argv.includes('--eu-trust');
    let euTrustData: EUTrustData;

    if (euTrustEnabled) {
        console.log('EU Trust verification enabled, loading EU Trust List data...');
        euTrustData = loadEUTrustData(signer_fpr_hex);
        console.log(`  EU root:  ${euTrustData.tl_root_eu}`);
        console.log(`  EU index: ${euTrustData.eu_index}`);
    } else {
        // Provide zero values when EU trust is disabled (backward compatibility)
        euTrustData = {
            tl_root_eu: '0',
            eu_merkle_path: Array(8).fill('0'),
            eu_index: '0'
        };
    }

    return {
        doc_hash: message_for_sig,  // TEMP: Use signed_attrs_hash for ECDSA verification
        pub_key_x,
        pub_key_y,
        signer_fpr,  // Field as decimal string
        tl_root,     // Field as decimal string
        eu_trust_enabled: euTrustEnabled,
        tl_root_eu: euTrustData.tl_root_eu,  // Field as decimal string
        signature,
        merkle_path,      // Array of Field decimal strings
        index,
        eu_merkle_path: euTrustData.eu_merkle_path,  // Array of Field decimal strings
        eu_index: euTrustData.eu_index
    };
}

async function compileCircuit() {
    const circuitDir = 'circuits/pades_ecdsa_hybrid';
    const targetDir = path.join(circuitDir, 'target');

    // Check if circuit is already compiled
    const compiledPath = path.join(targetDir, 'pades_ecdsa_hybrid.json');
    if (!fs.existsSync(compiledPath)) {
        console.log('Circuit not compiled. Compiling now...');
        const { execSync } = await import('node:child_process');
        execSync('nargo compile', {
            cwd: circuitDir,
            stdio: 'inherit'
        });
    }

    // Load compiled circuit
    const circuitArtifact = JSON.parse(fs.readFileSync(compiledPath, 'utf-8'));
    return circuitArtifact;
}

async function main() {
    console.log('Loading inputs...');
    const inputs = await loadInputs();

    console.log(`  doc_hash:     ${Buffer.from(inputs.doc_hash).toString('hex')}`);
    console.log(`  pub_key_x:    ${Buffer.from(inputs.pub_key_x).toString('hex')}`);
    console.log(`  pub_key_y:    ${Buffer.from(inputs.pub_key_y).toString('hex')}`);
    console.log(`  signer_fpr:   ${inputs.signer_fpr} (Field)`);
    console.log(`  tl_root:      ${inputs.tl_root} (Field)`);
    console.log(`  eu_trust:     ${inputs.eu_trust_enabled ? 'ENABLED' : 'disabled'}`);
    if (inputs.eu_trust_enabled) {
        console.log(`  tl_root_eu:   ${inputs.tl_root_eu} (Field)`);
        console.log(`  eu_index:     ${inputs.eu_index}`);
    }
    console.log(`  index:        ${inputs.index}`);
    console.log(`  signature:    ${Buffer.from(inputs.signature).toString('hex')}`);

    console.log('\nCompiling circuit...');
    const circuit = await compileCircuit();

    console.log('Initializing Noir...');
    const noir = new Noir(circuit);

    console.log('Initializing Barretenberg backend with increased memory...');
    // @aztec/bb.js expects the bytecode string, not the whole circuit object
    // Increase WASM memory to avoid "unreachable" errors
    const backend = new BarretenbergBackend(circuit.bytecode, {
        threads: 4,
        memory: {
            initial: 256,    // 256 pages = 16MB
            maximum: 65536   // 65536 pages = 4GB
        }
    });

    // Prepare inputs in Noir format
    const noirInputs = {
        doc_hash: Array.from(inputs.doc_hash),
        pub_key_x: Array.from(inputs.pub_key_x),
        pub_key_y: Array.from(inputs.pub_key_y),
        signer_fpr: inputs.signer_fpr,  // Field as string
        tl_root: inputs.tl_root,        // Field as string
        eu_trust_enabled: inputs.eu_trust_enabled,
        tl_root_eu: inputs.tl_root_eu,  // Field as string
        signature: Array.from(inputs.signature),
        merkle_path: inputs.merkle_path,      // Array of Field strings
        index: inputs.index,
        eu_merkle_path: inputs.eu_merkle_path, // Array of Field strings
        eu_index: inputs.eu_index
    };

    console.log('\nGenerating witness...');
    const { witness } = await noir.execute(noirInputs);

    console.log('Generating proof...');
    const proof = await backend.generateProof(witness);

    console.log(`Proof generated! Size: ${proof.proof.length} bytes`);

    // Save proof
    const outDir = 'out';
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const proofPath = path.join(outDir, 'proof.bin');
    const proofJsonPath = path.join(outDir, 'proof.json');
    const vkeyPath = path.join(outDir, 'vkey.bin');
    const manifestPath = path.join(outDir, 'manifest.json');

    fs.writeFileSync(proofPath, proof.proof);

    fs.writeFileSync(proofJsonPath, JSON.stringify({
        proof: Buffer.from(proof.proof).toString('hex'),
        publicInputs: proof.publicInputs
    }, null, 2));

    // Generate and save verification key
    const vkey = await backend.getVerificationKey();
    fs.writeFileSync(vkeyPath, vkey);

    // Generate protocol manifest
    const manifest: any = {
        version: 1,
        doc_hash: Buffer.from(inputs.doc_hash).toString('hex'),
        signer: {
            pub_x: Buffer.from(inputs.pub_key_x).toString('hex'),
            pub_y: Buffer.from(inputs.pub_key_y).toString('hex'),
            fingerprint: BigInt(inputs.signer_fpr).toString(16).padStart(64, '0')  // Convert Field back to hex
        },
        tl_root: inputs.tl_root,  // Store as Field decimal string
        proof: Buffer.from(proof.proof).toString('base64'),
        timestamp: new Date().toISOString(),
        notes: 'Generated by prove.ts (hybrid Pedersen circuit)'
    };

    // Add EU trust information if enabled
    if (inputs.eu_trust_enabled) {
        manifest.eu_trust = {
            enabled: true,
            tl_root_eu: inputs.tl_root_eu,  // Store as Field decimal string
            eu_index: inputs.eu_index
        };
    } else {
        manifest.eu_trust = {
            enabled: false
        };
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`\nOutputs written:`);
    console.log(`  Proof:    ${proofPath}`);
    console.log(`  Proof JSON: ${proofJsonPath}`);
    console.log(`  VKey:     ${vkeyPath}`);
    console.log(`  Manifest: ${manifestPath}`);

    console.log('\n✓ Proof generation complete!');

    // Explicitly exit to prevent hanging due to Barretenberg handles
    process.exit(0);
}

main().catch(err => {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
});
