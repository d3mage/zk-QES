use crate::MAX_SIGNED_ATTRS_LEN;

global OID_MESSAGE_DIGEST: [u8; 9] = [
    0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x04,
];

global MAX_ATTRS: u32 = 16;

fn read_byte(attrs: [u8; MAX_SIGNED_ATTRS_LEN], attrs_len: u32, idx: u32) -> u8 {
    assert(idx < attrs_len, "DER index out of bounds");
    attrs[idx]
}

fn parse_len(attrs: [u8; MAX_SIGNED_ATTRS_LEN], attrs_len: u32, idx: u32) -> (u32, u32) {
    let first = read_byte(attrs, attrs_len, idx);
    let mut len: u32 = 0;
    let mut len_bytes: u32 = 1;

    if first < 0x80 {
        len = first as u32;
    } else {
        let is_81 = first == 0x81;
        let is_82 = first == 0x82;
        assert(is_81 | is_82, "Unsupported DER length");

        if is_81 {
            let b1 = read_byte(attrs, attrs_len, idx + 1);
            len = b1 as u32;
            len_bytes = 2;
        }
        if is_82 {
            let b1 = read_byte(attrs, attrs_len, idx + 1);
            let b2 = read_byte(attrs, attrs_len, idx + 2);
            len = ((b1 as u32) << 8) | (b2 as u32);
            len_bytes = 3;
        }
    }

    (len, len_bytes)
}

fn oid_matches(attrs: [u8; MAX_SIGNED_ATTRS_LEN], attrs_len: u32, start: u32, len: u32) -> bool {
    let mut ok = len == 9;

    if len == 9 {
        for i in 0..9 {
            let b = read_byte(attrs, attrs_len, start + i);
            ok = ok & (b == OID_MESSAGE_DIGEST[i]);
        }
    }

    ok
}

pub fn extract_message_digest(attrs: [u8; MAX_SIGNED_ATTRS_LEN], attrs_len: u32) -> [u8; 32] {
    assert(attrs_len <= MAX_SIGNED_ATTRS_LEN, "signed_attrs_len exceeds MAX_SIGNED_ATTRS_LEN");

    let tag = read_byte(attrs, attrs_len, 0);
    assert(tag == 0x31, "SignedAttributes must start with SET");

    let (set_len, set_len_bytes) = parse_len(attrs, attrs_len, 1);
    let set_start = 1 + set_len_bytes;
    let set_end = set_start + set_len;
    assert(set_end <= attrs_len, "SignedAttributes SET length out of bounds");

    let mut cursor: u32 = set_start;
    let mut found: bool = false;
    let mut digest: [u8; 32] = [0u8; 32];

    for _ in 0..MAX_ATTRS {
        let should_parse = (cursor < set_end) & (found == false);
        if should_parse {
            let seq_tag = read_byte(attrs, attrs_len, cursor);
            assert(seq_tag == 0x30, "Expected SEQUENCE in SignedAttributes");

            let (seq_len, seq_len_bytes) = parse_len(attrs, attrs_len, cursor + 1);
            let seq_start = cursor + 1 + seq_len_bytes;
            let seq_end = seq_start + seq_len;
            assert(seq_end <= set_end, "SEQUENCE length out of bounds");

            let oid_tag = read_byte(attrs, attrs_len, seq_start);
            assert(oid_tag == 0x06, "Expected OID in SignedAttributes");

            let (oid_len, oid_len_bytes) = parse_len(attrs, attrs_len, seq_start + 1);
            let oid_start = seq_start + 1 + oid_len_bytes;

            if oid_matches(attrs, attrs_len, oid_start, oid_len) {
                let val_set_tag = read_byte(attrs, attrs_len, oid_start + oid_len);
                assert(val_set_tag == 0x31, "Expected SET for messageDigest value");

                let (val_set_len, val_set_len_bytes) =
                    parse_len(attrs, attrs_len, oid_start + oid_len + 1);
                let val_set_start = oid_start + oid_len + 1 + val_set_len_bytes;
                let val_set_end = val_set_start + val_set_len;
                assert(val_set_end <= seq_end, "Value SET length out of bounds");

                let oct_tag = read_byte(attrs, attrs_len, val_set_start);
                assert(oct_tag == 0x04, "Expected OCTET STRING for messageDigest");

                let (oct_len, oct_len_bytes) = parse_len(attrs, attrs_len, val_set_start + 1);
                assert(oct_len == 32, "messageDigest must be 32 bytes");
                let oct_start = val_set_start + 1 + oct_len_bytes;

                for i in 0..32 {
                    digest[i] = read_byte(attrs, attrs_len, oct_start + i);
                }

                found = true;
            }

            cursor = seq_end;
        }
    }

    assert(found, "messageDigest attribute not found");
    digest
}
