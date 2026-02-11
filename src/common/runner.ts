import fs from 'node:fs';
import path from 'node:path';
import { Noir } from '@noir-lang/noir_js';
import { Barretenberg, UltraHonkBackend as BarretenbergBackend } from '@aztec/bb.js';

export interface ProofResult<Manifest = unknown> {
    proof: Uint8Array;
    publicInputs: string[];
    vkey: Uint8Array;
    manifest: Manifest;
}

export interface RunPaths {
    pdfPath: string;
    allowlistPath: string;
    circuitPath: string;
    outDir: string;
}

export interface RunSpec<Prep extends { tl_root: string }, Proof extends ProofResult> {
    id: string;
    label: string;
    mode: string;
    isDump: boolean;
    paths: RunPaths;
    prepare: (
        pdfPath: string,
        allowlistPath: string,
        mode: string,
        isDump: boolean,
        outDir: string,
        bbApi?: Barretenberg,
    ) => Promise<Prep>;
    generateProof: (
        prep: Prep,
        noir: Noir,
        backend: BarretenbergBackend,
        isDump: boolean,
        outDir: string,
    ) => Promise<Proof>;
    verifyProof: (proofResult: Proof, backend: BarretenbergBackend, expectedTlRoot?: string) => Promise<boolean>;
}

function logRunHeader<Prep extends { tl_root: string }, Proof extends ProofResult>(spec: RunSpec<Prep, Proof>): void {
    console.log('=== Run Orchestration ===\n');
    console.log(`  Run: ${spec.label}`);
    console.log(`  Mode: ${spec.mode}`);
    console.log(`  PDF: ${spec.paths.pdfPath}`);
}

interface NoirCircuit {
    bytecode: string;
    [key: string]: unknown;
}

async function loadCircuit(circuitPath: string): Promise<NoirCircuit> {
    console.log('\nCompiling circuit...');
    const circuitDir = circuitPath;
    const circuitName = path.basename(circuitPath);
    const compiledPath = path.join(circuitDir, 'target', `${circuitName}.json`);

    if (!fs.existsSync(compiledPath)) {
        console.log('Circuit not compiled. Compiling now...');
        const { execSync } = await import('node:child_process');
        const nargoHome = path.join(circuitDir, '.nargo');
        if (!fs.existsSync(nargoHome)) {
            fs.mkdirSync(nargoHome, { recursive: true });
        }
        execSync('nargo compile', {
            cwd: circuitDir,
            stdio: 'inherit',
            env: {
                ...process.env,
                NARGO_HOME: nargoHome,
            },
        });
    }

    return JSON.parse(fs.readFileSync(compiledPath, 'utf-8'));
}

async function destroyWithTimeout(label: string, fn: () => Promise<void>, timeoutMs: number): Promise<boolean> {
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<void>((resolve) => {
        timeoutId = setTimeout(() => {
            timedOut = true;
            resolve();
        }, timeoutMs);
    });

    try {
        await Promise.race([fn(), timeoutPromise]);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`WARN: ${label} destroy failed: ${message}`);
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }

    if (timedOut) {
        console.warn(`WARN: ${label} destroy timed out after ${timeoutMs}ms; continuing.`);
    }

    return timedOut;
}

async function cleanup(backend?: BarretenbergBackend, bbApi?: Barretenberg): Promise<void> {
    const timeoutMs = 15000;
    let backendTimedOut = false;
    if (backend) {
        backendTimedOut = await destroyWithTimeout('Barretenberg backend', () => backend.destroy(), timeoutMs);
    }
    if (bbApi) {
        if (backendTimedOut) {
            console.warn('WARN: Skipping Barretenberg singleton destroy because backend shutdown timed out.');
            return;
        }
        await destroyWithTimeout('Barretenberg singleton', () => Barretenberg.destroySingleton(), timeoutMs);
    }
}

export async function runWithSpec<Prep extends { tl_root: string }, Proof extends ProofResult>(
    spec: RunSpec<Prep, Proof>,
): Promise<number> {
    let backend: BarretenbergBackend | undefined;
    let bbApi: Barretenberg | undefined;

    try {
        logRunHeader(spec);
        const circuit = await loadCircuit(spec.paths.circuitPath);

        console.log('Initializing Noir...');
        const noir = new Noir(circuit);

        console.log('Initializing Barretenberg backend with increased memory...');
        backend = new BarretenbergBackend(circuit.bytecode, {
            threads: 4,
            memory: {
                initial: 256,
                maximum: 65536,
            },
        });

        bbApi = await Barretenberg.initSingleton({ threads: 4 });

        const prep = await spec.prepare(
            spec.paths.pdfPath,
            spec.paths.allowlistPath,
            spec.mode,
            spec.isDump,
            spec.paths.outDir,
            bbApi,
        );
        const proofResult = await spec.generateProof(prep, noir, backend, spec.isDump, spec.paths.outDir);
        const isValid = await spec.verifyProof(proofResult, backend, prep.tl_root);

        return isValid ? 0 : 1;
    } finally {
        await cleanup(backend, bbApi);
    }
}
