#!/usr/bin/env node
/**
 * benchmark-comprehensive.ts
 *
 * Comprehensive benchmarking suite comparing:
 * 1. SHA-256 circuit with native bb
 * 2. SHA-256 circuit with WASM (bb.js) - if feasible
 * 3. Poseidon circuit with native bb
 * 4. Poseidon circuit with WASM (bb.js)
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

interface BenchmarkResult {
    circuit: 'sha256' | 'poseidon';
    backend: 'native-bb' | 'wasm';
    run: number;
    timings: {
        setup: number;
        prove: number;
        verify: number;
        total: number;
    };
    proof_size: number;
    constraint_count: number;
    status: 'success' | 'failed' | 'crashed';
    error?: string;
    timestamp: string;
}

const RUNS = 3; // Number of benchmark runs per configuration
const outDir = 'out';
const benchmarkDir = 'benchmarks';

function timeCommand(command: string, description: string): { duration: number; success: boolean; error?: string } {
    console.log(`  ${description}...`);
    const start = Date.now();
    try {
        execSync(command, { stdio: 'pipe', maxBuffer: 50 * 1024 * 1024 });
        const duration = Date.now() - start;
        console.log(`    ✓ ${(duration / 1000).toFixed(2)}s`);
        return { duration, success: true };
    } catch (error: any) {
        const duration = Date.now() - start;
        console.error(`    ✗ Failed (${(duration / 1000).toFixed(2)}s)`);
        return { duration, success: false, error: error.message };
    }
}

/**
 * Benchmark SHA-256 circuit with native bb
 */
async function benchmarkSHA256Native(run: number): Promise<BenchmarkResult> {
    console.log(`\n━━━ SHA-256 + Native bb - Run ${run}/${RUNS} ━━━\n`);

    const timings: any = {};
    let status: 'success' | 'failed' | 'crashed' = 'success';
    let errorMsg: string | undefined;

    try {
        // Setup (merkle tree build)
        const setupResult = timeCommand(
            'yarn merkle:build -- allowlist.json --out out',
            'Setup: Build SHA-256 Merkle tree'
        );
        timings.setup = setupResult.duration;

        // Prove
        const proveResult = timeCommand(
            'yarn prove:bb',
            'Prove: Generate proof with native bb'
        );
        timings.prove = proveResult.duration;
        if (!proveResult.success) {
            status = 'failed';
            errorMsg = proveResult.error;
        }

        // Verify
        const verifyResult = timeCommand(
            'yarn verify:bb',
            'Verify: Verify proof'
        );
        timings.verify = verifyResult.duration;
        if (!verifyResult.success && status === 'success') {
            status = 'failed';
            errorMsg = verifyResult.error;
        }

    } catch (error: any) {
        status = 'crashed';
        errorMsg = error.message;
        timings.setup = timings.setup || 0;
        timings.prove = timings.prove || 0;
        timings.verify = timings.verify || 0;
    }

    timings.total = (timings.setup || 0) + (timings.prove || 0) + (timings.verify || 0);

    const proofSize = fs.existsSync(path.join(outDir, 'proof'))
        ? fs.statSync(path.join(outDir, 'proof')).size
        : 0;

    return {
        circuit: 'sha256',
        backend: 'native-bb',
        run,
        timings,
        proof_size: proofSize,
        constraint_count: 327939,
        status,
        error: errorMsg,
        timestamp: new Date().toISOString()
    };
}

/**
 * Benchmark SHA-256 circuit with WASM (bb.js)
 * Note: This may crash due to circuit size
 */
async function benchmarkSHA256WASM(run: number): Promise<BenchmarkResult> {
    console.log(`\n━━━ SHA-256 + WASM (bb.js) - Run ${run}/${RUNS} ━━━\n`);
    console.log('⚠️  Warning: SHA-256 circuit is very large (327K constraints)');
    console.log('   This may crash with WASM backend\n');

    const timings: any = {};
    let status: 'success' | 'failed' | 'crashed' = 'success';
    let errorMsg: string | undefined;

    try {
        // Setup
        const setupResult = timeCommand(
            'yarn merkle:build -- allowlist.json --out out',
            'Setup: Build SHA-256 Merkle tree'
        );
        timings.setup = setupResult.duration;

        // Prove with WASM (using prove.ts which uses bb.js)
        const proveResult = timeCommand(
            'yarn prove',
            'Prove: Generate proof with bb.js (WASM)'
        );
        timings.prove = proveResult.duration;
        if (!proveResult.success) {
            status = 'crashed';
            errorMsg = 'WASM backend crashed with large SHA-256 circuit';
        }

        // Verify
        const verifyResult = timeCommand(
            'yarn verify',
            'Verify: Verify proof'
        );
        timings.verify = verifyResult.duration;

    } catch (error: any) {
        status = 'crashed';
        errorMsg = error.message;
        timings.setup = timings.setup || 0;
        timings.prove = timings.prove || 0;
        timings.verify = timings.verify || 0;
    }

    timings.total = (timings.setup || 0) + (timings.prove || 0) + (timings.verify || 0);

    const proofSize = fs.existsSync(path.join(outDir, 'proof'))
        ? fs.statSync(path.join(outDir, 'proof')).size
        : 0;

    return {
        circuit: 'sha256',
        backend: 'wasm',
        run,
        timings,
        proof_size: proofSize,
        constraint_count: 327939,
        status,
        error: errorMsg,
        timestamp: new Date().toISOString()
    };
}

