use crate::DocumentRegistry;
use crate::document_registry::test_document::utils;

/// Test that duplicate signatures are rejected
#[test(should_fail_with = "Signer already signed this document")]
unconstrained fn test_reject_duplicate_signature() {
    let (mut env, registry_address, admin) = utils::setup();

    let initial_cid = utils::create_test_cid(10);
    let signer_fpr = utils::create_test_fingerprint(123);
    let counterparties: [Field; 5] = [123 as Field, 0, 0, 0, 0];

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
    let cid_v1 = utils::create_test_cid(11);
    env.call_public(
        admin,
        DocumentRegistry::at(registry_address).add_signature(
            document_id,
            cid_v1,
            signer_fpr,
            utils::create_test_tl_root(1),
            utils::create_test_tl_root(2),
            true,
        ),
    );

    // Try to add same signature again (should fail)
    let cid_v2 = utils::create_test_cid(12);
    env.call_public(
        admin,
        DocumentRegistry::at(registry_address).add_signature(
            document_id,
            cid_v2,
            signer_fpr, // Same signer!
            utils::create_test_tl_root(3),
            utils::create_test_tl_root(4),
            true,
        ),
    );
}

/// Test that unauthorized signers are rejected
#[test(should_fail_with = "Signer not authorized for this document")]
unconstrained fn test_reject_unauthorized_signer() {
    let (mut env, registry_address, admin) = utils::setup();

    let initial_cid = utils::create_test_cid(13);
    let authorized_fpr = utils::create_test_fingerprint(123);
    let unauthorized_fpr = utils::create_test_fingerprint(999); // Not in counterparty list
    let counterparties: [Field; 5] = [123 as Field, 0, 0, 0, 0];

    // Create document
    let document_id = env.call_public(
        admin,
        DocumentRegistry::at(registry_address).create_document(
            initial_cid,
            counterparties,
            false,
        ),
    );

    // Try to add signature from unauthorized signer (should fail)
    let cid_v1 = utils::create_test_cid(14);
    env.call_public(
        admin,
        DocumentRegistry::at(registry_address).add_signature(
            document_id,
            cid_v1,
            unauthorized_fpr, // Not authorized!
            utils::create_test_tl_root(1),
            utils::create_test_tl_root(2),
            true,
        ),
    );
}

/// Test that signing fully signed document fails
#[test(should_fail_with = "Document already fully signed")]
unconstrained fn test_reject_signing_fully_signed_doc() {
    let (mut env, registry_address, admin) = utils::setup();

    let initial_cid = utils::create_test_cid(15);
    let signer_fpr = utils::create_test_fingerprint(123);
    let counterparties: [Field; 5] = [123 as Field, 0, 0, 0, 0];

    // Create document with only 1 required signature
    let document_id = env.call_public(
        admin,
        DocumentRegistry::at(registry_address).create_document(
            initial_cid,
            counterparties,
            false,
        ),
    );

    // Add signature (document becomes FULLY_SIGNED)
    let cid_v1 = utils::create_test_cid(16);
    env.call_public(
        admin,
        DocumentRegistry::at(registry_address).add_signature(
            document_id,
            cid_v1,
            signer_fpr,
            utils::create_test_tl_root(1),
            utils::create_test_tl_root(2),
            true,
        ),
    );

    // Try to add another signature (should fail)
    let cid_v2 = utils::create_test_cid(17);
    env.call_public(
        admin,
        DocumentRegistry::at(registry_address).add_signature(
            document_id,
            cid_v2,
            signer_fpr,
            utils::create_test_tl_root(3),
            utils::create_test_tl_root(4),
            true,
        ),
    );
}

/// Test zero CID rejection
#[test(should_fail_with = "Initial CID cannot be zero")]
unconstrained fn test_reject_zero_cid() {
    let (mut env, registry_address, admin) = utils::setup();

    let zero_cid = [0; 32]; // All zeros
    let counterparties: [Field; 5] = [123 as Field, 0, 0, 0, 0];

    // Try to create document with zero CID (should fail)
    env.call_public(
        admin,
        DocumentRegistry::at(registry_address).create_document(
            zero_cid,
            counterparties,
            false,
        ),
    );
}

