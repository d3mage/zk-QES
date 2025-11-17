import fs from 'node:fs';
import path from 'node:path';
import { Barretenberg } from '@aztec/bb.js';

interface Allowlist {
    cert_fingerprints: string[];
}

// BN254 field modulus (same as in Noir circuit)
const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// Convert hex string to Field (bigint)
// Applies modulo to handle SHA-256 hashes that exceed BN254 field modulus
function hexToField(hex: string): bigint {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const value = BigInt('0x' + cleanHex);
    // Apply modulo to ensure value fits in field
    return value % FIELD_MODULUS;
}

// Convert Field to hex string (32 bytes, big-endian)
function fieldToHex(field: bigint): string {
    return field.toString(16).padStart(64, '0');
}

// Convert Field to decimal string (for Noir inputs)
function fieldToDecimal(field: bigint): string {
    return field.toString(10);
}

async function pedersenMerkleHash(bbApi: Barretenberg, left: bigint, right: bigint): Promise<bigint> {
    const leftFr = bigintToUint8Array(left);
    const rightFr = bigintToUint8Array(right);

    const result = await bbApi.pedersenHash({ inputs: [leftFr, rightFr], hashIndex: 0 });
    const hashFr = result.hash;

    return uint8ArrayToBigint(hashFr);
}

// Bigint to 32-byte Uint8Array (big-endian)
function bigintToUint8Array(value: bigint): Uint8Array {
    const bytes = new Uint8Array(32);
    let num = value;
    for (let i = 31; i >= 0; i--) {
        bytes[i] = Number(num & 0xFFn);
        num = num >> 8n;
    }
    return bytes;
}

// 32-byte Uint8Array to bigint (big-endian)
function uint8ArrayToBigint(bytes: Uint8Array): bigint {
    let result = 0n;
    for (let i = 0; i < bytes.length; i++) {
        result = (result << 8n) | BigInt(bytes[i]);
    }
    return result;
}

// Build Merkle tree from leaves
async function buildMerkleTree(bbApi: Barretenberg, leaves: bigint[]): Promise<{
    root: bigint;
    layers: bigint[][];
}> {
    if (leaves.length === 0) {
        throw new Error('Cannot build tree from empty leaves');
    }

    // Pad to exactly 256 leaves (depth 8) to match circuit
    const CIRCUIT_DEPTH = 8;
    const paddedSize = Math.pow(2, CIRCUIT_DEPTH);

    const paddedLeaves = [...leaves];
    while (paddedLeaves.length < paddedSize) {
        paddedLeaves.push(0n);
    }

    const layers: bigint[][] = [paddedLeaves];

    // Build tree bottom-up
    let currentLayer = paddedLeaves;
    while (currentLayer.length > 1) {
        const nextLayer: bigint[] = [];

        for (let i = 0; i < currentLayer.length; i += 2) {
            const left = currentLayer[i];
            const right = currentLayer[i + 1];
            const parent = await pedersenMerkleHash(bbApi, left, right);
            nextLayer.push(parent);
        }

        layers.push(nextLayer);
        currentLayer = nextLayer;
    }

    return {
        root: currentLayer[0],
        layers
    };
}

// Get Merkle proof for a specific leaf index
function getMerkleProof(layers: bigint[][], index: number): bigint[] {
    const proof: bigint[] = [];
    let currentIndex = index;

    for (let level = 0; level < layers.length - 1; level++) {
        const layer = layers[level];
        const isRightChild = currentIndex % 2 === 1;
        const siblingIndex = isRightChild ? currentIndex - 1 : currentIndex + 1;

        const sibling = siblingIndex < layer.length ? layer[siblingIndex] : 0n;
        proof.push(sibling);

        currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
}

export async function createMerkleTreeFromAllowlist(allowlist: Allowlist, outDir: string, isDump: boolean = false): Promise<{
    root: string;
    proofs: Array<{
        fingerprint: string;
        index: number;
        merkle_path_hex: string[];
        merkle_path_decimal: string[];
        root_hex: string;
        root_decimal: string;
    }>;
}> {
    console.log('Initializing Barretenberg...');
    const bbApi = await Barretenberg.initSingleton({
        threads: 4
    });

    console.log('Building Pedersen Merkle tree from allowlist...');

    if (!allowlist.cert_fingerprints || allowlist.cert_fingerprints.length === 0) {
        throw new Error('Allowlist must contain at least one certificate fingerprint');
    }

    console.log(`\nFound ${allowlist.cert_fingerprints.length} fingerprints`);

    const leaves = allowlist.cert_fingerprints.map(hexToField);

    console.log('\nBuilding Merkle tree with Pedersen hash (Barretenberg native/async)...');
    const { root, layers } = await buildMerkleTree(bbApi, leaves);

    const depth = layers.length - 1;
    console.log(`\nTree built successfully:`);
    console.log(`  Root:  ${fieldToHex(root)}`);
    console.log(`  Root (decimal): ${fieldToDecimal(root)}`);
    console.log(`  Depth: ${depth}`);
    console.log(`  Leaves: ${leaves.length}`);

    const rootHex = fieldToHex(root);
    const rootDecimal = fieldToDecimal(root);

    console.log('\nGenerating inclusion proofs...');
    const proofs = [];
    for (let i = 0; i < allowlist.cert_fingerprints.length; i++) {
        const fingerprint = allowlist.cert_fingerprints[i];
        const proof = getMerkleProof(layers, i);

        const proofData = {
            fingerprint,
            index: i,
            merkle_path_hex: proof.map(fieldToHex),
            merkle_path_decimal: proof.map(fieldToDecimal),
            root_hex: rootHex,
            root_decimal: rootDecimal
        };

        proofs.push(proofData);
    }

    console.log(`✓ ${allowlist.cert_fingerprints.length} inclusion proofs generated`);

    if (isDump) {
        const pathsDir = path.join(outDir, 'tree-poseidon');
        if (!fs.existsSync(pathsDir)) {
            fs.mkdirSync(pathsDir, { recursive: true });
        }

        fs.writeFileSync(path.join(outDir, 'tl_root_poseidon.txt'), rootDecimal);

        for (const proofData of proofs) {
            const filename = `${proofData.fingerprint}.json`;
            fs.writeFileSync(path.join(pathsDir, filename), JSON.stringify(proofData, null, 2));
        }

        console.log(`\nOutputs saved to ${outDir}/:`);
        console.log(`  - tl_root_poseidon.txt`);
        console.log(`  - tree-poseidon/*.json`);
    }

    console.log('\n✅ Done!');

    await Barretenberg.destroySingleton();

    return {
        root: rootDecimal,
        proofs
    };
}