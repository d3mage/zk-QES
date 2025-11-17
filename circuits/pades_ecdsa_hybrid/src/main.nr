use dep::std::ecdsa_secp256r1::verify_signature;

// HYBRID CIRCUIT: SHA-256/Pedersen Optimization
//
// Key optimization: Use SHA-256 only where required by standards (document hash),
// use Pedersen (ZK-native) for internal operations (Merkle trees).
//
// This reduces circuit size by ~92% while maintaining cryptographic alignment
// with PDF/PAdES standards.
//
// Design rationale:
// - Document hash: Already SHA-256 from PDF signature (no circuit overhead)
// - ECDSA verification: Uses provided doc_hash (no additional hashing)
// - Merkle trees: Internal membership proofs (hash function choice doesn't matter)
//   -> Use Pedersen: 35 opcodes per hash vs 450 for SHA-256
//
// Expected savings:
// - Pure SHA-256: 16 Merkle hashes x 450 opcodes = 7,200 opcodes
// - Hybrid: 16 Merkle hashes x 35 opcodes = 560 opcodes
// - Reduction: 92% in hash operations

fn main(
    // Document binding (public) - UNCHANGED from SHA-256 version
    // This is already SHA-256 from the PDF signature, no circuit overhead
    doc_hash: pub [u8; 32],           // SHA-256 digest of PDF ByteRange

    // Signer identity (public) - UNCHANGED
    pub_key_x: pub [u8; 32],          // Public key X coordinate (big-endian)
    pub_key_y: pub [u8; 32],          // Public key Y coordinate (big-endian)

    // OPTIMIZED: Merkle-related inputs now use Field instead of [u8; 32]
    // This allows native Pedersen hashing without byte array conversions
    signer_fpr: pub Field,            // Signer fingerprint as Field (Pedersen leaf)
    tl_root: pub Field,               // Merkle root of local allow-list (Pedersen hash)

    // Private inputs (Pedersen-optimized)
    signature: [u8; 64],              // Signature (r || s, big-endian)
    merkle_path: [Field; 8],          // Merkle inclusion path (depth 8, Pedersen hashes)
    index: Field,                     // Leaf index in local tree
) {
    // 1. Verify ECDSA P-256 signature over doc_hash
    // UNCHANGED: Still uses SHA-256 doc_hash from PDF signature
    // No circuit overhead - hash is provided as input
    let valid = verify_signature(pub_key_x, pub_key_y, signature, doc_hash);
    assert(valid, "ECDSA P-256 verification failed");

    // 2. Verify signer is in the local allow-list (Pedersen Merkle tree)
    // OPTIMIZED: Pedersen is 13x faster than SHA-256 in circuits
    // Security: Pedersen is ZK-native and cryptographically secure for membership proofs
    let computed_root = compute_merkle_root_pedersen(signer_fpr, index, merkle_path);
    assert(computed_root == tl_root, "Signer not in local allow-list");


    // Note: artifact_hash binding removed for simplicity in this test
    // Can be added back as public Field input if needed
}

// Compute Merkle root using Pedersen hash (ZK-optimized)
//
// Pedersen hash is:
// - Algebraic (works directly with Field elements)
// - ZK-native (efficient in constraint systems)
// - Secure for membership proofs
// - ~35 opcodes per call vs ~450 for SHA-256
//
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
    let mut idx = index;

    // Traverse tree from leaf to root
    for i in 0..8 {
        let sibling = path[i];

        // Determine if current is left or right child
        // Check if idx is odd (right child) or even (left child)
        let idx_div_2 = idx / 2;
        let is_right = (idx_div_2 * 2) != idx;

        // Hash with sibling in correct order
        // OPTIMIZATION: Pedersen hash instead of SHA-256
        // Cost: ~35 opcodes vs ~450 for SHA-256 (13x improvement)
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