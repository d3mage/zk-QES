import fs from 'node:fs';
import path from 'node:path';
import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend as BarretenbergBackend } from '@aztec/bb.js';
import { getByteRangeHash } from '../ECDSA-Pades/byte-range.ts';
import { extractRsaSignatureFromPDF } from './signature.ts';
import { createMerkleTreeFromAllowlist } from '../ECDSA-Pades/tree.ts';
import { sha256 } from '../utils.ts';

const FIELD_MODULUS =
    21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function modulusToLimbs(modulusBytes: Uint8Array): string[] {
    let modulus = 0n;
    for (let i = 0; i < modulusBytes.length; i++) {
        modulus = (modulus << 8n) | BigInt(modulusBytes[i]);
    }

    const limbs: string[] = [];
    // noir-bignum uses 120-bit limbs (15 bytes each)
    const LIMB_BITS = 120n;
    const limbMask = (1n << LIMB_BITS) - 1n;
    
    for (let i = 0; i < 18; i++) {
        limbs.push((modulus & limbMask).toString());
        modulus = modulus >> LIMB_BITS;
    }
    
    return limbs;
}

function calculateRedcParam(modulusBytes: Uint8Array): string[] {
    let N = 0n;
    for (let i = 0; i < modulusBytes.length; i++) {
        N = (N << 8n) | BigInt(modulusBytes[i]);
    }

    // noir-bignum uses 120-bit limbs (15 bytes each)
    const LIMB_BITS = 120n;
    const R = 1n << (LIMB_BITS * 18n);
    const R_squared = (R * R) % N;
    
    const limbs: string[] = [];
    const limbMask = (1n << LIMB_BITS) - 1n;
    let value = R_squared;
    
    for (let i = 0; i < 18; i++) {
        limbs.push((value & limbMask).toString());
        value = value >> LIMB_BITS;
    }
    
    return limbs;
}

