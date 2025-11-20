import fs from 'node:fs';
import path from 'node:path';
import { Barretenberg } from '@aztec/bb.js';
import { bigintToUint8Array, uint8ArrayToBigint, hexToField, fieldToHex, fieldToDecimal } from './utils.ts';

interface Allowlist {
    cert_fingerprints: string[];
}

async function pedersenMerkleHash(bbApi: Barretenberg, left: bigint, right: bigint): Promise<bigint> {
    const leftFr = bigintToUint8Array(left);
    const rightFr = bigintToUint8Array(right);

    const result = await bbApi.pedersenHash({ inputs: [leftFr, rightFr], hashIndex: 0 });
    const hashFr = result.hash;

    return uint8ArrayToBigint(hashFr);
}

async function poseidonMerkleHash(bbApi: Barretenberg, left: bigint, right: bigint): Promise<bigint> {
    const leftFr = bigintToUint8Array(left);
    const rightFr = bigintToUint8Array(right);

    const result = await bbApi.poseidon2Hash({ inputs: [leftFr, rightFr] });
    const hashFr = result.hash;

    return uint8ArrayToBigint(hashFr);
}

// Build Merkle tree from leaves
async function buildMerkleTree(bbApi: Barretenberg, leaves: bigint[], mode: string, depth = 8): Promise<{
    root: bigint;
    layers: bigint[][];
}> {
    if (leaves.length === 0) {
        throw new Error('Cannot build tree from empty leaves');
    }

    // Select hash function based on mode
    let hashFn: (bbApi: Barretenberg, left: bigint, right: bigint) => Promise<bigint>;
    
    if (mode === 'pedersen') {
        hashFn = pedersenMerkleHash;
    } else if (mode === 'poseidon') {
        hashFn = poseidonMerkleHash;
    } else {
        throw new Error(`Invalid mode: ${mode}`);
    }

    const paddedSize = Math.pow(2, depth);
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
            const parent = await hashFn(bbApi, left, right);
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

export async function createMerkleTreeFromAllowlist(allowlist: Allowlist, outDir: string, mode: string = 'pedersen', isDump: boolean = false): Promise<{
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
    const bbApi = await Barretenberg.initSingleton({
        threads: 4
    });

    const modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);
    console.log(`Building ${modeLabel} Merkle tree from allowlist...`);

    if (!allowlist.cert_fingerprints || allowlist.cert_fingerprints.length === 0) {
        throw new Error('Allowlist must contain at least one certificate fingerprint');
    }

    console.log(`\nFound ${allowlist.cert_fingerprints.length} fingerprints`);

    const leaves = allowlist.cert_fingerprints.map(hexToField);

    console.log(`\nBuilding Merkle tree with ${modeLabel} hash (Barretenberg native/async)...`);
    const { root, layers } = await buildMerkleTree(bbApi, leaves, mode);

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
        const pathsDir = path.join(outDir, `tree-${mode}`);
        if (!fs.existsSync(pathsDir)) {
            fs.mkdirSync(pathsDir, { recursive: true });
        }

        fs.writeFileSync(path.join(outDir, `tl_root_${mode}.txt`), rootDecimal);

        for (const proofData of proofs) {
            const filename = `${proofData.fingerprint}.json`;
            fs.writeFileSync(path.join(pathsDir, filename), JSON.stringify(proofData, null, 2));
        }

        console.log(`\nOutputs saved to ${outDir}/:`);
        console.log(`  - tl_root_${mode}.txt`);
        console.log(`  - tree-${mode}/*.json`);
    }

    console.log('\n✅ Done!');

    await Barretenberg.destroySingleton();

    return {
        root: rootDecimal,
        proofs
    };
}