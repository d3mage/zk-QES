import fs from 'node:fs';
import path from 'node:path';
import { buildAllowlistFromCertificates, writeAllowlistFile } from '../src/common/allowlist.ts';

function usage(): void {
    console.log(`Usage: bun scripts/allowlist-from-certs.ts --out <file> [certs...] [--dir <folder>]

Options:
  --out, -o   Output allowlist JSON path (default: ./allowlist.generated.json)
  --dir, -d   Add all cert files in a directory (non-recursive)
  --help, -h  Show this help
`);
}

function isCertFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return ext === '.cer' || ext === '.crt' || ext === '.der' || ext === '.pem';
}

function parseArgs(argv: string[]): { outPath: string; certPaths: string[] } {
    const args = [...argv];
    let outPath = path.resolve(process.cwd(), 'allowlist.generated.json');
    const certPaths: string[] = [];

    while (args.length > 0) {
        const current = args.shift();
        if (!current) break;
        switch (current) {
            case '--out':
            case '-o':
                outPath = path.resolve(process.cwd(), args.shift() ?? outPath);
                break;
            case '--dir':
            case '-d': {
                const dir = args.shift();
                if (!dir) break;
                const resolved = path.resolve(process.cwd(), dir);
                const entries = fs.readdirSync(resolved);
                for (const entry of entries) {
                    if (isCertFile(entry)) {
                        certPaths.push(path.join(resolved, entry));
                    }
                }
                break;
            }
            case '--help':
            case '-h':
                usage();
                process.exit(0);
            default:
                certPaths.push(path.resolve(process.cwd(), current));
                break;
        }
    }

    return { outPath, certPaths };
}

const { outPath, certPaths } = parseArgs(process.argv.slice(2));

if (certPaths.length === 0) {
    usage();
    process.exit(1);
}

const allowlist = buildAllowlistFromCertificates(certPaths, { sort: true });
writeAllowlistFile(allowlist, outPath);

console.log(`Wrote allowlist with ${allowlist.cert_fingerprints.length} entries to: ${outPath}`);
