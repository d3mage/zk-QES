# Data Flow Diagram

This document illustrates the complete data flow through the ZK Qualified Signature system, from initial setup through proof generation and verification.

## Complete Workflow Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                    COMPLETE WORKFLOW PHASES                          │
└──────────────────────────────────────────────────────────────────────┘

PHASE 1: SETUP (One-time)
PHASE 2: DOCUMENT SIGNING (By signer)
PHASE 3: PROOF GENERATION (By prover/sender)
PHASE 4: VERIFICATION (By verifier/receiver)
```

---

## PHASE 1: Setup (One-Time)

### 1.1 Local Trust List Setup

```
┌─────────────┐
│  allowlist  │  JSON file with trusted certificate fingerprints
│   .json     │
└──────┬──────┘
       │
       │ yarn merkle:build allowlist.json --out out
       ▼
┌─────────────────────────────────────────────────────────────────┐
│  Merkle Tree Builder (tools/merkle/build.ts)                    │
│                                                                 │
│  For each signer in allowlist:                                 │
│    1. Extract certificate fingerprint                          │
│    2. SHA-256 hash of cert DER                                 │
│                                                                 │
│  Build SHA-256 Merkle tree:                                    │
│    Depth: 8 levels                                             │
│    Capacity: 256 signers                                       │
│    Hash function: SHA-256                                      │
└──────┬──────────────────────────────────────────────────────────┘
       │
       ▼
