# Trust Verification Flow

This document details how trust is established, verified, and enforced in the ZK Qualified Signature system.

## Trust Models Overview

```
┌───────────────────────────────────────────────────────────────┐
│                    TRUST MODELS COMPARISON                    │
└───────────────────────────────────────────────────────────────┘

┌────────────────────────────┬────────────────────────────────┐
│  LOCAL TRUST ONLY          │  DUAL TRUST (Local + EU)       │
├────────────────────────────┼────────────────────────────────┤
│                            │                                │
│  ┌──────────────────┐      │  ┌──────────────────┐          │
│  │   allowlist.json │      │  │   allowlist.json │          │
│  │  (Organization)  │      │  │  (Organization)  │          │
│  └────────┬─────────┘      │  └────────┬─────────┘          │
│           │                │           │                    │
│           │ SHA-256        │           │ SHA-256            │
│           │ Merkle tree    │           │ Merkle tree        │
│           ▼                │           ▼                    │
│  ┌──────────────────┐      │  ┌──────────────────┐          │
│  │    tl_root       │      │  │    tl_root       │          │
│  │  (Local only)    │      │  │  (Local verify)  │          │
│  └──────────────────┘      │  └──────────────────┘          │
│                            │           │                    │
│  ZK Circuit verifies:      │           │  ┌────────────────┐│
│    ✓ signer ∈ local list  │           │  │  EU LOTL XML   ││
│                            │           │  │  (Official)    ││
│  Trust basis:              │           │  └───────┬────────┘│
│    • Manual curation       │           │          │         │
│    • Organization policy   │           │          │ Parse   │
│                            │           │          ▼         │
│  Compliance:               │           │  ┌────────────────┐│
│    • Internal only         │           │  │  tl_root_eu    ││
│                            │           │  │  (EU verify)   ││
│                            │           │  └────────┬───────┘│
│                            │           │           │         │
│                            │           └───────────┘         │
│                            │                                │
│                            │  ZK Circuit verifies:          │
│                            │    ✓ signer ∈ local list       │
│                            │    ✓ signer ∈ EU LOTL          │
│                            │                                │
│                            │  Trust basis:                  │
│                            │    • Local + EU qualified TSPs │
│                            │    • eIDAS regulation          │
│                            │                                │
│                            │  Compliance:                   │
│                            │    • eIDAS compliant           │
│                            │    • Regulatory audit ready    │
└────────────────────────────┴────────────────────────────────┘
```

---

## Local Trust List Verification Flow

