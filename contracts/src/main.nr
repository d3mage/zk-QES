mod test;

use dep::aztec::macros::aztec;

#[aztec]
pub contract DocumentRegistry {
    use dep::aztec::{
        macros::{functions::{external, initializer, view}, storage::storage},
        protocol_types::{address::AztecAddress, hash::poseidon2_hash},
        state_vars::{Map, PublicMutable},
    };

    // ========================================
    // CONSTANTS
    // ========================================

    global MAX_COUNTERPARTIES: u32 = 5;

    // Document states
    global STATE_UNCOMMITTED: u8 = 0;
    global STATE_COMMITTED: u8 = 1;
    global STATE_PARTIALLY_SIGNED: u8 = 2;
    global STATE_FULLY_SIGNED: u8 = 3;

    // ========================================
    // STORAGE
    // ========================================

    #[storage]
    struct Storage<Context> {
        // Document counter
        document_count: PublicMutable<Field, Context>,

        // Document state tracking
        doc_creator: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
        doc_initial_cid: Map<Field, PublicMutable<Field, Context>, Context>,
        doc_current_cid: Map<Field, PublicMutable<Field, Context>, Context>,
        doc_state: Map<Field, PublicMutable<u8, Context>, Context>,
        doc_created_at: Map<Field, PublicMutable<u64, Context>, Context>,
        doc_last_updated: Map<Field, PublicMutable<u64, Context>, Context>,
        doc_required_signatures: Map<Field, PublicMutable<Field, Context>, Context>,
        doc_current_signatures: Map<Field, PublicMutable<Field, Context>, Context>,

        // CID to document_id mapping
        cid_to_doc_id: Map<Field, PublicMutable<Field, Context>, Context>,

        // Document CID version history (document_id - version - CID)
        doc_cid_versions: Map<Field, Map<Field, PublicMutable<Field, Context>, Context>, Context>,

        // Counterparties (document_id - index - fingerprint)
        doc_counterparties: Map<Field, Map<Field, PublicMutable<Field, Context>, Context>, Context>,

        // Signature records (document_id - signature_index - data)
        sig_fingerprint: Map<Field, Map<Field, PublicMutable<Field, Context>, Context>, Context>,
        sig_order: Map<Field, Map<Field, PublicMutable<Field, Context>, Context>, Context>,
        sig_cid_after: Map<Field, Map<Field, PublicMutable<Field, Context>, Context>, Context>,
        sig_timestamp: Map<Field, Map<Field, PublicMutable<u64, Context>, Context>, Context>,
        sig_proof_id: Map<Field, Map<Field, PublicMutable<Field, Context>, Context>, Context>,

        // ZK Proof anchoring (integrated from AztecAnchor)
        proof_registry: Map<Field, PublicMutable<Field, Context>, Context>,
        proof_count: PublicMutable<Field, Context>,
        proof_tl_root: Map<Field, PublicMutable<Field, Context>, Context>,
        proof_tl_root_eu: Map<Field, PublicMutable<Field, Context>, Context>,
        proof_eu_trust_enabled: Map<Field, PublicMutable<bool, Context>, Context>,
        proof_anchored_at: Map<Field, PublicMutable<u64, Context>, Context>,
        proof_anchored_by: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
    }

    // ========================================
    // CONSTRUCTOR
    // ========================================

    #[external("public")]
    #[initializer]
    fn constructor() {
        storage.document_count.write(0);
        storage.proof_count.write(0);
    }

    // ========================================
    // PUBLIC FUNCTIONS - DOCUMENT LIFECYCLE
    // ========================================

    /// Create a new document with initial CID and counterparties
    /// Returns document_id
    #[external("public")]
    fn create_document(
        initial_cid: [u8; 32],
        counterparties: [Field; MAX_COUNTERPARTIES], // Signer fingerprints (0 = unused)
        creator_is_signer: bool,
    ) -> pub Field {
        // Validate initial CID is not zero
        let mut cid_is_zero = true;
        for i in 0..32 {
            if initial_cid[i] != 0 {
                cid_is_zero = false;
            }
        }
        assert(!cid_is_zero, "Initial CID cannot be zero");

        // Convert CID to Field
        let mut cid_field: Field = 0;
        for i in 0..32 {
            cid_field = cid_field * 256 + initial_cid[i] as Field;
        }

        // Check CID is not already registered
        let existing_doc_id = storage.cid_to_doc_id.at(cid_field).read();
        assert(existing_doc_id == 0, "CID already registered");

        // Count counterparties
        let mut counterparty_count: Field = 0;
        for i in 0..MAX_COUNTERPARTIES {
            if counterparties[i] != 0 {
                counterparty_count = counterparty_count + 1;
            }
        }

        // Determine required signatures
        let required_sigs = if creator_is_signer {
            counterparty_count + 1
        } else {
            counterparty_count
        };

        // Field cannot be compared directly, need to check if counterparty_count is 0
        assert(counterparty_count != 0 as Field, "At least one signature required");

        // Generate document ID
        let document_id = storage.document_count.read() + 1;
        storage.document_count.write(document_id);

        // Get caller and timestamp
        let creator = context.msg_sender().unwrap();
        let timestamp = context.timestamp();

        // Store document state
        storage.doc_creator.at(document_id).write(creator);
        storage.doc_initial_cid.at(document_id).write(cid_field);
        storage.doc_current_cid.at(document_id).write(cid_field);
        storage.doc_state.at(document_id).write(STATE_COMMITTED);
        storage.doc_created_at.at(document_id).write(timestamp);
        storage.doc_last_updated.at(document_id).write(timestamp);
        storage.doc_required_signatures.at(document_id).write(required_sigs);
        storage.doc_current_signatures.at(document_id).write(0);

        // Map CID to document ID
        storage.cid_to_doc_id.at(cid_field).write(document_id);

        // Store version 0 CID
        storage.doc_cid_versions.at(document_id).at(0).write(cid_field);

        // Store counterparties
        for i in 0..MAX_COUNTERPARTIES {
            if counterparties[i] != 0 {
                storage.doc_counterparties.at(document_id).at(i as Field).write(counterparties[i]);
            }
        }

        document_id
    }

    /// Add a signature to a document
    /// This updates the document state and anchors the ZK proof
    #[external("public")]
    fn add_signature(
        document_id: Field,
        new_cid: [u8; 32], // CID after adding this signature
        signer_fpr: [u8; 32], // Signer's certificate fingerprint
        tl_root: [u8; 32],
        tl_root_eu: [u8; 32],
        eu_trust_enabled: bool,
    ) -> pub bool {
        // Validate document exists
        let doc_state = storage.doc_state.at(document_id).read();
        assert(doc_state > 0, "Document does not exist");

        // Validate document is not fully signed
        assert(doc_state != STATE_FULLY_SIGNED, "Document already fully signed");

        // Validate new CID is not zero
        let mut cid_is_zero = true;
        for i in 0..32 {
            if new_cid[i] != 0 {
                cid_is_zero = false;
            }
        }
        assert(!cid_is_zero, "New CID cannot be zero");

        // Validate signer fingerprint is not zero
        let mut fpr_is_zero = true;
        for i in 0..32 {
            if signer_fpr[i] != 0 {
                fpr_is_zero = false;
            }
        }
        assert(!fpr_is_zero, "Signer fingerprint cannot be zero");

        // Convert to Fields
        let mut new_cid_field: Field = 0;
        for i in 0..32 {
            new_cid_field = new_cid_field * 256 + new_cid[i] as Field;
        }

        let mut signer_fpr_field: Field = 0;
        for i in 0..32 {
            signer_fpr_field = signer_fpr_field * 256 + signer_fpr[i] as Field;
        }

        // Check signer is authorized (in counterparty list)
        let mut is_authorized = false;

        // Check counterparties
        for i in 0..MAX_COUNTERPARTIES {
            let counterparty = storage.doc_counterparties.at(document_id).at(i as Field).read();
            if counterparty == signer_fpr_field {
                is_authorized = true;
            }
        }

        assert(is_authorized, "Signer not authorized for this document");

        // Check signer hasn't already signed
        let current_sig_count = storage.doc_current_signatures.at(document_id).read();
        // Loop through existing signatures to check for duplicates
        for i in 0..MAX_COUNTERPARTIES {
            let existing_signer = storage.sig_fingerprint.at(document_id).at(i as Field).read();
            // Only check non-zero (existing) signatures
            if existing_signer != 0 {
                assert(existing_signer != signer_fpr_field, "Signer already signed this document");
            }
        }

        // Get current CID (this becomes the doc_hash for ZK proof)
        let current_cid = storage.doc_current_cid.at(document_id).read();

        // Get timestamp and caller
        let timestamp = context.timestamp();
        let caller = context.msg_sender().unwrap();

        // Anchor ZK proof inline (to avoid self reference issues)
        let proof_id = poseidon2_hash([current_cid, signer_fpr_field]);

        // Check for duplicate proofs
        let existing_proof = storage.proof_registry.at(proof_id).read();
        assert(existing_proof == 0, "Proof already anchored");

        // Store proof and metadata
        storage.proof_registry.at(proof_id).write(proof_id);

        // Convert trust roots to Fields
        let mut tl_root_field: Field = 0;
        for i in 0..32 {
            tl_root_field = tl_root_field * 256 + tl_root[i] as Field;
        }

        let mut tl_root_eu_field: Field = 0;
        for i in 0..32 {
            tl_root_eu_field = tl_root_eu_field * 256 + tl_root_eu[i] as Field;
        }

        storage.proof_tl_root.at(proof_id).write(tl_root_field);
        storage.proof_tl_root_eu.at(proof_id).write(tl_root_eu_field);
        storage.proof_eu_trust_enabled.at(proof_id).write(eu_trust_enabled);
        storage.proof_anchored_at.at(proof_id).write(timestamp);
        storage.proof_anchored_by.at(proof_id).write(caller);

        // Increment proof count
        let proof_count = storage.proof_count.read();
        storage.proof_count.write(proof_count + 1);

        // Store signature record
        let signature_index = current_sig_count;

        storage.sig_fingerprint.at(document_id).at(signature_index).write(signer_fpr_field);
        storage.sig_order.at(document_id).at(signature_index).write(signature_index + 1);
        storage.sig_cid_after.at(document_id).at(signature_index).write(new_cid_field);
        storage.sig_timestamp.at(document_id).at(signature_index).write(timestamp);
        storage.sig_proof_id.at(document_id).at(signature_index).write(proof_id);

        // Update document state
        let new_sig_count = current_sig_count + 1;
        storage.doc_current_signatures.at(document_id).write(new_sig_count);
        storage.doc_current_cid.at(document_id).write(new_cid_field);
        storage.doc_last_updated.at(document_id).write(timestamp);

        // Store CID version
        storage.doc_cid_versions.at(document_id).at(new_sig_count).write(new_cid_field);

        // Map new CID to document ID
        storage.cid_to_doc_id.at(new_cid_field).write(document_id);

        // Update state
        let required_sigs = storage.doc_required_signatures.at(document_id).read();
        // Check if all signatures collected (Field equality check)
        if new_sig_count == required_sigs {
            storage.doc_state.at(document_id).write(STATE_FULLY_SIGNED);
        } else {
            storage.doc_state.at(document_id).write(STATE_PARTIALLY_SIGNED);
        }

        true
    }

    // ========================================
    // INTERNAL FUNCTIONS
    // ========================================

    /// Internal function to anchor ZK proof (migrated from AztecAnchor)
    #[external("public")]
    fn _anchor_zk_proof_internal(
        doc_hash_field: Field,
        signer_fpr_field: Field,
        tl_root: [u8; 32],
        tl_root_eu: [u8; 32],
        eu_trust_enabled: bool,
    ) -> pub Field {
        // Compute proof ID
        let proof_id = poseidon2_hash([doc_hash_field, signer_fpr_field]);

        // Check for duplicates
        let existing = storage.proof_registry.at(proof_id).read();
        assert(existing == 0, "Proof already anchored");

        // Get timestamp and caller
        let timestamp = context.timestamp();
        let caller = context.msg_sender().unwrap();

        // Store proof
        storage.proof_registry.at(proof_id).write(proof_id);

        // Convert trust roots to Fields
        let mut tl_root_field: Field = 0;
        for i in 0..32 {
            tl_root_field = tl_root_field * 256 + tl_root[i] as Field;
        }

        let mut tl_root_eu_field: Field = 0;
        for i in 0..32 {
            tl_root_eu_field = tl_root_eu_field * 256 + tl_root_eu[i] as Field;
        }

        // Store metadata
        storage.proof_tl_root.at(proof_id).write(tl_root_field);
        storage.proof_tl_root_eu.at(proof_id).write(tl_root_eu_field);
        storage.proof_eu_trust_enabled.at(proof_id).write(eu_trust_enabled);
        storage.proof_anchored_at.at(proof_id).write(timestamp);
        storage.proof_anchored_by.at(proof_id).write(caller);

        // Increment count
        let count = storage.proof_count.read();
        storage.proof_count.write(count + 1);

        proof_id
    }

    // ========================================
    // VIEW FUNCTIONS - DOCUMENT QUERIES
    // ========================================

    /// Get document state
    #[external("public")]
    #[view]
    fn get_document_state(document_id: Field) -> pub u8 {
        storage.doc_state.at(document_id).read()
    }

    /// Get document creator
    #[external("public")]
    #[view]
    fn get_document_creator(document_id: Field) -> pub AztecAddress {
        storage.doc_creator.at(document_id).read()
    }

    /// Get initial CID
    #[external("public")]
    #[view]
    fn get_initial_cid(document_id: Field) -> pub Field {
        storage.doc_initial_cid.at(document_id).read()
    }

    /// Get current CID
    #[external("public")]
    #[view]
    fn get_current_cid(document_id: Field) -> pub Field {
        storage.doc_current_cid.at(document_id).read()
    }

    /// Get document ID by CID
    #[external("public")]
    #[view]
    fn get_document_id_by_cid(cid: [u8; 32]) -> pub Field {
        let mut cid_field: Field = 0;
        for i in 0..32 {
            cid_field = cid_field * 256 + cid[i] as Field;
        }
        storage.cid_to_doc_id.at(cid_field).read()
    }

    /// Get CID for specific version
    #[external("public")]
    #[view]
    fn get_cid_version(document_id: Field, version: Field) -> pub Field {
        storage.doc_cid_versions.at(document_id).at(version).read()
    }

    /// Get signature count for document
    #[external("public")]
    #[view]
    fn get_signature_count(document_id: Field) -> pub Field {
        storage.doc_current_signatures.at(document_id).read()
    }

    /// Get required signature count
    #[external("public")]
    #[view]
    fn get_required_signatures(document_id: Field) -> pub Field {
        storage.doc_required_signatures.at(document_id).read()
    }

    /// Get signature details
    #[external("public")]
    #[view]
    fn get_signature(
        document_id: Field,
        signature_index: Field,
    ) -> pub (Field, Field, Field, u64, Field) {
        // Returns: (fingerprint, order, cid_after, timestamp, proof_id)
        let fpr = storage.sig_fingerprint.at(document_id).at(signature_index).read();
        let order = storage.sig_order.at(document_id).at(signature_index).read();
        let cid_after = storage.sig_cid_after.at(document_id).at(signature_index).read();
        let timestamp = storage.sig_timestamp.at(document_id).at(signature_index).read();
        let proof_id = storage.sig_proof_id.at(document_id).at(signature_index).read();

        (fpr, order, cid_after, timestamp, proof_id)
    }

    /// Get counterparty by index
    #[external("public")]
    #[view]
    fn get_counterparty(document_id: Field, index: Field) -> pub Field {
        storage.doc_counterparties.at(document_id).at(index).read()
    }

    /// Get total document count
    #[external("public")]
    #[view]
    fn get_document_count() -> pub Field {
        storage.document_count.read()
    }

    /// Get created at timestamp
    #[external("public")]
    #[view]
    fn get_created_at(document_id: Field) -> pub u64 {
        storage.doc_created_at.at(document_id).read()
    }

    /// Get last updated timestamp
    #[external("public")]
    #[view]
    fn get_last_updated(document_id: Field) -> pub u64 {
        storage.doc_last_updated.at(document_id).read()
    }

    // ========================================
    // VIEW FUNCTIONS - PROOF QUERIES
    // ========================================

    /// Check if proof exists
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

    /// Get proof count
    #[external("public")]
    #[view]
    fn get_proof_count() -> pub Field {
        storage.proof_count.read()
    }

    /// Get proof trust list root
    #[external("public")]
    #[view]
    fn get_proof_tl_root(doc_hash: [u8; 32], signer_fpr: [u8; 32]) -> pub Field {
        let mut doc_hash_field: Field = 0;
        for i in 0..32 {
            doc_hash_field = doc_hash_field * 256 + doc_hash[i] as Field;
        }

        let mut signer_fpr_field: Field = 0;
        for i in 0..32 {
            signer_fpr_field = signer_fpr_field * 256 + signer_fpr[i] as Field;
        }

        let proof_id = poseidon2_hash([doc_hash_field, signer_fpr_field]);
        storage.proof_tl_root.at(proof_id).read()
    }
}
