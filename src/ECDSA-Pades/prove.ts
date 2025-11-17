import fs from 'node:fs';
import path from 'node:path';
import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend as BarretenbergBackend } from '@aztec/bb.js';

interface ProofInputs {
    doc_hash: Uint8Array;
    pub_key_x: Uint8Array;
    pub_key_y: Uint8Array;
    signer_fpr: string;
    tl_root: string;
    signature: Uint8Array;
    merkle_path: string[];
    index: string;
}

async function loadInputs(): Promise<ProofInputs> {
    const outDir = 'out';

    const docHashPath = path.join(outDir, 'doc_hash.bin');
    if (!fs.existsSync(docHashPath)) {
        throw new Error(`Document hash not found: ${docHashPath}`);
    }
    const doc_hash = new Uint8Array(fs.readFileSync(docHashPath));
    if (doc_hash.length !== 32) {
        throw new Error(`Invalid doc_hash length: ${doc_hash.length} (expected 32)`);
    }

    const signedAttrsHashPath = path.join(outDir, 'signed_attrs_hash.bin');
    const message_for_sig = fs.existsSync(signedAttrsHashPath)
        ? new Uint8Array(fs.readFileSync(signedAttrsHashPath))
        : doc_hash;

    const pubkeyJsonPath = path.join(outDir, 'pubkey.json');
    if (!fs.existsSync(pubkeyJsonPath)) {
        throw new Error(`Public key file not found: ${pubkeyJsonPath}`);
    }
    const pubkeyData = JSON.parse(fs.readFileSync(pubkeyJsonPath, 'utf-8'));
    const pub_key_x = new Uint8Array(Buffer.from(pubkeyData.x, 'hex'));
    const pub_key_y = new Uint8Array(Buffer.from(pubkeyData.y, 'hex'));

    if (pub_key_x.length !== 32 || pub_key_y.length !== 32) {
        throw new Error(`Invalid public key length`);
    }

    const certPath = path.join(outDir, 'cert.der');
    if (!fs.existsSync(certPath)) {
        throw new Error(`Certificate not found: ${certPath}`);
    }

    const crypto = await import('node:crypto');
    const certDer = fs.readFileSync(certPath);
    const signer_fpr_bytes = crypto.createHash('sha256').update(certDer).digest();
    const signer_fpr_hex = signer_fpr_bytes.toString('hex');
    console.log(`  Signer fingerprint (hex): ${signer_fpr_hex}`);

    const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
    const signer_fpr_raw = BigInt('0x' + signer_fpr_hex);
    const signer_fpr = (signer_fpr_raw % FIELD_MODULUS).toString();

    const tlRootPath = path.join(outDir, 'tl_root_poseidon.txt');
    if (!fs.existsSync(tlRootPath)) {
        throw new Error(`Trust list root not found: ${tlRootPath}`);
    }
    const tl_root = fs.readFileSync(tlRootPath, 'utf-8').trim();

    const proofPath = path.join(outDir, 'paths-poseidon', `${signer_fpr_hex}.json`);
    if (!fs.existsSync(proofPath)) {
        throw new Error(`Merkle proof not found: ${proofPath}\nSigner fingerprint: ${signer_fpr_hex}`);
    }

    const proofData = JSON.parse(fs.readFileSync(proofPath, 'utf-8'));
    const merkle_path = proofData.merkle_path_decimal || [];

    while (merkle_path.length < 8) {
        merkle_path.push('0');
    }

    const index = proofData.index.toString();

    const sigJsonPath = path.join(outDir, 'sig.json');
    if (!fs.existsSync(sigJsonPath)) {
        throw new Error(`Signature file not found: ${sigJsonPath}`);
    }
    const sigData = JSON.parse(fs.readFileSync(sigJsonPath, 'utf-8'));

    const signature = new Uint8Array(Buffer.from(sigData.signature, 'hex'));
    if (signature.length !== 64) {
        throw new Error(`Invalid signature length: ${signature.length} (expected 64)`);
    }

    return {
        doc_hash: message_for_sig,
        pub_key_x,
        pub_key_y,
        signer_fpr,
        tl_root,
        signature,
        merkle_path,
        index,
    };
}

async function compileCircuit() {
    const circuitDir = '../../circuits/pades_ecdsa_hybrid';
    const targetDir = path.join(circuitDir, 'target');

    const compiledPath = path.join(targetDir, 'pades_ecdsa_hybrid.json');
    if (!fs.existsSync(compiledPath)) {
        console.log('Circuit not compiled. Compiling now...');
        const { execSync } = await import('node:child_process');
        execSync('nargo compile', {
            cwd: circuitDir,
            stdio: 'inherit'
        });
    }

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
    console.log(`  index:        ${inputs.index}`);
    console.log(`  signature:    ${Buffer.from(inputs.signature).toString('hex')}`);

    console.log('\nCompiling circuit...');
    const circuit = await compileCircuit();

    console.log('Initializing Noir...');
    const noir = new Noir(circuit);

    console.log('Initializing Barretenberg backend with increased memory...');
    const backend = new BarretenbergBackend(circuit.bytecode, {
        threads: 4,
        memory: {
            initial: 256,
            maximum: 65536
        }
    });

    const noirInputs = {
        doc_hash: Array.from(inputs.doc_hash),
        pub_key_x: Array.from(inputs.pub_key_x),
        pub_key_y: Array.from(inputs.pub_key_y),
        signer_fpr: inputs.signer_fpr,
        tl_root: inputs.tl_root,
        signature: Array.from(inputs.signature),
        merkle_path: inputs.merkle_path,
        index: inputs.index,
    };

    console.log('\nGenerating witness...');
    const { witness } = await noir.execute(noirInputs);

    console.log('Generating proof...');
    const proof = await backend.generateProof(witness);

    console.log(`Proof generated! Size: ${proof.proof.length} bytes`);

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

    const vkey = await backend.getVerificationKey();
    fs.writeFileSync(vkeyPath, vkey);

    const manifest: any = {
        version: 1,
        doc_hash: Buffer.from(inputs.doc_hash).toString('hex'),
        signer: {
            pub_x: Buffer.from(inputs.pub_key_x).toString('hex'),
            pub_y: Buffer.from(inputs.pub_key_y).toString('hex'),
            fingerprint: BigInt(inputs.signer_fpr).toString(16).padStart(64, '0')
        },
        tl_root: inputs.tl_root,
        proof: Buffer.from(proof.proof).toString('base64'),
        timestamp: new Date().toISOString(),
        notes: 'Generated by prove.ts (hybrid Pedersen circuit)'
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`\nOutputs written:`);
    console.log(`  Proof:    ${proofPath}`);
    console.log(`  Proof JSON: ${proofJsonPath}`);
    console.log(`  VKey:     ${vkeyPath}`);
    console.log(`  Manifest: ${manifestPath}`);

    console.log('\n✓ Proof generation complete!');

    await backend.destroy();
}

main().catch(async err => {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
});
