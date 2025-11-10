# Checkpoint: POC PAdES + Noir Proof - 2025-10-23

## Task Overview
Building end-to-end POC for:
1. PAdES-signed PDF signature extraction
2. ECDSA P-256 verification in Noir circuit
3. Zero-knowledge proof generation
4. Encrypted PDF exchange via IPFS

## ✅ Completed

### 1. Infrastructure Setup
- ✅ Project structure created (`circuits/`, `out/`, `scripts/`)
- ✅ Dependencies installed (Noir.js, bb.js, pdf-lib, ASN.1, IPFS)
- ✅ Package.json configured with task scripts

### 2. Certificate Verification
- ✅ Confirmed test certificate is ECDSA P-256 (prime256v1)
- ✅ Public key: `x=83db162f...c1a5`, `y=251449d5...6319`
- ✅ Location: `test_files/EU-6669243D2B04331D0400000014EB9900F741B404.cer`

### 3. Noir Circuit
- ✅ Created `circuits/pades_ecdsa/src/main.nr`
- ✅ Uses `std::ecdsa_secp256r1::verify_signature`
- ✅ Inputs: `msg_hash[32]`, `pub_key_x[32]`, `pub_key_y[32]`, `signature[64]`
- ✅ Circuit compiles successfully with `nargo check`
- ✅ File: `circuits/pades_ecdsa/src/main.nr`

### 4. Scripts Implemented

#### `scripts/hash-byte-range.ts` ✅
- Extracts `/ByteRange` from PDF
- Computes SHA-256 of signed bytes
- Output: `out/doc_hash.bin`, `out/doc_hash.hex`
- Result: `406b03a5699da89d0fa80172f02e1dc07c02089a7cad12025d5cb760950c40d3`

#### `scripts/extract-cms.ts` ✅
- Parses CMS SignedData from PDF `/Contents`
- Extracts ECDSA signature (r, s)
- Extracts public key from certificate
- Outputs: `out/sig.json`, `out/pubkey.json`, `out/sig.bin`, `out/pubkey.bin`
- Signature: `a24a2b0a9b95995da5f955b15766dd9e3835c244871cafb80c49f37c2819504c2066d465b6d5e286201588de91c6ca4de1d224f2bdb8de9f7c378b2d5aea6233`

#### `scripts/prove.ts` ✅
- Loads circuit and inputs
- Uses `@noir-lang/noir_js` + `@aztec/bb.js` (v1.0.0-beta.3 / 0.82.2)
- Generates witness and proof via Barretenberg backend
- File created and tested (signature verification failing - see blockers)

#### `scripts/extract-signed-attrs.ts` ✅
- Extracts SignedAttributes from CMS
- Converts A0 tag to SET (0x31) for hashing
- Computes SHA-256(SignedAttributes) - the actual signed message in PAdES
- Output: `out/signed_attrs_hash.hex` = `981e524955112b5a19a0d55490d025a374f347b0e5013ef131daf24b40ae1556`

### 5. Outputs Generated
```
out/
├── doc_hash.bin (32 bytes)
├── doc_hash.hex
├── pubkey.bin (64 bytes: x || y)
├── pubkey.json
├── sig.bin (64 bytes: r || s)
├── sig.json
├── signed_attrs.der (434 bytes)
├── signed_attrs_hash.bin (32 bytes)
├── signed_attrs_hash.hex
└── cms.der (10240 bytes)
```

## 🚧 Current Blocker

### PAdES Signature Verification Failing
**Issue:** ECDSA verification fails in both:
- Noir circuit execution
- OpenSSL verification

**Root Cause:** Complex PAdES structure with embedded timestamp signatures
- PDF contains TSA (Time-Stamp Authority) signature in addition to main signature
- SignedAttributes structure at offset 2543 in CMS
- Need to identify correct SignerInfo (main document vs timestamp)