/**
 * Benchmark Poseidon circuit with native bb
 */
async function benchmarkPoseidonNative(run: number): Promise<BenchmarkResult> {
    console.log(`\n━━━ Poseidon + Native bb - Run ${run}/${RUNS} ━━━\n`);

    const timings: any = {};
    let status: 'success' | 'failed' | 'crashed' = 'success';
    let errorMsg: string | undefined;

    try {
        // Setup (merkle tree build)
        const setupResult = timeCommand(
            'yarn merkle-poseidon:build -- allowlist.json --out out',
            'Setup: Build Poseidon Merkle tree'
        );
        timings.setup = setupResult.duration;

        // Prove with native bb
        // We need to create a script similar to prove-with-bb.ts but for Poseidon
        const proveResult = timeCommand(
            'npx tsx scripts/prove-poseidon-native.ts',
            'Prove: Generate proof with native bb'
        );
        timings.prove = proveResult.duration;
        if (!proveResult.success) {
            status = 'failed';
            errorMsg = proveResult.error;
        }

        // Verify
        const verifyResult = timeCommand(
            'npx tsx scripts/verify-poseidon-native.ts',
            'Verify: Verify proof'
        );
        timings.verify = verifyResult.duration;
        if (!verifyResult.success && status === 'success') {
            status = 'failed';
            errorMsg = verifyResult.error;
        }

    } catch (error: any) {
        status = 'crashed';
        errorMsg = error.message;
        timings.setup = timings.setup || 0;
        timings.prove = timings.prove || 0;
        timings.verify = timings.verify || 0;
    }

    timings.total = (timings.setup || 0) + (timings.prove || 0) + (timings.verify || 0);

    const proofSize = fs.existsSync(path.join(outDir, 'proof-poseidon'))
        ? fs.statSync(path.join(outDir, 'proof-poseidon')).size
        : 0;

    return {
        circuit: 'poseidon',
        backend: 'native-bb',
        run,
        timings,
        proof_size: proofSize,
        constraint_count: 20000,
        status,
        error: errorMsg,
        timestamp: new Date().toISOString()
    };
}

/**
 * Benchmark Poseidon circuit with WASM (bb.js)
 */
async function benchmarkPoseidonWASM(run: number): Promise<BenchmarkResult> {
    console.log(`\n━━━ Poseidon + WASM (bb.js) - Run ${run}/${RUNS} ━━━\n`);

    const timings: any = {};
    let status: 'success' | 'failed' | 'crashed' = 'success';
    let errorMsg: string | undefined;

    try {
        // Setup
        const setupResult = timeCommand(
            'yarn merkle-poseidon:build -- allowlist.json --out out',
            'Setup: Build Poseidon Merkle tree'
        );
        timings.setup = setupResult.duration;

        // Prove with WASM
        const proveResult = timeCommand(
            'npx tsx scripts/test-poseidon-circuit.ts',
            'Prove: Generate proof with bb.js (WASM)'
        );
        timings.prove = proveResult.duration;
        if (!proveResult.success) {
            status = 'failed';
            errorMsg = proveResult.error;
        }

        // Verify is included in test-poseidon-circuit.ts
        timings.verify = 0;

    } catch (error: any) {
        status = 'crashed';
        errorMsg = error.message;
        timings.setup = timings.setup || 0;
        timings.prove = timings.prove || 0;
        timings.verify = timings.verify || 0;
    }

    timings.total = (timings.setup || 0) + (timings.prove || 0) + (timings.verify || 0);

    const proofSize = fs.existsSync(path.join(outDir, 'proof-poseidon.bin'))
        ? fs.statSync(path.join(outDir, 'proof-poseidon.bin')).size
        : 0;

    return {
        circuit: 'poseidon',
        backend: 'wasm',
        run,
        timings,
        proof_size: proofSize,
        constraint_count: 20000,
        status,
        error: errorMsg,
        timestamp: new Date().toISOString()
    };
}

