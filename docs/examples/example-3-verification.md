# Example 3: Verification Process Deep Dive

This example provides a detailed walkthrough of the **6-step verification process** used to validate ZK qualified signature proofs.

## Overview

The verifier performs six sequential checks:
1. **Manifest Loading** - Parse protocol manifest
2. **Artifact Binding** - Verify ciphertext matches commitment
3. **Local Trust** - Verify signer in local trust list
4. **EU Trust** - (Optional) Verify signer in EU Trust List
5. **Proof Loading** - Load ZK proof and verification key
6. **ZK Verification** - Verify zero-knowledge proof validity

## Architecture

```
┌─────────────┐
│  Manifest   │ ←──── Step 1: Parse & validate
│ manifest.json│
└──────┬──────┘
       │
       ├──→ doc_hash
       ├──→ artifact_hash    ←──── Step 2: Compare with actual ciphertext
       ├──→ signer_fpr
       ├──→ tl_root          ←──── Step 3: Compare with local trust list
       └──→ eu_trust         ←──── Step 4: Compare with EU trust list (optional)
            ├─ enabled
            ├─ tl_root_eu
            └─ eu_index

┌─────────────┐
│   Proof     │ ←──── Step 5: Load proof & vkey
│  proof.bin  │
│  vkey.bin   │
└──────┬──────┘
       │
       └──→ ZK Verifier      ←──── Step 6: Cryptographic verification
```

## Step-by-Step Breakdown

### Step 1: Manifest Loading

**Purpose:** Load and validate the protocol manifest structure

**Code Flow:**
```typescript
const manifestPath = 'out/manifest.json';
const manifestText = fs.readFileSync(manifestPath, 'utf-8');
const manifest = JSON.parse(manifestText);

// Validate structure
if (!manifest.version || manifest.version !== 1) {
  throw new Error('Invalid manifest version');
}

// Required fields
const required = ['doc_hash', 'artifact', 'signer', 'tl_root', 'proof', 'timestamp'];
for (const field of required) {
  if (!(field in manifest)) {
    throw new Error(`Missing required field: ${field}`);
  }
}
```

**What to Check:**
- ✅ Manifest exists and is valid JSON
- ✅ Version is 1 (protocol version)
- ✅ All required fields present
- ✅ Hash formats are valid hex strings
- ✅ Timestamp is valid ISO8601
- ✅ eu_trust object exists (even if disabled)

**Console Output:**
```
[1/6] Loading manifest...
  Version: 1
  Document hash: 2832...9434 (32 bytes)
  Artifact hash: 67f5...c926 (32 bytes)
  Signer fingerprint: 06a0...3cd3 (32 bytes)
  Trust list root: 2c22...bbf2 (32 bytes)
  EU Trust: ENABLED / disabled
  Timestamp: 2025-10-25T13:15:23.456Z
  ✓ Manifest structure valid
```

**Failure Scenarios:**
```
❌ Error: Manifest not found (out/manifest.json)
   → Run: yarn prove

❌ Error: Invalid JSON in manifest
   → File corrupted, regenerate proof

❌ Error: Missing field 'tl_root'
   → Manifest incomplete, regenerate proof

❌ Error: Invalid hex string in doc_hash
   → Manifest corrupted, regenerate proof
```

---

### Step 2: Artifact Binding Verification

**Purpose:** Ensure proof is bound to the specific ciphertext (prevent substitution attacks)

**Attack Prevented:**
```
Attacker tries:
  1. Use valid proof from document A
  2. Substitute ciphertext from document B
  3. Hope verifier accepts

Prevention:
  Proof contains artifact_hash commitment
  Verifier recomputes hash of provided ciphertext
  If hashes don't match → REJECT
```

**Code Flow:**
```typescript
// Load ciphertext
const cipherPath = 'out/encrypted-file.bin';
const cipher = fs.readFileSync(cipherPath);

// Compute SHA-256 hash
const computedHash = crypto.createHash('sha256').update(cipher).digest('hex');

// Compare with manifest commitment
if (computedHash !== manifest.artifact.artifact_hash) {
  throw new Error('Artifact binding verification failed: hash mismatch');
}
```

**What to Check:**
- ✅ Ciphertext file exists (`out/encrypted-file.bin`)
- ✅ SHA-256 hash computed correctly
- ✅ Hash matches manifest's `artifact.artifact_hash`
- ✅ File hasn't been modified or swapped

