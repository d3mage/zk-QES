# Example 2: Dual Trust (Local + EU Trust List)

This example demonstrates **dual trust verification** - proving a signer is in both your local allowlist AND the EU Trust List of qualified trust service providers.

## Overview

- **Trust model**: Dual verification (local + EU LOTL)
- **Use case**: Regulatory compliance + internal control
- **Trust sources**:
  - Local: `allowlist.json` (your trusted signers)
  - EU: Official EU List of Trusted Lists (LOTL)
- **ZK proof**: Verifies signer passes BOTH Merkle proofs

## Why Dual Trust?

**Local Trust List Alone:**
- ✅ Full control over who can sign
- ❌ No regulatory compliance guarantee
- ❌ Signers might not be qualified TSPs

**EU Trust List Alone:**
- ✅ Regulatory compliance (eIDAS)
- ✅ Qualified trust service providers
- ❌ No organization-specific control
- ❌ All EU TSPs accepted (might be too broad)

**Dual Trust (Best of Both):**
- ✅ Organization-specific control
- ✅ Regulatory compliance
- ✅ Zero-knowledge verification
- ✅ Stronger trust guarantees

## Prerequisites

- All prerequisites from Example 1
- Signer certificate issued by an EU qualified trust service provider
- Internet connection for one-time EU LOTL fetch

## Step-by-Step Walkthrough

### Part A: Setup (One-time)

#### 1. Fetch EU Trust List

```bash
yarn eutl:fetch --out tools/eutl/cache
```

**Expected Output:**
```
╔════════════════════════════════════════════════════╗
║   EU Trust List Fetcher                            ║
╚════════════════════════════════════════════════════╝

Fetching EU LOTL...
  URL: https://ec.europa.eu/tools/lotl/eu-lotl.xml
  ✓ Downloaded (462 KB)

Parsing EU Trust List XML...
  ⚠  Using simplified parser for POC
  Note: Production requires full ETSI TS 119 612 compliance

Extracting trust service providers...
  TSPs found: 248
  Qualified CAs: 187
  Certificate fingerprints extracted: 187

Generating snapshot...
  LOTL hash: e00b942e38fa340e4631aa7cacf9f528fc917441008f20e71b2670da45833df1
  Snapshot date: 2025-10-25T12:00:00.000Z

Outputs:
  tools/eutl/cache/lotl.xml (462 KB)
  tools/eutl/cache/snapshot.json
  tools/eutl/cache/qualified_cas.json

╔════════════════════════════════════════════════════╗
║   ✓ EU Trust List Fetch Complete                  ║
╚════════════════════════════════════════════════════╝

Summary:
  LOTL hash:         e00b942e38fa340e...
  TSPs found:        248
  Certificates:      187
  Snapshot date:     2025-10-25T12:00:00.000Z

Next step:
  yarn eutl:root --snapshot tools/eutl/cache/snapshot.json --out out
```

#### 2. Build EU Merkle Tree

```bash
yarn eutl:root --snapshot tools/eutl/cache/snapshot.json --out out
```

**Expected Output:**
```
╔════════════════════════════════════════════════════╗
║   EU Trust List Merkle Tree Builder                ║
╚════════════════════════════════════════════════════╝

Loading snapshot...
  Snapshot date: 2025-10-25T12:00:00.000Z
  LOTL hash: e00b942e38fa340e...
  Qualified CAs: 187

Building Merkle tree...
  Hash function: SHA-256
  Depth: 8
  Capacity: 256 leaves

Computing tree levels...
  Level 8: 187 hashes
  Level 7: 94 hashes
  Level 6: 47 hashes
  Level 5: 24 hashes
  Level 4: 12 hashes
  Level 3: 6 hashes
  Level 2: 3 hashes
  Level 1: 2 hashes
  Level 0: 1 hash (ROOT)

Generating inclusion proofs...
  ✓ 187 proofs generated

Tree built successfully:
  Root:  9f7c7c0661d5503651c01824eeb414c0c06660fded77bb3169705800d1ba775d
  Depth: 8
  Leaves: 187

Outputs:
  out/tl_root_eu.hex
  out/tl_root_eu.json
  out/eu_paths/*.json (187 files)

╔════════════════════════════════════════════════════╗
║   ✓ EU Trust List Merkle Tree Complete            ║
╚════════════════════════════════════════════════════╝
```

#### 3. Setup Local Trust List

Follow steps from Example 1 to create `allowlist.json` and build local Merkle tree:

