#!/usr/bin/env ts-node
// Quick benchmark script for Poseidon circuit
import * as fs from 'fs';
import { execSync } from 'child_process';

const circuitDir = 'circuits/pades_ecdsa_poseidon';

console.log("Testing Poseidon circuit proof generation...");
console.log("Circuit: ", circuitDir);

// Copy inputs from SHA-256 circuit
if (!fs.existsSync(`${circuitDir}/Prover.toml`)) {
    fs.copyFileSync('circuits/pades_ecdsa/Prover.toml', `${circuitDir}/Prover.toml`);
}

console.log("\n1. Generating witness (nargo execute)...");
const witnessStart = Date.now();
try {
    execSync(`cd ${circuitDir} && nargo execute`, { stdio: 'inherit' });
    const witnessTime = (Date.now() - witnessStart) / 1000;
    console.log(`✅ Witness generation: ${witnessTime.toFixed(2)} seconds`);
} catch (e) {
    console.log("❌ Witness generation failed");
    process.exit(1);
}

console.log("\n2. Generating proof with bb (WASM)...");
const proofStart = Date.now();
try {
    execSync(`cd ${circuitDir} && bb prove -b ./target/pades_ecdsa_poseidon.json -w ./target/pades_ecdsa_poseidon.gz -o ./proof`,
        { stdio: 'inherit' });
    const proofTime = (Date.now() - proofStart) / 1000;
    console.log(`✅ Proof generation (WASM): ${proofTime.toFixed(2)} seconds`);
} catch (e) {
    console.log("❌ Proof generation failed");
}

console.log("\n=== Summary ===");
console.log("Circuit: Poseidon (~20,000 constraints)");
console.log("Backend: bb.js (WASM)");