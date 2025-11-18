import fs from 'node:fs';
import path from 'node:path';
import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend as BarretenbergBackend } from '@aztec/bb.js';
import { getByteRangeHash } from "./byte-range.ts";
import { extractSignatureFromPDF } from './signature.ts';
import { createMerkleTreeFromAllowlist } from './tree.ts';
import { sha256 } from '../utils.ts';

const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

interface PreparationResult {
    doc_hash: Uint8Array;
    signed_attrs_hash: Uint8Array;
    pub_key_x: Uint8Array;
    pub_key_y: Uint8Array;
    signature: Uint8Array;
    certificate: Buffer;
    signer_fpr_hex: string;
    signer_fpr: string;
    tl_root: string;
    merkle_path: string[];
    index: string;
}

interface ProofResult {
    proof: Uint8Array;
    publicInputs: string[];
    vkey: Uint8Array;
    manifest: any;
}

async function preparePDF(pdfPath: string, allowlistPath: string, isDump: boolean = false, outDir: string = 'out'): Promise<PreparationResult> {
    console.log('=== PDF Preparation Phase ===\n');

    if (!fs.existsSync(pdfPath)) {
        throw new Error(`File not found: ${pdfPath}`);
    }
    const pdfBuffer = fs.readFileSync(pdfPath);

    if (isDump && !fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    console.log(`[1/5] Computing document hash (ByteRange)...`);
    const byteRangeHash = await getByteRangeHash(pdfBuffer, isDump, outDir);
    const doc_hash = new Uint8Array(Buffer.from(byteRangeHash, 'hex'));

    console.log(`\n[2/5] Extracting signature and certificate...`);
    const extractedData = await extractSignatureFromPDF(pdfBuffer, outDir, isDump);

    console.log(`\n[3/5] Computing signer fingerprint...`);
    const signer_fpr_bytes = sha256(extractedData.certificate);
    const signer_fpr_hex = Buffer.from(signer_fpr_bytes).toString('hex');
    const signer_fpr_raw = BigInt('0x' + signer_fpr_hex);
    const signer_fpr = (signer_fpr_raw % FIELD_MODULUS).toString();

    console.log(`  Fingerprint (hex):     ${signer_fpr_hex}`);
    console.log(`  Fingerprint (decimal): ${signer_fpr}`);

    console.log(`\n[4/5] Building Merkle tree from allowlist...`);
    if (!fs.existsSync(allowlistPath)) {
        throw new Error(`File not found: ${allowlistPath}`);
    }

    const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf-8'));
    const { root, proofs } = await createMerkleTreeFromAllowlist(allowlist, outDir, isDump);

    console.log(`\n[5/5] Loading Merkle proof for signer...`);
    const signerProof = proofs.find(p => p.fingerprint === signer_fpr_hex);
    
    if (!signerProof) {
        throw new Error(`Signer not found in allowlist! Fingerprint: ${signer_fpr_hex}`);
    }

    console.log(`  ✓ Signer found in allowlist (index ${signerProof.index})`);
    console.log(`  ✓ Merkle proof loaded`);

    if (isDump) {
        const pathsPoseidonDir = path.join(outDir, 'paths-poseidon');
        if (!fs.existsSync(pathsPoseidonDir)) {
            fs.mkdirSync(pathsPoseidonDir, { recursive: true });
        }
        fs.writeFileSync(
            path.join(pathsPoseidonDir, `${signer_fpr_hex}.json`),
            JSON.stringify(signerProof, null, 2)
        );
    }

    const signature = Buffer.concat([extractedData.signature.r, extractedData.signature.s]);

    return {
        doc_hash,
        signed_attrs_hash: extractedData.signedAttrsHash,
        pub_key_x: extractedData.publicKey.x,
        pub_key_y: extractedData.publicKey.y,
        signature: new Uint8Array(signature),
        certificate: extractedData.certificate,
        signer_fpr_hex,
        signer_fpr,
        tl_root: root,
        merkle_path: signerProof.merkle_path_decimal,
        index: signerProof.index.toString()
    };
}

async function generateProof(prep: PreparationResult, circuitPath: string, isDump: boolean = false, outDir: string = 'out'): Promise<ProofResult> {
    console.log('\n=== Proof Generation Phase ===\n');

    const message_for_sig = prep.signed_attrs_hash;

    console.log('Loading inputs...');
    console.log(`  doc_hash:     ${Buffer.from(message_for_sig).toString('hex')}`);
    console.log(`  pub_key_x:    ${Buffer.from(prep.pub_key_x).toString('hex')}`);
    console.log(`  pub_key_y:    ${Buffer.from(prep.pub_key_y).toString('hex')}`);
    console.log(`  signer_fpr:   ${prep.signer_fpr} (Field)`);
    console.log(`  tl_root:      ${prep.tl_root} (Field)`);
    console.log(`  index:        ${prep.index}`);
    console.log(`  signature:    ${Buffer.from(prep.signature).toString('hex')}`);

    console.log('\nCompiling circuit...');
    const circuitDir = circuitPath;
    const circuitName = path.basename(circuitPath);
    const compiledPath = path.join(circuitDir, 'target', `${circuitName}.json`);
    
    if (!fs.existsSync(compiledPath)) {
        console.log('Circuit not compiled. Compiling now...');
        const { execSync } = await import('node:child_process');
        execSync('nargo compile', {
            cwd: circuitDir,
            stdio: 'inherit'
        });
    }

    const circuit = JSON.parse(fs.readFileSync(compiledPath, 'utf-8'));

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

    const merkle_path = [...prep.merkle_path];
    while (merkle_path.length < 8) {
        merkle_path.push('0');
    }

    const noirInputs = {
        doc_hash: Array.from(message_for_sig),
        pub_key_x: Array.from(prep.pub_key_x),
        pub_key_y: Array.from(prep.pub_key_y),
        signer_fpr: prep.signer_fpr,
        tl_root: prep.tl_root,
        signature: Array.from(prep.signature),
        merkle_path: merkle_path,
        index: prep.index,
    };

    console.log('\nGenerating witness...');
    const { witness } = await noir.execute(noirInputs);

    console.log('Generating proof...');
    const proof = await backend.generateProof(witness);

    console.log(`Proof generated! Size: ${proof.proof.length} bytes`);

    const vkey = await backend.getVerificationKey();

    const manifest = {
        version: 1,
        doc_hash: Buffer.from(message_for_sig).toString('hex'),
        signer: {
            pub_x: Buffer.from(prep.pub_key_x).toString('hex'),
            pub_y: Buffer.from(prep.pub_key_y).toString('hex'),
            fingerprint: prep.signer_fpr_hex
        },
        tl_root: prep.tl_root,
        proof: Buffer.from(proof.proof).toString('base64'),
        timestamp: new Date().toISOString(),
        notes: 'Generated by run.ts'
    };

    if (isDump) {
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }

        const proofJsonPath = path.join(outDir, 'proof.json');
        const vkeyPath = path.join(outDir, 'vkey.bin');
        const manifestPath = path.join(outDir, 'manifest.json');

        fs.writeFileSync(proofJsonPath, JSON.stringify({
            proof: Buffer.from(proof.proof).toString('hex'),
            publicInputs: proof.publicInputs
        }, null, 2));

        fs.writeFileSync(vkeyPath, vkey);
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

        console.log(`\nOutputs written:`);
        console.log(`  Proof JSON: ${proofJsonPath}`);
        console.log(`  VKey:     ${vkeyPath}`);
        console.log(`  Manifest: ${manifestPath}`);
    }

    console.log('\n✓ Proof generation complete!');

    await backend.destroy();

    return {
        proof: proof.proof,
        publicInputs: proof.publicInputs,
        vkey,
        manifest
    };
}

