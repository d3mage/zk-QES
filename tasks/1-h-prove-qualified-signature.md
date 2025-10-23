Here’s a crisp, engineer-ready task brief you can drop into an issue or hand to the agent.

# Task: POC — PDF PAdES signing + Noir proof + encrypted exchange (Aztec starter)

## Goal

Using the **Aztec starter repo**, implement an end-to-end POC that:

1. extracts the signed message hash from a **PAdES**-signed PDF,
2. verifies an **ECDSA P-256** signature in a **Noir** circuit and generates a proof,
3. performs a minimal **encrypted exchange** of a PDF via IPFS (local or gateway),
4. verifies the proof and signature round-trip.

## Inputs provided

- `sample.pdf` — unsigned PDF
- `sample_signed.pdf` — PAdES-signed PDF (approval signature OK)
- `signer_cert.der` — X.509 certificate for the signature (SubjectPublicKeyInfo is P-256 if possible)
- **Aztec starter repo** (JS/TS + Noir setup)

> If the provided cert is RSA, still complete PAdES validation off-circuit; for Noir proof use an **ECDSA P-256** dev key in parallel (document both). Prefer ECDSA for ZK.

---

## Deliverables

- Working branch: `feature/poc-pades-noir`
- CLI demo scripts:
  - `scripts/hash-byte-range.ts` → prints the exact `/ByteRange` SHA-256 of a PDF
  - `scripts/extract-cms.ts` → outputs `(r,s)` and `(pubX,pubY)` from `sample_signed.pdf`
  - `scripts/prove.ts` → generates Noir proof for `(pubkey, msg_hash, sig)`
  - `scripts/verify.ts` → verifies the proof (off-chain)
  - `scripts/encrypt-upload.ts` / `scripts/decrypt.ts` → AES-GCM + ECIES/ECIES-like wrap + IPFS pin/fetch

- Noir project `pades_ecdsa/` with circuit and unit tests
- README with step-by-step runbook
- JSON transcript (`out/run-log.json`) for a full A→B→A round trip (hashes, CIDs, proof IDs)
- (Optional) minimal Aztec.nr contract stub + local verifier hook

---

## Success criteria (acceptance)

- ✅ `sample_signed.pdf` hash recomputed from `/ByteRange` matches the CMS-verified message digest
- ✅ Noir proof verifies for ECDSA P-256 over the recomputed hash
- ✅ Encrypted upload to IPFS and successful decrypt by the intended party
- ✅ Proof verification passes on the recipient side before accepting the file
- ✅ README instructions reproduce everything on a fresh machine

---

## Subtasks

### 1) Project scaffolding

- Clone Aztec starter; create `packages/zk-poc/` for app + scripts.
- Add `packages/circuits/pades_ecdsa/` (Noir).
- Yarn/NPM workspace wiring; `nargo` tooling in `package.json`.

### 2) PDF `/ByteRange` hashing (exact message)

Implement `hash-byte-range.ts`:

- Parse the first signature dictionary; read `/ByteRange [a b c d]`.
- Compute: `SHA256( bytes[a..a+b) || bytes[c..c+d) )`.
- Output hex and raw bytes; write to `out/doc_hash.bin` and `out/doc_hash.hex`.
- Add a guard for `[start-end]` vs `[offset,length]` formats (support both).

### 3) CMS/Cert extraction

Implement `extract-cms.ts`:

- Parse CMS `SignedData` from `sample_signed.pdf`’s signature.
- Extract signature algorithm; parse ECDSA `r,s` (32-byte big-endian).
- Extract SPKI public key `(x,y)` for P-256; export 32-byte big-endian.
- Save as `out/sig.json` and `out/pubkey.json`; also raw binaries.

> If signature is **RSA**: still export modulus/exponent and DER signature for logging; set a flag `isRSA=true`. Proceed with Noir using a generated ECDSA dev pair against `sample.pdf` to complete the ZK flow, and document the mismatch.

### 4) Noir circuit — ECDSA P-256 verify

Create `packages/circuits/pades_ecdsa/`:

- `Nargo.toml` with deps:
  - `ecdsa_secp256r1` (Noir stdlib crate)

- `src/main.nr`:
  - **Public inputs:** `msg_hash: Field`, `pub_x: Field`, `pub_y: Field`
  - **Private inputs:** `r: Field`, `s: Field`
  - Assert `verify_signature(pubkey, msg_hash, sig)`.

Unit tests:

- Known test vector signature passes
- Mutated bit in `msg_hash` fails

Build:

```
nargo check
nargo compile --json
```

### 5) Prover & verifier scripts

