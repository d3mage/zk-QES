use dep::noir_rsa::rsa::verify_sha256_pkcs1v15;
use dep::noir_rsa::types::RBN2048;

// RSA-2048 signature verification circuit for PAdES documents
// Supports PKCS#1 v1.5 padding with SHA-256
// Based on zkpassport/noir_rsa v0.9.1

fn main(
    // Document binding (public)
    doc_hash: pub [u8; 32],           // SHA-256 digest of PDF ByteRange

    // RSA-2048 signature and exponent (private/public as needed)
    // The signature includes the modulus implicitly
    // For RSA-2048: signature is 256 bytes
    signature: pub RBN2048,           // RSA-2048 signature (PKCS#1 v1.5)
    exponent: pub u32,                // RSA exponent (typically 65537)

    // Trust list inputs (using Pedersen for efficiency)
    signer_fpr: pub Field,            // Signer fingerprint as Field
    tl_root: pub Field,               // Merkle root of local allow-list

    // EU Trust List support
    eu_trust_enabled: pub bool,       // Feature flag for EU trust verification
    tl_root_eu: pub Field,            // Merkle root of EU qualified CAs

    // Private inputs for Merkle proofs
    merkle_path: [Field; 8],          // Merkle inclusion path for local allow-list
    index: Field,                     // Leaf index in local tree
    eu_merkle_path: [Field; 8],       // Merkle inclusion path for EU trust list
    eu_index: Field                   // Leaf index in EU tree
) {
    // 1. Verify RSA-2048 signature over doc_hash using PKCS#1 v1.5
    // noir_rsa expects: msg_hash, signature, exponent
    let valid = verify_sha256_pkcs1v15(doc_hash, signature, exponent);
    assert(valid, "RSA signature verification failed");

    // 2. Verify signer is in the local allow-list (Pedersen Merkle tree)
    let computed_root = compute_merkle_root_pedersen(signer_fpr, index, merkle_path);
    assert(computed_root == tl_root, "Signer not in local allow-list");

    // 3. Optional: Verify signer is also in EU Trust List (Pedersen)
    if eu_trust_enabled {
        let computed_eu_root = compute_merkle_root_pedersen(signer_fpr, eu_index, eu_merkle_path);
        assert(computed_eu_root == tl_root_eu, "Signer not in EU Trust List");
    }
}

// Compute Merkle root using Pedersen hash (ZK-optimized)
fn compute_merkle_root_pedersen(
    leaf: Field,
    index: Field,
    path: [Field; 8]
) -> Field {
    let mut current = leaf;
    let mut idx = index;

    for i in 0..8 {
        let sibling = path[i];

        // Determine if current is left or right child
        let idx_div_2 = idx / 2;
        let is_right = (idx_div_2 * 2) != idx;

        // Hash with sibling in correct order using Pedersen
        current = if is_right {
            std::hash::pedersen_hash([sibling, current])
        } else {
            std::hash::pedersen_hash([current, sibling])
        };

        // Move to parent node
        idx = idx_div_2;
    }

    current
}
