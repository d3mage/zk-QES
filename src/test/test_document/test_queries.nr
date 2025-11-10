use crate::DocumentRegistry;
use crate::document_registry::test_document::utils;

/// Test CID-to-document-ID lookup
#[test]
unconstrained fn test_cid_to_document_id_lookup() {
    let (mut env, registry_address, admin) = utils::setup();

    let initial_cid = utils::create_test_cid(30);
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

    // Look up by CID
    let found_id = env.view_public(
        DocumentRegistry::at(registry_address).get_document_id_by_cid(initial_cid),
    );

    assert_eq(found_id, document_id);
}

/// Test CID version history
#[test]
unconstrained fn test_cid_version_history() {
    let (mut env, registry_address, admin) = utils::setup();

    let cid_v0 = utils::create_test_cid(31);
    let cid_v1 = utils::create_test_cid(32);
    let cid_v2 = utils::create_test_cid(33);

    let signer1_fpr = utils::create_test_fingerprint(111);
    let signer2_fpr = utils::create_test_fingerprint(222);

    let counterparties: [Field; 5] = [111 as Field, 222 as Field, 0, 0, 0];

    // Create document (v0)
    let document_id = env.call_public(
        admin,
        DocumentRegistry::at(registry_address).create_document(
            cid_v0,
            counterparties,
            false,
        ),
    );

    // Add signature 1 (v1)
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

    // Add signature 2 (v2)
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

    // Query version history
    let v0_cid = env.view_public(
        DocumentRegistry::at(registry_address).get_cid_version(document_id, 0),
    );
    let v1_cid = env.view_public(
        DocumentRegistry::at(registry_address).get_cid_version(document_id, 1),
    );
    let v2_cid = env.view_public(
        DocumentRegistry::at(registry_address).get_cid_version(document_id, 2),
    );

    // Convert to Fields for comparison
    let mut expected_v0: Field = 0;
    for i in 0..32 {
        expected_v0 = expected_v0 * 256 + cid_v0[i] as Field;
    }
    let mut expected_v1: Field = 0;
    for i in 0..32 {
        expected_v1 = expected_v1 * 256 + cid_v1[i] as Field;
    }
    let mut expected_v2: Field = 0;
    for i in 0..32 {
        expected_v2 = expected_v2 * 256 + cid_v2[i] as Field;
    }

    assert_eq(v0_cid, expected_v0);
    assert_eq(v1_cid, expected_v1);
    assert_eq(v2_cid, expected_v2);
}