- `prove.ts`: loads compiled circuit, converts 32-byte big-endian → Field (BN254), generates proof (`noir_js + barretenberg`), writes `out/proof.bin`.
- `verify.ts`: verifies proof locally; exit non-zero on failure.

### 6) Minimal encrypted exchange via IPFS

- Key agreement: **ECIES-style** with P-256:
  - Generate ephemeral `eph_A` (A→B).
  - `shared = ECDH(eph_A, pub_B)`; `kdf(shared)` → AES-GCM key.
  - Encrypt `sample.pdf` → `cipher.bin` with `iv`, `aad` = `doc_hash`.
  - Upload to IPFS, obtain `cid`.
  - Package JSON:

    ```json
    {
      "cid": "…",
      "iv": "…",
      "aad": "<doc_hash_hex>",
      "ephemeralPub": "…",
      "alg": "ecdh+aesgcm-256"
    }
    ```

- `decrypt.ts` for the recipient:
  - Recompute `shared = ECDH(priv_B, eph_A_pub)`; decrypt; recompute `doc_hash` and compare to `aad`.

- Use `ipfs-http-client` or a gateway API; support local dev node.

### 7) End-to-end runbook (happy path)

1. `yarn tsx scripts/hash-byte-range.ts sample_signed.pdf`
2. `yarn tsx scripts/extract-cms.ts sample_signed.pdf signer_cert.der`
3. `yarn tsx scripts/prove.ts --hash out/doc_hash.bin --sig out/sig.json --pub out/pubkey.json`
4. `yarn tsx scripts/verify.ts out/proof.bin`
5. `yarn tsx scripts/encrypt-upload.ts sample.pdf --to pubkey_B`
6. Recipient runs `decrypt.ts`, signs `sample.pdf` → produces `sample_signed_by_B.pdf`, repeats steps 1–4, then re-encrypts back to A.

Log all artifacts to `out/` with timestamps.

### 8) Optional: DocMDP & timestamp

- Make first signature a **certifying** signature (DocMDP, no changes allowed).
- Add TSA call (RFC-3161) to get **PAdES-T**; embed `UnsignedAttributes`.

### 9) README

- Tools required (Node LTS, yarn, OpenSSL, `nargo`, jq).
- Exact commands (copy-paste).
- Troubleshooting:
  - Hash mismatch → check `/ByteRange` math and inclusive vs exclusive slicing.
  - Noir verify fail → endian/padding on `(r,s,x,y)`; confirm curve is P-256.
  - RSA-only sample → explain parallel dev ECDSA path for ZK.

---

## Code stubs (drop-in)

**Noir `src/main.nr`**

```rust
use dep::ecdsa_secp256r1::{PublicKey, Signature, verify_signature};

pub fn main(
    msg_hash: Field,   // SHA-256 digest mapped to BN254 field (big-endian)
    pub_x: Field,
    pub_y: Field,
    r: Field,
    s: Field
) {
    let pubkey = PublicKey { x: pub_x, y: pub_y };
    let sig = Signature { r, s };
    let ok = verify_signature(pubkey, msg_hash, sig);
    assert(ok, "ECDSA P-256 verification failed");
}
```

**Hash-from-ByteRange (TS sketch)**

```ts
import fs from "node:fs";

function sha256(buf: Uint8Array) {
  return crypto.subtle.digest("SHA-256", buf);
}

(async () => {
  const pdf = fs.readFileSync(process.argv[2]);
  // naive find of /ByteRange [a b c d]
  const s = pdf.toString("latin1");
  const m = s.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
  if (!m) throw new Error("ByteRange not found");
  const [a, b, c, d] = m.slice(1).map(Number);
  const part1 = pdf.subarray(a, a + b);
  const part2 = pdf.subarray(c, c + d);
  const concat = new Uint8Array(part1.length + part2.length);
  concat.set(part1, 0);
  concat.set(part2, part1.length);
  const digest = new Uint8Array(await sha256(concat));
  fs.writeFileSync("out/doc_hash.bin", digest);
  fs.writeFileSync("out/doc_hash.hex", Buffer.from(digest).toString("hex"));
  console.log("doc_hash", Buffer.from(digest).toString("hex"));
})();
```

---

## Notes & constraints

- **Curve:** aim for **P-256** for ZK; if real sample is RSA, note limitation and keep Noir demo on ECDSA dev key.
- **Endian:** all big-endian 32-byte for `(r,s,x,y)`; zero-pad to length.
- **Security (POC):** okay to keep keys in memory; do not commit secrets. Use `.env.local` for test keys.
