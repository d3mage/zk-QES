Task 5 — Aztec On-Chain Verification & Proof Anchoring

Goal

Deploy ZK proof verification to Aztec blockchain with on-chain proof registry, timestamp anchoring, and event emission for public auditability.

Deliverables

contracts/AztecAnchor/ — Aztec.nr smart contract with proof verifier.

scripts/anchor.ts — Submit proofs to on-chain registry.

scripts/query-anchor.ts — Query and verify on-chain proofs.

Aztec deployment scripts and configuration.

README section on on-chain verification.

E2E test for on-chain anchoring.

Acceptance Criteria

✅ Aztec contract deployed to testnet/sandbox.

✅ Contract verifies ZK proofs on-chain (or accepts pre-verified proofs).

✅ Event emission: Anchored(doc_hash, signer_fpr, tl_root_eu, timestamp).

✅ Off-chain verifier can match manifest to on-chain event.

✅ Query script retrieves proof data by doc_hash or event ID.

✅ E2E test: anchor → query → verify flow works.

✅ Gas costs documented.

Subtasks

A) Aztec Contract Development

Create contracts/AztecAnchor/src/main.nr:

Contract structure:

contract AztecAnchor {
    // Storage for proof commitments
    use dep::aztec::prelude::*;

    #[aztec(storage)]
    struct Storage {
        proof_registry: Map<Field, ProofData>,
        proof_count: PublicMutable<Field>,
    }

    struct ProofData {
        doc_hash: [u8; 32],
        artifact_hash: [u8; 32],
        signer_fpr: [u8; 32],
        tl_root: [u8; 32],
        tl_root_eu: [u8; 32],
        eu_trust_enabled: bool,
        timestamp: u64,
        submitter: AztecAddress,
    }

    #[aztec(public)]
    fn anchor_proof(
        doc_hash: [u8; 32],
        artifact_hash: [u8; 32],
        signer_fpr: [u8; 32],
        tl_root: [u8; 32],
        tl_root_eu: [u8; 32],
        eu_trust_enabled: bool,
        // Optional: actual proof for on-chain verification
    ) {
        let timestamp = context.timestamp();
        let submitter = context.msg_sender();

        // Store commitment
        let proof_id = compute_proof_id(doc_hash, signer_fpr);

        storage.proof_registry.at(proof_id).write(ProofData {
            doc_hash,
            artifact_hash,
            signer_fpr,
            tl_root,
            tl_root_eu,
            eu_trust_enabled,
            timestamp,
            submitter,
        });

        // Emit event
        emit_unencrypted_log(
            context,
            ProofAnchored {
                proof_id,
                doc_hash,
                signer_fpr,
                tl_root_eu,
                timestamp,
            }
        );

        storage.proof_count.write(storage.proof_count.read() + 1);
    }

    #[aztec(public)]
    fn get_proof(proof_id: Field) -> ProofData {
        storage.proof_registry.at(proof_id).read()
    }

    #[aztec(public)]
    fn verify_proof_exists(
        doc_hash: [u8; 32],
        signer_fpr: [u8; 32]
    ) -> bool {
        let proof_id = compute_proof_id(doc_hash, signer_fpr);
        // Check if proof exists
        storage.proof_registry.at(proof_id).is_some()
    }
}

Key decisions:

On-chain proof verification: Too expensive, store commitment instead

Event emission: For indexing and public auditability

Storage: Map by proof_id for efficient lookup

B) Proof Anchoring Script

Create scripts/anchor.ts:

Load manifest.json

Connect to Aztec sandbox/testnet

Call contract.anchor_proof() with manifest data

Wait for transaction confirmation

Retrieve event logs

Display proof ID and transaction hash

CLI Usage:

yarn anchor --manifest out/manifest.json

yarn anchor --manifest out/manifest.json --network testnet

Output:

Anchoring proof to Aztec...
  Contract: 0x1234...
  Proof ID: 0xabcd...
  Doc hash: 28327db1...
  Signer:   06a02856...
  EU trust: ENABLED

Transaction submitted: 0x5678...
Waiting for confirmation...

✅ Proof anchored!
  Proof ID:     0xabcd...
  Block:        12345
  Timestamp:    2025-10-25T02:00:00Z
  Gas used:     150000

Event emitted:
  ProofAnchored(
    proof_id: 0xabcd...,
    doc_hash: 28327db1...,
    signer_fpr: 06a02856...,
    tl_root_eu: 9f7c7c06...,
    timestamp: 1729818000
  )

