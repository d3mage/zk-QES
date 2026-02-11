pub mod der;

// Keep in sync with TS constant in src/common/pades.ts
pub global MAX_SIGNED_ATTRS_LEN: u32 = 512;

pub use dep::sha256::sha256_var;

pub fn sha256_signed_attrs(
    signed_attrs: [u8; MAX_SIGNED_ATTRS_LEN],
    signed_attrs_len: u32
) -> [u8; 32] {
    sha256_var(signed_attrs, signed_attrs_len as u64)
}

pub fn bytes32_to_field(bytes: [u8; 32]) -> Field {
    let mut acc: Field = 0;
    for i in 0..32 {
        acc = acc * 256 + (bytes[i] as Field);
    }
    acc
}

pub fn assert_bytes_eq(a: [u8; 32], b: [u8; 32]) {
    for i in 0..32 {
        assert(a[i] == b[i], "byte mismatch");
    }
}

pub fn concat_pubkey(x: [u8; 32], y: [u8; 32]) -> [u8; 64] {
    let mut out: [u8; 64] = [0u8; 64];
    for i in 0..32 {
        out[i] = x[i];
        out[i + 32] = y[i];
    }
    out
}

pub fn compute_merkle_root_pedersen(
    leaf: Field,
    index: Field,
    path: [Field; 8]
) -> Field {
    let mut current = leaf;
    let mut idx = index as u64;
    assert(idx < 256, "index out of range");

    for i in 0..8 {
        let sibling = path[i];
        let is_right = (idx & 1) != 0;

        current = if is_right {
            std::hash::pedersen_hash([sibling, current])
        } else {
            std::hash::pedersen_hash([current, sibling])
        };

        idx >>= 1;
    }

    current
}
