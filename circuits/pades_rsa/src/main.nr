use dep::noir_rsa::rsa::verify_sha256_pkcs1v15;
use dep::bignum::params::BigNumParams;
use dep::bignum::RuntimeBigNum;
use dep::pades_common::{sha256_signed_attrs, sha256_var, bytes32_to_field, assert_bytes_eq, compute_merkle_root_pedersen};
use dep::pades_common::der::extract_message_digest;
use dep::pades_common::MAX_SIGNED_ATTRS_LEN;

// RSA-2048 signature verification circuit for PAdES documents
// Supports PKCS#1 v1.5 padding with SHA-256
// Based on zkpassport/noir_rsa v0.9.2

fn main(
    // Public inputs
    doc_hash: pub [u8; 32],          // SHA-256 digest of PDF ByteRange
    signed_attrs_hash: pub [u8; 32],   // SHA-256 digest of CMS SignedAttributes
    tl_root: pub Field,                // Merkle root of local allow-list

    // Private inputs
    signed_attrs: [u8; MAX_SIGNED_ATTRS_LEN], // DER-encoded SignedAttributes (padded)
    signed_attrs_len: u32,            // Actual SignedAttributes length
    modulus_limbs: [u128; 18],
    redc_limbs: [u128; 18],
    signature_bytes: [u8; 256],
    exponent: u32,                     // RSA exponent (typically 65537)
    signer_fpr: Field,                 // Signer fingerprint as Field
    merkle_path: [Field; 8],           // Merkle inclusion path for local allow-list
    index: Field,                      // Leaf index in local tree
) {
    // 0. Bind SignedAttributes to doc_hash
    let computed_signed_attrs_hash = sha256_signed_attrs(signed_attrs, signed_attrs_len);
    assert_bytes_eq(computed_signed_attrs_hash, signed_attrs_hash);

    let message_digest = extract_message_digest(signed_attrs, signed_attrs_len);
    assert_bytes_eq(message_digest, doc_hash);

    // 0.1 Bind allow-list leaf to the signing key
    let rsa_key_bytes = serialize_rsa_key(modulus_limbs, exponent);
    let pubkey_hash = sha256_var(rsa_key_bytes, 292);
    let computed_fpr = bytes32_to_field(pubkey_hash);
    assert(computed_fpr == signer_fpr, "signer_fpr does not match public key");

    // Create BigNumParams for RSA-2048
    let params = BigNumParams::<18, 2048>::new(false, modulus_limbs, redc_limbs);
    
    // Convert signature bytes to RuntimeBigNum
    let signature = RuntimeBigNum::<18, 2048>::from_be_bytes(params, signature_bytes);
    
    // Verify RSA signature with explicit type parameters
    let valid = verify_sha256_pkcs1v15::<18, 2048>(signed_attrs_hash, signature, exponent);
    assert(valid, "RSA signature verification failed");

    // Merkle tree verification
    let computed_root = compute_merkle_root_pedersen(computed_fpr, index, merkle_path);
    assert(computed_root == tl_root, "Signer not in local allow-list");
}

fn limb_to_bytes_be(limb: u128) -> [u8; 16] {
    let mut out: [u8; 16] = [0u8; 16];
    let mut v = limb;
    for i in 0..16 {
        out[15 - i] = (v & 0xff) as u8;
        v = v >> 8;
    }
    out
}

fn serialize_rsa_key(modulus_limbs: [u128; 18], exponent: u32) -> [u8; 292] {
    let mut out: [u8; 292] = [0u8; 292];

    for i in 0..18 {
        let limb_bytes = limb_to_bytes_be(modulus_limbs[i]);
        let base = i * 16;
        for j in 0..16 {
            out[base + j] = limb_bytes[j];
        }
    }

    out[288] = (exponent >> 24) as u8;
    out[289] = (exponent >> 16) as u8;
    out[290] = (exponent >> 8) as u8;
    out[291] = exponent as u8;

    out
}