```
┌───────────────────────────────────────────────────────────────┐
│              LOCAL TRUST LIST VERIFICATION                    │
└───────────────────────────────────────────────────────────────┘

STEP 1: Trust List Creation (Prover & Verifier Must Match)
───────────────────────────────────────────────────────────────

┌─────────────┐
│ allowlist   │  Example:
│   .json     │  {
│             │    "signers": [
│             │      {
│             │        "name": "Alice",
│             │        "fingerprint": "06a0285...",
│             │        "organization": "Corp X"
│             │      },
│             │      { ... more signers ... }
│             │    ]
│             │  }
└──────┬──────┘
       │
       │ For each signer:
       │   fingerprint = SHA-256(certificate_DER)
       ▼
┌─────────────────────────────────────────────────────────┐
│  Merkle Tree Builder                                    │
│                                                         │
│  Build complete binary tree:                           │
│                                                         │
│  Level 0 (root):     H(H(H01 || H23) || H(H45 || H67)) │
│                       │                                  │
│  Level 1:         H(H01 || H23)    H(H45 || H67)       │
│                    │      │           │      │          │
│  Level 2:        H01    H23         H45    H67         │
│                  │  │    │  │        │  │    │  │       │
│  Level 3 (leaf): H0 H1  H2 H3      H4 H5  H6 H7        │
│                  │  │   │  │        │  │   │  │        │
│                  Signer fingerprints (SHA-256 hashes)   │
│                                                         │
│  Where:                                                 │
│    Hi = SHA-256(fingerprint_i)  (leaf hash)            │
│    Hij = SHA-256(Hi || Hj)      (internal node)        │
└─────────┬───────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│  OUTPUTS                                                │
│                                                         │
│  tl_root.hex: Root hash of Merkle tree                 │
│    Example: 2c22e22941cefc488db7e86be3c2b467...        │
│                                                         │
│  paths/<fingerprint>.json: Inclusion proof              │
│    {                                                    │
│      "fingerprint": "06a0285...",                       │
│      "index": 0,                                        │
│      "path": [                                          │
│        "h1_sibling",   ← Level 3 sibling              │
│        "h23_sibling",  ← Level 2 sibling              │
│        "h4567_sibling", ← Level 1 sibling             │
│        ... up to root                                  │
│      ]                                                  │
│    }                                                    │
└─────────────────────────────────────────────────────────┘


STEP 2: Proof Generation (Prover Side)
───────────────────────────────────────

Prover has:
  • signer_fpr = SHA-256(signer's certificate)
  • merkle_path = sibling hashes from paths/<fpr>.json
  • index = position in tree
  • tl_root = root from tl_root.hex

Circuit receives (private inputs):
  • signer_fpr (known to prover)
  • merkle_path (inclusion proof)
  • index (position)

Circuit computes:
  current = signer_fpr
  for i in 0..depth:
    if index & (1 << i) == 0:
      current = SHA-256(current || merkle_path[i])
    else:
      current = SHA-256(merkle_path[i] || current)

  computed_root = current

Circuit constraint:
  assert(computed_root == tl_root)

If assertion passes:
  ✓ signer_fpr is in the Merkle tree with root tl_root
  ✓ Proof includes commitment to tl_root (public input)
  ✓ Verifier can check tl_root matches their trust list


STEP 3: Verification (Verifier Side)
────────────────────────────────────

Verifier has:
  • tl_root.hex (their local trust list root)
  • manifest.json (from prover, contains manifest.tl_root)

Verification steps:
  1. Load local_root = read("out/tl_root.hex")
  2. Load manifest_root = manifest.tl_root
  3. Compare: local_root ?= manifest_root

  IF mismatch:
    ❌ REJECT: Different trust lists
    → Prover and verifier don't agree on who is trusted

  ELSE:
    ✓ Trust lists match
    ✓ ZK circuit verifies Merkle proof against this root
    ✓ Signer is in the agreed-upon trust list


Security Properties:
  ✅ Prover cannot fake membership in verifier's trust list
  ✅ Prover must have valid inclusion proof
  ✅ Verifier enforces their own trust policy
  ✅ Zero-knowledge: Verifier learns signer is authorized
                    but doesn't learn which specific signer
```

---

## EU Trust List Verification Flow

