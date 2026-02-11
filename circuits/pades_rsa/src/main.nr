use dep::noir_rsa::rsa::verify_sha256_pkcs1v15;
use dep::bignum::params::BigNumParams;
use dep::bignum::RuntimeBigNum;

// RSA-2048 signature verification circuit for PAdES documents
// Supports PKCS#1 v1.5 padding with SHA-256
// Based on zkpassport/noir_rsa v0.9.2

fn main(
    // Public inputs
    signed_attrs_hash: pub [u8; 32],   // SHA-256 digest of CMS SignedAttributes
    tl_root: pub Field,                // Merkle root of local allow-list

    // Private inputs
    modulus_limbs: [u128; 18],
    redc_limbs: [u128; 18],
    signature_bytes: [u8; 256],
    exponent: u32,                     // RSA exponent (typically 65537)
    signer_fpr: Field,                 // Signer fingerprint as Field
    merkle_path: [Field; 8],           // Merkle inclusion path for local allow-list
    index: Field,                      // Leaf index in local tree
) {
    // Create BigNumParams for RSA-2048
    let params = BigNumParams::<18, 2048>::new(false, modulus_limbs, redc_limbs);
    
    // Convert signature bytes to RuntimeBigNum
    let signature = RuntimeBigNum::<18, 2048>::from_be_bytes(params, signature_bytes);
    
    // Verify RSA signature with explicit type parameters
    let valid = verify_sha256_pkcs1v15::<18, 2048>(signed_attrs_hash, signature, exponent);
    assert(valid, "RSA signature verification failed");

    // Merkle tree verification
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
