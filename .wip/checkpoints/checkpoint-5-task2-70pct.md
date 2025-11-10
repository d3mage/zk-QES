# Checkpoint 5: Task 2 - 70% Complete

**Date:** 2025-10-23T23:35:00Z
**Status:** Ready for final push - encryption hardening, tests, docs

## Summary

Completed core infrastructure for artifact binding and trust lists. Circuit updated, Merkle toolchain working, prove/verify scripts enhanced with manifest generation.

## What Works ✅

### 1. Circuit Enhancement
- **File:** `circuits/pades_ecdsa/src/main.nr`
- **Status:** Compiles successfully
- **Features:**
  - ECDSA P-256 signature verification
  - SHA-256 Merkle tree membership proof
  - Public bindings: doc_hash, artifact_hash, signer_fpr, tl_root
  - Private inputs: signature, merkle_path (depth 8), index

### 2. Merkle Toolchain
- **Files:** `tools/merkle/build.ts`, `tools/merkle/prove.ts`
- **Commands:** `yarn merkle:build`, `yarn merkle:prove`
- **Tested:** ✅ 4-signer allowlist
- **Output:**
  - `out/tl_root.hex`: 4691e104c3e28e563a23b1dc79593159d3607c30489ba44917f9ec1c2a8528bc
  - `out/paths/*.json`: Inclusion proofs for each signer

### 3. Enhanced Prover
- **File:** `scripts/prove.ts`
- **Auto-loads:**
  - doc_hash.bin
  - cipher_hash.bin (or placeholder)
  - Certificate → signer fingerprint
  - tl_root.hex + Merkle proof
  - VERIFIED signature + pubkey
- **Generates:** `out/manifest.json` with full protocol metadata

### 4. Enhanced Verifier
- **File:** `scripts/verify.ts`
- **5-step verification:**
  1. Load manifest
  2. Verify artifact binding (ciphertext hash)
  3. Verify trust list membership
  4. Load proof + vkey
  5. Verify ZK proof
- **Output:** Clean, informative status

### 5. Protocol Manifest
```json
{
  "version": 1,
  "doc_hash": "<hex>",
  "artifact": {
    "type": "cipher",
    "artifact_hash": "<sha256-hex>"
  },
  "signer": {
    "pub_x": "<hex>",
    "pub_y": "<hex>",
    "fingerprint": "<sha256-cert>"
  },
  "tl_root": "<hex>",
  "proof": "<base64>",
  "timestamp": "<iso8601>"
}
```

## Remaining Work (30%)

### 6. Encryption Hardening
- Update `scripts/encrypt-upload.ts`:
  - Add `aad = doc_hash` to AES-GCM
  - Generate `cipher_hash.bin`
  - Save `encrypted-file.bin`
- Update `scripts/decrypt.ts`:
  - Verify AAD matches doc_hash
  - Handle AAD mismatch errors

### 7. E2E Tests
- Create `scripts/e2e-test.ts`:
  - Positive flow test
  - Tamper detection tests
  - Automated validation

### 8. README Documentation
- Add "Binding & Trust" section
- Document new commands
- Add security notes

## Technical Decisions

1. **SHA-256 for Merkle:** Simpler than Poseidon2, works across Noir + TypeScript
2. **Depth 8 tree:** 256 signer capacity, good for POC
3. **Certificate fingerprint:** SHA-256(cert-DER), standard approach
4. **Artifact hash:** SHA-256(ciphertext), could extend to CID later

## Files Modified Since Task 1

**New:**
- `tools/merkle/build.ts`
- `tools/merkle/prove.ts`
- `allowlist.json`
- `TASK-2-PROGRESS.md`
- `checkpoints/checkpoint-5-task2-70pct.md` (this file)

**Modified:**
- `circuits/pades_ecdsa/src/main.nr`
- `scripts/prove.ts`
- `scripts/verify.ts`
- `package.json` (added merkle:* scripts)

## Next Session Commands

```bash
# Resume from checkpoint
cd /home/alik/Develop/zk-qualified-signature

# Check status
cat checkpoints/checkpoint-5-task2-70pct.md

# Continue with encryption hardening
code scripts/encrypt-upload.ts
code scripts/decrypt.ts

# Then E2E tests
code scripts/e2e-test.ts

# Finally docs
code README.md
```

## Dependencies Installed

All from Task 1:
- `@noir-lang/noir_js@1.0.0-beta.3`
- `@aztec/bb.js@0.82.2`
- `pkijs@3.3.1` (for CAdES parsing)
- `pdf-lib@1.17.1`

## Test Commands

```bash
# Build trust list
yarn merkle:build allowlist.json --out out

# View root
cat out/tl_root.hex

# List proofs
ls out/paths/

# (After encryption hardening) Full flow:
yarn hash-byte-range sample_signed.pdf
yarn extract-cms sample_signed.pdf
yarn encrypt-upload sample.pdf
yarn prove
yarn verify
```

---

**Progress:** 70% → Target: 100%
**ETA:** 4-7 hours
**Blocker from Task 1:** PAdES-T signature validation (can revisit later)