```
┌───────────────────────────────────────────────────────────────┐
│               EU TRUST LIST VERIFICATION                      │
└───────────────────────────────────────────────────────────────┘

STEP 1: EU Trust List Fetch (One-Time Setup)
─────────────────────────────────────────────

Internet ─► https://ec.europa.eu/tools/lotl/eu-lotl.xml
               │
               │ yarn eutl:fetch
               ▼
┌──────────────────────────────────────────────────────────┐
│  EU LOTL XML (~462 KB)                                   │
│                                                          │
│  Structure:                                              │
│    <TrustServiceStatusList>                             │
│      <TrustServiceProvider>                             │
│        <TSPName>Qualified TSP Name</TSPName>            │
│        <TrustService>                                    │
│          <ServiceType>QC for eSignatures</ServiceType>  │
│          <X509Certificate>...</X509Certificate>         │
│        </TrustService>                                   │
│      </TrustServiceProvider>                            │
│      ... more TSPs ...                                  │
│    </TrustServiceStatusList>                            │
└──────┬───────────────────────────────────────────────────┘
       │
       │ Parse XML, extract qualified CAs
       ▼
┌──────────────────────────────────────────────────────────┐
│  snapshot.json                                           │
│  {                                                       │
│    "lotl_hash": "e00b942e38fa340e...",                  │
│    "snapshot_date": "2025-10-25T12:00:00Z",             │
│    "qualified_cas": [                                    │
│      {                                                   │
│        "name": "EU Qualified TSP 1",                    │
│        "fingerprint": "abc123...",                       │
│        "country": "DE",                                  │
│        "status": "granted"                               │
│      },                                                  │
│      ... ~187 qualified CAs ...                         │
│    ]                                                     │
│  }                                                       │
└──────┬───────────────────────────────────────────────────┘
       │
       │ yarn eutl:root --snapshot snapshot.json
       ▼
┌──────────────────────────────────────────────────────────┐
│  EU Merkle Tree (same structure as local trust list)    │
│                                                          │
│  Leaves: ~187 qualified CA fingerprints                 │
│  Depth: 8 levels (supports up to 256)                   │
│  Hash: SHA-256                                           │
└──────┬───────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│  OUTPUTS                                                 │
│                                                          │
│  tl_root_eu.hex: EU Merkle tree root                    │
│    Example: 9f7c7c0661d5503651c01824eeb414c0...         │
│                                                          │
│  tl_root_eu.json: Metadata                              │
│    {                                                     │
│      "root": "9f7c7c0661d550...",                       │
│      "depth": 8,                                         │
│      "leaf_count": 187,                                  │
│      "snapshot_date": "2025-10-25T12:00:00Z",           │
│      "lotl_hash": "e00b942e38fa340e..."                 │
│    }                                                     │
│                                                          │
│  eu_paths/<fingerprint>.json: Inclusion proofs          │
│    (Same format as local trust list)                    │
└──────────────────────────────────────────────────────────┘


STEP 2: Dual Trust Proof Generation
────────────────────────────────────

Prover runs: yarn prove -- --eu-trust

Circuit receives ADDITIONAL inputs:
  • eu_trust_enabled = true (public)
  • tl_root_eu (public, from tl_root_eu.hex)
  • eu_merkle_path (private, from eu_paths/<fpr>.json)
  • eu_index (private, position in EU tree)

Circuit logic:
  // Standard local trust verification
  local_root = compute_merkle_root(signer_fpr, index, merkle_path)
  assert(local_root == tl_root)

  // ADDITIONAL: EU trust verification
  if eu_trust_enabled {
    eu_root = compute_merkle_root(signer_fpr, eu_index, eu_merkle_path)
    assert(eu_root == tl_root_eu)  // ← Extra constraint!
  }

Result:
  ✓ Signer must be in BOTH trust lists
  ✓ Proof commits to BOTH roots (tl_root AND tl_root_eu)
  ✓ ZK circuit enforces dual membership


STEP 3: Dual Trust Verification
────────────────────────────────

Verifier receives manifest with:
  {
    "tl_root": "2c22e2294...",  // Local root
    "eu_trust": {
      "enabled": true,
      "tl_root_eu": "9f7c7c066...",  // EU root
      "eu_index": "42"
    }
  }

Verification steps:
  1. Check local trust (same as before):
     local_root ?= manifest.tl_root

  2. Check EU trust (if enabled):
     IF manifest.eu_trust.enabled:
       eu_local_root = read("out/tl_root_eu.hex")
       eu_manifest_root = manifest.eu_trust.tl_root_eu

       IF eu_local_root != eu_manifest_root:
         ❌ REJECT: EU trust list mismatch
       ELSE:
         ✓ EU trust list matches

  3. Verify ZK proof:
     • Circuit verifies BOTH Merkle proofs
     • Both constraints must pass

Result:
  ✅ Signer is in local allowlist (organization control)
  ✅ Signer is EU qualified TSP (regulatory compliance)
  ✅ Zero-knowledge: Identity not revealed
```

---

## Trust List Synchronization

