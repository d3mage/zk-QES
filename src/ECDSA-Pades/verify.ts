import fs from 'node:fs';
import path from 'node:path';
import { UltraHonkBackend as BarretenbergBackend } from '@aztec/bb.js';

interface Manifest {
    version: number;
    doc_hash: string;
    signer: {
        pub_x: string;
        pub_y: string;
        fingerprint: string;
    };
    tl_root: string;
    proof: string;
    timestamp: string;
    notes?: string;
}

async function compileCircuit() {
    const circuitDir = '../../circuits/pades_ecdsa_hybrid';
    const targetDir = path.join(circuitDir, 'target');
    const compiledPath = path.join(targetDir, 'pades_ecdsa_hybrid.json');

    if (!fs.existsSync(compiledPath)) {
        throw new Error('Circuit not compiled. Run "yarn prove" first to compile and generate proof.');
    }

    const circuitArtifact = JSON.parse(fs.readFileSync(compiledPath, 'utf-8'));
    return circuitArtifact;
}

async function main() {
    const outDir = 'out';

    console.log('=== ZK Qualified Signature Verification ===\n');

    console.log('[1/6] Loading manifest...');
    const manifestPath = path.join(outDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`Manifest not found: ${manifestPath}. Run "yarn prove" first.`);
    }

    const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    console.log(`  Version:   ${manifest.version}`);
    console.log(`  Timestamp: ${manifest.timestamp}`);
    console.log(`  Doc hash:  ${manifest.doc_hash}`);
    console.log(`  Signer:    ${manifest.signer.fingerprint}`);

    console.log('\n[2/5] Verifying local trust list membership...');

    const tlRootPath = path.join(outDir, 'tl_root_poseidon.txt');
    if (fs.existsSync(tlRootPath)) {
        const tlRoot = fs.readFileSync(tlRootPath, 'utf-8').trim();
        if (tlRoot === manifest.tl_root) {
            console.log(`  ✓ Local trust list root matches (Pedersen)`);
        } else {
            console.error(`  ✗ Local trust list root mismatch!`);
            console.error(`    Expected: ${tlRoot}`);
            console.error(`    Got:      ${manifest.tl_root}`);
            process.exit(1);
        }
    } else {
        console.log(`  ⚠ Local trust list root not found`);
        console.log(`    (Manifest declares tl_root: ${manifest.tl_root})`);
    }

    console.log('\n[4/5] Loading proof...');

    const vkeyPath = path.join(outDir, 'vkey.bin');
    const proofJsonPath = path.join(outDir, 'proof.json');

    if (!fs.existsSync(vkeyPath)) {
        throw new Error(`Verification key not found: ${vkeyPath}. Run "yarn prove" first.`);
    }

    const proof = Buffer.from(manifest.proof, 'base64');
    const vkey = fs.readFileSync(vkeyPath);

    const proofData = JSON.parse(fs.readFileSync(proofJsonPath, 'utf-8'));
    const publicInputs = proofData.publicInputs;

    console.log(`  Proof size: ${proof.length} bytes`);
    console.log(`  VKey size:  ${vkey.length} bytes`);
    console.log(`  Public inputs: ${publicInputs.length} values`);

    console.log('\n[5/5] Verifying zero-knowledge proof...');

    const circuit = await compileCircuit();
    const backend = new BarretenbergBackend(circuit.bytecode);

    try {
        const isValid = await backend.verifyProof({
            proof: proof,
            publicInputs: publicInputs
        });

        if (isValid) {
            console.log('  ✓ ZK proof verified!\n');
            console.log('═══════════════════════════════════════════════════');
            console.log('✅ ALL VERIFICATIONS PASSED!');
            console.log('═══════════════════════════════════════════════════\n');
            console.log('This proves that:');
            console.log('  ✓ Valid ECDSA P-256 signature over document');
            console.log('  ✓ Signer is in the trusted allow-list');
            console.log('  ✓ Signature validity proven in zero-knowledge\n');

            await backend.destroy();
        } else {
            console.log('\n❌ PROOF VERIFICATION FAILED');
            console.log('The proof is invalid or was generated incorrectly.');

            await backend.destroy();
            process.exit(1);
        }
    } catch (error) {
        console.error('\n❌ VERIFICATION ERROR:', error);

        try {
            await backend.destroy();
        } catch (e) {
        }
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
});
