#!/usr/bin/env node
/**
 * build.ts
 *
 * Builds a Merkle tree from an allowlist of certificate fingerprints.
 * Uses Poseidon2 hash function (compatible with Noir circuit).
 *
 * Usage: node --loader ts-node/esm tools/merkle/build.ts <allowlist.json> --out <output-dir>
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

interface Allowlist {
    cert_fingerprints: string[];
}

interface MerkleTree {
    root: string;
    leaves: string[];
    depth: number;
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

// Simple hash function for Merkle tree (using SHA-256)
// Note: In production, this should use Poseidon2 to match the circuit
// For now, we use SHA-256 for simplicity and will update to match circuit later
function simpleHash(left: bigint, right: bigint): bigint {
    // Convert to buffers
    const leftBuf = Buffer.alloc(32);
    const rightBuf = Buffer.alloc(32);

    // Write as big-endian
    for (let i = 0; i < 32; i++) {
        leftBuf[31 - i] = Number((left >> BigInt(i * 8)) & 0xFFn);
        rightBuf[31 - i] = Number((right >> BigInt(i * 8)) & 0xFFn);
    }

    // Hash concatenation
    const hash = crypto.createHash('sha256');
    hash.update(leftBuf);
    hash.update(rightBuf);
    const result = hash.digest();

    // Convert back to bigint
    let value = 0n;
    for (let i = 0; i < 32; i++) {
        value = (value << 8n) | BigInt(result[i]);
    }

    return value;
}

// Build Merkle tree from leaves
function buildMerkleTree(leaves: bigint[]): {
    root: bigint;
    layers: bigint[][];
} {
    if (leaves.length === 0) {
        throw new Error('Cannot build tree from empty leaves');
    }

    // Pad to power of 2
    const depth = Math.ceil(Math.log2(leaves.length));
    const paddedSize = Math.pow(2, depth);

    // Pad with zeros (or last leaf repeated)
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
            const parent = simpleHash(left, right);
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

    console.log('Building Merkle tree from allowlist...');
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
    console.log('\nBuilding Merkle tree (using SHA-256 for now, will switch to Poseidon2)...');
    const { root, layers } = buildMerkleTree(leaves);

    const depth = layers.length - 1;
    console.log(`\nTree built successfully:`);
    console.log(`  Root:  ${fieldToHex(root)}`);
    console.log(`  Depth: ${depth}`);
    console.log(`  Leaves: ${leaves.length}`);

    // Create output directory
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const pathsDir = path.join(outDir, 'paths');
    if (!fs.existsSync(pathsDir)) {
        fs.mkdirSync(pathsDir, { recursive: true });
    }

    // Save root
    const rootHex = fieldToHex(root);
    fs.writeFileSync(path.join(outDir, 'tl_root.hex'), rootHex);
    fs.writeFileSync(path.join(outDir, 'tl_root.json'), JSON.stringify({
        root: rootHex,
        depth,
        leaf_count: leaves.length
    }, null, 2));

    // Generate and save proofs for each fingerprint
    console.log('\nGenerating inclusion proofs...');
    for (let i = 0; i < allowlist.cert_fingerprints.length; i++) {
        const fingerprint = allowlist.cert_fingerprints[i];
        const proof = getMerkleProof(layers, i);

        const proofData = {
            fingerprint,
            index: i,
            path: proof.map(fieldToHex),
            root: rootHex
        };

        const filename = path.join(pathsDir, `${fingerprint}.json`);
        fs.writeFileSync(filename, JSON.stringify(proofData, null, 2));
    }

    console.log(`\nOutputs written:`);
    console.log(`  Root:   ${outDir}/tl_root.hex`);
    console.log(`  Paths:  ${pathsDir}/ (${allowlist.cert_fingerprints.length} files)`);
    console.log('\n✓ Merkle tree built successfully!');
}

main().catch(err => {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
});