```
┌───────────────────────────────────────────────────────────────┐
│            TRUST LIST SYNCHRONIZATION PATTERNS                │
└───────────────────────────────────────────────────────────────┘

Pattern 1: Shared Local Trust List
──────────────────────────────────

Organization maintains centralized allowlist:

┌─────────────────┐
│  Central Server │
│  allowlist.json │
└────────┬────────┘
         │
         ├───────────► Prover downloads
         │             yarn merkle:build allowlist.json
         │             Root: 2c22e229...
         │
         └───────────► Verifier downloads
                       yarn merkle:build allowlist.json
                       Root: 2c22e229... ← Must match!

Pros:
  ✓ Guaranteed synchronization
  ✓ Central policy enforcement
  ✓ Easy updates

Cons:
  ⚠ Single point of control
  ⚠ Requires secure distribution


Pattern 2: Shared EU Trust List
────────────────────────────────

Both prover and verifier fetch from EU:

┌─────────────────────────────────┐
│  EU LOTL (Official)             │
│  https://ec.europa.eu/...       │
└────────┬────────────────────────┘
         │
         ├───────────► Prover fetches
         │             yarn eutl:fetch
         │             yarn eutl:root
         │             Root: 9f7c7c06...
         │
         └───────────► Verifier fetches
                       yarn eutl:fetch
                       yarn eutl:root
                       Root: 9f7c7c06... ← Should match
                                          (if same snapshot)

Pros:
  ✓ Official source (trustworthy)
  ✓ Automatically updated by EU
  ✓ No central org control needed

Cons:
  ⚠ Snapshot timing matters
  ⚠ LOTL changes over time


Pattern 3: Snapshot Pinning (Recommended)
──────────────────────────────────────────

Prover and verifier agree on specific snapshot:

Prover:
  1. Fetch EU LOTL: yarn eutl:fetch
  2. Build tree: yarn eutl:root
  3. Share snapshot metadata:
     {
       "lotl_hash": "e00b942e38fa340e...",
       "snapshot_date": "2025-10-25T12:00:00Z",
       "tl_root_eu": "9f7c7c0661d550..."
     }

Verifier:
  1. Receive snapshot metadata
  2. Fetch same LOTL version (via hash check)
  3. Rebuild tree
  4. Verify root matches: tl_root_eu

Manifest includes:
  "eu_trust": {
    "enabled": true,
    "tl_root_eu": "9f7c7c0661d550...",
    "snapshot_date": "2025-10-25T12:00:00Z",
    "lotl_hash": "e00b942e38fa340e..."
  }

Pros:
  ✓ Deterministic (exact snapshot)
  ✓ Auditable (LOTL hash verifiable)
  ✓ No sync issues

Cons:
  ⚠ Requires snapshot distribution
  ⚠ Must update periodically
```

---

## Trust Enforcement in ZK Circuit

