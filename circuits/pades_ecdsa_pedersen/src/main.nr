use dep::std::ecdsa_secp256r1::verify_signature;

fn main(
    // Public inputs
    signed_attrs_hash: pub [u8; 32],  // SHA-256 digest of CMS SignedAttributes
    tl_root: pub Field,               // Merkle root of local allow-list (Pedersen hash)

    // Private inputs
    pub_key_x: [u8; 32],              // Public key X coordinate (big-endian)
    pub_key_y: [u8; 32],              // Public key Y coordinate (big-endian)
    signer_fpr: Field,                // Signer fingerprint as Field (Pedersen leaf)
    signature: [u8; 64],              // Signature (r || s, big-endian)
    merkle_path: [Field; 8],          // Merkle inclusion path (depth 8, Pedersen hashes)
    index: Field,                     // Leaf index in local tree
) {
    // 1. Verify ECDSA P-256 signature over signed_attrs_hash
    // ECDSA still uses byte arrays (no change here)
    let valid = verify_signature(pub_key_x, pub_key_y, signature, signed_attrs_hash);
    assert(valid, "ECDSA P-256 verification failed");

    // 2. Verify signer is in the local allow-list (Pedersen Merkle tree)
    let computed_root = compute_merkle_root_pedersen(signer_fpr, index, merkle_path);
    assert(computed_root == tl_root, "Signer not in local allow-list");
}

// Compute Merkle root using Pedersen
// Parameters:
// - leaf: Signer fingerprint as Field (SHA-256 cert hash converted to Field)
// - index: Position in the tree (0-255 for depth 8)
// - path: Array of sibling hashes from leaf to root
//
// Returns: Merkle root as Field
fn compute_merkle_root_pedersen(
    leaf: Field,
    index: Field,
    path: [Field; 8]
) -> Field {
    let mut current = leaf;
    let mut idx = index as u64;

    for i in 0..8 {
        let sibling = path[i];

        // Determine if current is left or right child
        let is_right = (idx & 1) != 0;

        current = if is_right {
            std::hash::pedersen_hash([sibling, current])
        } else {
            std::hash::pedersen_hash([current, sibling])
        };

        // Move to parent node
        idx = idx >> 1;
    }

    current
}