```bash
yarn merkle:build allowlist.json --out out
```

### Part B: Daily Workflow

#### 4. Extract Document Data (Same as Example 1)

```bash
yarn hash-byte-range test_files/sample_signed.pdf
yarn extract-cms test_files/sample_signed.pdf
```

#### 5. Encrypt Document (Same as Example 1)

```bash
yarn encrypt-upload test_files/sample.pdf --to out/VERIFIED_pubkey.json
```

#### 6. Generate ZK Proof with Dual Trust

**Key Difference:** Add `--eu-trust` flag

```bash
yarn prove -- --eu-trust
```

**Expected Output:**
```
╔════════════════════════════════════════════════════╗
║   ZK Qualified Signature - Proof Generation        ║
╚════════════════════════════════════════════════════╝

Loading inputs...

EU Trust verification enabled, loading EU Trust List data...
  Loading EU root: out/tl_root_eu.hex
  EU root:  9f7c7c0661d5503651c01824eeb414c0c06660fded77bb3169705800d1ba775d

  Loading EU inclusion proof for fingerprint: 06a02856c08dde5c6679377c06f6fe7be1855d586bd1448343db2736b1473cd3
  ✓ EU path loaded: out/eu_paths/06a02856c08dde5c6679377c06f6fe7be1855d586bd1448343db2736b1473cd3.json
  EU index: 42

Input summary:
  doc_hash:     28327db146121652074521fef547918d6b96773d62234e77709d07fc0c589434
  artifact_hash: 67f593a9c4a0e194aaeac072d41f97371ae202742f0db833f37d59a5d5b9c926
  pub_key_x:    83db162f9d339482c2d4f638ce909581bd972626583718d3c7e5231cce78c1a5
  pub_key_y:    251449d534548cc8c93d4294c28baea40d7889f1384d477fdb0c011c18766319
  signer_fpr:   06a02856c08dde5c6679377c06f6fe7be1855d586bd1448343db2736b1473cd3
  tl_root:      2c22e22941cefc488db7e86be3c2b467f4efe8fa15fc057bc4a7cfddc917bbf2
  eu_trust:     ENABLED
  tl_root_eu:   9f7c7c0661d5503651c01824eeb414c0c06660fded77bb3169705800d1ba775d
  eu_index:     42
  index:        0

Compiling circuit...
✓ Circuit compiled

Initializing Noir...
✓ Noir initialized

Initializing Barretenberg backend...
✓ Backend initialized

Generating witness...
  ⚙ Verifying ECDSA signature...
  ⚙ Verifying local Merkle inclusion...
  ⚙ Verifying EU Merkle inclusion...
✓ Witness generated (took 2.7s)

Generating proof...
✓ Proof generated (took 5m 31s)

Saving outputs...
  out/proof.bin (2.1 KB)
  out/vkey.bin (1.8 KB)
  out/manifest.json

✅ Proof generation complete!
   Mode: DUAL TRUST (Local + EU)
```

#### 7. Verify Proof (Auto-detects Dual Trust)

```bash
yarn verify
```

**Expected Output:**
```
╔════════════════════════════════════════════════════╗
║   ZK Qualified Signature Verification              ║
╚════════════════════════════════════════════════════╝

[1/6] Loading manifest...
  Version: 1
  Document hash: 2832...9434
  Artifact hash: 67f5...c926
  Signer fingerprint: 06a0...3cd3
  Trust list root: 2c22...bbf2
  EU Trust: ENABLED ←
  EU root: 9f7c...775d
  EU index: 42
  Timestamp: 2025-10-25T13:15:23.456Z

[2/6] Verifying artifact binding...
  Loading ciphertext: out/encrypted-file.bin
  Computing SHA-256...
  ✓ Artifact hash matches ciphertext

[3/6] Verifying local trust list membership...
  Loading trust list root: out/tl_root.hex
  Comparing roots...
  ✓ Trust list root matches

[4/6] Verifying EU Trust List membership... ←
  Loading EU trust list root: out/tl_root_eu.hex
  Comparing EU roots...
  ✓ EU Trust List root matches
  ✓ Dual trust verification enabled

[5/6] Loading proof...
  Proof size: 2,134 bytes
  ✓ Proof loaded

[6/6] Verifying zero-knowledge proof...
  Initializing Barretenberg verifier...
  ✓ ZK proof verified! (took 89s)

╔════════════════════════════════════════════════════╗
║              ✅ ALL VERIFICATIONS PASSED! ✅        ║
╚════════════════════════════════════════════════════╝

Summary:
  ✓ Signature is valid (proven in ZK)
  ✓ Signer is in LOCAL trust list ←
  ✓ Signer is in EU Trust List (dual trust) ←
  ✓ Document hash matches signed bytes
  ✓ Artifact binding verified (no substitution)
  ✓ Proof cryptographically sound

Trust Level: DUAL (Local + EU Qualified TSP)
```