```
┌───────────────────────────────────────────────────────────────┐
│                ZK CIRCUIT TRUST ENFORCEMENT                   │
└───────────────────────────────────────────────────────────────┘

Circuit: circuits/pades_ecdsa/src/main.nr

fn main(
    // Public inputs
    doc_hash: [u8; 32],
    artifact_hash: [u8; 32],
    pub_key_x: [u8; 32],
    pub_key_y: [u8; 32],
    signer_fpr: [u8; 32],
    tl_root: [u8; 32],           ← Local trust root
    eu_trust_enabled: bool,       ← Dual trust flag
    tl_root_eu: [u8; 32],        ← EU trust root

    // Private inputs
    signature: [u8; 64],
    merkle_path: [[u8; 32]; 8],  ← Local inclusion proof
    index: Field,
    eu_merkle_path: [[u8; 32]; 8], ← EU inclusion proof
    eu_index: Field
) {
    // ──────────────────────────────────────────────────────
    // CONSTRAINT 1: Signature Validity
    // ──────────────────────────────────────────────────────
    let pub_key = ECDSAPublicKey { x: pub_key_x, y: pub_key_y };
    let is_valid = ecdsa_verify_p256(pub_key, signature, doc_hash);
    assert(is_valid, "Invalid signature");

    // ──────────────────────────────────────────────────────
    // CONSTRAINT 2: Local Trust List Membership
    // ──────────────────────────────────────────────────────
    let computed_local_root = compute_merkle_root_sha256(
        signer_fpr,      // Leaf value
        index,           // Position in tree
        merkle_path      // Sibling hashes
    );
    assert(
        computed_local_root == tl_root,
        "Signer not in local trust list"
    );

    // ──────────────────────────────────────────────────────
    // CONSTRAINT 3: EU Trust List Membership (Conditional)
    // ──────────────────────────────────────────────────────
    if eu_trust_enabled {
        let computed_eu_root = compute_merkle_root_sha256(
            signer_fpr,         // Same signer
            eu_index,           // Different position
            eu_merkle_path      // Different siblings
        );
        assert(
            computed_eu_root == tl_root_eu,
            "Signer not in EU Trust List"
        );
    }
    // If eu_trust_enabled == false, this block skipped
    // (no additional constraint)
}

// ──────────────────────────────────────────────────────────
// Helper: Merkle Root Computation
// ──────────────────────────────────────────────────────────
fn compute_merkle_root_sha256(
    leaf: [u8; 32],
    index: Field,
    path: [[u8; 32]; 8]
) -> [u8; 32] {
    let mut current = leaf;
    let mut idx = index;

    for i in 0..8 {  // Depth = 8
        let sibling = path[i];

        if idx % 2 == 0 {
            // Current node is left child
            current = sha256_hash_pair(current, sibling);
        } else {
            // Current node is right child
            current = sha256_hash_pair(sibling, current);
        }

        idx = idx / 2;  // Move to parent level
    }

    current  // This is the computed root
}


Security Analysis:
──────────────────

Attack 1: Fake Membership
  Attacker tries: Use signer NOT in trust list
  Defense: Merkle proof verification fails
           assert(computed_root == tl_root) rejects
  Result: ❌ Proof generation fails

Attack 2: Different Trust Lists
  Attacker tries: Use their own allowlist
  Defense: tl_root is public input
           Verifier compares with their own root
  Result: ❌ Verification rejects (root mismatch)

Attack 3: EU Trust Bypass (if dual trust required)
  Attacker tries: Set eu_trust_enabled = false
  Defense: eu_trust_enabled is public input
           Verifier checks manifest.eu_trust.enabled
           Policy enforces dual trust requirement
  Result: ❌ Verification rejects (policy violation)

Attack 4: Wrong EU List
  Attacker tries: Use outdated or fake EU LOTL
  Defense: tl_root_eu is public input
           Verifier compares with their own EU root
  Result: ❌ Verification rejects (EU root mismatch)
```

---

## Trust Policy Matrix

```
┌───────────────────────────────────────────────────────────────┐
│                    TRUST POLICY MATRIX                        │
└───────────────────────────────────────────────────────────────┘

Use Case                Local   EU    Decision Logic
────────────────────────────────────────────────────────────────
Internal documents      ✓       ✗     Local trust sufficient
  - Memos                              Organization controls
  - Reports                            who can sign
  - Internal contracts

Regulatory filings      ✓       ✓     Dual trust required
  - Tax submissions                    Must be qualified TSP
  - Legal filings                      AND in local allowlist
  - Compliance docs

Cross-border EU         ✗       ✓     EU trust only
  - EU-wide contracts                  Signer must be qualified
  - eIDAS documents                    Organization doesn't
  - Public services                    need local control

Public verification     ✗       ✓     EU trust only
  - Anyone can verify                  Public can check against
  - No org membership                  official EU LOTL
  - Transparency                       No private allowlist

──────────────────────────────────────────────────────────────
Trust Configuration:
  • Local only:  eu_trust_enabled = false
  • Dual trust:  eu_trust_enabled = true
  • EU only:     Use empty local allowlist + EU trust
──────────────────────────────────────────────────────────────
```

---

**Summary:** The trust verification system provides flexible, zero-knowledge verification of signer authorization against both custom organizational policies (local trust lists) and regulatory requirements (EU Trust List), with cryptographic enforcement via Merkle proofs in the ZK circuit.
