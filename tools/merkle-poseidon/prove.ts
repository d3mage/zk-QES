#!/usr/bin/env node
/**
 * prove.ts (Poseidon2 version)
 *
 * Retrieves a Merkle inclusion proof for a specific certificate fingerprint.
 *
 * Usage: node --loader ts-node/esm tools/merkle-poseidon/prove.ts --fingerprint <hex> --out <output-file>
 */

import fs from 'node:fs';
import path from 'node:path';

interface ProofData {
    fingerprint: string;
    index: number;
    merkle_path_hex: string[];
    merkle_path_decimal: string[];
    root_hex: string;
    root_decimal: string;
}

async function main() {
    const args = process.argv.slice(2);

    let fingerprint: string | undefined;
    let outFile: string | undefined;
    let pathsDir = 'out/paths-poseidon';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--fingerprint' && args[i + 1]) {
            fingerprint = args[i + 1];
            i++;
        } else if (args[i] === '--out' && args[i + 1]) {
            outFile = args[i + 1];
            i++;
        } else if (args[i] === '--paths-dir' && args[i + 1]) {
            pathsDir = args[i + 1];
            i++;
        }
    }

    if (!fingerprint) {
        console.error('Usage: node prove.ts --fingerprint <hex> [--out <output-file>] [--paths-dir <dir>]');
        process.exit(1);
    }

    // Remove 0x prefix if present
    fingerprint = fingerprint.startsWith('0x') ? fingerprint.slice(2) : fingerprint;

    console.log(`Looking for Poseidon proof for fingerprint: ${fingerprint}`);
    console.log(`  Paths dir: ${pathsDir}`);

    const proofFile = path.join(pathsDir, `${fingerprint}.json`);

    if (!fs.existsSync(proofFile)) {
        throw new Error(`Proof file not found: ${proofFile}\nRun 'build.ts' first to generate proofs.`);
    }

    const proofData: ProofData = JSON.parse(fs.readFileSync(proofFile, 'utf-8'));

    console.log(`\nProof found:`);
    console.log(`  Index: ${proofData.index}`);
    console.log(`  Root (hex):     ${proofData.root_hex}`);
    console.log(`  Root (decimal): ${proofData.root_decimal}`);
    console.log(`  Path depth: ${proofData.merkle_path_hex.length}`);

    if (outFile) {
        const outDir = path.dirname(outFile);
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }

        fs.writeFileSync(outFile, JSON.stringify(proofData, null, 2));
        console.log(`\n✓ Proof written to: ${outFile}`);
    } else {
        console.log(`\nProof data:`);
        console.log(JSON.stringify(proofData, null, 2));
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
