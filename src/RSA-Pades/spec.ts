import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Noir } from '@noir-lang/noir_js';
import type { Barretenberg, UltraHonkBackend as BarretenbergBackend } from '@aztec/bb.js';
import { extractRsaSignatureFromPDF } from './signature.ts';
import type { RunSpec, ProofResult } from '../common/runner.ts';
import {
    type CommonPreparationResult,
    MAX_SIGNED_ATTRS_LEN,
    padMerklePath,
    prepareCommon,
    padBytes,
    verifyProofCommon,
    writeProofArtifacts
} from '../common/pades.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const DEFAULT_MODE = 'pedersen';

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

    // noir-bignum uses Barrett reduction with:
    // redc_param = 2^(2*MOD_BITS + 4) / modulus
    // (see BARRETT_REDUCTION_OVERFLOW_BITS = 4)
    const LIMB_BITS = 120n;
    const MOD_BITS = 2048n;
    const BARRETT_OVERFLOW_BITS = 4n;
    const numerator = 1n << (2n * MOD_BITS + BARRETT_OVERFLOW_BITS);
    const redc = numerator / N;

    const limbs: string[] = [];
    const limbMask = (1n << LIMB_BITS) - 1n;
    let value = redc;

    for (let i = 0; i < 18; i++) {
        limbs.push((value & limbMask).toString());
        value = value >> LIMB_BITS;
    }

    return limbs;
}

type PreparationResult = CommonPreparationResult & {
    pub_key_n: Uint8Array; // RSA modulus (n)
    modulus_limbs: string[]; // RSA modulus as 18 limbs
    redc_limbs: string[]; // Montgomery reduction params as 18 limbs
    exponent: number; // RSA exponent as u32
    signature: Uint8Array; // raw RSA signature bytes
};

type RsaManifest = {
    version: number;
    doc_hash: string;
    signed_attrs_hash: string;
    signer: {
        pub_n: string;
        exponent_dec: string;
        exponent_hex: string;
        fingerprint: string;
    };
    tl_root: string;
    proof: string;
    timestamp: string;
    notes: string;
};

type RsaProofResult = ProofResult<RsaManifest>;

export type RsaSpecOptions = {
    pdfPath: string;
    allowlistPath?: string;
    allowlistCertPaths?: string[];
    circuitPath?: string;
    outDir?: string;
    mode?: string;
    isDump?: boolean;
};

async function preparePDF(
    pdfPath: string,
    allowlistPath: string,
    mode: string,
    isDump: boolean = false,
    outDir: string = 'out',
    bbApi?: Barretenberg,
    allowlistCertPaths?: string[],
): Promise<PreparationResult> {
    const basePrep = await prepareCommon({
        pdfPath,
        allowlistPath,
        allowlistCertPaths,
        mode,
        isDump,
        outDir,
        bbApi,
        extractLabel: 'RSA',
        extract: async (pdfBuffer, extractOutDir, extractDump) => {
            const extractedData = await extractRsaSignatureFromPDF(pdfBuffer, extractOutDir, extractDump);
            const signatureBytes = extractedData.signature.signature;
            const pub_key_n = new Uint8Array(extractedData.publicKey.n);

            return {
                signedAttrsHash: extractedData.signedAttrsHash,
                signedAttrsDer: extractedData.signedAttrsDer,
                certificate: extractedData.certificate,
                publicKeyFingerprintBytes: extractedData.publicKeyFingerprintBytes,
                pub_key_n,
                exponent: extractedData.publicKey.e,
                signature: new Uint8Array(signatureBytes),
            };
        },
    });

    const pub_key_n = basePrep.pub_key_n;

    console.log('\nRSA key details:');
    console.log(`  size: ${pub_key_n.length} bytes (${pub_key_n.length * 8} bits)`);
    console.log(`  modulus (first 32 bytes): ${Buffer.from(pub_key_n.slice(0, 32)).toString('hex')}`);

    if (pub_key_n.length !== 256) {
        throw new Error(`Circuit expects 2048-bit modulus (256 bytes). Got ${pub_key_n.length} bytes.`);
    }
    if (basePrep.signature.length !== 256) {
        throw new Error(`Circuit expects 256-byte RSA signature. Got ${basePrep.signature.length} bytes.`);
    }
    if (basePrep.exponent <= 0 || basePrep.exponent >= 131072) {
        throw new Error(`RSA exponent must be in (0, 2^17). Got ${basePrep.exponent}.`);
    }

    const modulus_limbs = modulusToLimbs(pub_key_n);
    const redc_limbs = calculateRedcParam(pub_key_n);

    console.log(`  modulus_limbs count: ${modulus_limbs.length}`);
    console.log(`  redc_limbs count: ${redc_limbs.length}`);

    return {
        ...basePrep,
        modulus_limbs,
        redc_limbs,
    };
}