/// Test zero signer fingerprint rejection
#[test(should_fail_with = "Signer fingerprint cannot be zero")]
unconstrained fn test_reject_zero_signer_fingerprint() {
    let (mut env, registry_address, admin) = utils::setup();

    let initial_cid = utils::create_test_cid(18);
    let zero_fpr = [0; 32]; // All zeros
    let counterparties: [Field; 5] = [123 as Field, 0, 0, 0, 0];

    // Create document
    let document_id = env.call_public(
        admin,
        DocumentRegistry::at(registry_address).create_document(
            initial_cid,
            counterparties,
            false,
        ),
    );

    // Try to add signature with zero fingerprint (should fail)
    let cid_v1 = utils::create_test_cid(19);
    env.call_public(
        admin,
        DocumentRegistry::at(registry_address).add_signature(
            document_id,
            cid_v1,
            zero_fpr, // Zero fingerprint!
            utils::create_test_tl_root(1),
            utils::create_test_tl_root(2),
            true,
        ),
    );
}

/// Test duplicate CID rejection
#[test(should_fail_with = "CID already registered")]
unconstrained fn test_reject_duplicate_cid() {
    let (mut env, registry_address, admin) = utils::setup();

    let duplicate_cid = utils::create_test_cid(20);
    let counterparties: [Field; 5] = [123 as Field, 0, 0, 0, 0];

    // Create first document
    env.call_public(
        admin,
        DocumentRegistry::at(registry_address).create_document(
            duplicate_cid,
            counterparties,
            false,
        ),
    );

    // Try to create second document with same CID (should fail)
    env.call_public(
        admin,
        DocumentRegistry::at(registry_address).create_document(
            duplicate_cid, // Same CID!
            counterparties,
            false,
        ),
    );
}

/// Test signature order tracking
#[test]
unconstrained fn test_signature_order() {
    let (mut env, registry_address, admin) = utils::setup();

    let initial_cid = utils::create_test_cid(21);
    let signer1_fpr = utils::create_test_fingerprint(111);
    let signer2_fpr = utils::create_test_fingerprint(222);
    let signer3_fpr = utils::create_test_fingerprint(333);

    let counterparties: [Field; 5] = [
        111 as Field,
        222 as Field,
        333 as Field,
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

    // Add signatures in order
    env.call_public(
        admin,
        DocumentRegistry::at(registry_address).add_signature(
            document_id,
            utils::create_test_cid(22),
            signer1_fpr,
            utils::create_test_tl_root(1),
            utils::create_test_tl_root(2),
            true,
        ),
    );

    env.call_public(
        admin,
        DocumentRegistry::at(registry_address).add_signature(
            document_id,
            utils::create_test_cid(23),
            signer2_fpr,
            utils::create_test_tl_root(3),
            utils::create_test_tl_root(4),
            true,
        ),
    );

    env.call_public(
        admin,
        DocumentRegistry::at(registry_address).add_signature(
            document_id,
            utils::create_test_cid(24),
            signer3_fpr,
            utils::create_test_tl_root(5),
            utils::create_test_tl_root(6),
            true,
        ),
    );

    // Verify signature order
    let (fpr1, order1, _, _, _) = env.view_public(
        DocumentRegistry::at(registry_address).get_signature(document_id, 0),
    );
    assert_eq(order1, 1);

    let (fpr2, order2, _, _, _) = env.view_public(
        DocumentRegistry::at(registry_address).get_signature(document_id, 1),
    );
    assert_eq(order2, 2);

    let (fpr3, order3, _, _, _) = env.view_public(
        DocumentRegistry::at(registry_address).get_signature(document_id, 2),
    );
    assert_eq(order3, 3);
}