interface PreparationResult {
    doc_hash: Uint8Array;             // SHA-256(ByteRange) of the PDF
    signed_attrs_hash: Uint8Array;    // SHA-256(DER-encoded SignedAttributes)
    pub_key_n: Uint8Array;            // RSA modulus (n)
    modulus_limbs: string[];          // RSA modulus as 18 limbs
    redc_limbs: string[];             // Montgomery reduction params as 18 limbs
    exponent: number;                 // RSA exponent as u32
    signature: Uint8Array;            // raw RSA signature bytes
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

async function preparePDF(
    pdfPath: string,
    allowlistPath: string,
    isDump: boolean = false,
    outDir: string = 'out'
): Promise<PreparationResult> {
    console.log('=== PDF Preparation Phase ===\n');

    if (!fs.existsSync(pdfPath)) {
        throw new Error(`File not found: ${pdfPath}`);
    }
    const pdfBuffer = fs.readFileSync(pdfPath);

    if (isDump && !fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    console.log('[1/5] Computing document hash (ByteRange)...');
    const byteRangeHash = await getByteRangeHash(pdfBuffer, isDump, outDir);
    const doc_hash = new Uint8Array(Buffer.from(byteRangeHash, 'hex'));

    console.log('\n[2/5] Extracting signature and certificate (RSA)...');
    const extractedData = await extractRsaSignatureFromPDF(pdfBuffer, outDir, isDump);

    console.log('\n[3/5] Computing signer fingerprint...');
    const signer_fpr_bytes = sha256(extractedData.certificate);
    const signer_fpr_hex = Buffer.from(signer_fpr_bytes).toString('hex');
    const signer_fpr_raw = BigInt('0x' + signer_fpr_hex);
    const signer_fpr = (signer_fpr_raw % FIELD_MODULUS).toString();

    console.log(`  Fingerprint (hex):     ${signer_fpr_hex}`);
    console.log(`  Fingerprint (decimal): ${signer_fpr}`);

    console.log('\n[4/5] Building Merkle tree from allowlist...');
    if (!fs.existsSync(allowlistPath)) {
        throw new Error(`File not found: ${allowlistPath}`);
    }

    const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf-8'));
    const { root, proofs } = await createMerkleTreeFromAllowlist(allowlist, outDir, isDump);

    console.log('\n[5/5] Loading Merkle proof for signer...');
    const signerProof = proofs.find((p: any) => p.fingerprint === signer_fpr_hex);

    if (!signerProof) {
        throw new Error(`Signer not found in allowlist! Fingerprint: ${signer_fpr_hex}`);
    }

    console.log(`  ✓ Signer found in allowlist (index ${signerProof.index})`);
    console.log('  ✓ Merkle proof loaded');

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

    const signatureBytes = extractedData.signature.signature;
    const pub_key_n = new Uint8Array(extractedData.publicKey.n);

    console.log(`\n[DEBUG] RSA key size: ${pub_key_n.length} bytes (${pub_key_n.length * 8} bits)`);
    console.log(`  modulus (first 32 bytes): ${Buffer.from(pub_key_n.slice(0, 32)).toString('hex')}`);
    
    const modulus_limbs = modulusToLimbs(pub_key_n);
    const redc_limbs = calculateRedcParam(pub_key_n);

    console.log(`  modulus_limbs count: ${modulus_limbs.length}`);
    console.log(`  redc_limbs count: ${redc_limbs.length}`);

    return {
        doc_hash,
        signed_attrs_hash: extractedData.signedAttrsHash,
        pub_key_n,
        modulus_limbs,
        redc_limbs,
        exponent: extractedData.publicKey.e,
        signature: new Uint8Array(signatureBytes),
        certificate: extractedData.certificate,
        signer_fpr_hex,
        signer_fpr,
        tl_root: root,
        merkle_path: signerProof.merkle_path_decimal,
        index: signerProof.index.toString()
    };
}

async function generateProof(
    prep: PreparationResult,
    circuitPath: string,
    isDump: boolean = false,
    outDir: string = 'out'
): Promise<ProofResult> {
    console.log('\n=== Proof Generation Phase ===\n');

    const signed_attrs_hash = prep.signed_attrs_hash;

    console.log('Loading inputs...');
    console.log(`  exponent:  ${prep.exponent}`);
    console.log(`  tl_root:   ${prep.tl_root}`);

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
        signed_attrs_hash: Array.from(signed_attrs_hash),
        modulus_limbs: prep.modulus_limbs,
        redc_limbs: prep.redc_limbs,
        signature_bytes: Array.from(prep.signature),
        exponent: prep.exponent,
        signer_fpr: prep.signer_fpr,
        tl_root: prep.tl_root,
        merkle_path,
        index: prep.index
    };

    console.log('\nDEBUG: Circuit inputs:');
    console.log('  signed_attrs_hash:', Buffer.from(noirInputs.signed_attrs_hash).toString('hex'));
    console.log('  modulus_limbs[0]:', noirInputs.modulus_limbs[0]);
    console.log('  modulus_limbs[17]:', noirInputs.modulus_limbs[17]);
    console.log('  redc_limbs[0]:', noirInputs.redc_limbs[0]);
    console.log('  redc_limbs[17]:', noirInputs.redc_limbs[17]);
    console.log('  signature_bytes length:', noirInputs.signature_bytes.length);
    console.log('  signature (first 32 bytes):', Buffer.from(noirInputs.signature_bytes.slice(0, 32)).toString('hex'));
    console.log('  exponent:', noirInputs.exponent);
    console.log('  index:', noirInputs.index);
    console.log('  merkle_path length:', noirInputs.merkle_path.length);

    console.log('\nGenerating witness...');
    const { witness } = await noir.execute(noirInputs);

    console.log('Generating proof...');
    const proof = await backend.generateProof(witness);

    console.log(`Proof generated! Size: ${proof.proof.length} bytes`);

    const vkey = await backend.getVerificationKey();

    const manifest = {
        version: 1,
        // Bind manifest to the actual PDF payload hash (ByteRange)
        doc_hash: Buffer.from(prep.doc_hash).toString('hex'),
        // Also expose the CMS SignedAttributes hash that was actually signed
        signed_attrs_hash: Buffer.from(signed_attrs_hash).toString('hex'),
        signer: {
            pub_n: Buffer.from(prep.pub_key_n).toString('hex'),
            exponent_dec: prep.exponent.toString(10),
            exponent_hex: '0x' + prep.exponent.toString(16),
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

        fs.writeFileSync(
            proofJsonPath,
            JSON.stringify(
                {
                    proof: Buffer.from(proof.proof).toString('hex'),
                    publicInputs: proof.publicInputs
                },
                null,
                2
            )
        );

        fs.writeFileSync(vkeyPath, vkey);
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

        console.log('\nOutputs written:');
        console.log(`  Proof JSON: ${proofJsonPath}`);
        console.log(`  VKey:       ${vkeyPath}`);
        console.log(`  Manifest:   ${manifestPath}`);
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

async function verifyProof(
    proofResult: ProofResult,
    circuitPath: string,
    expectedTlRoot?: string
): Promise<boolean> {
    console.log('\n=== Verification Phase ===\n');

    console.log('[1/3] Loading manifest...');
    const manifest = proofResult.manifest;

    console.log(`  Version:            ${manifest.version}`);
    console.log(`  Timestamp:          ${manifest.timestamp}`);
    console.log(`  Doc hash:           ${manifest.doc_hash}`);
    console.log(`  SignedAttrs hash:   ${manifest.signed_attrs_hash}`);
    console.log(`  Signer fingerprint: ${manifest.signer.fingerprint}`);
    console.log(`  Signer pub_n:       ${manifest.signer.pub_n}`);
    console.log(`  Signer exponent:    ${manifest.signer.exponent_dec} (${manifest.signer.exponent_hex})`);

    if (expectedTlRoot) {
        console.log('\n[2/3] Verifying trust list membership...');
        if (expectedTlRoot === manifest.tl_root) {
            console.log('  ✓ Trust list root matches');
        } else {
            console.error('  ✗ Trust list root mismatch!');
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
        } catch {
        }
        return false;
    }
}

async function main() {
    const pdfPath = '../../examples/RSA/RSA.pdf';
    const allowlistPath = 'allowlist.json';
    const circuitPath = '../../circuits/pades_rsa';
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
