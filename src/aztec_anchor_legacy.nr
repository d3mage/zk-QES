mod test;
use dep::aztec::macros::aztec;

#[aztec]
pub contract AztecAnchor {
    use dep::aztec::{
        macros::{functions::{external, initializer, view}, storage::storage},
        protocol_types::{address::AztecAddress, hash::poseidon2_hash},
        state_vars::{Map, PublicMutable},
    };

    #[storage]
    struct Storage<Context> {
        // Map from proof_id to existence check (0 = not exists, proof_id = exists)
        proof_registry: Map<Field, PublicMutable<Field, Context>, Context>,
        // Total count of anchored proofs
        proof_count: PublicMutable<Field, Context>,
        // Metadata storage - using individual maps for Aztec compatibility
        tl_root_map: Map<Field, PublicMutable<Field, Context>, Context>,
        tl_root_eu_map: Map<Field, PublicMutable<Field, Context>, Context>,
        eu_trust_enabled_map: Map<Field, PublicMutable<bool, Context>, Context>,
        anchored_at_map: Map<Field, PublicMutable<u64, Context>, Context>,
        anchored_by_map: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
    }

    // ========================================
    // PUBLIC FUNCTIONS
    // ========================================

    #[external("public")]
    #[initializer]
    fn constructor() {
        storage.proof_count.write(0);
    }

    /// Anchor a ZK proof on-chain with full metadata
    #[external("public")]
    fn anchor_proof(
        doc_hash: [u8; 32],
        signer_fpr: [u8; 32],
        tl_root: [u8; 32],
        tl_root_eu: [u8; 32],
        eu_trust_enabled: bool,
    ) {
        // Validate inputs - check not all zeros
        let mut doc_hash_is_zero = true;
        for i in 0..32 {
            if doc_hash[i] != 0 {
                doc_hash_is_zero = false;
            }
        }
        assert(!doc_hash_is_zero, "Document hash cannot be zero");

        let mut signer_fpr_is_zero = true;
        for i in 0..32 {
            if signer_fpr[i] != 0 {
                signer_fpr_is_zero = false;
            }
        }
        assert(!signer_fpr_is_zero, "Signer fingerprint cannot be zero");

        // Compute proof identifier
        let mut doc_hash_field: Field = 0;
        for i in 0..32 {
            doc_hash_field = doc_hash_field * 256 + doc_hash[i] as Field;
        }

        let mut signer_fpr_field: Field = 0;
        for i in 0..32 {
            signer_fpr_field = signer_fpr_field * 256 + signer_fpr[i] as Field;
        }

        let proof_id = poseidon2_hash([doc_hash_field, signer_fpr_field]);

        // SECURITY: Check for duplicates - prevent double anchoring
        let existing = storage.proof_registry.at(proof_id).read();
        assert(existing == 0, "Proof already anchored for this document and signer");

        // Get current timestamp and caller
        let timestamp = context.timestamp();
        let caller = context.msg_sender().unwrap();

        // Store proof_id as existence indicator
        storage.proof_registry.at(proof_id).write(proof_id);

        // Store all metadata
        let mut tl_root_field: Field = 0;
        for i in 0..32 {
            tl_root_field = tl_root_field * 256 + tl_root[i] as Field;
        }

        let mut tl_root_eu_field: Field = 0;
        for i in 0..32 {
            tl_root_eu_field = tl_root_eu_field * 256 + tl_root_eu[i] as Field;
        }

        storage.tl_root_map.at(proof_id).write(tl_root_field);
        storage.tl_root_eu_map.at(proof_id).write(tl_root_eu_field);
        storage.eu_trust_enabled_map.at(proof_id).write(eu_trust_enabled);
        storage.anchored_at_map.at(proof_id).write(timestamp);
        storage.anchored_by_map.at(proof_id).write(caller);

        // Increment global count
        let current_count = storage.proof_count.read();
        storage.proof_count.write(current_count + 1);
    }

    // ========================================
    // VIEW FUNCTIONS
    // ========================================

    /// Check if a proof exists for given doc_hash and signer
    #[external("public")]
    #[view]
    fn get_proof_exists(doc_hash: [u8; 32], signer_fpr: [u8; 32]) -> pub bool {
        let mut doc_hash_field: Field = 0;
        for i in 0..32 {
            doc_hash_field = doc_hash_field * 256 + doc_hash[i] as Field;
        }

        let mut signer_fpr_field: Field = 0;
        for i in 0..32 {
            signer_fpr_field = signer_fpr_field * 256 + signer_fpr[i] as Field;
        }

        let proof_id = poseidon2_hash([doc_hash_field, signer_fpr_field]);
        let stored_id = storage.proof_registry.at(proof_id).read();
        stored_id == proof_id
    }

    /// Get the trust list root for a proof
    #[external("public")]
    #[view]
    fn get_tl_root(doc_hash: [u8; 32], signer_fpr: [u8; 32]) -> pub Field {
        let mut doc_hash_field: Field = 0;
        for i in 0..32 {
            doc_hash_field = doc_hash_field * 256 + doc_hash[i] as Field;
        }

        let mut signer_fpr_field: Field = 0;
        for i in 0..32 {
            signer_fpr_field = signer_fpr_field * 256 + signer_fpr[i] as Field;
        }

        let proof_id = poseidon2_hash([doc_hash_field, signer_fpr_field]);
        storage.tl_root_map.at(proof_id).read()
    }

    /// Get the EU trust list root for a proof
    #[external("public")]
    #[view]
    fn get_tl_root_eu(doc_hash: [u8; 32], signer_fpr: [u8; 32]) -> pub Field {
        let mut doc_hash_field: Field = 0;
        for i in 0..32 {
            doc_hash_field = doc_hash_field * 256 + doc_hash[i] as Field;
        }

        let mut signer_fpr_field: Field = 0;
        for i in 0..32 {
            signer_fpr_field = signer_fpr_field * 256 + signer_fpr[i] as Field;
        }

        let proof_id = poseidon2_hash([doc_hash_field, signer_fpr_field]);
        storage.tl_root_eu_map.at(proof_id).read()
    }

    /// Get whether EU trust was enabled for a proof
    #[external("public")]
    #[view]
    fn get_eu_trust_enabled(doc_hash: [u8; 32], signer_fpr: [u8; 32]) -> pub bool {
        let mut doc_hash_field: Field = 0;
        for i in 0..32 {
            doc_hash_field = doc_hash_field * 256 + doc_hash[i] as Field;
        }

        let mut signer_fpr_field: Field = 0;
        for i in 0..32 {
            signer_fpr_field = signer_fpr_field * 256 + signer_fpr[i] as Field;
        }

        let proof_id = poseidon2_hash([doc_hash_field, signer_fpr_field]);
        storage.eu_trust_enabled_map.at(proof_id).read()
    }

    /// Get the timestamp when proof was anchored
    #[external("public")]
    #[view]
    fn get_anchored_at(doc_hash: [u8; 32], signer_fpr: [u8; 32]) -> pub u64 {
        let mut doc_hash_field: Field = 0;
        for i in 0..32 {
            doc_hash_field = doc_hash_field * 256 + doc_hash[i] as Field;
        }

        let mut signer_fpr_field: Field = 0;
        for i in 0..32 {
            signer_fpr_field = signer_fpr_field * 256 + signer_fpr[i] as Field;
        }

        let proof_id = poseidon2_hash([doc_hash_field, signer_fpr_field]);
        storage.anchored_at_map.at(proof_id).read()
    }

    /// Get the address that anchored the proof
    #[external("public")]
    #[view]
    fn get_anchored_by(doc_hash: [u8; 32], signer_fpr: [u8; 32]) -> pub AztecAddress {
        let mut doc_hash_field: Field = 0;
        for i in 0..32 {
            doc_hash_field = doc_hash_field * 256 + doc_hash[i] as Field;
        }

        let mut signer_fpr_field: Field = 0;
        for i in 0..32 {
            signer_fpr_field = signer_fpr_field * 256 + signer_fpr[i] as Field;
        }

        let proof_id = poseidon2_hash([doc_hash_field, signer_fpr_field]);
        storage.anchored_by_map.at(proof_id).read()
    }

    /// Get total count of anchored proofs
    #[external("public")]
    #[view]
    fn get_proof_count() -> pub Field {
        storage.proof_count.read()
    }

    /// Compute proof_id for given doc_hash and signer (utility function)
    #[external("public")]
    #[view]
    fn get_proof_id_for(doc_hash: [u8; 32], signer_fpr: [u8; 32]) -> pub Field {
        let mut doc_hash_field: Field = 0;
        for i in 0..32 {
            doc_hash_field = doc_hash_field * 256 + doc_hash[i] as Field;
        }

        let mut signer_fpr_field: Field = 0;
        for i in 0..32 {
            signer_fpr_field = signer_fpr_field * 256 + signer_fpr[i] as Field;
        }

        poseidon2_hash([doc_hash_field, signer_fpr_field])
    }
}
