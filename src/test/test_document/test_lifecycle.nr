use crate::DocumentRegistry;
use crate::document_registry::test_document::utils;

/// Test basic document creation
#[test]
unconstrained fn test_create_document() {
    let (mut env, registry_address, admin) = utils::setup();

    let initial_cid = utils::create_test_cid(1);
    let counterparties: [Field; 5] = [
        123, // counterparty 1
        456, // counterparty 2
        0,   // unused
        0,   // unused
        0,   // unused
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
}

/// Test document creation with creator as signer
#[test]
unconstrained fn test_create_document_creator_is_signer() {
    let (mut env, registry_address, admin) = utils::setup();

    let initial_cid = utils::create_test_cid(2);
    let counterparties: [Field; 5] = [
        789, // counterparty 1
        0,
        0,
        0,
        0,
    ];

    // Create document with creator as signer
    let document_id = env.call_public(
        admin,
        DocumentRegistry::at(registry_address).create_document(
            initial_cid,
            counterparties,
            true, // creator IS a signer
        ),
    );

    assert_eq(document_id, 1);

    // Verify required signatures = counterparties + 1 (creator)
    let required_sigs = env.view_public(
        DocumentRegistry::at(registry_address).get_required_signatures(document_id),
    );
    assert_eq(required_sigs, 2); // 1 counterparty + 1 creator
}

/// Test adding first signature (transition to PARTIALLY_SIGNED)
#[test]
unconstrained fn test_add_first_signature() {
    let (mut env, registry_address, admin) = utils::setup();

    let initial_cid = utils::create_test_cid(3);
    let signer_fpr = utils::create_test_fingerprint(123);
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

    // Add first signature
    let new_cid = utils::create_test_cid(4);
    let tl_root = utils::create_test_tl_root(10);
    let tl_root_eu = utils::create_test_tl_root(20);

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

    // Verify current CID updated
    let current_cid_field = env.view_public(
        DocumentRegistry::at(registry_address).get_current_cid(document_id),
    );
    // Convert new_cid to Field for comparison
    let mut expected_cid: Field = 0;
    for i in 0..32 {
        expected_cid = expected_cid * 256 + new_cid[i] as Field;
    }
    assert_eq(current_cid_field, expected_cid);
}

/// Test full lifecycle: create → sign → sign → FULLY_SIGNED
#[test]
unconstrained fn test_full_lifecycle_two_signers() {
    let (mut env, registry_address, admin) = utils::setup();

    let initial_cid = utils::create_test_cid(5);
    let signer1_fpr = utils::create_test_fingerprint(111);
    let signer2_fpr = utils::create_test_fingerprint(222);

    let counterparties: [Field; 5] = [
        111 as Field,
        222 as Field,
        0,
        0,
        0,
    ];

    // 1. Create document
    let document_id = env.call_public(
        admin,
        DocumentRegistry::at(registry_address).create_document(
            initial_cid,
            counterparties,
            false,
        ),
    );

    // 2. First signature
    let cid_v1 = utils::create_test_cid(6);
    env.call_public(
        admin,
        DocumentRegistry::at(registry_address).add_signature(
            document_id,
            cid_v1,
            signer1_fpr,
            utils::create_test_tl_root(1),
            utils::create_test_tl_root(2),
            true,
        ),
    );

    // State should be PARTIALLY_SIGNED
    let state = env.view_public(
        DocumentRegistry::at(registry_address).get_document_state(document_id),
    );
    assert_eq(state, 2);

    // 3. Second signature
    let cid_v2 = utils::create_test_cid(7);
    env.call_public(
        admin,
        DocumentRegistry::at(registry_address).add_signature(
            document_id,
            cid_v2,
            signer2_fpr,
            utils::create_test_tl_root(3),
            utils::create_test_tl_root(4),
            true,
        ),
    );

    // State should be FULLY_SIGNED
    let final_state = env.view_public(
        DocumentRegistry::at(registry_address).get_document_state(document_id),
    );
    assert_eq(final_state, 3); // STATE_FULLY_SIGNED

    let sig_count = env.view_public(
        DocumentRegistry::at(registry_address).get_signature_count(document_id),
    );
    assert_eq(sig_count, 2);
}

/// Test 5 counterparties (maximum)
#[test]
unconstrained fn test_five_counterparties() {
    let (mut env, registry_address, admin) = utils::setup();

    let initial_cid = utils::create_test_cid(8);
    let counterparties: [Field; 5] = [
        100 as Field,
        200 as Field,
        300 as Field,
        400 as Field,
        500 as Field,
    ];

    // Create document with 5 counterparties
    let document_id = env.call_public(
        admin,
        DocumentRegistry::at(registry_address).create_document(
            initial_cid,
            counterparties,
            false,
        ),
    );

    // Verify required signatures
    let required_sigs = env.view_public(
        DocumentRegistry::at(registry_address).get_required_signatures(document_id),
    );
    assert_eq(required_sigs, 5);

    // Add all 5 signatures
    for i in 0..5 {
        let mut signer_fpr = [0; 32];
        signer_fpr[31] = ((i + 1) * 100) as u8;

        let mut new_cid = [0; 32];
        new_cid[31] = (10 + i) as u8;

        env.call_public(
            admin,
            DocumentRegistry::at(registry_address).add_signature(
                document_id,
                new_cid,
                signer_fpr,
                utils::create_test_tl_root(1),
                utils::create_test_tl_root(2),
                true,
            ),
        );
    }

    // Verify fully signed
    let state = env.view_public(
        DocumentRegistry::at(registry_address).get_document_state(document_id),
    );
    assert_eq(state, 3); // STATE_FULLY_SIGNED
}
