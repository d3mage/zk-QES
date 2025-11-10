use crate::DocumentRegistry;
use dep::aztec::test::helpers::test_environment::TestEnvironment;

unconstrained fn setup() -> (TestEnvironment, dep::aztec::protocol_types::address::AztecAddress, dep::aztec::protocol_types::address::AztecAddress) {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();

    let initializer = DocumentRegistry::interface().constructor();
    let registry_address = env.deploy("DocumentRegistry").with_public_initializer(admin, initializer);

    (env, registry_address, admin)
}

#[test]
unconstrained fn test_initializer() {
    let (mut env, registry_address, _admin) = setup();

    // Check initial document count is 0
    let doc_count = env.view_public(DocumentRegistry::at(registry_address).get_document_count());
    assert_eq(doc_count, 0);

    // Check initial proof count is 0
    let proof_count = env.view_public(DocumentRegistry::at(registry_address).get_proof_count());
    assert_eq(proof_count, 0);
}

#[test]
unconstrained fn test_create_document() {
    let (mut env, registry_address, admin) = setup();

    // Create test CID
    let mut initial_cid = [0; 32];
    initial_cid[31] = 1;

    // Create counterparties array (2 signers)
    let counterparties: [Field; 5] = [
        123 as Field, // Signer 1
        456 as Field, // Signer 2
        0,
        0,
        0,
    ];

    // Create document
    let document_id = env.call_public(
        admin,
        DocumentRegistry::at(registry_address).create_document(
            initial_cid,
            counterparties,
            false, // creator is not a signer
        ),
    );

    assert_eq(document_id, 1);

    // Verify document state
    let state = env.view_public(
        DocumentRegistry::at(registry_address).get_document_state(document_id),
    );
    assert_eq(state, 1); // STATE_COMMITTED

    // Verify signature counts
    let current_sigs = env.view_public(
        DocumentRegistry::at(registry_address).get_signature_count(document_id),
    );
    assert_eq(current_sigs, 0);

    let required_sigs = env.view_public(
        DocumentRegistry::at(registry_address).get_required_signatures(document_id),
    );
    assert_eq(required_sigs, 2); // 2 counterparties

    // Verify document count incremented
    let doc_count = env.view_public(DocumentRegistry::at(registry_address).get_document_count());
    assert_eq(doc_count, 1);
}

#[test]
unconstrained fn test_add_signature() {
    let (mut env, registry_address, admin) = setup();

    // Create test data
    let mut initial_cid = [0; 32];
    initial_cid[31] = 10;

    let mut signer_fpr = [0; 32];
    signer_fpr[31] = 123;

    let counterparties: [Field; 5] = [
        123 as Field, // This signer
        456 as Field, // Another signer
        0,
        0,
        0,
    ];

    // Create document
    let document_id = env.call_public(
        admin,
        DocumentRegistry::at(registry_address).create_document(
            initial_cid,
            counterparties,
            false,
        ),
    );

    // Prepare signature data
    let mut new_cid = [0; 32];
    new_cid[31] = 11;

    let mut tl_root = [0; 32];
    tl_root[31] = 50;

    let mut tl_root_eu = [0; 32];
    tl_root_eu[31] = 60;

    // Add signature
    let success = env.call_public(
        admin,
        DocumentRegistry::at(registry_address).add_signature(
            document_id,
            new_cid,
            signer_fpr,
            tl_root,
            tl_root_eu,
            true,
        ),
    );

    assert(success);

    // Verify state changed to PARTIALLY_SIGNED
    let state = env.view_public(
        DocumentRegistry::at(registry_address).get_document_state(document_id),
    );
    assert_eq(state, 2); // STATE_PARTIALLY_SIGNED

    // Verify signature count
    let sig_count = env.view_public(
        DocumentRegistry::at(registry_address).get_signature_count(document_id),
    );
    assert_eq(sig_count, 1);

    // Verify proof was anchored
    let proof_count = env.view_public(DocumentRegistry::at(registry_address).get_proof_count());
    assert_eq(proof_count, 1);
}
