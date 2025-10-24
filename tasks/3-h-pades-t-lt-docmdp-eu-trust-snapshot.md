Task 3 — PAdES-T/LT, DocMDP, EU Trust Snapshot, + Optional Aztec Anchor
Goal

Augment the POC with:

PAdES-T (trusted timestamp) and DocMDP (certifying) support,

PAdES-LT evidence embedding (OCSP/CRL → DSS/VRI),

EU trust snapshot (allow-list → LOTL/TL mirror) and Merkle root,

(Optional) Aztec on-chain anchor for proofs/commitments.

Deliverables

scripts/pades-certify.ts — create DocMDP certifying signature (no changes allowed or strict policy).

scripts/pades-timestamp.ts — add RFC-3161 TSA to produce PAdES-T.

scripts/pades-lt.ts — fetch OCSP/CRL, embed DSS/VRI → PAdES-LT.

tools/eutl/

fetch.ts — mirror LOTL + MS TLs (cache to eutl/),

root.ts — compute Merkle root over qualified CA cert fingerprints,

prove.ts — inclusion path for signer CA (or end-entity fingerprint if you prefer).

Circuit delta circuits/pades_ecdsa/src/main.nr

add optional public input tl_root_eu and optional inclusion proof (feature-flagged).

contracts/AztecAnchor/ (optional)

verifier wiring, anchor(doc_hash, signer_fpr, tl_root_eu, artifact_hash, timestamp) event.

README updates + diagrams.

E2E tests: certify+T+LT path, EU trust inclusion, negative cases.

Acceptance Criteria

✅ DocMDP present; Adobe/Okular show “certifying signature” w/ chosen policy.

✅ PAdES-T: timestamp token embedded; verifier shows signed at trusted time.

✅ PAdES-LT: DSS/VRI contains chain + revocation; offline validation OK.

✅ EU trust snapshot: local mirror built; Merkle tl_root_eu produced; inclusion proof generated for at least one sample QTSP chain.

✅ ZK proof still verifies; if --eu-trust used, Merkle inclusion for signer_fpr (or issuing CA) passes.

✅ Negative tests: stale/absent OCSP → LT build fails; signer not in EU root → inclusion fails.

✅ (Optional) Aztec contract emits event; off-chain verifier can match event to manifest.

Subtasks
A) DocMDP (Certifying Signature)

Implement pades-certify.ts:

Insert first signature as DocMDP; set transform params (e.g., noChanges or minimal allowed changes).

Recompute /ByteRange, sign → validate in Adobe.

Add CLI: yarn pades:certify sample.pdf --policy no-changes

B) RFC-3161 Timestamp → PAdES-T

Implement pades-timestamp.ts:

Compute message imprint (SHA-256 of signed ranges), call TSA URL (configurable).

Embed timestamp token in signature’s unsigned attributes → re-save PDF.

CLI: yarn pades:tsa sample_certified.pdf --tsa https://<tsa-endpoint>

C) PAdES-LT (DSS/VRI)

Implement pades-lt.ts:

Build certificate chain (EE→CA→Root), fetch OCSP (or CRL fallback).

Embed DSS dictionaries and VRI entries per signature (chain certs, OCSP/CRL, timestamps).

Validate offline (no network) in a reference validator.

CLI: yarn pades:lt sample_certified_t.pdf

D) EU Trust Snapshot (LOTL/TLs)

tools/eutl/fetch.ts:

Download LOTL and MS TLs (cache JSON/DER); store snapshot w/ date.

tools/eutl/root.ts:

Extract qualified trust anchors/QTSP CA cert fingerprints (SHA-256 DER),

Build Merkle tree (Poseidon or SHA-256—match your current tree), output tl_root_eu.hex.

tools/eutl/prove.ts:

Given signer_fpr (or issuing CA fpr), output Merkle path JSON.

Wire manifest to record tl_root_eu.

E) Circuit Feature Flag

Keep your current allow-list; add euTrustEnabled public bit:

if 1, require Merkle inclusion against tl_root_eu, else skip.

Preserve proof size; re-run size/perf benchmarks.

F) Optional: Aztec Anchor

Minimal Aztec.nr contract:

method anchor(proof, doc_hash, artifact_hash, signer_fpr, tl_root_eu, ts)

verifies proof (vk), emits Anchored(doc_hash, signer_fpr, tl_root_eu, ts).

Script scripts/anchor.ts to submit & read back event; link in README.

G) Tests

Happy path: certify → tsa → lt → prove → verify → (anchor).

Negatives:

Remove OCSP → LT builder should fail with clear error.

Change a byte after T → signature invalid.

Use a signer not present in EU snapshot → inclusion proof fails.

Replay different CID → artifact binding fails as before.

CLI Cheatsheet

# 1) Certify (DocMDP)

yarn pades:certify sample.pdf --policy no-changes

# 2) Timestamp (PAdES-T)

yarn pades:tsa sample_certified.pdf --tsa https://tsa.example.com

# 3) Long-term validation (PAdES-LT)

yarn pades:lt sample_certified_t.pdf

# 4) EU trust snapshot

yarn eutl:fetch
yarn eutl:root --out out/tl_root_eu.hex
yarn eutl:prove --fingerprint <sha256-cert-or-issuer> --out out/eu_path.json

# 5) Prove with EU trust

yarn prove --eu-trust --tl-root $(cat out/tl_root_eu.hex) --merkle-path out/eu_path.json

# 6) Verify (and optional on-chain anchor)

yarn verify

# optional

yarn anchor --manifest out/manifest.json --proof out/proof.bin

Notes / Design Choices

Which fingerprint to include? start with end-entity cert fingerprint; if chains rotate often, consider issuing CA inclusion instead.

Timestamp source: pick a TSA that allows browser/CLI calls; keep endpoint configurable.

DSS/VRI size: PDFs grow—consider gzip in storage if needed; ensure incremental updates preserve prior signatures.

Performance: record proof time/size deltas after circuit changes.

Security: cache EU lists with snapshot date; include the snapshot hash in manifest.
