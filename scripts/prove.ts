#!/usr/bin/env node
/**
 * prove.ts
 *
 * Generates a Noir proof for ECDSA P-256 signature verification.
 * Reads inputs from out/ directory and creates a ZK proof.
 *
 * Usage: yarn prove
 *   or: yarn prove --hash <hash-file> --sig <sig-file> --pub <pubkey-file>
 */

import fs from 'node:fs';
import path from 'node:path';
import { Noir } from '@noir-lang/noir_js';
import { UltraPlonkBackend as BarretenbergBackend } from '@aztec/bb.js';

interface ProofInputs {
    doc_hash: Uint8Array;
    artifact_hash: Uint8Array;
    pub_key_x: Uint8Array;
    pub_key_y: Uint8Array;
    signer_fpr: Uint8Array;
    tl_root: Uint8Array; // SHA-256 hash (32 bytes)
    signature: Uint8Array;
    merkle_path: number[][]; // Array of byte arrays (each 32 bytes)
    index: string; // Field as decimal string
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

    // 2. Read artifact hash (ciphertext or CID hash)
    // For now, use the cipher hash if it exists, otherwise use doc_hash as placeholder
    const cipherHashPath = path.join(outDir, 'cipher_hash.bin');
    let artifact_hash: Uint8Array;
    if (fs.existsSync(cipherHashPath)) {
        artifact_hash = new Uint8Array(fs.readFileSync(cipherHashPath));
        if (artifact_hash.length !== 32) {
            throw new Error(`Invalid artifact_hash length: ${artifact_hash.length} (expected 32)`);
        }
    } else {
        console.warn('Warning: cipher_hash.bin not found, using doc_hash as placeholder');
        artifact_hash = doc_hash;
    }

    // 3. Read public key - use VERIFIED from PKI.js
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

    // 4. Compute signer fingerprint (SHA-256 of certificate DER)
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

    const signer_fpr = crypto.createHash('sha256').update(certDer).digest();

    // 5. Read Merkle tree root and proof
    const tlRootPath = path.join(outDir, 'tl_root.hex');
    if (!fs.existsSync(tlRootPath)) {
        throw new Error(`Trust list root not found: ${tlRootPath}. Run 'yarn merkle:build' first.`);
    }
    const tlRootHex = fs.readFileSync(tlRootPath, 'utf-8').trim();
    const tl_root = new Uint8Array(Buffer.from(tlRootHex, 'hex'));

    // Find the Merkle proof for this signer
    const proofPath = path.join(outDir, 'paths', `${signer_fpr.toString('hex')}.json`);
    if (!fs.existsSync(proofPath)) {
        throw new Error(`Merkle proof not found: ${proofPath}\nSigner fingerprint: ${signer_fpr.toString('hex')}\nRun 'yarn merkle:build' to generate proofs.`);
    }

    const proofData = JSON.parse(fs.readFileSync(proofPath, 'utf-8'));

    // Convert path from hex to Field decimal strings (pad to 8 elements)
    const merkle_path = proofData.path.map((hex: string) => {
        const bytes = Buffer.from(hex, 'hex');
        return Array.from(new Uint8Array(bytes));
    });
    while (merkle_path.length < 8) {
        merkle_path.push(Array(32).fill(0)); // Pad with zero bytes
    }

    const index = proofData.index.toString();

    // 6. Read signature - use VERIFIED from PKI.js
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

    return {
        doc_hash: message_for_sig,  // TEMP: Use signed_attrs_hash for ECDSA verification
        artifact_hash,
        pub_key_x,
        pub_key_y,
        signer_fpr: new Uint8Array(signer_fpr),
        tl_root,
        signature,
        merkle_path,
        index
    };
}

async function compileCircuit() {
    const circuitDir = 'circuits/pades_ecdsa';
    const targetDir = path.join(circuitDir, 'target');

    // Check if circuit is already compiled
    const compiledPath = path.join(targetDir, 'pades_ecdsa.json');
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
    console.log(`  artifact_hash: ${Buffer.from(inputs.artifact_hash).toString('hex')}`);
    console.log(`  pub_key_x:    ${Buffer.from(inputs.pub_key_x).toString('hex')}`);
    console.log(`  pub_key_y:    ${Buffer.from(inputs.pub_key_y).toString('hex')}`);
    console.log(`  signer_fpr:   ${Buffer.from(inputs.signer_fpr).toString('hex')}`);
    console.log(`  tl_root:      ${Buffer.from(inputs.tl_root).toString('hex')}`);
    console.log(`  index:        ${inputs.index}`);
    console.log(`  signature:    ${Buffer.from(inputs.signature).toString('hex')}`);

    console.log('\nCompiling circuit...');
    const circuit = await compileCircuit();

    console.log('Initializing Noir...');
    const noir = new Noir(circuit);

    console.log('Initializing Barretenberg backend...');
    // @aztec/bb.js expects the bytecode string, not the whole circuit object
    const backend = new BarretenbergBackend(circuit.bytecode);

    // Prepare inputs in Noir format
    const noirInputs = {
        doc_hash: Array.from(inputs.doc_hash),
        artifact_hash: Array.from(inputs.artifact_hash),
        pub_key_x: Array.from(inputs.pub_key_x),
        pub_key_y: Array.from(inputs.pub_key_y),
        signer_fpr: Array.from(inputs.signer_fpr),
        tl_root: Array.from(inputs.tl_root),
        signature: Array.from(inputs.signature),
        merkle_path: inputs.merkle_path,
        index: inputs.index
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
    const manifest = {
        version: 1,
        doc_hash: Buffer.from(inputs.doc_hash).toString('hex'),
        artifact: {
            type: 'cipher',
            artifact_hash: Buffer.from(inputs.artifact_hash).toString('hex')
        },
        signer: {
            pub_x: Buffer.from(inputs.pub_key_x).toString('hex'),
            pub_y: Buffer.from(inputs.pub_key_y).toString('hex'),
            fingerprint: Buffer.from(inputs.signer_fpr).toString('hex')
        },
        tl_root: Buffer.from(inputs.tl_root).toString('hex'),
        proof: Buffer.from(proof.proof).toString('base64'),
        timestamp: new Date().toISOString(),
        notes: 'Generated by prove.ts'
    };

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
