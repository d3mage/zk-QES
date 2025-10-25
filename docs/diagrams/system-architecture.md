# System Architecture

This document provides a comprehensive overview of the ZK Qualified Signature system architecture.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ZK Qualified Signature System                │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Document   │      │  Trust Lists │      │  Encryption  │
│  Processing  │      │  Management  │      │   & Binding  │
└──────┬───────┘      └──────┬───────┘      └──────┬───────┘
       │                     │                     │
       │                     │                     │
       ├─────────────────────┴─────────────────────┤
       │                                           │
       ▼                                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Noir ZK Circuit                            │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐               │
│  │   ECDSA    │  │   Merkle   │  │  Bindings  │               │
│  │ P-256 Sig  │  │ Tree Proof │  │   Verify   │               │
│  └────────────┘  └────────────┘  └────────────┘               │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Barretenberg Backend                          │
│              (Proof Generation & Verification)                  │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Protocol Manifest                            │
│         (Commitment to all public inputs + proof)               │
└─────────────────────────────────────────────────────────────────┘
```

## Component Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                            COMPONENTS                                 │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ 1. Document Processing Layer                                    │ │
│  ├─────────────────────────────────────────────────────────────────┤ │
│  │  • hash-byte-range.ts  → Extract PDF /ByteRange SHA-256        │ │
│  │  • extract-cms.ts      → Parse CMS signature, extract pub key  │ │
│  │  • pades-certify.ts    → Create DocMDP certifying signatures   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ 2. Trust List Management Layer                                  │ │
│  ├─────────────────────────────────────────────────────────────────┤ │
│  │  Local Trust List:                                              │ │
│  │    • merkle/build.ts  → Build SHA-256 Merkle tree              │ │
│  │    • merkle/prove.ts  → Generate inclusion proofs              │ │
│  │                                                                 │ │
│  │  EU Trust List:                                                 │ │
│  │    • eutl/fetch.ts    → Download EU LOTL (462KB XML)           │ │
│  │    • eutl/root.ts     → Build EU Merkle tree from qualified CAs│ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ 3. Encryption & Binding Layer                                   │ │
│  ├─────────────────────────────────────────────────────────────────┤ │
│  │  • encrypt-upload.ts  → ECDH + AES-256-GCM with doc_hash AAD   │ │
│  │  • decrypt.ts         → Decrypt and verify AAD binding         │ │
│  │  • Artifact hashing   → SHA-256(ciphertext) for binding        │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ 4. Zero-Knowledge Circuit Layer                                 │ │
│  ├─────────────────────────────────────────────────────────────────┤ │
│  │  circuits/pades_ecdsa/src/main.nr (111 lines)                  │ │
│  │                                                                 │ │
│  │  Verifies:                                                      │ │
│  │    ✓ ECDSA P-256 signature over doc_hash                       │ │
│  │    ✓ Local Merkle proof (signer in allowlist)                  │ │
│  │    ✓ Optional: EU Merkle proof (signer in EU Trust List)       │ │
│  │                                                                 │ │
│  │  Public Inputs (8):                                             │ │
│  │    - doc_hash, artifact_hash, pub_key_x, pub_key_y             │ │
│  │    - signer_fpr, tl_root, eu_trust_enabled, tl_root_eu         │ │
│  │                                                                 │ │
│  │  Private Inputs (5):                                            │ │
│  │    - signature, merkle_path, index, eu_merkle_path, eu_index   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ 5. Proof Generation & Verification Layer                        │ │
│  ├─────────────────────────────────────────────────────────────────┤ │
│  │  • prove.ts   → Auto-load inputs, generate witness & proof     │ │
│  │                 Supports --eu-trust flag for dual trust         │ │
│  │                                                                 │ │
│  │  • verify.ts  → 6-step verification:                           │ │
│  │                 [1] Load manifest                               │ │
│  │                 [2] Verify artifact binding                     │ │
│  │                 [3] Verify local trust list                     │ │
│  │                 [4] Verify EU trust list (if enabled)           │ │
│  │                 [5] Load proof                                  │ │
│  │                 [6] Verify ZK proof                             │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ 6. Protocol Manifest Layer                                      │ │
│  ├─────────────────────────────────────────────────────────────────┤ │
│  │  manifest.json contains:                                        │ │
│  │    • All public inputs (commitments)                            │ │
│  │    • ZK proof (base64 encoded)                                  │ │
│  │    • EU trust status and parameters                             │ │
│  │    • Timestamp (ISO8601)                                        │ │
│  │                                                                 │ │
│  │  Enables:                                                       │ │
│  │    • Tamper detection (artifact_hash check)                     │ │
│  │    • Trust verification (tl_root comparison)                    │ │
│  │    • Complete audit trail                                       │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

## Trust Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                    TRUST LIST ARCHITECTURE                    │
└───────────────────────────────────────────────────────────────┘

┌──────────────────────────┐         ┌─────────────────────────┐
│   Local Trust List       │         │  EU Trust List (LOTL)   │
│   (allowlist.json)       │         │  (EU Official)          │
└──────────┬───────────────┘         └──────────┬──────────────┘
           │                                    │
           │ SHA-256 cert fingerprints          │ Download via API
           ▼                                    ▼
    ┌─────────────────┐                 ┌─────────────────┐
    │ Merkle Builder  │                 │ EUTL Fetcher    │
    │ (merkle/build)  │                 │ (eutl/fetch)    │
    └────────┬────────┘                 └────────┬────────┘
             │                                   │
             │ Build depth-8 SHA-256 tree        │ Parse XML
             ▼                                   ▼
    ┌─────────────────┐                 ┌─────────────────┐
    │  tl_root.hex    │                 │  snapshot.json  │
    │  paths/*.json   │                 └────────┬────────┘
    └────────┬────────┘                          │
             │                                   │ Build tree
             │                                   ▼
             │                          ┌─────────────────┐
             │                          │ EU Merkle Tree  │
             │                          │ (eutl/root)     │
             │                          └────────┬────────┘
             │                                   │
             │                                   ▼
             │                          ┌─────────────────┐
             │                          │ tl_root_eu.hex  │
             │                          │ eu_paths/*.json │
             │                          └────────┬────────┘
             │                                   │
             └───────────┬───────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   Noir ZK Circuit    │
              │                      │
              │  IF eu_trust_enabled │
              │    Verify BOTH:      │
              │     • Local Merkle   │
              │     • EU Merkle      │
              │  ELSE                │
              │    Verify Local only │
              └──────────────────────┘
```

