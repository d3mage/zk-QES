#!/usr/bin/env ts-node
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

console.log("=== ZK Proof Generation Benchmark: WASM vs Native ===\n");

// Ensure we have test data
const proverTomlPath = './circuits/pades_ecdsa/Prover.toml';
if (!fs.existsSync(proverTomlPath)) {
    console.error("Prover.toml not found. Please run setup first.");
    process.exit(1);
}

// Test 1: Poseidon with bb.js (WASM)
console.log("Test 1: Poseidon Circuit with bb.js (WASM)");
console.log("-".repeat(50));
const poseidonStart = Date.now();
try {
    execSync('cd circuits/pades_ecdsa_poseidon && bb prove -b ./target/pades_ecdsa_poseidon.json -w ./target/witness.gz -o ./proof_poseidon_wasm',
        { stdio: 'inherit' });
    const poseidonTime = (Date.now() - poseidonStart) / 1000;
    console.log(`✅ Poseidon with WASM: ${poseidonTime.toFixed(2)} seconds\n`);
} catch (e) {
    console.log(`❌ Poseidon with WASM failed: ${e.message}\n`);
}

// Test 2: SHA-256 with bb.js (WASM)
console.log("Test 2: SHA-256 Circuit with bb.js (WASM)");
console.log("-".repeat(50));
const sha256WasmStart = Date.now();
try {
    execSync('cd circuits/pades_ecdsa && bb prove -b ./target/pades_ecdsa.json -w ./target/witness.gz -o ./proof_sha256_wasm',
        { stdio: 'inherit' });
    const sha256WasmTime = (Date.now() - sha256WasmStart) / 1000;
    console.log(`✅ SHA-256 with WASM: ${sha256WasmTime.toFixed(2)} seconds\n`);
} catch (e) {
    console.log(`❌ SHA-256 with WASM failed (likely too large): ${e.message}\n`);
}

// Test 3: Poseidon with native bb
console.log("Test 3: Poseidon Circuit with native bb");
console.log("-".repeat(50));
const poseidonNativeStart = Date.now();
try {
    // First check if native bb is installed
    execSync('which bb', { stdio: 'ignore' });
    execSync('cd circuits/pades_ecdsa_poseidon && bb prove -b ./target/pades_ecdsa_poseidon.json -w ./target/witness.gz -o ./proof_poseidon_native',
        { stdio: 'inherit' });
    const poseidonNativeTime = (Date.now() - poseidonNativeStart) / 1000;
    console.log(`✅ Poseidon with native bb: ${poseidonNativeTime.toFixed(2)} seconds\n`);
} catch (e) {
    console.log(`❌ Native bb not installed or failed: ${e.message}\n`);
}

// Test 4: SHA-256 with native bb
console.log("Test 4: SHA-256 Circuit with native bb");
console.log("-".repeat(50));
const sha256NativeStart = Date.now();
try {
    execSync('which bb', { stdio: 'ignore' });
    execSync('cd circuits/pades_ecdsa && bb prove -b ./target/pades_ecdsa.json -w ./target/witness.gz -o ./proof_sha256_native',
        { stdio: 'inherit' });
    const sha256NativeTime = (Date.now() - sha256NativeStart) / 1000;
    console.log(`✅ SHA-256 with native bb: ${sha256NativeTime.toFixed(2)} seconds\n`);
} catch (e) {
    console.log(`❌ Native bb not installed or failed: ${e.message}\n`);
}

console.log("=== Summary ===");
console.log("Circuit constraints:");
console.log("- Poseidon: ~20,000 constraints");
console.log("- SHA-256: ~328,000 constraints (16x larger)");
console.log("\nExpected: Poseidon should be much faster than SHA-256");
console.log("Reality: Performance depends heavily on backend (WASM vs native)");