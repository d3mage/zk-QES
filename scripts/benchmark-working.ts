#!/usr/bin/env node
/**
 * benchmark-working.ts
 *
 * Benchmark only the working configurations:
 * - Poseidon circuit with WASM (bb.js) - WORKS
 * - Note: SHA-256 with native bb fails with "Length is too large"
 * - Note: Poseidon with native bb has compilation errors
 *
 * This gives us accurate timing data for what's currently functional.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

interface BenchmarkResult {
    circuit: 'poseidon';
    backend: 'wasm';
    run: number;
    timings: {
        setup: number;
        prove: number;
        total: number;
    };
    proof_size: number;
    constraint_count: number;
    status: 'success' | 'failed';
    error?: string;
    timestamp: string;
}

const RUNS = 5; // Run 5 times for better statistical data
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

async function benchmarkPoseidonWASM(run: number): Promise<BenchmarkResult> {
    console.log(`\n━━━ Poseidon + WASM (bb.js) - Run ${run}/${RUNS} ━━━\n`);

    const timings: any = {};
    let status: 'success' | 'failed' = 'success';
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
            'Prove + Verify: Generate and verify proof with bb.js (WASM)'
        );
        timings.prove = proveResult.duration;
        if (!proveResult.success) {
            status = 'failed';
            errorMsg = proveResult.error;
        }

    } catch (error: any) {
        status = 'failed';
        errorMsg = error.message;
        timings.setup = timings.setup || 0;
        timings.prove = timings.prove || 0;
    }

    timings.total = (timings.setup || 0) + (timings.prove || 0);

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
    console.log('║                  BENCHMARK RESULTS                            ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    const successful = results.filter(r => r.status === 'success');
    const failed = results.filter(r => r.status === 'failed');

    console.log(`✓ Successful runs: ${successful.length}/${results.length}`);
    if (failed.length > 0) {
        console.log(`✗ Failed runs: ${failed.length}/${results.length}`);
    }

    if (successful.length === 0) {
        console.log('\n❌ No successful runs to analyze\n');
        return;
    }

    // Calculate statistics
    const setupTimes = successful.map(r => r.timings.setup);
    const proveTimes = successful.map(r => r.timings.prove);
    const totalTimes = successful.map(r => r.timings.total);

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const stddev = (arr: number[]) => {
        const mean = avg(arr);
        const squareDiffs = arr.map(x => Math.pow(x - mean, 2));
        return Math.sqrt(avg(squareDiffs));
    };
    const min = (arr: number[]) => Math.min(...arr);
    const max = (arr: number[]) => Math.max(...arr);

    console.log('\n## Poseidon Circuit + WASM (bb.js)\n');
    console.log(`Circuit size:     ${successful[0].constraint_count.toLocaleString()} constraints`);
    console.log(`Proof size:       ${successful[0].proof_size.toLocaleString()} bytes`);
    console.log('');

    console.log('### Setup Time (Merkle Tree Build)');
    console.log(`  Average:  ${(avg(setupTimes) / 1000).toFixed(2)}s`);
    console.log(`  Std Dev:  ${(stddev(setupTimes) / 1000).toFixed(2)}s`);
    console.log(`  Min:      ${(min(setupTimes) / 1000).toFixed(2)}s`);
    console.log(`  Max:      ${(max(setupTimes) / 1000).toFixed(2)}s`);
    console.log('');

    console.log('### Prove + Verify Time');
    console.log(`  Average:  ${(avg(proveTimes) / 1000).toFixed(2)}s`);
    console.log(`  Std Dev:  ${(stddev(proveTimes) / 1000).toFixed(2)}s`);
    console.log(`  Min:      ${(min(proveTimes) / 1000).toFixed(2)}s`);
    console.log(`  Max:      ${(max(proveTimes) / 1000).toFixed(2)}s`);
    console.log('');

    console.log('### Total Time');
    console.log(`  Average:  ${(avg(totalTimes) / 1000).toFixed(2)}s`);
    console.log(`  Std Dev:  ${(stddev(totalTimes) / 1000).toFixed(2)}s`);
    console.log(`  Min:      ${(min(totalTimes) / 1000).toFixed(2)}s`);
    console.log(`  Max:      ${(max(totalTimes) / 1000).toFixed(2)}s`);

    // Detailed run breakdown
    console.log('\n## Individual Run Times\n');
    console.log('| Run | Setup (s) | Prove (s) | Total (s) |');
    console.log('|-----|-----------|-----------|-----------|');
    successful.forEach(r => {
        console.log(`| ${r.run.toString().padStart(3)} | ${(r.timings.setup / 1000).toFixed(2).padStart(9)} | ${(r.timings.prove / 1000).toFixed(2).padStart(9)} | ${(r.timings.total / 1000).toFixed(2).padStart(9)} |`);
    });

    console.log('\n## Summary for Documentation\n');
    console.log('```');
    console.log('Circuit: Poseidon2 (optimized)');
    console.log(`Constraints: ${successful[0].constraint_count.toLocaleString()}`);
    console.log(`Proof Size: ${successful[0].proof_size.toLocaleString()} bytes`);
    console.log(`Backend: WASM (bb.js via @aztec/bb.js)`);
    console.log('');
    console.log(`Prove + Verify Time: ${(avg(proveTimes) / 1000).toFixed(1)}s ± ${(stddev(proveTimes) / 1000).toFixed(1)}s`);
    console.log(`Total Time (incl. setup): ${(avg(totalTimes) / 1000).toFixed(1)}s ± ${(stddev(totalTimes) / 1000).toFixed(1)}s`);
    console.log('```');

    // Save results
    const timestamp = Date.now();
    const reportPath = path.join(benchmarkDir, `poseidon-wasm-benchmark-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify({
        metadata: {
            circuit: 'poseidon',
            backend: 'wasm',
            constraint_count: successful[0].constraint_count,
            proof_size: successful[0].proof_size,
            runs: results.length,
            successful_runs: successful.length,
            failed_runs: failed.length
        },
        statistics: {
            setup: {
                avg: avg(setupTimes) / 1000,
                stddev: stddev(setupTimes) / 1000,
                min: min(setupTimes) / 1000,
                max: max(setupTimes) / 1000
            },
            prove: {
                avg: avg(proveTimes) / 1000,
                stddev: stddev(proveTimes) / 1000,
                min: min(proveTimes) / 1000,
                max: max(proveTimes) / 1000
            },
            total: {
                avg: avg(totalTimes) / 1000,
                stddev: stddev(totalTimes) / 1000,
                min: min(totalTimes) / 1000,
                max: max(totalTimes) / 1000
            }
        },
        runs: results
    }, null, 2));
    console.log(`\n📊 Detailed results saved to: ${reportPath}\n`);
}

async function main() {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║       ZK Qualified Signature - Poseidon WASM Benchmark       ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log(`\nRunning ${RUNS} iterations to collect accurate statistics\n`);

    // Ensure directories exist
    if (!fs.existsSync(benchmarkDir)) {
        fs.mkdirSync(benchmarkDir, { recursive: true });
    }

    const results: BenchmarkResult[] = [];

    try {
        for (let i = 1; i <= RUNS; i++) {
            const result = await benchmarkPoseidonWASM(i);
            results.push(result);

            // Small delay between runs
            if (i < RUNS) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Generate report
        generateReport(results);

        console.log('✅ Benchmark complete!\n');

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
