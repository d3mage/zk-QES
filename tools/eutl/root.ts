#!/usr/bin/env node
/**
 * root.ts
 *
 * Builds Merkle tree from EU Trust List certificate fingerprints.
 * Reuses the Merkle tree logic from tools/merkle/build.ts
 *
 * Usage: yarn eutl:root --snapshot cache/snapshot.json --out out/tl_root_eu.hex
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Reuse Merkle tree logic from Task 2
function sha256(data: Buffer): Buffer {
    return crypto.createHash('sha256').update(data).digest();
}

function buildMerkleTree(leaves: Buffer[]): {
    root: Buffer;
    depth: number;
    paths: Map<string, { siblings: Buffer[]; index: number }>;
} {
    const CIRCUIT_DEPTH = 8; // Fixed depth to match circuit
    const paddedSize = Math.pow(2, CIRCUIT_DEPTH); // 256 leaves

    console.log(`Building Merkle tree (depth ${CIRCUIT_DEPTH})...`);

    // Pad leaves to 256 with zero hashes
    const paddedLeaves = [...leaves];
    const zeroHash = Buffer.alloc(32, 0);
    while (paddedLeaves.length < paddedSize) {
        paddedLeaves.push(zeroHash);
    }

    console.log(`  Leaves: ${leaves.length} (padded to ${paddedLeaves.length})`);

    // Build tree bottom-up
    let currentLevel = paddedLeaves;
    const paths = new Map<string, { siblings: Buffer[]; index: number }>();

    // Initialize paths for each leaf
    for (let i = 0; i < leaves.length; i++) {
        paths.set(leaves[i].toString('hex'), {
            siblings: [],
            index: i
        });
    }

    let depth = 0;
    while (currentLevel.length > 1) {
        const nextLevel: Buffer[] = [];

        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = currentLevel[i + 1];

            // Hash(left || right)
            const parent = sha256(Buffer.concat([left, right]));
            nextLevel.push(parent);

            // Update paths: record sibling for each original leaf
            for (const [leafHex, pathData] of paths.entries()) {
                const leafIndex = pathData.index;
                const positionAtThisLevel = Math.floor(leafIndex / Math.pow(2, depth));

                if (positionAtThisLevel === i || positionAtThisLevel === i + 1) {
                    // This leaf's path goes through this parent
                    const sibling = (positionAtThisLevel === i) ? right : left;
                    pathData.siblings.push(sibling);
                }
            }
        }

        currentLevel = nextLevel;
        depth++;
    }

    return {
        root: currentLevel[0],
        depth: CIRCUIT_DEPTH,
        paths
    };
}

async function main() {
    const args = process.argv.slice(2);

    const snapshotIndex = args.indexOf('--snapshot');
    const outIndex = args.indexOf('--out');

    if (snapshotIndex === -1) {
        console.error('Error: --snapshot argument required');
        console.error('Usage: yarn eutl:root --snapshot cache/snapshot.json --out out');
        process.exit(1);
    }

    const snapshotPath = args[snapshotIndex + 1];
    const outDir = outIndex !== -1 ? args[outIndex + 1] : 'out';

    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║   EU Trust List Merkle Root Builder               ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    try {
        // Load snapshot
        console.log('Loading EU Trust List snapshot...');
        console.log(`  Path: ${snapshotPath}`);

        if (!fs.existsSync(snapshotPath)) {
            throw new Error(`Snapshot file not found: ${snapshotPath}`);
        }

        const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
        console.log(`  ✓ Snapshot loaded`);
        console.log(`    Date: ${snapshot.snapshot_date}`);
        console.log(`    Certificates: ${snapshot.total_certs}`);

        // Extract fingerprints
        const fingerprints: string[] = snapshot.tsps.flatMap((tsp: any) =>
            tsp.certificates.map((cert: any) => cert.fingerprint)
        );

        console.log(`\nFound ${fingerprints.length} certificate fingerprints`);

        if (fingerprints.length === 0) {
            throw new Error('No certificate fingerprints found in snapshot');
        }

        // Convert to buffers
        const leaves = fingerprints.map(fp => Buffer.from(fp, 'hex'));

        // Build Merkle tree
        const tree = buildMerkleTree(leaves);

        console.log(`\nTree built successfully:`);
        console.log(`  Root:  ${tree.root.toString('hex')}`);
        console.log(`  Depth: ${tree.depth}`);
        console.log(`  Leaves: ${fingerprints.length}`);

        // Create output directory
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }

        // Save root
        const rootHexPath = path.join(outDir, 'tl_root_eu.hex');
        fs.writeFileSync(rootHexPath, tree.root.toString('hex'));

        const rootJsonPath = path.join(outDir, 'tl_root_eu.json');
        fs.writeFileSync(rootJsonPath, JSON.stringify({
            root: tree.root.toString('hex'),
            depth: tree.depth,
            leaf_count: fingerprints.length,
            snapshot_date: snapshot.snapshot_date,
            lotl_hash: snapshot.lotl_hash
        }, null, 2));

        console.log(`\nOutputs written:`);
        console.log(`  Root (hex):  ${rootHexPath}`);
        console.log(`  Root (json): ${rootJsonPath}`);

        // Save inclusion proofs
        const pathsDir = path.join(outDir, 'eu_paths');
        if (!fs.existsSync(pathsDir)) {
            fs.mkdirSync(pathsDir, { recursive: true });
        }

        console.log(`\nGenerating inclusion proofs...`);
        let proofCount = 0;

        for (const [leafHex, pathData] of tree.paths.entries()) {
            const proofPath = path.join(pathsDir, `${leafHex}.json`);
            fs.writeFileSync(proofPath, JSON.stringify({
                fingerprint: leafHex,
                index: pathData.index,
                root: tree.root.toString('hex'),
                siblings: pathData.siblings.map(s => s.toString('hex')),
                depth: tree.depth
            }, null, 2));
            proofCount++;
        }

        console.log(`  Paths saved: ${pathsDir}/ (${proofCount} files)`);

        console.log('\n╔════════════════════════════════════════════════════╗');
        console.log('║   ✓ EU Trust List Merkle Tree Complete            ║');
        console.log('╚════════════════════════════════════════════════════╝\n');

        process.exit(0);

    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main();