## Manifest Comparison

**Local Trust Only** (from Example 1):
```json
{
  "tl_root": "2c22e22941cefc488db7e86be3c2b467f4efe8fa15fc057bc4a7cfddc917bbf2",
  "eu_trust": {
    "enabled": false
  }
}
```

**Dual Trust** (this example):
```json
{
  "tl_root": "2c22e22941cefc488db7e86be3c2b467f4efe8fa15fc057bc4a7cfddc917bbf2",
  "eu_trust": {
    "enabled": true,
    "tl_root_eu": "9f7c7c0661d5503651c01824eeb414c0c06660fded77bb3169705800d1ba775d",
    "eu_index": "42"
  }
}
```

## Security Properties

Dual trust provides **all properties from Example 1**, plus:

✅ **EU Compliance**: Signer is a qualified trust service provider per eIDAS
✅ **Regulatory Audit**: Proof verifiable against official EU trust list
✅ **Stronger Binding**: Two independent Merkle proofs (both must pass)
✅ **Flexible Policy**: Can switch between local-only and dual trust per document

## ZK Circuit Behavior

When `--eu-trust` is enabled, the circuit performs:

```rust
// 1. Verify ECDSA signature
assert(ecdsa_verify(pub_key, signature, doc_hash));

// 2. Verify local trust list
let local_root = compute_merkle_root(signer_fpr, index, merkle_path);
assert(local_root == tl_root);

// 3. IF eu_trust_enabled, verify EU trust list
if eu_trust_enabled {
    let eu_root = compute_merkle_root(signer_fpr, eu_index, eu_merkle_path);
    assert(eu_root == tl_root_eu); // ← Additional constraint
}
```

**Performance Impact:**
- Proof generation: +5-10 seconds (minimal)
- Verification: +1-2 seconds (file I/O for EU root check)
- Proof size: Same (2.1 KB)

## Use Cases

**When to use Dual Trust:**
- ✅ Regulatory compliance required (eIDAS, GDPR)
- ✅ External audits by government agencies
- ✅ Cross-border document exchange in EU
- ✅ Healthcare, finance, legal sectors
- ✅ Need proof signer is qualified TSP

**When to use Local Trust Only:**
- ✅ Internal-only documents
- ✅ No regulatory requirements
- ✅ Faster setup (no EU LOTL fetch)
- ✅ Custom trust criteria (not just qualified TSPs)

## Negative Test: Signer Not in EU List

What happens if signer is in local allowlist but NOT in EU Trust List?

```bash
# Add non-qualified signer to allowlist.json
# Rebuild local tree
yarn merkle:build allowlist.json --out out

# Try to prove with --eu-trust
yarn prove -- --eu-trust
```

**Expected Failure:**
```
Error: EU inclusion proof not found
  Fingerprint: a7b3c4d5e6f7890123456789abcdef0123456789abcdef0123456789abcdef01
  Path: out/eu_paths/a7b3c4d5e6f7890123456789abcdef0123456789abcdef01.json

This signer is not in the EU Trust List.
Either:
  1. Use local trust only: yarn prove (without --eu-trust)
  2. Ensure signer certificate is from an EU qualified TSP
```

This prevents generating proofs for non-qualified signers when dual trust is required.

## Maintenance

**EU Trust List Updates:**

The EU LOTL is updated regularly. To refresh:

```bash
# Re-fetch (monthly recommended)
yarn eutl:fetch --out tools/eutl/cache

# Rebuild EU Merkle tree
yarn eutl:root --snapshot tools/eutl/cache/snapshot.json --out out

# Old proofs remain valid (they commit to specific snapshot)
# New proofs use updated EU trust list
```

**Snapshot Dating:**
- Each manifest includes EU snapshot date
- Verifiers can check if snapshot is recent enough
- Auditors can validate against historical EU lists

## Next Steps

- **Example 3**: Deep dive into the 6-step verification process
- **Example 4**: Learn about DocMDP certifying signatures
- See `TASK-3-PROGRESS.md` for technical implementation details
