Here’s the next engineer-ready task for your agent.

# Task: Bind ZK Proofs to Artifacts + Dev Trust List + Protocol Manifest

## Goal

Harden the POC by (1) binding each ZK signature proof to the exact **document** and the exchanged **ciphertext/CID**, (2) proving the signer is in a **dev allow-list** (Merkle tree), and (3) introducing a signed **protocol manifest** for each hop.

---

## Deliverables

- **Circuit update** (`packages/circuits/pades_ecdsa/`):
  - Public inputs: `doc_hash`, `artifact_hash` (hash of IPFS CID _or_ ciphertext), `signer_fpr`, `tl_root`.
  - Private inputs: `sig_r`, `sig_s`, `merkle_path`, `index_bits`.
  - Asserts: `ECDSA_P256_verify(pubkey, doc_hash, (r,s))` and `MerkleInclusion(signer_fpr ∈ tl_root)`.

- **Merkle toolchain** (`packages/tools/merkle/`):
  - CLI to build `tl_root` from `allowlist.json` (array of cert fingerprints).
  - CLI to produce inclusion path for a given `signer_fpr`.

- **Prover/Verifier update**:
  - `prove.ts` accepts `--doc-hash`, `--artifact-hash`, `--signer-fpr`, `--tl-root`, and path to `merkle_path.json`.
  - `verify.ts` checks the updated public inputs.

- **Encryption hardening**:
  - AES-GCM **AAD = doc_hash**.
  - Compute `cipher_hash = SHA-256(ciphertext)`; store alongside CID; choose one as `artifact_hash`.

- **Protocol manifest** (`/out/manifest.json` for each hop):

  ```json
  {
    "version": 1,
    "doc_hash": "<hex>",
    "artifact": {
      "type": "ipfs-cid|cipher",
      "cid": "<cid-if-any>",
      "artifact_hash": "<sha256-hex-of-cipher-or-cid-bytes>"
    },
    "signer": {
      "pub_x": "<hex32>",
      "pub_y": "<hex32>",
      "fingerprint": "<sha256(cert-der)-hex>"
    },
    "tl_root": "<hex>",
    "proof": "<base64>",
    "timestamp": "<iso8601>",
    "notes": "optional"
  }
  ```

- **E2E tests**:
  - Positive: A→B and B→A with proof+manifest verification.
  - Negative: tamper CID / ciphertext / doc bytes → proof or manifest check fails.

- **Docs**: README section “Binding & Trust” with exact commands.

---

## Success Criteria (Acceptance)

- ✅ Circuit compiles; proof size remains ≈ same order (±25%).
- ✅ For a valid run, `verify.ts` passes with public inputs matching `manifest.json`.
- ✅ If **CID** or **ciphertext** changes, verification fails (artifact binding works).
- ✅ If signer is removed from `allowlist.json`, proof fails (Merkle check works).
- ✅ AES-GCM decryption fails if `doc_hash` (AAD) mismatches plaintext (encryption binding works).
- ✅ README instructions reproduce on a fresh machine.

---

## Subtasks & Implementation Notes

### 1) Circuit: add binding + allow-list

- Public:
  - `doc_hash: Field` (PDF /ByteRange SHA-256 mapped to BN254)
  - `artifact_hash: Field` (choose either `SHA-256(ciphertext)` or `SHA-256(multibase(cid))`)
  - `signer_fpr: Field` (from `SHA-256(cert-der)` → 32B → Field)
  - `tl_root: Field`

- Private:
  - `sig_r, sig_s`
  - `merkle_path: [Field; D]`, `index_bits: [bool; D]`

- Assertions:

  ```rust
  assert(verify_signature(pubkey, doc_hash, sig), "P-256 verify failed");
  assert(merkle_verify(signer_fpr, tl_root, merkle_path, index_bits), "Signer not in allowlist");
  // artifact_hash is public & recorded; no extra math required here, just exposure/binding.
  ```

- Keep `pub_x, pub_y` as **public** (or derive `signer_fpr` from cert off-circuit; do not parse cert in-circuit).

### 2) Merkle allow-list tooling

- `allowlist.json`:

  ```json
  { "cert_fingerprints": ["<sha256-hex>", "..."] }
  ```

- Build:
  - Poseidon (or your chosen hash) over leaf = `Field(signer_fpr)`.
  - Output `tl_root.hex` and `paths/<fingerprint>.json`.

- Add unit tests: inclusion and exclusion.

### 3) Encryption & artifact hashing

- Encryption:
  - Derive AES-256-GCM key via ECDH+KDF.
  - Set `aad = doc_hash_bytes`.
  - Output `{cipher.bin, iv, aad_hex, epk, alg}`.

- Artifact hash:
  - Option A (simpler): `cipher_hash = SHA-256(cipher.bin)` → use as `artifact_hash`.
  - Option B: `cid_hash = SHA-256(multibase(CID) bytes)`; do both and pick one (documented).

### 4) Prover/Verifier updates

- Prover:
  - Loads `r,s,pub_x,pub_y,doc_hash,artifact_hash,signer_fpr,tl_root,merkle_path`.
  - Converts 32B big-endian → Field decimal strings consistently.
  - Emits `proof.bin` and `manifest.json`.

- Verifier:
  - Reads `manifest.json` + `proof.bin`.
  - Recomputes `artifact_hash` locally from CID or ciphertext.
  - Verifies the proof with those public inputs.

### 5) E2E Scenarios

- **Happy path**: run current A→B→A flow; proofs bind to `doc_hash` and `artifact_hash`; manifests archived.
- **Tamper tests**:
  - Change a single byte in `cipher.bin` → decrypt fails or proof binding check fails.
  - Rehost under a different CID → `cid_hash` mismatch → verification fails.
  - Swap signer → allow-list proof fails.

---

## CLI Additions (examples)

```bash
# Build allowlist
yarn tsx tools/merkle/build.ts allowlist.json --out out/tl_root.hex

# Produce inclusion path for signer
yarn tsx tools/merkle/prove.ts --fingerprint <sha256-cert> --out out/paths/<fpr>.json

# Prove with binding
yarn tsx scripts/prove.ts \
  --doc-hash out/doc_hash.bin \
  --artifact-hash out/cipher_hash.bin \
  --pub out/pubkey.json \
  --sig out/sig.json \
  --signer-fpr <hex> \
  --tl-root $(cat out/tl_root.hex) \
  --merkle-path out/paths/<fpr>.json \
  --manifest out/manifest.json

# Verify
yarn tsx scripts/verify.ts --manifest out/manifest.json --proof out/proof.bin
```

---

## Notes / Gotchas

- **Encoding discipline:** all 32-byte values big-endian; zero-pad to 32B before Field conversion.
- **Hash sources:** for `artifact_hash`, document whether it’s `cipher_hash` or `cid_hash`, and stick to it for the sprint.
- **Security:** don’t log keys; zeroize buffers where possible; never serialize private ECDH scalars.