**Evidence:**
- Found SignedAttributes: offset 2543, 434 bytes
- messageDigest in SignedAttributes: `52E332BEC7B892A730B43F5D405275856322D3C09FBD947FB9B5C3797A817F4E`
- Document hash (ByteRange): `406b03a5699da89d0fa80172f02e1dc07c02089a7cad12025d5cb760950c40d3`
- ❌ Mismatch indicates timestamp or nested structure

## ⏭️ Next Steps (Priority Order)

### High Priority
1. **Fix Signature Extraction**
   - Parse CMS to find main SignerInfo (not timestamp)
   - Locate correct SignedAttributes for document signature
   - Verify `messageDigest` attribute matches `doc_hash`
   - Extract correct signature value from matching SignerInfo

2. **Test with Known Vectors**
   - Option A: Create simple ECDSA P-256 test with known signature
   - Option B: Generate new PAdES PDF without timestamp
   - Verify circuit works with clean test data

### Medium Priority
3. **Implement `scripts/verify.ts`**
   - Loads proof from `out/proof.bin`
   - Verifies with Barretenberg backend
   - Returns pass/fail

4. **Implement IPFS Exchange**
   - `scripts/encrypt-upload.ts`: ECIES + AES-GCM + IPFS upload
   - `scripts/decrypt.ts`: Fetch + decrypt + verify hash

### Low Priority
5. **End-to-End Test**
   - Full runbook A→B→A exchange
   - JSON transcript to `out/run-log.json`

6. **Documentation**
   - Update README with working commands
   - Troubleshooting guide
   - Dependency installation instructions

## Technical Notes

### Noir Version Compatibility
- Using `nargo 1.0.0-beta.3` (local installation)
- Matching `@noir-lang/noir_js@1.0.0-beta.3`
- Backend: `@aztec/bb.js@0.82.2` (not `@noir-lang/backend_barretenberg`)
- Circuit compiles but witness generation fails on invalid signature

### PAdES Structure Insights
```
CMS SignedData (10240 bytes)
├── SignedData version=1
├── DigestAlgorithms: sha256
├── ContentInfo: pkcs7-data
├── Certificates (issuer chain)
├── SignerInfo #1 (document signature)
│   ├── SignerIdentifier
│   ├── DigestAlgorithm: sha256
│   ├── SignedAttributes [A0] → SET [31] for hashing
│   │   ├── contentType
│   │   ├── signingTime
│   │   ├── messageDigest (should match doc_hash)
│   │   └── signingCertificateV2
│   └── SignatureValue (ECDSA-with-SHA256)
└── SignerInfo #2 (timestamp signature - RFC 3161)
    └── ... (nested TSA signature)
```

### Commands to Run
```bash
# Extract data
yarn hash-byte-range test_files/sample_signed.pdf
yarn extract-cms test_files/sample_signed.pdf test_files/EU-*.cer

# Generate proof (currently fails)
yarn prove

# Compile circuit manually
cd circuits/pades_ecdsa && nargo compile
```

## Files Modified
- `package.json` - added dependencies and scripts
- `.gitignore` - added `out/`, `*.bin`, `*.hex`
- Created: `circuits/pades_ecdsa/`
- Created: `scripts/hash-byte-range.ts`
- Created: `scripts/extract-cms.ts`
- Created: `scripts/prove.ts`
- Created: `scripts/extract-signed-attrs.ts`

## Test Files Available
- `test_files/sample.pdf` (unsigned, 18810 bytes)
- `test_files/sample_signed.pdf` (signed with PAdES-T, 51128 bytes)
- `test_files/EU-6669243D2B04331D0400000014EB9900F741B404.cer` (ECDSA P-256 cert)

## Estimated Completion
- **Current:** ~60% complete
- **Blocked on:** Signature extraction from complex PAdES structure
- **Time to unblock:** 2-4 hours (CMS parsing + test vectors)
- **Remaining work:** 6-10 hours (IPFS, verification, testing)