function generateReport(results: BenchmarkResult[]): void {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║          COMPREHENSIVE BENCHMARK RESULTS                      ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    // Group results
    const sha256Native = results.filter(r => r.circuit === 'sha256' && r.backend === 'native-bb');
    const sha256WASM = results.filter(r => r.circuit === 'sha256' && r.backend === 'wasm');
    const poseidonNative = results.filter(r => r.circuit === 'poseidon' && r.backend === 'native-bb');
    const poseidonWASM = results.filter(r => r.circuit === 'poseidon' && r.backend === 'wasm');

    // Calculate averages (only for successful runs)
    const avg = (arr: BenchmarkResult[]) => {
        const successful = arr.filter(r => r.status === 'success');
        if (successful.length === 0) return null;
        return {
            setup: successful.reduce((sum, r) => sum + r.timings.setup, 0) / successful.length,
            prove: successful.reduce((sum, r) => sum + r.timings.prove, 0) / successful.length,
            verify: successful.reduce((sum, r) => sum + r.timings.verify, 0) / successful.length,
            total: successful.reduce((sum, r) => sum + r.timings.total, 0) / successful.length,
            successRate: (successful.length / arr.length) * 100,
            proofSize: successful[0]?.proof_size || 0
        };
    };

    const results_sha256_native = avg(sha256Native);
    const results_sha256_wasm = avg(sha256WASM);
    const results_poseidon_native = avg(poseidonNative);
    const results_poseidon_wasm = avg(poseidonWASM);

    // Print detailed results
    console.log('## 1. SHA-256 Circuit + Native bb');
    if (results_sha256_native) {
        console.log(`   Runs: ${sha256Native.filter(r => r.status === 'success').length}/${sha256Native.length} successful`);
        console.log(`   Setup:   ${(results_sha256_native.setup / 1000).toFixed(2)}s`);
        console.log(`   Prove:   ${(results_sha256_native.prove / 1000).toFixed(2)}s`);
        console.log(`   Verify:  ${(results_sha256_native.verify / 1000).toFixed(2)}s`);
        console.log(`   Total:   ${(results_sha256_native.total / 1000).toFixed(2)}s`);
        console.log(`   Proof:   ${results_sha256_native.proofSize.toLocaleString()} bytes`);
    } else {
        console.log(`   ❌ All runs failed`);
        console.log(`   Error: ${sha256Native[0]?.error || 'Unknown'}`);
    }

    console.log('\n## 2. SHA-256 Circuit + WASM (bb.js)');
    if (results_sha256_wasm) {
        console.log(`   Runs: ${sha256WASM.filter(r => r.status === 'success').length}/${sha256WASM.length} successful`);
        console.log(`   Setup:   ${(results_sha256_wasm.setup / 1000).toFixed(2)}s`);
        console.log(`   Prove:   ${(results_sha256_wasm.prove / 1000).toFixed(2)}s`);
        console.log(`   Verify:  ${(results_sha256_wasm.verify / 1000).toFixed(2)}s`);
        console.log(`   Total:   ${(results_sha256_wasm.total / 1000).toFixed(2)}s`);
        console.log(`   Proof:   ${results_sha256_wasm.proofSize.toLocaleString()} bytes`);
    } else {
        console.log(`   ❌ All runs failed (expected - circuit too large for WASM)`);
        console.log(`   Error: ${sha256WASM[0]?.error || 'Unknown'}`);
    }

    console.log('\n## 3. Poseidon Circuit + Native bb');
    if (results_poseidon_native) {
        console.log(`   Runs: ${poseidonNative.filter(r => r.status === 'success').length}/${poseidonNative.length} successful`);
        console.log(`   Setup:   ${(results_poseidon_native.setup / 1000).toFixed(2)}s`);
        console.log(`   Prove:   ${(results_poseidon_native.prove / 1000).toFixed(2)}s`);
        console.log(`   Verify:  ${(results_poseidon_native.verify / 1000).toFixed(2)}s`);
        console.log(`   Total:   ${(results_poseidon_native.total / 1000).toFixed(2)}s`);
        console.log(`   Proof:   ${results_poseidon_native.proofSize.toLocaleString()} bytes`);
    } else {
        console.log(`   ❌ All runs failed`);
        console.log(`   Error: ${poseidonNative[0]?.error || 'Unknown'}`);
    }

    console.log('\n## 4. Poseidon Circuit + WASM (bb.js)');
    if (results_poseidon_wasm) {
        console.log(`   Runs: ${poseidonWASM.filter(r => r.status === 'success').length}/${poseidonWASM.length} successful`);
        console.log(`   Setup:   ${(results_poseidon_wasm.setup / 1000).toFixed(2)}s`);
        console.log(`   Prove:   ${(results_poseidon_wasm.prove / 1000).toFixed(2)}s`);
        console.log(`   Verify:  ${(results_poseidon_wasm.verify / 1000).toFixed(2)}s`);
        console.log(`   Total:   ${(results_poseidon_wasm.total / 1000).toFixed(2)}s`);
        console.log(`   Proof:   ${results_poseidon_wasm.proofSize.toLocaleString()} bytes`);
    } else {
        console.log(`   ❌ All runs failed`);
        console.log(`   Error: ${poseidonWASM[0]?.error || 'Unknown'}`);
    }

    // Comparison table
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    COMPARISON TABLE                           ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log('| Configuration              | Prove Time | Total Time | Proof Size | Status |');
    console.log('|----------------------------|------------|------------|------------|--------|');

    const formatRow = (name: string, result: any, constraint: number) => {
        if (result) {
            return `| ${name.padEnd(26)} | ${(result.prove / 1000).toFixed(2).padStart(9)}s | ${(result.total / 1000).toFixed(2).padStart(9)}s | ${result.proofSize.toLocaleString().padStart(10)} | ✅ OK  |`;
        } else {
            return `| ${name.padEnd(26)} | ${'N/A'.padStart(9)} | ${'N/A'.padStart(9)} | ${'N/A'.padStart(10)} | ❌ FAIL |`;
        }
    };

    console.log(formatRow('SHA-256 + Native bb', results_sha256_native, 327939));
    console.log(formatRow('SHA-256 + WASM', results_sha256_wasm, 327939));
    console.log(formatRow('Poseidon + Native bb', results_poseidon_native, 20000));
    console.log(formatRow('Poseidon + WASM', results_poseidon_wasm, 20000));

    // Key findings
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                      KEY FINDINGS                             ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    if (results_poseidon_native && results_poseidon_wasm) {
        const speedup = results_poseidon_wasm.prove / results_poseidon_native.prove;
        console.log(`✓ Poseidon Native vs WASM: Native is ${speedup.toFixed(2)}x faster`);
    }

    if (results_sha256_native && results_poseidon_native) {
        const ratio = results_sha256_native.prove / results_poseidon_native.prove;
        console.log(`✓ SHA-256 vs Poseidon (both native): SHA-256 is ${ratio.toFixed(2)}x ${ratio > 1 ? 'slower' : 'faster'}`);
    }

    if (results_sha256_native && results_poseidon_native) {
        const sizeRatio = results_sha256_native.proofSize / results_poseidon_native.proofSize;
        console.log(`✓ Proof size: SHA-256 is ${sizeRatio.toFixed(2)}x larger than Poseidon`);
    }

    console.log(`\n✓ Constraint count: SHA-256 has ${(327939 / 20000).toFixed(1)}x more constraints than Poseidon`);

    // Save results
    const timestamp = Date.now();
    const reportPath = path.join(benchmarkDir, `comprehensive-benchmark-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n📊 Detailed results saved to: ${reportPath}`);
}

