# Checkpoint 2: Debugging PAdES Signature Verification

## Progress Since Last Checkpoint

### ✅ Fixed Extraction Issues
1. **Found main document signature** (was confusing with timestamp signature)
   - Main SignerInfo at CMS offset 1354
   - Signature value at offset 1354+685 = 2039
   - SignedAttributes at offset 1354+264 = 1618

2. **Extracted correct data:**
   - SignedAttributes hash: `7845d04fe7cc02af7f7b45e04440118ebd022ffd715eb74f82031de3de683e80`
   - Signature r: `5f774181f3d6909c7cf0f8b664f61fd9c92d50aefef0a616a32cdc79ff038742`
   - Signature s: `7a144c65718bbf4a5a7b6555c9677da4071696f938315825189731fff06ab370`
   - Public key x: `83db162f9d339482c2d4f638ce909581bd972626583718d3c7e5231cce78c1a5`
   - Public key y: `251449d534548cc8c93d4294c28baea40d7889f1384d477fdb0c011c18766319`

3. **Verified data integrity:**
   - ✅ messageDigest in SignedAttributes = `406b03a5...` matches doc_hash
   - ✅ Certificate fingerprints match (CMS embedded == separate .cer file)
   - ✅ Public key extracted correctly from P-256 cert
   - ✅ Signature is ECDSA-with-SHA256 as expected

## Current Blocker

### Signature Verification Fails Everywhere

**Status:** pdfsig validates ✅, but manual verification fails ❌

| Tool | Result |
|------|--------|
| pdfsig | ✅ "Signature is Valid" |
| OpenSSL cms -verify | ❌ "verification failure" |
| OpenSSL pkeyutl | ❌ "provider signature failure" |
| Noir circuit | ❌ "ECDSA P-256 verification failed" |

### Hypotheses

1. **CAdES vs CMS complexity**
   - PAdES uses CAdES (advanced electronic signatures)
   - pdfsig (libpoppler) handles CAdES correctly
   - OpenSSL might need additional handling

2. **Hash algorithm mismatch**
   - SignedAttributes use SHA-256
   - But signature might use different hash in combination?

3. **Encoding issue**
   - Big-endian vs little-endian?
   - Point compression?
   - DER encoding subtlety?

4. **Noir std library issue**
   - `std::ecdsa_secp256r1::verify_signature` might have bug
   - Or expects different input format

## Files Generated

```
out/
├── FINAL_signed_attrs.der        (409 bytes) - SignedAttributes with SET tag
├── FINAL_signed_attrs_hash.bin   (32 bytes)  - SHA-256 of above
├── FINAL_signed_attrs_hash.hex              - Hex: 7845d04f...
├── MAIN_sig.bin                  (64 bytes)  - r || s signature
├── MAIN_sig.json                            - JSON with r, s separately
├── pubkey.json                              - x, y coordinates
├── doc_hash.hex                             - ByteRange hash: 406b03a5...
└── cms_embedded_cert.pem                    - Certificate from CMS
```

## Next Steps to Unblock

### Option A: Debug Noir Implementation
1. Check Noir std library source for `ecdsa_secp256r1`
2. Create minimal test with known P-256 vectors
3. File bug if Noir implementation is wrong

### Option B: Use Node.js Crypto
1. Verify signature using Node.js `crypto` module
2. If it works, proves data is correct
3. Debug why Noir fails

### Option C: Re-extract with Proper Tool
1. Use `node-forge` or `@peculiar/x509` for full CAdES parsing
2. Let library handle all CAdES complexity
3. Extract validated signature components

### Option D: Generate New Test PDF
1. Create simple PDF with ECDSA P-256 signature (no timestamp)
2. Use that for POC instead
3. Come back to complex PAdES later

## Recommendation

**Try Option B first** (5 minutes) - use Node crypto to verify. If it works, we know data is good and Noir is the issue. If it fails, we know extraction is still wrong.

Then **Option C** (30 minutes) - proper CAdES library should handle this.

## Command to Resume

```bash
# Test with Node.js crypto
node --loader ts-node/esm -e "
import crypto from 'crypto';
import fs from 'fs';

const cert = crypto.createPublicKey(fs.readFileSync('out/cms_embedded_cert.pem'));
const sig = fs.readFileSync('out/MAIN_sig.bin');
const hash = fs.readFileSync('out/FINAL_signed_attrs_hash.bin');

try {
  const verify = crypto.verify(
    null, // prehashed
    hash,
    { key: cert, dsaEncoding: 'ieee-p1363' },
    sig
  );
  console.log('✅ VERIFIED:', verify);
} catch (e) {
  console.log('❌ FAILED:', e.message);
}
"
```
