use crate::AztecAnchor;
use crate::test::utils;

#[test]
unconstrained fn test_initializer() {
    let (mut env, anchor_contract_address, _admin) = utils::setup();

    // Check initial count is 0
    let count = env.view_public(AztecAnchor::at(anchor_contract_address).get_proof_count());
    assert_eq(count, 0);
}

#[test]
unconstrained fn test_anchor_proof() {
    let (mut env, anchor_contract_address, admin) = utils::setup();

    let doc_hash: [u8; 32] = [1; 32];
    let signer_fpr: [u8; 32] = [3; 32];
    let tl_root: [u8; 32] = [4; 32];
    let tl_root_eu: [u8; 32] = [5; 32];
    let eu_trust_enabled = true;

    env.call_public(
        admin,
        AztecAnchor::at(anchor_contract_address).anchor_proof(
            doc_hash,
            signer_fpr,
            tl_root,
            tl_root_eu,
            eu_trust_enabled,
        ),
    );

    let count = env.view_public(AztecAnchor::at(anchor_contract_address).get_proof_count());
    assert_eq(count, 1);
}

#[test]
unconstrained fn test_multiple_anchors() {
    let (mut env, anchor_contract_address, admin) = utils::setup();

    let doc_hash1: [u8; 32] = [1; 32];
    let doc_hash2: [u8; 32] = [2; 32];
    let signer_fpr: [u8; 32] = [4; 32];
    let tl_root: [u8; 32] = [5; 32];
    let tl_root_eu: [u8; 32] = [6; 32];
    let eu_trust_enabled = true;

    // Anchor first proof
    env.call_public(
        admin,
        AztecAnchor::at(anchor_contract_address).anchor_proof(
            doc_hash1,
            signer_fpr,
            tl_root,
            tl_root_eu,
            eu_trust_enabled,
        ),
    );

    // Anchor second proof
    env.call_public(
        admin,
        AztecAnchor::at(anchor_contract_address).anchor_proof(
            doc_hash2,
            signer_fpr,
            tl_root,
            tl_root_eu,
            eu_trust_enabled,
        ),
    );

    let count = env.view_public(AztecAnchor::at(anchor_contract_address).get_proof_count());
    assert_eq(count, 2);
}
