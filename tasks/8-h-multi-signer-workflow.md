Multi-Signer Qualified Workflow (A → B → A) with Recovery
Goal

Ship a production-ready, two-party countersign flow using the QTSP:

A encrypts → sends → B decrypts → B QTSP-signs → returns → A QTSP-signs → final PDF.

Every hop produces/consumes your ZK proof + manifest.

Flow is resumable after crashes/network drops.

Deliverables

Session coordinator (tiny lib + CLI): state machine for A→B→A with checkpoints.

States: INIT → SENT → RECEIVED → B_SIGNED → RETURNED → A_SIGNED → COMPLETE

Persists session.json (id, step, CIDs/paths, hashes, timestamps).

Countersign PAdES:

pades-countersign.ts: adds second signature as incremental update (keeps DocMDP rules).

Works with CSC signHash for both parties.

QTSP revocation guard:

On each sign, fetch OCSP (or CRL) via AIA; refuse signing if revoked.

Manifest v2:

Add session_id, step, circuit_id, vk_hash, lotl_snapshot_id, qtsp_provider, alg.

Resume commands:

yarn session:start, :send, :receive, :sign-b, :return, :sign-a, :finalize, :resume

E2E test (happy + failure):

Happy path (A→B→A) with ECDSA credential.

Mid-way failure simulation (kill process) → :resume recovers.

Tamper tests still fail (doc/artifact/trust).

Docs:

“Two-party qualified signing” playbook with screenshots/logs.

Acceptance Criteria

✅ Two valid qualified signatures embedded (PAdES-T/LT) and both verify in Acrobat + DSS.

✅ Noir proofs generated/verified at both hops; manifests bound to the same doc_hash & correct artifact.

✅ Session is idempotent/resumable: stopping after any step and running yarn session:resume completes without re-doing past signatures.

✅ Revocation check: if OCSP says revoked or unknown, signing aborts with a clear error.

✅ DocMDP policy from the first signature remains intact after countersign.

✅ Full transcript (JSON) written with all hashes, times, QTSP ids, proof ids.

Subtasks

1. Session coordinator

Implement a small state machine (src/session/coord.ts) with atomic writes to out/session/<id>/session.json.

Generate session_id = sha256(doc_hash || random); include in all manifests & Aztec anchors.

2. A → B leg

yarn session:start <pdf>: hash, encrypt, produce artifact_hash, manifest v2, push (IPFS/local), anchor optional.

yarn session:send: deliver package (CID or file) + manifest to B.

3. B decrypt + QTSP sign + proof

yarn session:receive <package>: decrypt, verify manifest & artifact.

yarn session:sign-b: CSC signHash → embed PAdES-T/LT → ZK proof → verify → anchor (optional) → return to A.

4. A countersign + proof

yarn session:sign-a: verify B’s PAdES + proof → countersign with CSC → PAdES-T/LT → ZK proof → verify → anchor.

5. Revocation guard

Before each CSC sign: build chain from QTSP certs, call OCSP; block on revoked/unknown.

Log OCSP serial & nextUpdate into manifest.

6. Resume & idempotency

yarn session:resume: read session state, run the next action only.

Checkpoints after every artifact write; never re-sign the same step.

7. Tests

Happy path: both ECDSA credentials → green in Acrobat+DSS+your verifier.

Failure: kill after B_SIGNED, then :resume finishes cleanly.

Tamper: flip a byte in ciphertext → artifact binding fails; flip manifest → integrity fails.

Revocation: mock OCSP revoked → command aborts.

CLI Cheatsheet
yarn session:start sample.pdf
yarn session:send --to bob@example.com

# On B:

yarn session:receive <package>
yarn session:sign-b
yarn session:return

# Back on A:

yarn session:sign-a
yarn session:finalize

# At any point:

yarn session:resume

Nice-to-haves (if time allows)

Multi-TSA failover (primary/secondary URLs).

Proof batching (aggregate anchors per session).

Desktop build (Electron) for users without WebCrypto.