**Console Output:**
```
[2/6] Verifying artifact binding...
  Loading ciphertext: out/encrypted-file.bin
  Size: 45,263 bytes
  Computing SHA-256...
  Expected: 67f593a9c4a0e194aaeac072d41f97371ae202742f0db833f37d59a5d5b9c926
  Computed: 67f593a9c4a0e194aaeac072d41f97371ae202742f0db833f37d59a5d5b9c926
  ✓ Artifact hash matches ciphertext
```

**Success Test:**
```bash
# Hash should match
$ sha256sum out/encrypted-file.bin
67f593a9c4a0e194aaeac072d41f97371ae202742f0db833f37d59a5d5b9c926  out/encrypted-file.bin
```

**Failure Scenarios:**
```
❌ Error: Artifact binding verification failed
   Computed: a1b2c3...
   Expected: 67f593...
   → Ciphertext has been modified or swapped

❌ Error: Ciphertext file not found (out/encrypted-file.bin)
   → Run: yarn encrypt-upload ...

❌ Error: File read error
   → Check file permissions
```

**Security Impact:**
- **Without this check:** Attacker could substitute any ciphertext
- **With this check:** Proof is cryptographically bound to exact ciphertext bytes

---

### Step 3: Local Trust List Verification

**Purpose:** Ensure verifier is using the same trust list as the prover

**Attack Prevented:**
```
Attacker tries:
  1. Add malicious signer to their local allowlist.json
  2. Generate proof with extended trust list
  3. Send proof to victim
  4. Victim verifies against their own (legitimate) trust list
  5. Proof fails because trust list roots don't match

Prevention:
  Both prover and verifier must have matching tl_root
  Trust list root is a public input to the ZK circuit
  Verifier checks manifest's tl_root matches their local version
```

**Code Flow:**
```typescript
// Load verifier's local trust list root
const localRootPath = 'out/tl_root.hex';
const localRoot = fs.readFileSync(localRootPath, 'utf-8').trim();

// Compare with manifest's commitment
if (localRoot !== manifest.tl_root) {
  throw new Error('Trust list mismatch: roots do not match');
}
```

**What to Check:**
- ✅ Local trust list root file exists (`out/tl_root.hex`)
- ✅ Root value matches manifest's `tl_root`
- ✅ Trust lists are synchronized between prover and verifier

**Console Output:**
```
[3/6] Verifying local trust list membership...
  Loading trust list root: out/tl_root.hex
  Verifier's root: 2c22e22941cefc488db7e86be3c2b467f4efe8fa15fc057bc4a7cfddc917bbf2
  Manifest's root:  2c22e22941cefc488db7e86be3c2b467f4efe8fa15fc057bc4a7cfddc917bbf2
  ✓ Trust list root matches
```

**Failure Scenarios:**
```
❌ Error: Trust list mismatch
   Verifier root: 2c22e22941cefc...
   Manifest root: a7b3c4d5e6f789...
   → Prover and verifier have different allowlists
   → Solution: Share allowlist.json and rebuild: yarn merkle:build

❌ Error: Trust list root not found (out/tl_root.hex)
   → Run: yarn merkle:build allowlist.json --out out

❌ Error: Signer not in verifier's trust list
   → Verifier needs to add signer to allowlist.json and rebuild
```

**Security Impact:**
- **Without this check:** Prover could use different (malicious) trust list
- **With this check:** Verifier enforces their own trust policy

**Trust List Synchronization:**

```bash
# Prover and verifier must use same allowlist.json

# Prover side:
yarn merkle:build allowlist.json --out out
# Root: 2c22e22941cefc488db7e86be3c2b467f4efe8fa15fc057bc4a7cfddc917bbf2

# Verifier side:
# 1. Receive allowlist.json from prover (or agreed-upon source)
# 2. Build identical tree:
yarn merkle:build allowlist.json --out out
# Root: 2c22e22941cefc488db7e86be3c2b467f4efe8fa15fc057bc4a7cfddc917bbf2 ← Must match!
```

---

### Step 4: EU Trust List Verification (Optional)

**Purpose:** When dual trust is enabled, verify signer is in EU Trust List

