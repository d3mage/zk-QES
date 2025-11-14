#!/usr/bin/env node
/**
 * build.ts (Poseidon2 version)
 *
 * Builds a Merkle tree from an allowlist of certificate fingerprints.
 * Uses Poseidon hash function (compatible with Noir circuit).
 *
 * Usage: node --loader ts-node/esm tools/merkle-poseidon/build.ts <allowlist.json> --out <output-dir>
 */

import fs from 'node:fs';
import path from 'node:path';
import { BarretenbergSync, Fr } from '@aztec/bb.js';

interface Allowlist {
    cert_fingerprints: string[];
}

// Convert hex string to Field (bigint)
function hexToField(hex: string): bigint {
    // Remove 0x prefix if present
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    return BigInt('0x' + cleanHex);
}

// Convert Field to hex string (32 bytes, big-endian)
function fieldToHex(field: bigint): string {
    return field.toString(16).padStart(64, '0');
}

// Convert Field to decimal string (for Noir inputs)
function fieldToDecimal(field: bigint): string {
    return field.toString(10);
}

// Global Barretenberg API instance (initialized in main)
let bbApi: any = null;

// Pedersen hash function for Merkle tree (matches Noir circuit)
// Uses Barretenberg which is guaranteed to match Noir's std::hash::pedersen_hash
function pedersenMerkleHash(left: bigint, right: bigint): bigint {
    if (!bbApi) {
        throw new Error('Barretenberg API not initialized');
    }

    const leftFr = new Fr(left);
    const rightFr = new Fr(right);

    const hashFr = bbApi.pedersenHash([leftFr, rightFr], 0);

    // Convert Fr back to bigint
    const hashHex = hashFr.toString();
    return BigInt(hashHex);
}

// Build Merkle tree from leaves
function buildMerkleTree(leaves: bigint[]): {
    root: bigint;
    layers: bigint[][];
} {
    if (leaves.length === 0) {
        throw new Error('Cannot build tree from empty leaves');
    }

    // Pad to exactly 256 leaves (depth 8) to match circuit
    const CIRCUIT_DEPTH = 8;
    const paddedSize = Math.pow(2, CIRCUIT_DEPTH);  // 256 leaves

    // Pad with zeros
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
            const parent = pedersenMerkleHash(left, right);
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

    // Start from leaf layer (bottom)
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

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.error('Usage: node build.ts <allowlist.json> [--out <output-dir>]');
        process.exit(1);
    }

    const allowlistPath = args[0];
    let outDir = 'out';

    const outIndex = args.indexOf('--out');
    if (outIndex !== -1 && args[outIndex + 1]) {
        outDir = args[outIndex + 1];
    }

    // Initialize Barretenberg
    console.log('Initializing Barretenberg...');
    bbApi = await BarretenbergSync.initSingleton();

    console.log('Building Pedersen Merkle tree from allowlist...');
    console.log(`  Input:  ${allowlistPath}`);
    console.log(`  Output: ${outDir}/`);

    // Read allowlist
    if (!fs.existsSync(allowlistPath)) {
        throw new Error(`Allowlist file not found: ${allowlistPath}`);
    }

    const allowlist: Allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf-8'));

    if (!allowlist.cert_fingerprints || allowlist.cert_fingerprints.length === 0) {
        throw new Error('Allowlist must contain at least one certificate fingerprint');
    }

    console.log(`\nFound ${allowlist.cert_fingerprints.length} fingerprints`);

    // Convert fingerprints to Field values
    const leaves = allowlist.cert_fingerprints.map(hexToField);

    // Build tree
    console.log('\nBuilding Merkle tree with Pedersen hash (pedersen-fast)...');
    const { root, layers } = buildMerkleTree(leaves);

    const depth = layers.length - 1;
    console.log(`\nTree built successfully:`);
    console.log(`  Root:  ${fieldToHex(root)}`);
    console.log(`  Root (decimal): ${fieldToDecimal(root)}`);
    console.log(`  Depth: ${depth}`);
    console.log(`  Leaves: ${leaves.length}`);

    // Create output directory
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const pathsDir = path.join(outDir, 'paths-poseidon');
    if (!fs.existsSync(pathsDir)) {
        fs.mkdirSync(pathsDir, { recursive: true });
    }

    // Save root
    const rootHex = fieldToHex(root);
    const rootDecimal = fieldToDecimal(root);

    fs.writeFileSync(path.join(outDir, 'tl_root_poseidon.hex'), rootHex);
    fs.writeFileSync(path.join(outDir, 'tl_root_poseidon.txt'), rootDecimal);
    fs.writeFileSync(path.join(outDir, 'tl_root_poseidon.json'), JSON.stringify({
        root_hex: rootHex,
        root_decimal: rootDecimal,
        depth,
        leaf_count: leaves.length,
        hash_function: 'Pedersen (Barretenberg/bb.js, guaranteed compatible with Noir std::hash::pedersen_hash)'
    }, null, 2));

    // Generate and save proofs for each fingerprint
    console.log('\nGenerating inclusion proofs...');
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

        const filename = `${fingerprint}.json`;
        fs.writeFileSync(path.join(pathsDir, filename), JSON.stringify(proofData, null, 2));
    }

    console.log(`✓ ${allowlist.cert_fingerprints.length} inclusion proofs generated`);
    console.log(`\nOutputs saved to ${outDir}/:`);
    console.log(`  - tl_root_poseidon.hex (hex format)`);
    console.log(`  - tl_root_poseidon.txt (decimal format for Noir)`);
    console.log(`  - tl_root_poseidon.json (metadata)`);
    console.log(`  - paths-poseidon/*.json (inclusion proofs)`);
    console.log('\n✅ Done!');
}

main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
