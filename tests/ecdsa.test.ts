import { expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWithSpec } from '../src/common/runner.ts';
import { createEcdsaRunSpec } from '../src/ECDSA-Pades/spec.ts';
import { sha256 } from '../src/common/utils.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function deterministicBytes(seed: string, length: number): Buffer {
    const chunks: Buffer[] = [];
    let counter = 0;
    let remaining = length;

    while (remaining > 0) {
        const digest = Buffer.from(sha256(Buffer.from(`${seed}:${counter}`)));
        const take = Math.min(remaining, digest.length);
        chunks.push(digest.slice(0, take));
        remaining -= take;
        counter += 1;
    }

    return Buffer.concat(chunks);
}

function writeDummyCert(dir: string, name: string, seed: string): string {
    const filePath = path.join(dir, name);
    const bytes = deterministicBytes(seed, 512);
    fs.writeFileSync(filePath, bytes);
    return filePath;
}

function seededShuffle<T>(items: T[], seed: number): T[] {
    const out = [...items];
    let state = seed >>> 0;

    const next = (): number => {
        // xorshift32
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return state >>> 0;
    };

    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = next() % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }

    return out;
}

test('ECDSA PAdES (pedersen) end-to-end', { timeout: 0 }, async () => {
    console.log('\n=== Test: ECDSA PAdES (pedersen) ===\n');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-qes-ecdsa-'));
    const signerCert = path.join(repoRoot, 'examples', 'ECDSA', 'ECDSA.cer');
    const dummy1 = writeDummyCert(tmpDir, 'dummy-1.cer', 'ecdsa-dummy-1');
    const dummy2 = writeDummyCert(tmpDir, 'dummy-2.cer', 'ecdsa-dummy-2');
    const dummy3 = writeDummyCert(tmpDir, 'dummy-3.cer', 'ecdsa-dummy-3');

    const certs = [signerCert, dummy1, dummy2, dummy3];
    const seed = Number(process.env.ALLOWLIST_SEED ?? 1337);
    const allowlistCertPaths = seededShuffle(certs, seed);
    const outDir = path.join(tmpDir, 'run-seeded');
    const spec = createEcdsaRunSpec({
        pdfPath: path.join(repoRoot, 'examples', 'ECDSA', 'ECDSA.pdf'),
        allowlistCertPaths,
        outDir,
    });
    const code = await runWithSpec(spec);
    expect(code).toBe(0);
});