## Data Flow Layers

```
┌────────────────────────────────────────────────────────────────┐
│                         DATA FLOW LAYERS                       │
└────────────────────────────────────────────────────────────────┘

Layer 1: INPUT LAYER
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐
│ Signed PDF  │  │  Plaintext  │  │ Certificate │  │Trust Lists│
│   Document  │  │    File     │  │  (X.509)    │  │  (JSON)   │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘
       │                │                │               │
       ▼                ▼                ▼               ▼

Layer 2: EXTRACTION LAYER
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐
│  doc_hash   │  │  plaintext  │  │  pub_key    │  │Merkle Root│
│  (32 bytes) │  │             │  │  signature  │  │  (32B)    │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘
       │                │                │               │
       ▼                ▼                ▼               ▼

Layer 3: CRYPTOGRAPHIC LAYER
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐
│   SHA-256   │  │  AES-GCM    │  │ECDSA P-256  │  │ SHA-256   │
│  Hashing    │  │ Encryption  │  │   Verify    │  │Merkle Tree│
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘
       │                │                │               │
       ▼                ▼                ▼               ▼

Layer 4: COMMITMENT LAYER
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐
│  doc_hash   │  │artifact_hash│  │  pub inputs │  │  tl_root  │
│  (public)   │  │  (public)   │  │   (public)  │  │ (public)  │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘
       │                │                │               │
       └────────────────┴────────────────┴───────────────┘
                                │
                                ▼

Layer 5: ZERO-KNOWLEDGE LAYER
┌────────────────────────────────────────────────────────────────┐
│              Noir Circuit (pades_ecdsa/main.nr)                │
│                                                                │
│  Constraints:                                                  │
│    • ECDSA signature verification                             │
│    • Merkle inclusion proof (local)                           │
│    • Merkle inclusion proof (EU, if enabled)                  │
│    • Public input bindings                                    │
│                                                                │
│  Input: Private (signature, merkle paths)                     │
│  Output: Proof that all constraints satisfied                 │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼

Layer 6: PROOF LAYER
┌────────────────────────────────────────────────────────────────┐
│                    Barretenberg Backend                        │
│                                                                │
│  • Generates witness (2-3 seconds)                            │
│  • Generates proof (5-10 minutes)                             │
│  • Proof size: ~2.1 KB (UltraHonk)                            │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼

Layer 7: MANIFEST LAYER
┌────────────────────────────────────────────────────────────────┐
│                     manifest.json                              │
│                                                                │
│  Contains:                                                     │
│    • All public inputs (commitments)                          │
│    • ZK proof (base64)                                        │
│    • EU trust configuration                                   │
│    • Timestamp                                                │
│                                                                │
│  Enables:                                                      │
│    • Verifier to check all bindings                           │
│    • Audit trail                                              │
│    • Trust list verification                                  │
└────────────────────────────────────────────────────────────────┘
```