C) Query Script

Create scripts/query-anchor.ts:

Query by proof_id

Query by doc_hash

Query by signer_fpr

List all proofs (paginated)

Verify proof exists on-chain

CLI Usage:

yarn query-anchor --proof-id 0xabcd...

yarn query-anchor --doc-hash 28327db1...

yarn query-anchor --list --limit 10

Output:

Querying Aztec for proof ID: 0xabcd...

✅ Proof found on-chain!

  Proof Data:
    doc_hash:        28327db146121652...
    artifact_hash:   67f593a9c4a0e194...
    signer_fpr:      06a02856c08dde5c...
    tl_root:         2c22e22941cefc48...
    tl_root_eu:      9f7c7c0661d55036...
    eu_trust:        ENABLED
    timestamp:       2025-10-25T02:00:00Z
    block:           12345
    submitter:       0xf123...

  Verification:
    ✓ Proof exists on-chain
    ✓ Timestamp valid
    ✓ Block confirmed

D) Aztec Deployment

Create contracts/AztecAnchor/package.json

Setup Aztec.nr dependencies

Create deployment script deploy.ts:

Compile contract

Deploy to sandbox

Deploy to testnet (optional)

Save contract address

CLI Usage:

yarn aztec:compile

yarn aztec:deploy --network sandbox

yarn aztec:deploy --network testnet

E) Integration with Verifier

Update scripts/verify.ts:

Add optional --check-onchain flag

Query Aztec for proof data

Compare on-chain data with local manifest

Enhanced verification output:

[7/7] Checking on-chain anchor (optional)...
  ⚡ Querying Aztec contract...
  ✓ Proof found on-chain!
  ✓ On-chain data matches local manifest
  ✓ Block: 12345, Timestamp: 2025-10-25T02:00:00Z

CLI Usage:

yarn verify --check-onchain

F) E2E Test

Add TEST 7: On-Chain Anchoring

Deploy contract to sandbox

Anchor proof

Query proof

Verify on-chain data matches manifest

Check event emission

G) Documentation

README section:

On-chain verification overview

Setup Aztec sandbox

Anchor proofs

Query proofs

Gas costs and economics

Add to examples/example-5-onchain.md

H) Gas Optimization

Benchmark anchor_proof() gas usage

Optimize storage layout

Consider batch anchoring

Document gas costs:

anchor_proof(): ~150k gas

get_proof(): ~50k gas

verify_proof_exists(): ~30k gas

CLI Cheatsheet

# Setup Aztec

yarn aztec:compile

yarn aztec:deploy --network sandbox

# Anchor proof on-chain

yarn anchor --manifest out/manifest.json

# Query proof

yarn query-anchor --proof-id 0xabcd...

yarn query-anchor --doc-hash 28327db1...

# Verify with on-chain check

yarn verify --check-onchain

# List all proofs

yarn query-anchor --list --limit 10

Notes / Design Choices

Commitment vs Full Verification:

Store commitment (cheap)

Full ZK verification on-chain (very expensive ~500k+ gas)

Recommendation: Store commitment, verify off-chain

Event Emission:

Critical for indexing

Allows off-chain proof discovery

Public auditability

Storage Design:

Map by proof_id = hash(doc_hash, signer_fpr)

Efficient lookup

No double-anchoring

Network Selection:

Sandbox for development

Testnet for testing

Mainnet for production

Security Considerations:

Anyone can anchor (open registry)

Consider access control for production

Proof ownership via submitter field

Timestamp from block (trusted time)

Optional Features

Batch anchoring (multiple proofs in one tx)

Proof revocation mechanism

Access control (only authorized submitters)

Integration with IPFS for proof storage

Event indexing with subgraph

Estimated Effort

Contract development: 3 hours

Anchor script: 1 hour

Query script: 1 hour

Deployment setup: 1 hour

E2E test: 1 hour

Documentation: 1 hour

Total: 8 hours

Dependencies

Task 2: Complete ✅

Task 3: Complete ✅

Aztec sandbox installed

Aztec.nr dependencies

Success Criteria

✅ Contract deployed and functional

✅ Proofs anchored on-chain

✅ Events emitted and queryable

✅ Off-chain verification matches

✅ Gas costs reasonable (<200k per anchor)

✅ E2E test passes

✅ Documentation complete