**Conditional Logic:**
```typescript
if (manifest.eu_trust && manifest.eu_trust.enabled) {
  // EU trust verification required
  const euRootPath = 'out/tl_root_eu.hex';
  const euRoot = fs.readFileSync(euRootPath, 'utf-8').trim();

  if (euRoot !== manifest.eu_trust.tl_root_eu) {
    throw new Error('EU Trust List mismatch');
  }

  console.log('  ✓ EU Trust List root matches');
  console.log('  ✓ Dual trust verification enabled');
} else {
  console.log('  ⊘ EU Trust verification disabled');
}
```

**What to Check:**
- ✅ If `eu_trust.enabled === true`, EU root file must exist
- ✅ EU root matches manifest's `tl_root_eu`
- ✅ EU snapshot is recent enough (policy-dependent)

**Console Output (Enabled):**
```
[4/6] Verifying EU Trust List membership...
  EU Trust: ENABLED
  Loading EU trust list root: out/tl_root_eu.hex
  Verifier's EU root: 9f7c7c0661d5503651c01824eeb414c0c06660fded77bb3169705800d1ba775d
  Manifest's EU root:  9f7c7c0661d5503651c01824eeb414c0c06660fded77bb3169705800d1ba775d
  ✓ EU Trust List root matches
  ✓ Dual trust verification enabled
```

**Console Output (Disabled):**
```
[4/6] Verifying EU Trust List membership...
  ⊘ EU Trust verification disabled
```

**Failure Scenarios:**
```
❌ Error: EU Trust List mismatch
   Verifier EU root: 9f7c7c0661d550...
   Manifest EU root:  a1b2c3d4e5f678...
   → Prover and verifier have different EU snapshots
   → Solution: Synchronize EU snapshots

❌ Error: EU trust enabled but root file missing
   → Run: yarn eutl:fetch --out tools/eutl/cache
   → Run: yarn eutl:root --snapshot ... --out out

❌ Error: EU snapshot too old
   → Policy violation, re-fetch EU LOTL
   → Run: yarn eutl:fetch --out tools/eutl/cache
```

---

### Step 5: Proof Loading

**Purpose:** Load the ZK proof and verification key from disk

**Code Flow:**
```typescript
const proofPath = 'out/proof.bin';
const vkeyPath = 'out/vkey.bin';

const proofBytes = fs.readFileSync(proofPath);
const vkeyBytes = fs.readFileSync(vkeyPath);

console.log(`  Proof size: ${proofBytes.length} bytes`);
console.log(`  Vkey size: ${vkeyBytes.length} bytes`);
```

**What to Check:**
- ✅ `proof.bin` exists and is readable
- ✅ `vkey.bin` exists and is readable
- ✅ Files are not empty
- ✅ File sizes are reasonable (~2KB for proof, ~1.8KB for vkey)

**Console Output:**
```
[5/6] Loading proof...
  Proof file: out/proof.bin
  Vkey file:  out/vkey.bin
  Proof size: 2,134 bytes
  Vkey size:  1,876 bytes
  ✓ Proof loaded
```

**Failure Scenarios:**
```
❌ Error: Proof file not found (out/proof.bin)
   → Run: yarn prove

❌ Error: Verification key not found (out/vkey.bin)
   → Run: yarn prove (vkey generated automatically)

❌ Error: File size mismatch
   → Files corrupted, regenerate proof
```

---

### Step 6: Zero-Knowledge Proof Verification

**Purpose:** Cryptographically verify the ZK proof is valid

**What the ZK Circuit Proves:**
1. ✅ ECDSA signature is valid over `doc_hash`
2. ✅ Signature was made by public key `(pub_x, pub_y)`
3. ✅ Public key's certificate fingerprint is `signer_fpr`
4. ✅ `signer_fpr` is in Merkle tree with root `tl_root` (local)
5. ✅ If EU trust enabled: `signer_fpr` is also in EU tree with root `tl_root_eu`
6. ✅ Proof is bound to `artifact_hash`

**Code Flow:**
```typescript
// Initialize Barretenberg verifier
console.log('  Initializing Barretenberg verifier...');
const backend = new BarretenbergBackend(vkeyBytes);
const noir = new Noir(circuit);

// Extract public inputs from manifest
const publicInputs = {
  doc_hash: hexToBytes(manifest.doc_hash),
  artifact_hash: hexToBytes(manifest.artifact.artifact_hash),
  pub_key_x: hexToBytes(manifest.signer.pub_x),
  pub_key_y: hexToBytes(manifest.signer.pub_y),
  signer_fpr: hexToBytes(manifest.signer.fingerprint),
  tl_root: hexToBytes(manifest.tl_root),
  eu_trust_enabled: manifest.eu_trust.enabled,
  tl_root_eu: manifest.eu_trust.enabled
    ? hexToBytes(manifest.eu_trust.tl_root_eu)
    : new Uint8Array(32)
};

// Verify proof
const isValid = await backend.verifyProof({
  proof: proofBytes,
  publicInputs: publicInputs
});

if (!isValid) {
  throw new Error('ZK proof verification failed');
}
```