async function verifyProof(proofResult: ProofResult, circuitPath: string, expectedTlRoot?: string): Promise<boolean> {
    console.log('\n=== Verification Phase ===\n');

    console.log('[1/3] Loading manifest...');
    const manifest = proofResult.manifest;

    console.log(`  Version:   ${manifest.version}`);
    console.log(`  Timestamp: ${manifest.timestamp}`);
    console.log(`  Doc hash:  ${manifest.doc_hash}`);
    console.log(`  Signer:    ${manifest.signer.fingerprint}`);

    if (expectedTlRoot) {
        console.log('\n[2/3] Verifying trust list membership...');
        if (expectedTlRoot === manifest.tl_root) {
            console.log(`  ✓ Trust list root matches`);
        } else {
            console.error(`  ✗ Trust list root mismatch!`);
            console.error(`    Expected: ${expectedTlRoot}`);
            console.error(`    Got:      ${manifest.tl_root}`);
            return false;
        }
    }

    console.log('\n[3/3] Verifying zero-knowledge proof...');

    const circuitDir = circuitPath;
    const circuitName = path.basename(circuitPath);
    const compiledPath = path.join(circuitDir, 'target', `${circuitName}.json`);

    if (!fs.existsSync(compiledPath)) {
        throw new Error('Circuit not compiled. Run proof generation first.');
    }

    const circuit = JSON.parse(fs.readFileSync(compiledPath, 'utf-8'));
    const backend = new BarretenbergBackend(circuit.bytecode);

    try {
        const isValid = await backend.verifyProof({
            proof: proofResult.proof,
            publicInputs: proofResult.publicInputs
        });

        if (isValid) {
            console.log('  ✓ ZK proof verified!\n');
            console.log('═══════════════════════════════════════════════════');
            console.log('✅ ALL VERIFICATIONS PASSED!');
            console.log('═══════════════════════════════════════════════════\n');

            await backend.destroy();
            return true;
        } else {
            console.log('\n❌ PROOF VERIFICATION FAILED');
            console.log('The proof is invalid or was generated incorrectly.');

            await backend.destroy();
            return false;
        }
    } catch (error) {
        console.error('\n❌ VERIFICATION ERROR:', error);

        try {
            await backend.destroy();
        } catch (e) {
        }
        return false;
    }
}

async function main() {
    const pdfPath = '../../examples/ECDSA/ECDSA.pdf';
    const allowlistPath = 'allowlist.json';
    const circuitPath = '../../circuits/pades_ecdsa_pedersen';
    const isDump = false;
    const outDir = 'out';

    const prep = await preparePDF(pdfPath, allowlistPath, isDump, outDir);
    const proofResult = await generateProof(prep, circuitPath, isDump, outDir);
    const isValid = await verifyProof(proofResult, circuitPath, prep.tl_root);

    if (!isValid) {
        process.exit(1);
    }
}

main().catch(err => {
    console.error('\n❌ ERROR:', err.message);
    if (err.stack) {
        console.error(err.stack);
    }
    process.exit(1);
});