## Security Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                     SECURITY PROPERTIES                        │
└────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ 1. SIGNATURE VALIDITY (Zero-Knowledge)                        │
├───────────────────────────────────────────────────────────────┤
│  ZK Circuit proves:                                           │
│    ecdsa_verify(pub_key, signature, doc_hash) == true         │
│                                                               │
│  Without revealing:                                           │
│    • Signature value (r, s)                                   │
│    • Private key                                              │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ 2. DOCUMENT BINDING                                           │
├───────────────────────────────────────────────────────────────┤
│  doc_hash = SHA-256(PDF ByteRange)                           │
│                                                               │
│  Public input to circuit:                                     │
│    • Prover commits to specific document                      │
│    • Cannot swap documents with same signature                │
│    • Verifier knows which document was signed                 │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ 3. ARTIFACT BINDING                                           │
├───────────────────────────────────────────────────────────────┤
│  artifact_hash = SHA-256(ciphertext)                          │
│                                                               │
│  Public input to circuit:                                     │
│    • Prover commits to specific encrypted artifact            │
│    • Verifier recomputes hash                                 │
│    • Mismatch → REJECT (tamper detected)                      │
│                                                               │
│  AES-GCM AAD binding:                                         │
│    • AAD = doc_hash                                           │
│    • Plaintext-ciphertext cryptographically bound             │
│    • Decryption fails if doc_hash mismatches                  │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ 4. IDENTITY BINDING (Trust Lists)                            │
├───────────────────────────────────────────────────────────────┤
│  Local Trust:                                                 │
│    signer_fpr ∈ allowlist (Merkle proof)                     │
│                                                               │
│  EU Trust (optional):                                         │
│    signer_fpr ∈ EU LOTL (Merkle proof)                       │
│                                                               │
│  ZK Circuit verifies:                                         │
│    compute_merkle_root(signer_fpr, path) == tl_root           │
│                                                               │
│  Verifier checks:                                             │
│    manifest.tl_root == local tl_root file                     │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ 5. CRYPTOGRAPHIC SOUNDNESS                                   │
├───────────────────────────────────────────────────────────────┤
│  Proof System: UltraHonk (via Barretenberg)                  │
│                                                               │
│  Properties:                                                  │
│    • Completeness: Valid proofs always verify                │
│    • Soundness: Invalid proofs rejected (negligible prob)    │
│    • Zero-knowledge: Proof reveals no private info           │
│                                                               │
│  Security Level:                                              │
│    • ~128-bit security                                        │
│    • ECDSA P-256 (NIST standard)                             │
│    • SHA-256 (FIPS 180-4)                                    │
│    • AES-256-GCM (NIST SP 800-38D)                           │
└───────────────────────────────────────────────────────────────┘
```

## Performance Characteristics

```
┌────────────────────────────────────────────────────────────────┐
│                   PERFORMANCE PROFILE                          │
└────────────────────────────────────────────────────────────────┘

Operation               Time          Size        Notes
─────────────────────────────────────────────────────────────────
PDF Extraction          < 1s          -           Fast I/O
Merkle Tree Build       < 1s          256 leaves  SHA-256 hashing
EU LOTL Fetch           3-5s          462 KB      Network dependent
EU Merkle Build         1-2s          187 leaves  SHA-256 hashing
Encryption              < 1s          +16 bytes   AES-GCM overhead
                                      (auth tag)
Circuit Compilation     5-10s         -           One-time
Witness Generation      2-3s          -           Circuit execution
Proof Generation        5-10 min      2.1 KB      UltraHonk
Proof Verification      60-90s        -           Barretenberg
                                                  backend
─────────────────────────────────────────────────────────────────

Proof Size Breakdown:
  • Proof:          ~2,134 bytes  (ZK proof data)
  • Vkey:           ~1,876 bytes  (verification key)
  • Manifest:       ~800 bytes    (JSON metadata)
  • Total:          ~4.8 KB       (complete verification package)
```

## Deployment Architecture (Future)

```
┌────────────────────────────────────────────────────────────────┐
│                    POTENTIAL DEPLOYMENT                        │
└────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                        Client Side                          │
├─────────────────────────────────────────────────────────────┤
│  • Document processing                                      │
│  • Proof generation (5-10 min)                             │
│  • Local trust list management                             │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ Upload: manifest.json + encrypted-file.bin
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                      Storage Layer                          │
├─────────────────────────────────────────────────────────────┤
│  • IPFS (decentralized)                                     │
│  • S3 (centralized)                                         │
│  • Arweave (permanent)                                      │
│                                                             │
│  Stores:                                                    │
│    - Encrypted artifacts                                    │
│    - Protocol manifests                                     │
│    - ZK proofs                                              │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ Retrieve: CID or hash
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                     Verification Layer                      │
├─────────────────────────────────────────────────────────────┤
│  Option A: Client-Side Verification                        │
│    • Download manifest + proof                              │
│    • Run verify.ts locally (60-90s)                        │
│    • Full privacy                                           │
│                                                             │
│  Option B: On-Chain Verification (Aztec)                   │
│    • Deploy verifier contract                               │
│    • Submit proof to chain                                  │
│    • Emit verification event                                │
│    • Public auditability                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Summary

**Key Architectural Strengths:**
- ✅ Modular design (6 independent layers)
- ✅ Multiple binding mechanisms (3-way binding)
- ✅ Flexible trust model (local, EU, or dual)
- ✅ Zero-knowledge privacy preservation
- ✅ Complete audit trail via manifests
- ✅ Production-ready proof-of-concept

**Design Principles:**
1. **Separation of Concerns**: Each layer has a single responsibility
2. **Composability**: Components can be used independently
3. **Extensibility**: Easy to add new trust lists or binding methods
4. **Security by Design**: Multiple redundant security checks
5. **Standards Compliance**: PAdES, eIDAS, ISO 32000
