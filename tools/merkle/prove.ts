#!/usr/bin/env node
/**
 * prove.ts
 *
 * Retrieves a Merkle inclusion proof for a specific certificate fingerprint.
 *
 * Usage: node --loader ts-node/esm tools/merkle/prove.ts --fingerprint <hex> --out <output-file>
 */

import fs from 'node:fs';
import path from 'node:path';

interface ProofData {
    fingerprint: string;
    index: number;
    path: string[];
    root: string;
}

async function main() {
    const args = process.argv.slice(2);

    let fingerprint: string | undefined;
    let outFile: string | undefined;
    let pathsDir = 'out/paths';

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

    console.log(`Looking for proof for fingerprint: ${fingerprint}`);
    console.log(`  Paths dir: ${pathsDir}`);

    const proofFile = path.join(pathsDir, `${fingerprint}.json`);

    if (!fs.existsSync(proofFile)) {
        throw new Error(`Proof file not found: ${proofFile}\nRun 'build.ts' first to generate proofs.`);
    }

    const proofData: ProofData = JSON.parse(fs.readFileSync(proofFile, 'utf-8'));

    console.log(`\nProof found:`);
    console.log(`  Index: ${proofData.index}`);
    console.log(`  Root:  ${proofData.root}`);
    console.log(`  Path depth: ${proofData.path.length}`);

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