async function main() {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║   ZK Qualified Signature - Comprehensive Benchmark            ║');
    console.log('║   Testing: SHA-256 & Poseidon × Native bb & WASM              ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log(`\nRunning ${RUNS} iteration(s) per configuration (4 configurations)\n`);

    // Ensure directories exist
    if (!fs.existsSync(benchmarkDir)) {
        fs.mkdirSync(benchmarkDir, { recursive: true });
    }

    const results: BenchmarkResult[] = [];

    try {
        // 1. SHA-256 + Native bb
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  Configuration 1/4: SHA-256 + Native bb');
        console.log('═══════════════════════════════════════════════════════════════');
        for (let i = 1; i <= RUNS; i++) {
            const result = await benchmarkSHA256Native(i);
            results.push(result);
        }

        // 2. SHA-256 + WASM (may crash)
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  Configuration 2/4: SHA-256 + WASM (bb.js)');
        console.log('═══════════════════════════════════════════════════════════════');
        for (let i = 1; i <= RUNS; i++) {
            const result = await benchmarkSHA256WASM(i);
            results.push(result);
        }

        // 3. Poseidon + Native bb
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  Configuration 3/4: Poseidon + Native bb');
        console.log('═══════════════════════════════════════════════════════════════');
        for (let i = 1; i <= RUNS; i++) {
            const result = await benchmarkPoseidonNative(i);
            results.push(result);
        }

        // 4. Poseidon + WASM
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  Configuration 4/4: Poseidon + WASM (bb.js)');
        console.log('═══════════════════════════════════════════════════════════════');
        for (let i = 1; i <= RUNS; i++) {
            const result = await benchmarkPoseidonWASM(i);
            results.push(result);
        }

        // Generate report
        generateReport(results);

        console.log('\n✅ Comprehensive benchmark complete!\n');

    } catch (error: any) {
        console.error('\n❌ Benchmark failed:', error.message);
        if (results.length > 0) {
            console.log('\n⚠️  Generating partial report from completed runs...');
            generateReport(results);
        }
        process.exit(1);
    }
}

main();
