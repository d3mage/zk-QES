use dep::std::ecdsa_secp256r1::verify_signature;
use dep::pades_common::{
    sha256_signed_attrs,
    sha256_var,
    bytes32_to_field,
    assert_bytes_eq,
    concat_pubkey,
    compute_merkle_root_pedersen
};
use dep::pades_common::der::extract_message_digest;
use dep::pades_common::MAX_SIGNED_ATTRS_LEN;

fn main(
    // Public inputs
    doc_hash: pub [u8; 32],          // SHA-256 digest of PDF ByteRange
    signed_attrs_hash: pub [u8; 32],  // SHA-256 digest of CMS SignedAttributes
    tl_root: pub Field,               // Merkle root of local allow-list (Pedersen hash)

    // Private inputs
    signed_attrs: [u8; MAX_SIGNED_ATTRS_LEN], // DER-encoded SignedAttributes (padded)
    signed_attrs_len: u32,            // Actual SignedAttributes length
    pub_key_x: [u8; 32],              // Public key X coordinate (big-endian)
    pub_key_y: [u8; 32],              // Public key Y coordinate (big-endian)
    signer_fpr: Field,                // Signer fingerprint as Field (Pedersen leaf)
    signature: [u8; 64],              // Signature (r || s, big-endian)
    merkle_path: [Field; 8],          // Merkle inclusion path (depth 8, Pedersen hashes)
    index: Field,                     // Leaf index in local tree
) {
    // 0. Bind SignedAttributes to doc_hash
    let computed_signed_attrs_hash = sha256_signed_attrs(signed_attrs, signed_attrs_len);
    assert_bytes_eq(computed_signed_attrs_hash, signed_attrs_hash);

    let message_digest = extract_message_digest(signed_attrs, signed_attrs_len);
    assert_bytes_eq(message_digest, doc_hash);

    // 0.1 Bind allow-list leaf to the signing key
    let pubkey_bytes = concat_pubkey(pub_key_x, pub_key_y);
    let pubkey_hash = sha256_var(pubkey_bytes, 64);
    let computed_fpr = bytes32_to_field(pubkey_hash);
    assert(computed_fpr == signer_fpr, "signer_fpr does not match public key");

    // 1. Verify ECDSA P-256 signature over signed_attrs_hash
    // ECDSA still uses byte arrays (no change here)
    let valid = verify_signature(pub_key_x, pub_key_y, signature, signed_attrs_hash);
    assert(valid, "ECDSA P-256 verification failed");

    // 2. Verify signer is in the local allow-list (Pedersen Merkle tree)
    let computed_root = compute_merkle_root_pedersen(computed_fpr, index, merkle_path);
    assert(computed_root == tl_root, "Signer not in local allow-list");
}