┌───────────────────────────────────────────────────────────────┐
│  OUTPUTS:                                                     │
│    out/tl_root.hex  ──────► Merkle root (32 bytes hex)       │
│    out/tl_root.json ──────► Metadata (depth, leaf count)     │
│    out/paths/*.json ──────► Inclusion proof per signer       │
└───────────────────────────────────────────────────────────────┘
```

### 1.2 EU Trust List Setup (Optional - for Dual Trust)

```
Internet
   │
   │ yarn eutl:fetch --out tools/eutl/cache
   ▼
┌──────────────────────────────────────────────────────────────┐
│  EU LOTL Fetcher (tools/eutl/fetch.ts)                       │
│                                                              │
│  1. Download EU LOTL XML                                    │
│     URL: https://ec.europa.eu/tools/lotl/eu-lotl.xml        │
│     Size: ~462 KB                                           │
│                                                              │
│  2. Parse XML (simplified for POC)                          │
│     Extract: Trust Service Providers (TSPs)                 │
│     Extract: Qualified CA certificates                      │
│                                                              │
│  3. Generate snapshot                                        │
│     Hash LOTL: SHA-256(lotl.xml)                            │
│     Date: ISO8601 timestamp                                 │
└──────┬───────────────────────────────────────────────────────┘
       │
       ▼
┌───────────────────────────────────────────────────────────────┐
│  OUTPUTS:                                                     │
│    tools/eutl/cache/lotl.xml ─────► Raw LOTL XML             │
│    tools/eutl/cache/snapshot.json ► Parsed snapshot          │
│    tools/eutl/cache/qualified_cas.json ► CA fingerprints     │
└──────┬────────────────────────────────────────────────────────┘
       │
       │ yarn eutl:root --snapshot snapshot.json --out out
       ▼
┌──────────────────────────────────────────────────────────────┐
│  EU Merkle Tree Builder (tools/eutl/root.ts)                │
│                                                              │
│  For each qualified CA:                                      │
│    1. SHA-256(certificate DER) = fingerprint                │
│    2. Add to Merkle tree                                    │
│                                                              │
│  Build SHA-256 Merkle tree:                                 │
│    Depth: 8 levels                                          │
│    Leaves: ~187 (current EU LOTL)                           │
└──────┬───────────────────────────────────────────────────────┘
       │
       ▼
┌───────────────────────────────────────────────────────────────┐
│  OUTPUTS:                                                     │
│    out/tl_root_eu.hex ────► EU Merkle root (32 bytes hex)   │
│    out/tl_root_eu.json ───► Metadata + LOTL hash            │
│    out/eu_paths/*.json ───► Inclusion proof per EU CA       │
└───────────────────────────────────────────────────────────────┘
```

---

## PHASE 2: Document Signing

```
┌─────────────┐
│  Unsigned   │  Original PDF document
│     PDF     │
└──────┬──────┘
       │
       │ Optional: yarn pades:certify doc.pdf --policy no-changes --out certified.pdf
       ▼
┌─────────────────────────────────────────────────────────────┐
│  DocMDP Certifying (Optional) (scripts/pades-certify.ts)   │
│                                                             │
│  Creates PDF structure for certifying signature:           │
│    • /Perms dictionary in catalog                          │
│    • DocMDP transformation parameters (P=1/2/3)            │
│    • Signature field with policy                           │
└──────┬──────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────┐
│  Signer's   │  External tool (Adobe, OpenSSL, etc.)
│  Signing    │  Signs PDF with qualified certificate
│   Process   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Signed    │  PDF with embedded PAdES signature
│     PDF     │
└──────┬──────┘
       │
       └────────► Sent to prover (document exchange)
```

---

## PHASE 3: Proof Generation

### 3.1 Document Processing

```
┌──────────────┐
│  Signed PDF  │
└──────┬───────┘
       │
       ├─────────► yarn hash-byte-range signed.pdf
       │
       └─────────► yarn extract-cms signed.pdf

┌──────────────────────────────────────────────────────────────┐
│  hash-byte-range.ts                                          │
│                                                              │
│  1. Parse PDF /ByteRange [offset1 len1 offset2 len2]       │
│  2. Extract bytes: part1 = pdf[offset1:offset1+len1]       │
│                     part2 = pdf[offset2:offset2+len2]       │
│  3. Compute: doc_hash = SHA-256(part1 || part2)            │
└──────┬───────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  OUTPUTS:                                                    │
│    out/doc_hash.bin ───► 32-byte binary hash                │
│    out/doc_hash.hex ───► 64-character hex string            │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  extract-cms.ts                                              │
│                                                              │
│  1. Find PDF /Contents <hex_signature>                      │
│  2. Parse CMS/PKCS#7 SignedData                             │
│  3. Extract ECDSA signature (r, s) in DER format            │
│  4. Parse certificate → SubjectPublicKeyInfo                │
│  5. Extract public key coordinates (x, y)                   │
│  6. Compute: cert_fpr = SHA-256(certificate DER)            │
└──────┬───────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  OUTPUTS:                                                    │
│    out/VERIFIED_pubkey.json ─► {pub_x, pub_y} 32B each     │
│    out/VERIFIED_sig.json ────► {r, s} 32B each             │
│    out/VERIFIED_cert_fpr.hex ► SHA-256(cert) 32B           │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Encryption & Artifact Binding

```
┌────────────┐       ┌─────────────────┐
│ Plaintext  │       │  Recipient's    │
│    File    │       │  Public Key     │
└──────┬─────┘       └────────┬────────┘
       │                      │
       │ yarn encrypt-upload file.pdf --to pubkey.json
       │                      │
       └──────────┬───────────┘
                  ▼
┌──────────────────────────────────────────────────────────────┐
│  encrypt-upload.ts                                           │
│                                                              │
│  1. Load recipient_pub_key (x, y)                           │
│  2. Generate ephemeral key pair: (eph_priv, eph_pub)        │
│  3. ECDH: shared = ecdh(eph_priv, recipient_pub)            │
│  4. HKDF-SHA256: aes_key = kdf(shared, salt, info)          │
│  5. Generate random IV (12 bytes)                           │
│  6. Set AAD = doc_hash (binds plaintext to document)        │
│  7. Encrypt: AES-256-GCM(aes_key, IV, AAD)                  │
│     ciphertext, auth_tag = encrypt(plaintext, AAD)          │
│  8. Compute: artifact_hash = SHA-256(ciphertext || tag)     │
└──────┬───────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  OUTPUTS:                                                    │
│    out/encrypted-file.bin ───► Ciphertext + auth tag        │
│    out/cipher_hash.bin ──────► artifact_hash (32 bytes)     │
│    out/encrypted-metadata.json ► Encryption parameters       │
└──────────────────────────────────────────────────────────────┘
```

### 3.3 Proof Generation

```
All required files:
  ✓ out/doc_hash.bin
  ✓ out/cipher_hash.bin
  ✓ out/VERIFIED_pubkey.json
  ✓ out/VERIFIED_sig.json
  ✓ out/VERIFIED_cert_fpr.hex
  ✓ out/tl_root.hex
  ✓ out/paths/<fingerprint>.json
  ✓ (Optional) out/tl_root_eu.hex
  ✓ (Optional) out/eu_paths/<fingerprint>.json
       │
       │ yarn prove [-- --eu-trust]
       ▼
┌──────────────────────────────────────────────────────────────┐
│  prove.ts                                                    │
│                                                              │
│  1. Auto-load all inputs:                                   │
│     • doc_hash ← out/doc_hash.bin                           │
│     • artifact_hash ← out/cipher_hash.bin                   │
│     • pub_key_x, pub_key_y ← out/VERIFIED_pubkey.json       │
│     • signature (r, s) ← out/VERIFIED_sig.json              │
│     • signer_fpr ← out/VERIFIED_cert_fpr.hex                │
│     • tl_root ← out/tl_root.hex                             │
│     • merkle_path, index ← out/paths/<fingerprint>.json     │
│                                                              │
│  2. IF --eu-trust flag:                                     │
│     • eu_trust_enabled = true                               │
│     • tl_root_eu ← out/tl_root_eu.hex                       │
│     • eu_merkle_path, eu_index ← out/eu_paths/<fpr>.json    │
│    ELSE:                                                     │
│     • eu_trust_enabled = false                              │
│     • tl_root_eu = zeros(32)                                │
│     • eu_merkle_path = zeros(8 x 32)                        │
│     • eu_index = 0                                          │
│                                                              │
│  3. Compile circuit (if needed)                             │
│  4. Initialize Noir + Barretenberg                          │
│  5. Generate witness                                        │
│  6. Generate proof                                          │
└──────┬───────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  Noir Circuit (circuits/pades_ecdsa/src/main.nr)            │
│                                                              │
│  fn main(                                                    │
│    // Public inputs (8)                                     │
│    doc_hash: [u8; 32],                                      │
│    artifact_hash: [u8; 32],                                 │
│    pub_key_x: [u8; 32],                                     │
│    pub_key_y: [u8; 32],                                     │
│    signer_fpr: [u8; 32],                                    │
│    tl_root: [u8; 32],                                       │
│    eu_trust_enabled: bool,                                  │
│    tl_root_eu: [u8; 32],                                    │
│    // Private inputs (5)                                    │
│    signature: [u8; 64],                                     │
│    merkle_path: [[u8; 32]; 8],                              │
│    index: Field,                                            │
│    eu_merkle_path: [[u8; 32]; 8],                           │
│    eu_index: Field                                          │
│  ) {                                                         │
│    // 1. Verify ECDSA signature                            │
│    assert(ecdsa_verify_p256(pub_key, signature, doc_hash));│
│                                                              │
│    // 2. Verify local Merkle proof                         │
│    let local_root = compute_merkle_root(                    │
│      signer_fpr, index, merkle_path                         │
│    );                                                        │
│    assert(local_root == tl_root);                           │
│                                                              │
│    // 3. IF EU trust enabled, verify EU Merkle proof       │
│    if eu_trust_enabled {                                    │
│      let eu_root = compute_merkle_root(                     │
│        signer_fpr, eu_index, eu_merkle_path                 │
│      );                                                      │
│      assert(eu_root == tl_root_eu);                         │
│    }                                                         │
│  }                                                           │
└──────┬───────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  Barretenberg Backend                                        │
│                                                              │
│  1. Witness generation: Execute circuit constraints         │
│     Time: 2-3 seconds                                       │
│                                                              │
│  2. Proof generation: UltraHonk proof system                │
│     Time: 5-10 minutes                                      │
│     Output: ~2.1 KB proof                                   │
└──────┬───────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  OUTPUTS:                                                    │
│    out/proof.bin ────────► ZK proof (2.1 KB)                │
│    out/vkey.bin ─────────► Verification key (1.8 KB)        │
│    out/manifest.json ────► Protocol manifest:               │
│      {                                                       │
│        version: 1,                                          │
│        doc_hash,                                            │
│        artifact: {artifact_hash},                           │
│        signer: {pub_x, pub_y, fingerprint},                 │
│        tl_root,                                             │
│        eu_trust: {enabled, tl_root_eu?, eu_index?},         │
│        proof: "<base64>",                                   │
│        timestamp: "<iso8601>"                               │
│      }                                                       │
└──────────────────────────────────────────────────────────────┘
```

---

## PHASE 4: Verification

### 4.1 Verification Flow

```
Verifier receives:
  • out/manifest.json
  • out/encrypted-file.bin
  • out/proof.bin
  • out/vkey.bin

Verifier has locally:
  • out/tl_root.hex (local trust list)
  • out/tl_root_eu.hex (EU trust list, if dual trust)
       │
       │ yarn verify
       ▼
┌──────────────────────────────────────────────────────────────┐
│  verify.ts - 6-Step Verification Process                    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  STEP 1: Load Manifest                                       │
│                                                              │
│  1. Read out/manifest.json                                  │
│  2. Parse JSON                                              │
│  3. Validate structure:                                     │
│     ✓ version === 1                                        │
│     ✓ All required fields present                          │
│     ✓ Hash formats valid (64 hex chars)                    │
│     ✓ Timestamp valid ISO8601                              │
│  4. Extract all commitments:                                │
│     • doc_hash (what document was signed)                  │
│     • artifact_hash (which ciphertext)                     │
│     • signer_fpr (who signed)                              │
│     • tl_root (which trust list)                           │
│     • eu_trust config (dual trust enabled?)                │
└──────┬───────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 2: Verify Artifact Binding                            │
│                                                              │
│  1. Load ciphertext: out/encrypted-file.bin                │
│  2. Compute: actual_hash = SHA-256(ciphertext)             │
│  3. Compare: actual_hash ?= manifest.artifact_hash          │
│  4. IF mismatch → REJECT (ciphertext substituted)           │
│  5. ELSE → PASS (artifact bound to proof)                   │
│                                                              │
│  Security: Prevents attacker from swapping encrypted files  │
└──────┬───────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 3: Verify Local Trust List                            │
│                                                              │
│  1. Load verifier's trust root: out/tl_root.hex             │
│  2. Compare: local_root ?= manifest.tl_root                 │
│  3. IF mismatch → REJECT (different trust lists)            │
│  4. ELSE → PASS (trust lists synchronized)                  │
│                                                              │
│  Security: Enforces verifier's trust policy                 │
└──────┬───────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 4: Verify EU Trust List (If Enabled)                  │
│                                                              │
│  IF manifest.eu_trust.enabled === false:                    │
│    • Log: "EU Trust verification disabled"                  │
│    • Skip to Step 5                                         │
│                                                              │
│  ELSE IF manifest.eu_trust.enabled === true:                │
│    1. Load verifier's EU root: out/tl_root_eu.hex           │
│    2. Compare: local_eu_root ?= manifest.eu_trust.tl_root_eu│
│    3. IF mismatch → REJECT (different EU snapshots)         │
│    4. ELSE → PASS (dual trust verified)                     │
│    5. Log: "✓ Dual trust verification enabled"             │
│                                                              │
│  Security: Ensures signer is qualified TSP (eIDAS compliant)│
└──────┬───────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 5: Load Proof                                         │
│                                                              │
│  1. Read proof: out/proof.bin (~2.1 KB)                     │
│  2. Read vkey: out/vkey.bin (~1.8 KB)                       │
│  3. Validate file sizes reasonable                          │
│  4. Prepare for ZK verification                             │
└──────┬───────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 6: Verify Zero-Knowledge Proof                        │
│                                                              │
│  1. Initialize Barretenberg verifier backend                │
│  2. Extract public inputs from manifest:                    │
│     • doc_hash                                              │
│     • artifact_hash                                         │
│     • pub_key_x, pub_key_y                                  │
│     • signer_fpr                                            │
│     • tl_root                                               │
│     • eu_trust_enabled                                      │
│     • tl_root_eu (if enabled, else zeros)                   │
│                                                              │
│  3. Call: verify_proof(vkey, proof, public_inputs)          │
│     Time: 60-90 seconds                                     │
│                                                              │
│  4. Barretenberg checks:                                    │
│     • ECDSA signature constraint satisfied                  │
│     • Local Merkle proof constraint satisfied               │
│     • EU Merkle proof constraint satisfied (if enabled)     │
│     • Public input bindings match                           │
│     • Proof cryptographically valid                         │
│                                                              │
│  5. IF verification fails → REJECT                          │
│     • Invalid signature, OR                                 │
│     • Signer not in trust list, OR                          │
│     • Public inputs don't match                             │
│                                                              │
│  6. ELSE → ACCEPT                                           │
│     • All constraints satisfied                             │
│     • Proof is valid                                        │
└──────┬───────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  VERIFICATION RESULT                                         │
│                                                              │
│  IF all 6 steps PASS:                                       │
│    ✅ ALL VERIFICATIONS PASSED!                            │
│                                                              │
│    Guarantees:                                              │
│      ✓ Valid ECDSA signature over doc_hash                 │
│      ✓ Signer in local trust list                          │
│      ✓ Signer in EU Trust List (if dual trust)             │
│      ✓ Document hash committed                              │
│      ✓ Artifact binding verified (no substitution)          │
│      ✓ Zero-knowledge preserved                             │
│                                                              │
│  IF ANY step FAILS:                                         │
│    ❌ VERIFICATION FAILED                                   │
│    → Reject the proof                                       │
└──────────────────────────────────────────────────────────────┘
```

---

## File Dependencies Graph

```
┌────────────────────────────────────────────────────────────┐
│                  FILE DEPENDENCY GRAPH                     │
└────────────────────────────────────────────────────────────┘

Input Files                    Generated Files
─────────────                  ───────────────

sample_signed.pdf ────┬───► out/doc_hash.bin
                      │     out/doc_hash.hex
                      │
                      └───► out/VERIFIED_pubkey.json
                            out/VERIFIED_sig.json
                            out/VERIFIED_cert_fpr.hex

allowlist.json ───────────► out/tl_root.hex
                            out/tl_root.json
                            out/paths/*.json

EU LOTL XML ──────────────► tools/eutl/cache/snapshot.json
                            tools/eutl/cache/qualified_cas.json
                            out/tl_root_eu.hex
                            out/tl_root_eu.json
                            out/eu_paths/*.json

sample.pdf ───────────────► out/encrypted-file.bin
                            out/cipher_hash.bin
                            out/encrypted-metadata.json

All above ────────────────► out/proof.bin
(via prove.ts)              out/vkey.bin
                            out/manifest.json
```

---

## Data Size Summary

```
┌────────────────────────────────────────────────────────────┐
│                     DATA SIZES                             │
└────────────────────────────────────────────────────────────┘

File                        Size            Notes
──────────────────────────────────────────────────────────────
doc_hash.bin                32 bytes        SHA-256 output
cipher_hash.bin             32 bytes        SHA-256 output
tl_root.hex                 64 bytes        Hex-encoded (32B)
tl_root_eu.hex              64 bytes        Hex-encoded (32B)
VERIFIED_pubkey.json        ~150 bytes      JSON with 2×32B
VERIFIED_sig.json           ~150 bytes      JSON with 2×32B
merkle path JSON            ~800 bytes      8 × 32B hashes
proof.bin                   ~2,134 bytes    UltraHonk proof
vkey.bin                    ~1,876 bytes    Verification key
manifest.json               ~800 bytes      Complete metadata
encrypted-file.bin          plaintext + 16B AES-GCM auth tag
──────────────────────────────────────────────────────────────
Total verification package: ~5 KB (manifest + proof + vkey)
```

---

## Timing Summary

```
┌────────────────────────────────────────────────────────────┐
│                    OPERATION TIMING                        │
└────────────────────────────────────────────────────────────┘

Phase     Operation                  Time        Notes
──────────────────────────────────────────────────────────────
Setup     Merkle tree build          < 1s        256 signers
Setup     EU LOTL fetch              3-5s        Network
Setup     EU Merkle build            1-2s        187 signers

Prove     PDF extraction             < 1s        I/O bound
Prove     Encryption                 < 1s        AES-GCM fast
Prove     Circuit compilation        5-10s       One-time
Prove     Witness generation         2-3s        Circuit exec
Prove     Proof generation           5-10 min    CPU intensive

Verify    Manifest load              < 0.1s      JSON parse
Verify    Artifact binding check     < 0.5s      SHA-256
Verify    Trust list checks          < 0.5s      File I/O
Verify    ZK proof verification      60-90s      Backend verify
──────────────────────────────────────────────────────────────
Total prove time: ~5-10 minutes (mostly proof generation)
Total verify time: ~90 seconds (mostly ZK verification)
```

---

## Security Data Flow

```
CONFIDENTIALITY FLOW:
  Plaintext → AES-256-GCM → Ciphertext
      ↓           ↓             ↓
   Private    doc_hash AAD   Public (encrypted)

INTEGRITY FLOW:
  Signature → ECDSA Verify → Valid/Invalid
      ↓           ↓              ↓
   Private   Public (doc_hash)  Boolean
   (in ZK)     (commitment)   (ZK proof)

AUTHENTICITY FLOW:
  Cert fingerprint → Merkle Proof → In Trust List?
         ↓               ↓              ↓
      Private       Public (root)    Boolean
      (in ZK)       (commitment)    (ZK proof)
```

---

**Summary:** The data flow demonstrates a complete privacy-preserving qualified signature verification system with multiple redundant security layers and comprehensive audit trails.
