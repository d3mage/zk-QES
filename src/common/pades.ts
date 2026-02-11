import fs from 'node:fs';
import path from 'node:path';
import type { Barretenberg, UltraHonkBackend as BarretenbergBackend } from '@aztec/bb.js';
import { getByteRangeHash } from './byte-range.ts';
import { createMerkleTreeFromAllowlist } from './tree.ts';
import { sha256 } from './utils.ts';
import { FIELD_MODULUS } from './constants.ts';
import { buildAllowlistFromCertificates, writeAllowlistFile } from './allowlist.ts';
import type { ProofResult } from './runner.ts';

export interface CommonPreparationResult {
    doc_hash: Uint8Array;
    signed_attrs_hash: Uint8Array;
    certificate: Buffer;
    signer_fpr_hex: string;
    signer_fpr: string;
    tl_root: string;
    merkle_path: string[];
    index: string;
}

type ExtractedData<Extra extends object> = {
    signedAttrsHash: Buffer;
    certificate: Buffer;
} & Extra;

export async function prepareCommon<Extra extends object>(args: {
    pdfPath: string;
    allowlistPath?: string;
    allowlistCertPaths?: string[];
    mode: string;
    isDump: boolean;
    outDir: string;
    bbApi?: Barretenberg;
    extractLabel?: string;
    extract: (pdfBuffer: Buffer, outDir: string, isDump: boolean) => Promise<ExtractedData<Extra>>;
}): Promise<CommonPreparationResult & Extra> {
    const { pdfPath, mode, isDump, outDir, bbApi, extractLabel, extract } = args;

    console.log('=== PDF Preparation Phase ===\n');

    if (!fs.existsSync(pdfPath)) {
        throw new Error(`File not found: ${pdfPath}`);
    }

    let allowlistPath = args.allowlistPath;
    if (!allowlistPath) {
        allowlistPath = path.join(outDir, 'allowlist.generated.json');
    }

    if (args.allowlistCertPaths && args.allowlistCertPaths.length > 0) {
        const allowlistDir = path.dirname(allowlistPath);
        if (!fs.existsSync(allowlistDir)) {
            fs.mkdirSync(allowlistDir, { recursive: true });
        }
        const allowlist = buildAllowlistFromCertificates(args.allowlistCertPaths);
        writeAllowlistFile(allowlist, allowlistPath);
    }

    if (!fs.existsSync(allowlistPath)) {
        throw new Error(`File not found: ${allowlistPath}`);
    }

    const pdfBuffer = fs.readFileSync(pdfPath);

    if (isDump && !fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    console.log('[1/5] Computing document hash (ByteRange)...');
    const byteRangeHash = await getByteRangeHash(pdfBuffer, isDump, outDir);
    const doc_hash = new Uint8Array(Buffer.from(byteRangeHash, 'hex'));

    const label = extractLabel ? ` (${extractLabel})` : '';
    console.log(`\n[2/5] Extracting signature and certificate${label}...`);
    const extracted = await extract(pdfBuffer, outDir, isDump);

    console.log('\n[3/5] Computing signer fingerprint...');
    const signer_fpr_bytes = sha256(extracted.certificate);
    const signer_fpr_hex = Buffer.from(signer_fpr_bytes).toString('hex');
    const signer_fpr_raw = BigInt(`0x${signer_fpr_hex}`);
    const signer_fpr = (signer_fpr_raw % FIELD_MODULUS).toString();

    console.log(`  Fingerprint (hex): ${signer_fpr_hex}`);
    console.log(`  Fingerprint (decimal): ${signer_fpr}`);

    console.log('\n[4/5] Building Merkle tree from allowlist...');
    const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf-8'));
    const { root, proofs } = await createMerkleTreeFromAllowlist(allowlist, outDir, mode, isDump, bbApi);

    console.log('\n[5/5] Loading Merkle proof for signer...');
    const signerProof = proofs.find((p) => p.fingerprint === signer_fpr_hex);

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
        fs.writeFileSync(path.join(pathsPoseidonDir, `${signer_fpr_hex}.json`), JSON.stringify(signerProof, null, 2));
    }

    const { signedAttrsHash, certificate, ...rest } = extracted;

    return {
        doc_hash,
        signed_attrs_hash: new Uint8Array(signedAttrsHash),
        certificate,
        signer_fpr_hex,
        signer_fpr,
        tl_root: root,
        merkle_path: signerProof.merkle_path_decimal,
        index: signerProof.index.toString(),
        ...rest,
    };
}

export function padMerklePath(merklePath: string[], depth = 8): string[] {
    const padded = [...merklePath];
    while (padded.length < depth) {
        padded.push('0');
    }
    return padded;
}

export function writeProofArtifacts<Manifest>(args: {
    outDir: string;
    proof: Uint8Array;
    publicInputs: string[];
    vkey: Uint8Array;
    manifest: Manifest;
}): void {
    const { outDir, proof, publicInputs, vkey, manifest } = args;

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
                proof: Buffer.from(proof).toString('hex'),
                publicInputs,
            },
            null,
            2,
        ),
    );

    fs.writeFileSync(vkeyPath, vkey);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log('\nOutputs written:');
    console.log(`  Proof JSON: ${proofJsonPath}`);
    console.log(`  VKey: ${vkeyPath}`);
    console.log(`  Manifest: ${manifestPath}`);
}

export async function verifyProofCommon<Manifest extends { tl_root: string }, Proof extends ProofResult<Manifest>>(
    proofResult: Proof,
    backend: BarretenbergBackend,
    expectedTlRoot: string | undefined,
    logManifest: (manifest: Proof['manifest']) => void,
): Promise<boolean> {
    console.log('\n=== Verification Phase ===\n');

    console.log('[1/3] Loading manifest...');
    const manifest = proofResult.manifest;
    logManifest(manifest);

    if (expectedTlRoot) {
        console.log('\n[2/3] Verifying trust list membership...');
        if (expectedTlRoot === manifest.tl_root) {
            console.log('  ✓ Trust list root matches');
        } else {
            console.error('  ✗ Trust list root mismatch!');
            console.error(`    Expected: ${expectedTlRoot}`);
            console.error(`    Got: ${manifest.tl_root}`);
            return false;
        }
    }

    console.log('\n[3/3] Verifying zero-knowledge proof...');

    try {
        const isValid = await backend.verifyProof({
            proof: proofResult.proof,
            publicInputs: proofResult.publicInputs,
        });

        if (isValid) {
            console.log('  ✓ ZK proof verified.');
            console.log('═══════════════════════════════════════════════════');
            console.log('✓ All verifications passed.');
            console.log('═══════════════════════════════════════════════════\n');

            return true;
        }

        console.log('\n✗ Proof verification failed.');
        console.log('The proof is invalid or was generated incorrectly.');
        return false;
    } catch (error) {
        console.error('\nERROR: Verification failed.', error);
        return false;
    }
}
