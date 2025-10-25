Task 4 — Complete Task 3: DocMDP & Documentation

Goal

Complete remaining Task 3 deliverables: DocMDP certifying signatures and comprehensive documentation. Skip blocked PAdES-T/LT components.

Deliverables

scripts/pades-certify.ts — Create DocMDP certifying signature with transform parameters.

README.md — Complete documentation with:

EU Trust List workflow

Command reference and examples

Architecture diagrams

Security model explanation

TASK-3-COMPLETE.md — Final checkpoint document.

examples/ directory — Usage examples and sample outputs.

Acceptance Criteria

✅ DocMDP: Adobe/Okular shows "certifying signature" with chosen policy (no-changes/form-fill/annotations).

✅ README: Complete EU trust workflow documented with commands and expected output.

✅ Examples: At least 3 working examples (local trust, EU trust, dual trust).

✅ Diagrams: System architecture, data flow, and trust verification flow.

✅ Checkpoint: Final Task 3 completion document created.

✅ E2E test: DocMDP test added to test suite.

Subtasks

A) DocMDP Certifying Signature

Implement pades-certify.ts:

Use pdf-lib to create signature dictionary.

Set /DocMDP transformation dictionary with policy parameter:

P=1: No changes allowed after signature

P=2: Form filling allowed

P=3: Form filling and annotations allowed

Compute /ByteRange for signature placeholder.

Sign with ECDSA P-256 using existing keys.

Validate in Adobe Acrobat/Okular.

CLI Usage:

yarn pades:certify sample.pdf --policy no-changes --key signer.pem --out certified.pdf

yarn pades:certify sample.pdf --policy form-fill --key signer.pem --out certified.pdf

Output:

Certified PDF with DocMDP signature dictionary.

Policy enforced (test by modifying PDF afterward).

B) Complete Documentation

Update README.md:

Add "EU Trust List Verification" section after Task 2.

Document complete workflow:

Setup phase (fetch EU trust list)

Daily usage (local vs dual trust)

Verification process

Add command reference table:

| Command | Purpose | Example |
|---------|---------|---------|
| yarn eutl:fetch | Download EU LOTL | yarn eutl:fetch --out tools/eutl/cache |
| yarn eutl:root | Build EU Merkle tree | yarn eutl:root --snapshot ... |
| yarn prove | Local trust only | yarn prove |
| yarn prove --eu-trust | Dual trust | yarn prove -- --eu-trust |
| yarn verify | Verify proof | yarn verify |

Add architecture diagram:

System components

Data flow

Trust verification logic

Add security model section:

Dual trust verification

Zero-knowledge properties

Attack prevention

C) Create Examples

Create examples/ directory with:

example-1-local-trust.md:

Complete workflow using local allowlist only

Commands and expected output

Example manifest

example-2-eu-trust.md:

Complete workflow using dual trust

EU trust list setup

Commands and expected output

Example manifest with eu_trust enabled

example-3-verification.md:

Verification walkthrough

6-step process explanation

Success and failure scenarios

example-4-docmdp.md:

DocMDP certifying signature workflow

Policy selection guide

Validation steps

D) Architecture Diagrams

Create docs/diagrams/ with:

system-architecture.md or .png:

Components: PDF, Circuit, Prover, Verifier

Trust lists (local + EU)

Artifact binding

data-flow.md or .png:

Setup → Prove → Verify flow

File dependencies

trust-verification.md or .png:

Local Merkle verification

EU Merkle verification

Dual trust logic

E) Final Checkpoint

Create TASK-3-COMPLETE.md:

Summary of all Task 3 work

Components delivered

Known limitations

Performance metrics

Next steps (Task 4+)

Update TASK-3-PROGRESS.md → archive it

Commit message for final Task 3 completion

F) E2E Test Enhancement

Add TEST 6: DocMDP Validation

Create certified PDF

Verify DocMDP signature present

Attempt modification (should fail if policy enforced)

Validate with external tool (pdfsig or Adobe)

G) Package.json Scripts

Add new scripts:

"pades:certify": "node --loader ts-node/esm scripts/pades-certify.ts"

Update help text in README

CLI Cheatsheet

# DocMDP Certifying Signature

yarn pades:certify sample.pdf --policy no-changes --out certified.pdf

# Verify in Adobe (manual)

# Open certified.pdf in Adobe Acrobat → should show "Certified Document"

# EU Trust List Setup (one-time)

yarn eutl:fetch --out tools/eutl/cache

yarn eutl:root --snapshot tools/eutl/cache/snapshot.json --out out

# Proof Generation

yarn prove                    # Local trust only

yarn prove -- --eu-trust      # Dual trust (local + EU)

# Verification

yarn verify                   # Auto-detects mode from manifest

# E2E Testing

yarn e2e-test                 # All 6 tests including DocMDP

Notes / Design Choices

DocMDP Implementation:

Use pdf-lib for PDF manipulation (already in dependencies)

ECDSA P-256 signing (reuse existing key infrastructure)

Validation requires Adobe/Okular (no pure Node.js validator)

Documentation Style:

Clear commands with expected output

Visual diagrams (ASCII or PNG)

Examples before theory (practical first)

Security section for auditors

Skip Blocked Items:

PAdES-T: Blocked by PKI.js complexity (RFC-3161 timestamp)

PAdES-LT: Blocked by PKI.js complexity (DSS/VRI)

Document as "Future Work" instead

Estimated Effort

DocMDP: 2 hours

Documentation: 2 hours

Examples: 1 hour

Diagrams: 1 hour

Checkpoint: 30 min

E2E test: 30 min

Total: 6-7 hours

Success Criteria Summary

From Task 3 spec (achievable items):

✅ DocMDP present; Adobe shows "certifying signature"

⬜ PAdES-T (SKIP - blocked)

⬜ PAdES-LT (SKIP - blocked)

✅ EU trust snapshot working

✅ ZK proof with EU trust verified

✅ Negative tests (signer not in EU list)

✅ Documentation complete

Result: Task 3 at ~90% completion (skip 2 blocked items)

Dependencies

Task 2: Complete ✅

Task 3 (partial): 60% complete ✅

Required tools: Adobe Acrobat or Okular for DocMDP validation

Optional

Create video walkthrough

Deploy demo to public site

Create Docker container for easy setup

Write academic paper draft
