import fs from 'fs';
import { createPoseidonHash } from 'poseidon-lite';

const poseidon = createPoseidonHash();

/**
 * Pedersen hash for Noir circuit compatibility
 * Uses poseidon-lite which matches std::hash::pedersen_hash in Noir
 */
export function pedersenHash(left: bigint, right: bigint): bigint {
  return poseidon([left, right]);
}

/**
 * Build Pedersen Merkle tree from fingerprints
 */
export function buildPedersenMerkleTree(fingerprints: string[]): {
  root: string;
  paths: Map<string, { path: string[]; index: number }>;
} {
  const TREE_DEPTH = 8;
  const MAX_LEAVES = 256;
  
  if (fingerprints.length > MAX_LEAVES) {
    throw new Error(`Too many fingerprints: ${fingerprints.length} (max ${MAX_LEAVES})`);
  }
  
  // Convert fingerprints to Field elements (BigInt)
  const leaves = fingerprints.map(fpr => BigInt('0x' + fpr));
  
  // Pad to power of 2
  while (leaves.length < MAX_LEAVES) {
    leaves.push(0n);
  }
  
  // Build tree bottom-up
  let currentLevel = [...leaves];
  const tree: bigint[][] = [currentLevel];
  
  for (let level = 0; level < TREE_DEPTH; level++) {
    const nextLevel: bigint[] = [];
    
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = currentLevel[i + 1];
      const parent = pedersenHash(left, right);
      nextLevel.push(parent);
    }
    
    tree.push(nextLevel);
    currentLevel = nextLevel;
  }
  
  const root = tree[TREE_DEPTH][0];
  
  // Generate inclusion paths
  const paths = new Map<string, { path: string[]; index: number }>();
  
  for (let i = 0; i < fingerprints.length; i++) {
    const path: string[] = [];
    let index = i;
    
    for (let level = 0; level < TREE_DEPTH; level++) {
      const siblingIndex = index ^ 1; // XOR with 1 to get sibling
      const sibling = tree[level][siblingIndex];
      path.push(sibling.toString());
      index = Math.floor(index / 2);
    }
    
    paths.set(fingerprints[i], { path, index: i });
  }
  
  return { root: root.toString(), paths };
}

// CLI
async function main() {
  const allowlistPath = process.argv[2] || 'allowlist.json';
  const outDir = process.argv[3] || 'out';
  
  console.log('Pedersen Merkle Tree Builder\n');
  
  // Read allowlist
  const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf-8'));
  const fingerprints = allowlist.cert_fingerprints || [];
  
  console.log(`Fingerprints: ${fingerprints.length}`);
  
  // Build tree
  const { root, paths } = buildPedersenMerkleTree(fingerprints);
  
  console.log(`Root: ${root}\n`);
  
  // Save root
  fs.writeFileSync(`${outDir}/tl_root_pedersen.hex`, root);
  console.log(`✅ Saved root to ${outDir}/tl_root_pedersen.hex`);
  
  // Save paths
  fs.mkdirSync(`${outDir}/pedersen_paths`, { recursive: true });
  
  for (const [fpr, data] of paths.entries()) {
    const pathFile = `${outDir}/pedersen_paths/${fpr}.json`;
    fs.writeFileSync(pathFile, JSON.stringify(data, null, 2));
  }
  
  console.log(`✅ Saved ${paths.size} Merkle paths to ${outDir}/pedersen_paths/`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