**What to Check:**
- ✅ Barretenberg backend initializes successfully
- ✅ Public inputs extracted correctly from manifest
- ✅ Proof verifies cryptographically
- ✅ No constraint violations

**Console Output:**
```
[6/6] Verifying zero-knowledge proof...
  Initializing Barretenberg verifier...
  ✓ Backend initialized

  Extracting public inputs from manifest...
  ✓ 8 public inputs extracted

  Verifying proof cryptographically...
  ⚙ Constraint check (ECDSA)...
  ⚙ Constraint check (Merkle local)...
  ⚙ Constraint check (Merkle EU)...
  ⚙ Proof system verification...
  ✓ ZK proof verified! (took 87s)
```

**Failure Scenarios:**
```
❌ Error: ZK proof verification failed
   → Proof is invalid or public inputs don't match
   → Possible causes:
     - Proof generated with different private inputs
     - Manifest tampered with
     - Circuit version mismatch
   → Solution: Regenerate proof

❌ Error: Constraint violation in circuit
   → One of the assertions failed:
     - ECDSA signature invalid
     - Merkle proof invalid
     - Public input mismatch
   → This means the claim is false (proof should fail)

❌ Error: Backend initialization failed
   → Circuit compilation issue
   → Run: cd circuits/pades_ecdsa && nargo compile
```

---

## Complete Verification Flow

```
START
  ↓
[1] Load manifest ──→ Parse JSON, validate structure
  ↓
[2] Verify artifact binding ──→ Recompute cipher hash, compare
  ↓
[3] Verify local trust ──→ Compare tl_root with local file
  ↓
[4] Verify EU trust (if enabled) ──→ Compare tl_root_eu with local file
  ↓
[5] Load proof ──→ Read proof.bin and vkey.bin
  ↓
[6] Verify ZK proof ──→ Barretenberg cryptographic verification
  ↓
ALL PASSED? ──→ ✅ Accept
ANY FAILED? ──→ ❌ Reject
```

## Security Analysis

### What Each Step Protects Against

| Step | Attack Prevented | Security Property |
|------|------------------|-------------------|
| 1. Manifest | Malformed data, version mismatch | Protocol integrity |
| 2. Artifact binding | Ciphertext substitution | Non-repudiation of artifact |
| 3. Local trust | Unauthorized signer (local policy) | Trust policy enforcement |
| 4. EU trust | Non-qualified TSP (if required) | Regulatory compliance |
| 5. Proof loading | Missing/corrupted proof | Availability |
| 6. ZK verification | Invalid signature, unauthorized signer | Cryptographic soundness |

### Defense in Depth

Even if one check is bypassed (hypothetically), others still protect:

**Example Attack: Bypass Artifact Binding**
- Attacker modifies Step 2 to always pass
- Step 6 (ZK proof) still fails because:
  - Proof commits to `artifact_hash`
  - Circuit verification will reject if actual `artifact_hash` doesn't match proof

**Example Attack: Tamper with Manifest**
- Attacker changes `tl_root` in manifest
- Step 3 catches this (mismatch with verifier's local root)
- Step 6 also catches this (ZK proof commits to original `tl_root`)

## Success Criteria Summary

All 6 steps must pass:

```
✓ [1/6] Manifest structure valid
✓ [2/6] Artifact hash matches ciphertext
✓ [3/6] Local trust list root matches
✓ [4/6] EU trust list root matches (if enabled)
✓ [5/6] Proof and vkey loaded successfully
✓ [6/6] ZK proof cryptographically valid

Result: ✅ ALL VERIFICATIONS PASSED
```

If ANY step fails → **REJECT** the proof

## Next Steps

- **Example 4**: Learn about DocMDP certifying signatures
- See `scripts/verify.ts` for full implementation code
- See `circuits/pades_ecdsa/src/main.nr` for circuit constraints
