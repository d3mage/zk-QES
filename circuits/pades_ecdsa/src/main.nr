use dep::std::ecdsa_secp256r1::verify_signature;
use dep::std::hash::sha256;

fn main(
    // Document and artifact binding (all public)
    doc_hash: pub [u8; 32],           // SHA-256 digest of PDF ByteRange
    artifact_hash: pub [u8; 32],      // SHA-256 of ciphertext or CID

    // Signer identity and trust list (public)
    pub_key_x: pub [u8; 32],          // Public key X coordinate (big-endian)
    pub_key_y: pub [u8; 32],          // Public key Y coordinate (big-endian)
    signer_fpr: pub [u8; 32],         // SHA-256(cert-der)
    tl_root: pub [u8; 32],            // Merkle root of local allow-list (SHA-256 hash)

    // EU Trust List support (optional, Task 3)
    eu_trust_enabled: pub bool,       // Feature flag for EU trust verification
    tl_root_eu: pub [u8; 32],         // Merkle root of EU qualified CAs

    // Private inputs
    signature: [u8; 64],              // Signature (r || s, big-endian)
    merkle_path: [[u8; 32]; 8],       // Merkle inclusion path for local allow-list (depth 8)
    index: Field,                     // Leaf index in local tree
    eu_merkle_path: [[u8; 32]; 8],    // Merkle inclusion path for EU trust list
    eu_index: Field                   // Leaf index in EU tree
) {
    // 1. Verify ECDSA P-256 signature over doc_hash
    let valid = verify_signature(pub_key_x, pub_key_y, signature, doc_hash);
    assert(valid, "ECDSA P-256 verification failed");

    // 2. Verify signer is in the local allow-list (Merkle tree)
    // Compute expected root from leaf and path using SHA-256
    let computed_root = compute_merkle_root_sha256(signer_fpr, index, merkle_path);

    // Compare byte arrays directly
    assert(computed_root == tl_root, "Signer not in local allow-list");

    // 3. Optional: Verify signer is also in EU Trust List
    // This provides dual trust verification: local allowlist AND EU qualified status
    if eu_trust_enabled {
        let computed_eu_root = compute_merkle_root_sha256(signer_fpr, eu_index, eu_merkle_path);
        assert(computed_eu_root == tl_root_eu, "Signer not in EU Trust List");
    }

    // 4. artifact_hash is public and bound to the proof
    // Binding is enforced by making it a public input
    // The verifier must check that artifact_hash matches the actual ciphertext/CID hash
    // No explicit constraint needed - public input provides the binding
}

// Helper: convert 32-byte array to Field (big-endian interpretation)
// For Merkle tree operations
fn bytes_to_field(bytes: [u8; 32]) -> Field {
    let mut result: Field = 0;
    let mut multiplier: Field = 1;

    // Process bytes in reverse (little-endian accumulation from big-endian input)
    for i in 0..32 {
        let byte_idx = 31 - i;
        result = result + (bytes[byte_idx] as Field) * multiplier;
        multiplier = multiplier * 256;
    }

    result
}

// Compute Merkle root from leaf, index, and sibling path using SHA-256
// Merkle path is provided as Field elements (converted from 32-byte hashes)
fn compute_merkle_root_sha256(
    leaf: [u8; 32],
    index: Field,
    path: [[u8; 32]; 8]
) -> [u8; 32] {
    let mut current = leaf;
    let mut idx = index;

    for i in 0..8 {
        let sibling = path[i];

        // Determine if current is left or right child
        // index bit determines position: 0 = left, 1 = right
        let is_right = (idx as u64 & 1) as bool;

        // Hash with sibling in correct order
        current = if is_right {
            hash_pair_sha256(sibling, current)
        } else {
            hash_pair_sha256(current, sibling)
        };

        // Move to next level (divide index by 2)
        idx = idx / 2;
    }

    current
}

// Hash a pair of 32-byte values using SHA-256
fn hash_pair_sha256(left: [u8; 32], right: [u8; 32]) -> [u8; 32] {
    let mut input = [0; 64];

    for i in 0..32 {
        input[i] = left[i];
        input[i + 32] = right[i];
    }

    sha256(input)
}

// Convert Field to 32-byte array (big-endian)
fn field_to_bytes(field: Field) -> [u8; 32] {
    let mut bytes = [0; 32];
    let mut value = field;

    // Convert field to bytes (big-endian)
    for i in 0..32 {
        let byte_idx = 31 - i;
        bytes[byte_idx] = (value as u8);
        value = value / 256;
    }

    bytes
}
