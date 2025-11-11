#!/usr/bin/env node
/**
 * build.ts (Pedersen version)
 *
 * Builds a Merkle tree from an allowlist of certificate fingerprints.
 * Uses Pedersen hash function (compatible with Noir std::hash::pedersen_hash).
 *
 * Usage: node --loader ts-node/esm tools/merkle-pedersen/build.ts <allowlist.json> --out <output-dir>
 */

import fs from 'node:fs';
import path from 'node:path';
import { BarretenbergSync } from '@aztec/bb.js';

interface Allowlist {
    cert_fingerprints: string[];
}

// Convert hex string to Field (bigint)
function hexToField(hex: string): bigint {
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

// Pedersen hash function using Barretenberg
let bb: BarretenbergSync | null = null;

function initBarretenberg() {
    if (!bb) {
        bb = new BarretenbergSync();
    }
    return bb;
}

function pedersenHash(left: bigint, right: bigint): bigint {
    const barretenberg = initBarretenberg();
    // Convert to Buffer format that bb.js expects
    const leftBuf = Buffer.from(fieldToHex(left), 'hex');
    const rightBuf = Buffer.from(fieldToHex(right), 'hex');

    // Pedersen compress (hash two field elements)
    const result = barretenberg.pedersenHash([leftBuf, rightBuf], 0);

    // Convert back to bigint
    return BigInt('0x' + result.toString('hex'));
}

// Build Merkle tree from leaves
function buildMerkleTree(leaves: bigint[]): {
    root: bigint;
    layers: bigint[][];
} {
    if (leaves.length === 0) {
        throw new Error('Cannot build tree from empty leaves');
    }

    const layers: bigint[][] = [leaves];
    let currentLayer = leaves;

    // Build tree bottom-up
    while (currentLayer.length > 1) {
        const nextLayer: bigint[] = [];

        for (let i = 0; i < currentLayer.length; i += 2) {
            const left = currentLayer[i];
            const right = i + 1 < currentLayer.length ? currentLayer[i + 1] : left;
            const parent = pedersenHash(left, right);
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

// Generate Merkle proof for a specific leaf
function generateProof(layers: bigint[][], leafIndex: number): {
    path: bigint[];
    index: number;
} {
    const path: bigint[] = [];
    let index = leafIndex;

    for (let level = 0; level < layers.length - 1; level++) {
        const layer = layers[level];
        const isRightNode = index % 2 === 1;
        const siblingIndex = isRightNode ? index - 1 : index + 1;

        const sibling = siblingIndex < layer.length ? layer[siblingIndex] : layer[index];
        path.push(sibling);

        index = Math.floor(index / 2);
    }

    // Pad to depth 8
    while (path.length < 8) {
        path.push(BigInt(0));
    }

    return {
        path: path.slice(0, 8),
        index: leafIndex
    };
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 3 || !args.includes('--out')) {
        console.error('Usage: node build.ts <allowlist.json> --out <output-dir>');
        process.exit(1);
    }

    const allowlistPath = args[0];
    const outDir = args[args.indexOf('--out') + 1];

    console.log('Building Pedersen Merkle tree from allowlist...');
    console.log(`  Input:  ${allowlistPath}`);
    console.log(`  Output: ${outDir}/\n`);

    // Read allowlist
    const allowlist: Allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf-8'));
    const fingerprints = allowlist.cert_fingerprints;

    console.log(`Found ${fingerprints.length} fingerprints\n`);

    // Convert to Field elements
    const leaves = fingerprints.map(hexToField);

    console.log('Building Merkle tree with Pedersen hash (via Barretenberg)...\n');

    // Initialize Barretenberg
    initBarretenberg();

    // Build tree
    const { root, layers } = buildMerkleTree(leaves);

    console.log('Tree built successfully:');
    console.log(`  Root:  ${fieldToHex(root)}`);
    console.log(`  Root (decimal): ${fieldToDecimal(root)}`);
    console.log(`  Depth: 8`);
    console.log(`  Leaves: ${leaves.length}\n`);

    // Generate inclusion proofs
    console.log('Generating inclusion proofs...');
    const proofsDir = path.join(outDir, 'paths-pedersen');
    fs.mkdirSync(proofsDir, { recursive: true });

    for (let i = 0; i < fingerprints.length; i++) {
        const proof = generateProof(layers, i);
        const proofFile = path.join(proofsDir, `${fingerprints[i]}.json`);

        fs.writeFileSync(proofFile, JSON.stringify({
            leaf: fingerprints[i],
            leaf_decimal: fieldToDecimal(leaves[i]),
            index: proof.index,
            merkle_path_decimal: proof.path.map(fieldToDecimal)
        }, null, 2));
    }
    console.log(`✓ ${fingerprints.length} inclusion proofs generated\n`);

    // Save root and metadata
    fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(
        path.join(outDir, 'tl_root_pedersen.hex'),
        fieldToHex(root)
    );

    fs.writeFileSync(
        path.join(outDir, 'tl_root_pedersen.txt'),
        fieldToDecimal(root)
    );

    fs.writeFileSync(
        path.join(outDir, 'tl_root_pedersen.json'),
        JSON.stringify({
            root_hex: fieldToHex(root),
            root_decimal: fieldToDecimal(root),
            depth: 8,
            leaf_count: leaves.length,
            hash_function: "Pedersen (Barretenberg, compatible with Noir std::hash::pedersen_hash)"
        }, null, 2)
    );

    console.log(`Outputs saved to ${outDir}/:`);
    console.log(`  - tl_root_pedersen.hex (hex format)`);
    console.log(`  - tl_root_pedersen.txt (decimal format for Noir)`);
    console.log(`  - tl_root_pedersen.json (metadata)`);
    console.log(`  - paths-pedersen/*.json (inclusion proofs)\n`);

    console.log('✅ Done!');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
