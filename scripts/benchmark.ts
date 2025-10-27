#!/usr/bin/env node
/**
 * benchmark.ts
 *
 * Performance benchmarking suite for ZK Qualified Signature system
 * Compares SHA-256 and Poseidon circuits across multiple runs
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

interface BenchmarkResult {
    circuit: string;
    run: number;
    steps: {
        extract_hash: number;
        extract_signature: number;
        build_merkle: number;
        encrypt: number;
        prove: number;
        verify: number;
        total: number;
    };
    proof_size: number;
    constraint_count: number;
    timestamp: string;
}

const RUNS = 3; // Number of benchmark runs per circuit
const outDir = 'out';
const benchmarkDir = 'benchmarks';

function timeCommand(command: string, description: string): number {
    console.log(`  Running: ${description}...`);
    const start = Date.now();
    try {
        execSync(command, { stdio: 'pipe' });
        const duration = Date.now() - start;
        console.log(`    ✓ ${duration}ms`);
        return duration;
    } catch (error) {
        console.error(`    ✗ Failed`);
        throw error;
    }
}

async function benchmarkPoseidon(run: number): Promise<BenchmarkResult> {
    console.log(`\n━━━ Poseidon Circuit - Run ${run} ━━━\n`);

    const steps: any = {};

    steps.extract_hash = timeCommand(
        'yarn hash-byte-range -- test_files/sample_signed.pdf',
        'Extract ByteRange hash'
    );

    steps.extract_signature = timeCommand(
        'yarn extract-cades -- test_files/sample_signed.pdf',
        'Extract CAdES signature'
    );

    steps.build_merkle = timeCommand(
        'yarn merkle-poseidon:build -- allowlist.json --out out',
        'Build Poseidon Merkle tree'
    );

    steps.encrypt = timeCommand(
        'yarn encrypt-upload -- test_files/sample.pdf --to out/VERIFIED_pubkey.json',
        'Encrypt file'
    );

    steps.prove = timeCommand(
        'npx tsx scripts/test-poseidon-circuit.ts',
        'Generate proof (Poseidon)'
    );

    // Verification is included in test-poseidon-circuit.ts
    steps.verify = 0;

    steps.total = Object.values(steps).reduce((a: any, b: any) => a + b, 0) as number;

    // Get proof size
    const proofSize = fs.existsSync(path.join(outDir, 'proof-poseidon.bin'))
        ? fs.statSync(path.join(outDir, 'proof-poseidon.bin')).size
        : 0;

    return {
        circuit: 'poseidon',
        run,
        steps,
        proof_size: proofSize,
        constraint_count: 20000, // Approximate
        timestamp: new Date().toISOString()
    };
}

async function benchmarkSHA256(run: number): Promise<BenchmarkResult> {
    console.log(`\n━━━ SHA-256 Circuit (Native bb) - Run ${run} ━━━\n`);

    const steps: any = {};

    steps.extract_hash = timeCommand(
        'yarn hash-byte-range -- test_files/sample_signed.pdf',
        'Extract ByteRange hash'
    );

    steps.extract_signature = timeCommand(
        'yarn extract-cades -- test_files/sample_signed.pdf',
        'Extract CAdES signature'
    );

    steps.build_merkle = timeCommand(
        'yarn merkle:build -- allowlist.json --out out',
        'Build SHA-256 Merkle tree'
    );

    steps.encrypt = timeCommand(
        'yarn encrypt-upload -- test_files/sample.pdf --to out/VERIFIED_pubkey.json',
        'Encrypt file'
    );

    steps.prove = timeCommand(
        'yarn prove:bb',
        'Generate proof (SHA-256 with native bb)'
    );

    steps.verify = timeCommand(
        'yarn verify:bb',
        'Verify proof (SHA-256)'
    );

    steps.total = Object.values(steps).reduce((a: any, b: any) => a + b, 0) as number;

    // Get proof size
    const proofSize = fs.existsSync(path.join(outDir, 'proof'))
        ? fs.statSync(path.join(outDir, 'proof')).size
        : 0;

    return {
        circuit: 'sha256',
        run,
        steps,
        proof_size: proofSize,
        constraint_count: 327939,
        timestamp: new Date().toISOString()
    };
}

function generateReport(results: BenchmarkResult[]): void {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║          BENCHMARK RESULTS SUMMARY                 ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    // Group by circuit
    const poseidonResults = results.filter(r => r.circuit === 'poseidon');
    const sha256Results = results.filter(r => r.circuit === 'sha256');

    const avgPoseidon = poseidonResults.length > 0
        ? poseidonResults.reduce((sum, r) => sum + r.steps.total, 0) / poseidonResults.length
        : 0;

    const avgSHA256 = sha256Results.length > 0
        ? sha256Results.reduce((sum, r) => sum + r.steps.total, 0) / sha256Results.length
        : 0;

    console.log('## Poseidon Circuit');
    console.log(`  Runs: ${poseidonResults.length}`);
    console.log(`  Average total time: ${(avgPoseidon / 1000).toFixed(2)}s`);
    console.log(`  Proof size: ${poseidonResults[0]?.proof_size || 0} bytes`);
    console.log(`  Constraints: ${poseidonResults[0]?.constraint_count || 0}`);

    console.log('\n## SHA-256 Circuit (Native bb)');
    console.log(`  Runs: ${sha256Results.length}`);
    console.log(`  Average total time: ${(avgSHA256 / 1000).toFixed(2)}s`);
    console.log(`  Proof size: ${sha256Results[0]?.proof_size || 0} bytes`);
    console.log(`  Constraints: ${sha256Results[0]?.constraint_count || 0}`);

    console.log('\n## Comparison');
    const speedup = avgSHA256 / avgPoseidon;
    console.log(`  Time ratio: ${speedup > 1 ? 'Poseidon' : 'SHA-256'} is ${Math.abs(speedup - 1).toFixed(2)}x ${speedup > 1 ? 'faster' : 'slower'}`);
    console.log(`  Proof size ratio: SHA-256 is ${(sha256Results[0]?.proof_size / poseidonResults[0]?.proof_size).toFixed(2)}x larger`);
    console.log(`  Constraint ratio: SHA-256 has ${(sha256Results[0]?.constraint_count / poseidonResults[0]?.constraint_count).toFixed(2)}x more constraints`);

    console.log('\n## Detailed Breakdown (milliseconds)\n');
    console.log('| Step | Poseidon | SHA-256 |');
    console.log('|------|----------|---------|');

    const steps = ['extract_hash', 'extract_signature', 'build_merkle', 'encrypt', 'prove', 'verify', 'total'];
    for (const step of steps) {
        const pAvg = poseidonResults.reduce((sum, r) => sum + (r.steps as any)[step], 0) / poseidonResults.length;
        const sAvg = sha256Results.reduce((sum, r) => sum + (r.steps as any)[step], 0) / sha256Results.length;
        console.log(`| ${step.padEnd(18)} | ${pAvg.toFixed(0).padStart(8)} | ${sAvg.toFixed(0).padStart(7)} |`);
    }

    // Save detailed results
    const reportPath = path.join(benchmarkDir, `benchmark-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n📊 Detailed results saved to: ${reportPath}`);
}

async function main() {
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║   ZK Qualified Signature - Performance Benchmark   ║');
    console.log('╚════════════════════════════════════════════════════╝');
    console.log(`\nRunning ${RUNS} iteration(s) per circuit...\n`);

    // Ensure benchmark directory exists
    if (!fs.existsSync(benchmarkDir)) {
        fs.mkdirSync(benchmarkDir, { recursive: true });
    }

    const results: BenchmarkResult[] = [];

    try {
        // Benchmark Poseidon circuit
        for (let i = 1; i <= RUNS; i++) {
            const result = await benchmarkPoseidon(i);
            results.push(result);
        }

        // Benchmark SHA-256 circuit
        for (let i = 1; i <= RUNS; i++) {
            const result = await benchmarkSHA256(i);
            results.push(result);
        }

        // Generate report
        generateReport(results);

        console.log('\n✅ Benchmark complete!\n');

    } catch (error: any) {
        console.error('\n❌ Benchmark failed:', error.message);
        process.exit(1);
    }
}

main();