async function generateProof(
    prep: PreparationResult,
    noir: Noir,
    backend: BarretenbergBackend,
    isDump: boolean = false,
    outDir: string = 'out',
): Promise<RsaProofResult> {
    console.log('\n=== Proof Generation Phase ===\n');

    const signed_attrs_hash = prep.signed_attrs_hash;
    const signed_attrs_der = padBytes(prep.signed_attrs_der, MAX_SIGNED_ATTRS_LEN);
    const signed_attrs_len = prep.signed_attrs_der.length;

    const merkle_path = padMerklePath(prep.merkle_path, 8);

    const noirInputs = {
        doc_hash: Array.from(prep.doc_hash),
        signed_attrs_hash: Array.from(signed_attrs_hash),
        signed_attrs: Array.from(signed_attrs_der),
        signed_attrs_len,
        modulus_limbs: prep.modulus_limbs,
        redc_limbs: prep.redc_limbs,
        signature_bytes: Array.from(prep.signature),
        exponent: prep.exponent,
        signer_fpr: prep.signer_fpr,
        tl_root: prep.tl_root,
        merkle_path,
        index: prep.index,
    };

    console.log('Inputs:');
    console.log(`  doc_hash: ${Buffer.from(prep.doc_hash).toString('hex')}`);
    console.log(`  signed_attrs_hash: ${Buffer.from(noirInputs.signed_attrs_hash).toString('hex')}`);
    console.log(`  signed_attrs_len: ${signed_attrs_len}`);
    console.log(`  modulus_limbs[0]: ${noirInputs.modulus_limbs[0]}`);
    console.log(`  modulus_limbs[17]: ${noirInputs.modulus_limbs[17]}`);
    console.log(`  redc_limbs[0]: ${noirInputs.redc_limbs[0]}`);
    console.log(`  redc_limbs[17]: ${noirInputs.redc_limbs[17]}`);
    console.log(`  signature_bytes length: ${noirInputs.signature_bytes.length}`);
    console.log(
        `  signature (first 32 bytes): ${Buffer.from(noirInputs.signature_bytes.slice(0, 32)).toString('hex')}`,
    );
    console.log(`  exponent: ${noirInputs.exponent}`);
    console.log(`  tl_root: ${noirInputs.tl_root}`);
    console.log(`  index: ${noirInputs.index}`);
    console.log(`  merkle_path length: ${noirInputs.merkle_path.length}`);

    console.log('\nGenerating witness...');
    const { witness } = await noir.execute(noirInputs);

    console.log('Generating proof...');
    const proof = await backend.generateProof(witness);

    console.log(`✓ Proof generated (${proof.proof.length} bytes)`);

    const vkey = await backend.getVerificationKey();

    const manifest: RsaManifest = {
        version: 1,
        // Bind manifest to the actual PDF payload hash (ByteRange)
        doc_hash: Buffer.from(prep.doc_hash).toString('hex'),
        // Also expose the CMS SignedAttributes hash that was actually signed
        signed_attrs_hash: Buffer.from(signed_attrs_hash).toString('hex'),
        signer: {
            pub_n: Buffer.from(prep.pub_key_n).toString('hex'),
            exponent_dec: prep.exponent.toString(10),
            exponent_hex: `0x${prep.exponent.toString(16)}`,
            fingerprint: prep.signer_fpr_hex,
        },
        tl_root: prep.tl_root,
        proof: Buffer.from(proof.proof).toString('base64'),
        timestamp: new Date().toISOString(),
        notes: 'Generated by runner',
    };

    if (isDump) {
        writeProofArtifacts({
            outDir,
            proof: proof.proof,
            publicInputs: proof.publicInputs,
            vkey,
            manifest,
        });
    }

    console.log('\n✓ Proof generation complete.');

    return {
        proof: proof.proof,
        publicInputs: proof.publicInputs,
        vkey,
        manifest,
    };
}

async function verifyProof(
    proofResult: RsaProofResult,
    backend: BarretenbergBackend,
    expectedTlRoot?: string,
): Promise<boolean> {
    return verifyProofCommon(proofResult, backend, expectedTlRoot, (manifest) => {
        console.log(`  Version: ${manifest.version}`);
        console.log(`  Timestamp: ${manifest.timestamp}`);
        console.log(`  Doc hash: ${manifest.doc_hash}`);
        console.log(`  Signed attrs hash: ${manifest.signed_attrs_hash}`);
        console.log(`  Signer fingerprint: ${manifest.signer.fingerprint}`);
        console.log(`  Signer pub_n: ${manifest.signer.pub_n}`);
        console.log(`  Signer exponent: ${manifest.signer.exponent_dec} (${manifest.signer.exponent_hex})`);
    });
}

export function createRsaRunSpec(options: RsaSpecOptions): RunSpec<PreparationResult, RsaProofResult> {
    const mode = options.mode ?? DEFAULT_MODE;
    const outDir = options.outDir ?? path.join(__dirname, 'out');
    const allowlistPath = options.allowlistPath ?? path.join(outDir, 'allowlist.generated.json');

    return {
        id: 'rsa',
        label: `RSA PAdES (${mode})`,
        mode,
        isDump: options.isDump ?? false,
        paths: {
            pdfPath: options.pdfPath,
            allowlistPath,
            circuitPath: options.circuitPath ?? path.join(repoRoot, 'circuits', 'pades_rsa'),
            outDir,
        },
        prepare: (pdfPath, allowlistPath, mode, isDump, outDir, bbApi) =>
            preparePDF(pdfPath, allowlistPath, mode, isDump, outDir, bbApi, options.allowlistCertPaths),
        generateProof,
        verifyProof,
    };
}
