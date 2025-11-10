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
        // Map from proof_id (hash of doc_hash + signer_fpr) to proof_id (as existence check)
        proof_registry: Map<Field, PublicMutable<Field, Context>, Context>,
        proof_count: PublicMutable<Field, Context>,
        // Individual metadata maps for each field
        tl_root_map: Map<Field, PublicMutable<Field, Context>, Context>,
        tl_root_eu_map: Map<Field, PublicMutable<Field, Context>, Context>,
        eu_trust_enabled_map: Map<Field, PublicMutable<bool, Context>, Context>,
        anchored_at_map: Map<Field, PublicMutable<u64, Context>, Context>,
        anchored_by_map: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor() {
        storage.proof_count.write(0);
    }

    #[external("public")]
    fn anchor_proof(
        doc_hash: [u8; 32],
        signer_fpr: [u8; 32],
        tl_root: [u8; 32],
        tl_root_eu: [u8; 32],
        eu_trust_enabled: bool,
    ) {
        // Convert byte arrays to Field elements
        let mut doc_hash_field: Field = 0;
        for i in 0..32 {
            doc_hash_field = doc_hash_field * 256 + doc_hash[i] as Field;
        }

        let mut signer_fpr_field: Field = 0;
        for i in 0..32 {
            signer_fpr_field = signer_fpr_field * 256 + signer_fpr[i] as Field;
        }

        let mut tl_root_field: Field = 0;
        for i in 0..32 {
            tl_root_field = tl_root_field * 256 + tl_root[i] as Field;
        }

        let mut tl_root_eu_field: Field = 0;
        for i in 0..32 {
            tl_root_eu_field = tl_root_eu_field * 256 + tl_root_eu[i] as Field;
        }

        let proof_id = poseidon2_hash([doc_hash_field, signer_fpr_field]);

        // SECURITY: Check for duplicates - prevent double anchoring
        let existing = storage.proof_registry.at(proof_id).read();
        assert(existing == 0, "Proof already anchored");

        // Get current timestamp and caller
        let timestamp = context.timestamp();
        let caller = context.msg_sender().unwrap();

        // Store proof_id as existence indicator
        storage.proof_registry.at(proof_id).write(proof_id);

        // Store full metadata in separate maps
        storage.tl_root_map.at(proof_id).write(tl_root_field);
        storage.tl_root_eu_map.at(proof_id).write(tl_root_eu_field);
        storage.eu_trust_enabled_map.at(proof_id).write(eu_trust_enabled);
        storage.anchored_at_map.at(proof_id).write(timestamp);
        storage.anchored_by_map.at(proof_id).write(caller);

        // Increment count (only if new proof was added)
        let current_count = storage.proof_count.read();
        storage.proof_count.write(current_count + 1);
    }

    #[external("public")]
    #[view]
    fn get_proof_exists(doc_hash: [u8; 32], signer_fpr: [u8; 32]) -> pub bool {
        // Compute proof_id
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

    #[external("public")]
    #[view]
    fn get_proof_count() -> pub Field {
        storage.proof_count.read()
    }

    #[external("public")]
    #[view]
    fn get_proof_id_for(doc_hash: [u8; 32], signer_fpr: [u8; 32]) -> pub Field {
        // Compute proof_id
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
