import path from 'node:path';
import { runWithSpec } from './common/runner.ts';
import { createEcdsaRunSpec } from './ECDSA-Pades/spec.ts';
import { createRsaRunSpec } from './RSA-Pades/spec.ts';

type RunKind = 'ecdsa' | 'rsa';

type CliOptions = {
    kind?: RunKind;
    pdfPath?: string;
    allowlistPath?: string;
    outDir?: string;
    mode?: string;
    isDump?: boolean;
    showHelp?: boolean;
};

const usage = `=== Usage ===
Run: bun src/run.ts <ecdsa|rsa> --pdf <path> --allowlist <path> [options]

Options:
  --pdf, -p         Path to the signed PDF
  --allowlist, -a   Path to the allowlist JSON
  --out, -o         Output directory (optional)
  --mode, -m        Merkle hash mode (default: pedersen)
  --dump            Write intermediate artifacts
  --help, -h        Show this help
`;

function parseArgs(argv: string[]): CliOptions {
    const opts: CliOptions = {};
    const args = [...argv];

    if (args.length > 0 && !args[0].startsWith('-')) {
        const kind = args.shift();
        if (kind === 'ecdsa' || kind === 'rsa') {
            opts.kind = kind;
        }
    }

    while (args.length > 0) {
        const current = args.shift();
        if (!current) {
            break;
        }

        switch (current) {
            case '--pdf':
            case '-p':
                opts.pdfPath = args.shift();
                break;
            case '--allowlist':
            case '-a':
                opts.allowlistPath = args.shift();
                break;
            case '--out':
            case '-o':
                opts.outDir = args.shift();
                break;
            case '--mode':
            case '-m':
                opts.mode = args.shift();
                break;
            case '--dump':
                opts.isDump = true;
                break;
            case '--help':
            case '-h':
                opts.showHelp = true;
                break;
            default:
                break;
        }
    }

    return opts;
}

function resolvePath(input: string): string {
    return path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
}

const opts = parseArgs(process.argv.slice(2));
if (opts.showHelp || !opts.kind) {
    console.log(usage);
    process.exit(opts.showHelp ? 0 : 1);
}

if (!opts.pdfPath || !opts.allowlistPath) {
    console.error('\nERROR: --pdf and --allowlist are required.');
    console.log(usage);
    process.exit(1);
}

const pdfPath = resolvePath(opts.pdfPath);
const allowlistPath = resolvePath(opts.allowlistPath);
const outDir = opts.outDir ? resolvePath(opts.outDir) : undefined;

const commonOptions = {
    pdfPath,
    allowlistPath,
    outDir,
    mode: opts.mode,
    isDump: opts.isDump
};

const spec = opts.kind === 'ecdsa' ? createEcdsaRunSpec(commonOptions) : createRsaRunSpec(commonOptions);

runWithSpec(spec)
    .then((code) => {
        process.exit(code);
    })
    .catch((err) => {
        console.error('\nERROR:', err.message);
        if (err.stack) {
            console.error(err.stack);
        }
        process.exit(1);
    });
