use dep::std::ecdsa_secp256r1::verify_signature;

// Pedersen version of pades_ecdsa circuit

fn main(
    doc_hash: pub [u8; 32],           // SHA-256 digest of PDF ByteRange

    // Signer identity (public)
    pub_key_x: pub [u8; 32],          // Public key X coordinate (big-endian)
    pub_key_y: pub [u8; 32],          // Public key Y coordinate (big-endian)

    signer_fpr: pub Field,            // Signer fingerprint as Field (Pedersen leaf)
    tl_root: pub Field,               // Merkle root of local allow-list (Pedersen hash)

    // Private inputs
    signature: [u8; 64],              // Signature (r || s, big-endian)
    merkle_path: [Field; 8],          // Merkle inclusion path (depth 8, Pedersen hashes)
    index: Field,                     // Leaf index in local tree

) {
    // 1. Verify ECDSA P-256 signature over doc_hash
    // ECDSA still uses byte arrays (no change here)
    let valid = verify_signature(pub_key_x, pub_key_y, signature, doc_hash);
    assert(valid, "ECDSA P-256 verification failed");

    // 2. Verify signer is in the local allow-list (Pedersen Merkle tree)
    let computed_root = compute_merkle_root_pedersen(signer_fpr, index, merkle_path);
    assert(computed_root == tl_root, "Signer not in local allow-list");
}

// Compute Merkle root using Pedersen
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
        let is_right = (idx as u64 & 1) != 0;

        // Uses Pedersen for simplicity and compatibility
        current = if is_right {
            std::hash::pedersen_hash([sibling, current])
        } else {
            std::hash::pedersen_hash([current, sibling])
        };

        // Move to next level (divide index by 2)
        idx = idx / 2;
    }

    current
}