/// Test counterparty queries
#[test]
unconstrained fn test_counterparty_queries() {
    let (mut env, registry_address, admin) = utils::setup();

    let initial_cid = utils::create_test_cid(34);
    let counterparties: [Field; 5] = [
        100 as Field,
        200 as Field,
        300 as Field,
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

    // Query counterparties
    let cp0 = env.view_public(
        DocumentRegistry::at(registry_address).get_counterparty(document_id, 0),
    );
    let cp1 = env.view_public(
        DocumentRegistry::at(registry_address).get_counterparty(document_id, 1),
    );
    let cp2 = env.view_public(
        DocumentRegistry::at(registry_address).get_counterparty(document_id, 2),
    );

    assert_eq(cp0, 100);
    assert_eq(cp1, 200);
    assert_eq(cp2, 300);
}

/// Test signature detail queries
#[test]
unconstrained fn test_signature_detail_queries() {
    let (mut env, registry_address, admin) = utils::setup();

    let initial_cid = utils::create_test_cid(35);
    let signer_fpr = utils::create_test_fingerprint(123);
    let new_cid = utils::create_test_cid(36);

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

    // Add signature
    env.call_public(
        admin,
        DocumentRegistry::at(registry_address).add_signature(
            document_id,
            new_cid,
            signer_fpr,
            utils::create_test_tl_root(10),
            utils::create_test_tl_root(20),
            true,
        ),
    );

    // Query signature details
    let (fpr, order, cid_after, timestamp, proof_id) = env.view_public(
        DocumentRegistry::at(registry_address).get_signature(document_id, 0),
    );

    // Convert signer_fpr to Field
    let mut expected_fpr: Field = 0;
    for i in 0..32 {
        expected_fpr = expected_fpr * 256 + signer_fpr[i] as Field;
    }

    assert_eq(fpr, expected_fpr);
    assert_eq(order, 1);
    assert(timestamp > 0);
    assert(proof_id != 0); // Proof was anchored
}

/// Test document count
#[test]
unconstrained fn test_document_count() {
    let (mut env, registry_address, admin) = utils::setup();

    // Initial count should be 0
    let initial_count = env.view_public(
        DocumentRegistry::at(registry_address).get_document_count(),
    );
    assert_eq(initial_count, 0);

    // Create 3 documents
    for i in 0..3 {
        let cid = utils::create_test_cid((40 + i) as u8);
        let counterparties: [Field; 5] = [123 as Field, 0, 0, 0, 0];

        env.call_public(
            admin,
            DocumentRegistry::at(registry_address).create_document(
                cid,
                counterparties,
                false,
            ),
        );
    }

    // Count should be 3
    let final_count = env.view_public(
        DocumentRegistry::at(registry_address).get_document_count(),
    );
    assert_eq(final_count, 3);
}

/// Test proof anchoring integration
#[test]
unconstrained fn test_proof_anchoring() {
    let (mut env, registry_address, admin) = utils::setup();

    let initial_cid = utils::create_test_cid(43);
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

    // Add signature (should anchor proof)
    let new_cid = utils::create_test_cid(44);
    env.call_public(
        admin,
        DocumentRegistry::at(registry_address).add_signature(
            document_id,
            new_cid,
            signer_fpr,
            utils::create_test_tl_root(100),
            utils::create_test_tl_root(200),
            true,
        ),
    );

    // Check proof exists
    let proof_exists = env.view_public(
        DocumentRegistry::at(registry_address).get_proof_exists(
            initial_cid, // doc_hash = initial CID
            signer_fpr,
        ),
    );
    assert(proof_exists);

    // Check proof count incremented
    let proof_count = env.view_public(
        DocumentRegistry::at(registry_address).get_proof_count(),
    );
    assert_eq(proof_count, 1);
}

/// Test get initial and current CID
#[test]
unconstrained fn test_get_initial_and_current_cid() {
    let (mut env, registry_address, admin) = utils::setup();

    let initial_cid = utils::create_test_cid(45);
    let new_cid = utils::create_test_cid(46);
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

    // Initial CID should match
    let queried_initial = env.view_public(
        DocumentRegistry::at(registry_address).get_initial_cid(document_id),
    );
    let mut expected_initial: Field = 0;
    for i in 0..32 {
        expected_initial = expected_initial * 256 + initial_cid[i] as Field;
    }
    assert_eq(queried_initial, expected_initial);

    // Current CID should also match initially
    let queried_current_before = env.view_public(
        DocumentRegistry::at(registry_address).get_current_cid(document_id),
    );
    assert_eq(queried_current_before, expected_initial);

    // Add signature
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

    // Initial CID should remain unchanged
    let queried_initial_after = env.view_public(
        DocumentRegistry::at(registry_address).get_initial_cid(document_id),
    );
    assert_eq(queried_initial_after, expected_initial);

    // Current CID should be updated
    let queried_current_after = env.view_public(
        DocumentRegistry::at(registry_address).get_current_cid(document_id),
    );
    let mut expected_new: Field = 0;
    for i in 0..32 {
        expected_new = expected_new * 256 + new_cid[i] as Field;
    }
    assert_eq(queried_current_after, expected_new);
}

/// Test timestamps
#[test]
unconstrained fn test_timestamps() {
    let (mut env, registry_address, admin) = utils::setup();

    let initial_cid = utils::create_test_cid(47);
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

    // Check created_at timestamp
    let created_at = env.view_public(
        DocumentRegistry::at(registry_address).get_created_at(document_id),
    );
    assert(created_at > 0);

    // Check last_updated timestamp (should equal created_at initially)
    let last_updated_initial = env.view_public(
        DocumentRegistry::at(registry_address).get_last_updated(document_id),
    );
    assert_eq(last_updated_initial, created_at);

    // Add signature
    let signer_fpr = utils::create_test_fingerprint(123);
    env.call_public(
        admin,
        DocumentRegistry::at(registry_address).add_signature(
            document_id,
            utils::create_test_cid(48),
            signer_fpr,
            utils::create_test_tl_root(1),
            utils::create_test_tl_root(2),
            true,
        ),
    );

    // last_updated should be greater than or equal to created_at
    let last_updated_after = env.view_public(
        DocumentRegistry::at(registry_address).get_last_updated(document_id),
    );
    assert(last_updated_after >= created_at);
}
