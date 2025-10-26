mod test;
use dep::aztec::macros::aztec;

#[aztec]
pub contract AztecAnchor {
    use dep::aztec::{
        macros::{functions::{initializer, public, utility}, storage::storage},
    };
    use dep::aztec::protocol_types::{
        hash::poseidon2_hash,
    };
    use dep::aztec::state_vars::{Map, PublicMutable};

    #[storage]
    struct Storage<Context> {
        // Map from proof_id (hash of doc_hash + signer_fpr) to proof_id (as existence check)
        proof_registry: Map<Field, PublicMutable<Field, Context>, Context>,
        proof_count: PublicMutable<Field, Context>,
    }

    #[public]
    #[initializer]
    fn constructor() {
        storage.proof_count.write(0);
    }

    #[public]
    fn anchor_proof(
        doc_hash: [u8; 32],
        artifact_hash: [u8; 32],
        signer_fpr: [u8; 32],
        tl_root: [u8; 32],
        tl_root_eu: [u8; 32],
        eu_trust_enabled: bool,
    ) {
        // Compute proof_id from doc_hash and signer_fpr using Poseidon2
        let mut doc_hash_field: Field = 0;
        for i in 0..32 {
            doc_hash_field = doc_hash_field * 256 + doc_hash[i] as Field;
        }

        let mut signer_fpr_field: Field = 0;
        for i in 0..32 {
            signer_fpr_field = signer_fpr_field * 256 + signer_fpr[i] as Field;
        }

        let proof_id = poseidon2_hash([doc_hash_field, signer_fpr_field]);

        // Store proof_id as existence indicator
        storage.proof_registry.at(proof_id).write(proof_id);

        // Increment count
        let current_count = storage.proof_count.read();
        storage.proof_count.write(current_count + 1);

        // Note: Additional fields (artifact_hash, tl_root, tl_root_eu, eu_trust_enabled)
        // are passed as parameters but not stored in this simplified version.
        // In production, you'd create additional storage maps for these fields.
    }

    #[utility]
    unconstrained fn get_proof_exists(doc_hash: [u8; 32], signer_fpr: [u8; 32]) -> bool {
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

    #[utility]
    unconstrained fn get_proof_count() -> Field {
        storage.proof_count.read()
    }

    #[utility]
    unconstrained fn get_proof_id_for(doc_hash: [u8; 32], signer_fpr: [u8; 32]) -> Field {
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
