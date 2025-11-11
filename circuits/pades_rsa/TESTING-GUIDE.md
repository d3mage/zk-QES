# RSA Circuit Testing Guide

## What You Need to Run & Verify

### 1. Extract RSA Signature from PDF

First, you need a **PAdES-signed PDF with RSA-2048 signature**.

```bash
# Use existing script to extract RSA signature
yarn extract-cms signed_document.pdf
```

This should output:
- `out/VERIFIED_pubkey.json` - RSA public key (modulus + exponent)
- `out/VERIFIED_sig.json` - RSA signature bytes
- `out/doc_hash.hex` - SHA-256 of PDF ByteRange

### 2. Convert RSA Data to Circuit Format

The circuit needs inputs in specific formats:

#### Required Script: `scripts/prepare-rsa-inputs.ts`

```typescript
import fs from 'fs';
import crypto from 'crypto';

// Convert RSA signature to RBN2048 format
function rsaToRBN2048(signature: Buffer, modulus: Buffer) {
  // RSA-2048: 18 limbs of ~120 bits each
  const NUM_LIMBS = 18;
  const LIMB_BITS = 120;
  
  // Convert signature bytes to limbs
  const sigLimbs = bytesToLimbs(signature, NUM_LIMBS, LIMB_BITS);
  const modLimbs = bytesToLimbs(modulus, NUM_LIMBS, LIMB_BITS);
  
  // Calculate modulus parameters (required by noir-bignum)
  const doubleModulus = calculateDoubleModulus(modLimbs);
  const redcParam = calculateRedcParam(modLimbs);
  
  return {
    limbs: sigLimbs,
    params: {
      modulus: modLimbs,
      double_modulus: doubleModulus,
      redc_param: redcParam,
      has_multiplicative_inverse: true
    }
  };
}

function bytesToLimbs(bytes: Buffer, numLimbs: number, limbBits: number): string[] {
  // Convert big-endian bytes to limbs
  // Each limb is a 120-bit number (fits in Field)
  const limbs: string[] = [];
  const bytesPerLimb = Math.ceil(limbBits / 8);
  
  for (let i = 0; i < numLimbs; i++) {
    const start = i * bytesPerLimb;
    const end = Math.min(start + bytesPerLimb, bytes.length);
    const limbBytes = bytes.slice(start, end);
    
    // Convert to bigint
    let limbValue = 0n;
    for (const byte of limbBytes) {
      limbValue = (limbValue << 8n) | BigInt(byte);
    }
    
    limbs.push(limbValue.toString());
  }
  
  return limbs;
}

function calculateDoubleModulus(modLimbs: string[]): string[] {
  // 2 * modulus (for Montgomery reduction)
  const mod = limbsToBigInt(modLimbs);
  const doubleMod = mod * 2n;
  return bigIntToLimbs(doubleMod, modLimbs.length);
}

function calculateRedcParam(modLimbs: string[]): string[] {
  // R^2 mod N for Montgomery reduction
  // R = 2^(LIMB_BITS * NUM_LIMBS)
  const mod = limbsToBigInt(modLimbs);
  const R = 2n ** BigInt(120 * modLimbs.length);
  const R2 = (R * R) % mod;
  return bigIntToLimbs(R2, modLimbs.length);
}

function limbsToBigInt(limbs: string[]): bigint {
  let result = 0n;
  for (let i = limbs.length - 1; i >= 0; i--) {
    result = (result << 120n) | BigInt(limbs[i]);
  }
  return result;
}

function bigIntToLimbs(value: bigint, numLimbs: number): string[] {
  const limbs: string[] = [];
  const mask = (1n << 120n) - 1n;
  
  for (let i = 0; i < numLimbs; i++) {
    limbs.push((value & mask).toString());
    value >>= 120n;
  }
  
  return limbs;
}

// Main execution
const pubkey = JSON.parse(fs.readFileSync('out/VERIFIED_pubkey.json', 'utf-8'));
const sig = JSON.parse(fs.readFileSync('out/VERIFIED_sig.json', 'utf-8'));
const docHash = fs.readFileSync('out/doc_hash.bin');

// Convert to circuit format
const signature = rsaToRBN2048(
  Buffer.from(sig.signature, 'hex'),
  Buffer.from(pubkey.n, 'hex')
);

// Build Prover.toml
const proverToml = {
  doc_hash: Array.from(docHash).map(b => b.toString()),
  signature,
  exponent: pubkey.e || 65537,
  
  // Trust list inputs (get from Merkle tools)
  signer_fpr: calculateFingerprint(pubkey),
  tl_root: fs.readFileSync('out/tl_root_pedersen.hex', 'utf-8'),
  
  // Merkle path (from tools/merkle-poseidon/prove.ts)
  merkle_path: JSON.parse(fs.readFileSync('out/paths/merkle_path.json', 'utf-8')),
  index: "0",
  
  // EU trust (optional)
  eu_trust_enabled: false,
  tl_root_eu: "0",
  eu_merkle_path: ["0", "0", "0", "0", "0", "0", "0", "0"],
  eu_index: "0"
};

fs.writeFileSync('circuits/pades_rsa/Prover.toml', 
  formatToml(proverToml));

console.log('✅ Prover.toml generated for RSA circuit');
```

### 3. Build Trust Lists (Pedersen Merkle Trees)

The RSA circuit uses Pedersen hashes (not SHA-256):

```bash
# Need to update merkle builder to support Pedersen
# Or create new tool: tools/merkle-pedersen/build.ts

yarn merkle:build:pedersen allowlist.json --out out
# Outputs: out/tl_root_pedersen.hex
```

### 4. Generate Proof

```bash
cd circuits/pades_rsa

# Generate witness
nargo execute

# Generate proof with bb
bb prove -b target/pades_rsa.json -w target/pades_rsa.gz -o proof

# Expected time: 100-150 seconds (1.5-2.5 minutes)
```

### 5. Verify Proof

```bash
# Write verification key
bb write_vk -b target/pades_rsa.json -o vk

# Verify proof
bb verify -k vk -p proof

# Expected time: 10-20 seconds
```

## What's Missing Currently

### ❌ Not Yet Implemented

1. **RSA Signature Extraction**
   - Current `extract-cms.ts` extracts ECDSA
   - Need to detect signature algorithm
   - Extract RSA modulus (n) and signature bytes

2. **RBN2048 Converter**
   - Script to convert RSA signature → RuntimeBigNum format
   - Calculate Montgomery reduction parameters
   - Handle 18 limbs × 120 bits each

3. **Pedersen Merkle Builder**
   - Current merkle tools use SHA-256
   - Need Pedersen version for RSA circuit
   - Must match `std::hash::pedersen_hash` in circuit

4. **RSA Prover Script**
   - Combine all steps: extract → convert → prove
   - Handle RBN2048 witness generation
   - Integration with existing workflow

### ✅ Already Have

1. ✅ RSA circuit compiled (`circuits/pades_rsa/`)
2. ✅ PDF hash extraction (`yarn hash-byte-range`)
3. ✅ Trust list allowlist (`allowlist.json`)
4. ✅ Barretenberg backend (`bb` CLI)

## Implementation Checklist

To make RSA circuit fully operational:

- [ ] Update `scripts/extract-cms.ts` to handle RSA signatures
- [ ] Create `scripts/rsa-to-rbn2048.ts` converter
- [ ] Create `tools/merkle-pedersen/build.ts` (or update existing)
- [ ] Create `scripts/prove-rsa.ts` end-to-end prover
- [ ] Create `scripts/verify-rsa.ts` end-to-end verifier
- [ ] Test with real RSA-signed PDF
- [ ] Benchmark actual proof time
- [ ] Document memory requirements

## Quick Test (Without Real RSA PDF)

If you just want to verify the circuit compiles and runs:

```bash
cd circuits/pades_rsa

# The auto-generated Prover.toml has empty values
# Circuit will fail but you can see the error messages

nargo execute
# Error: Expected witness value for signature.limbs[0]

# This confirms the circuit structure is correct
# Need real RSA signature data to proceed
```

## Estimated Implementation Time

- RSA extraction: 2 hours
- RBN2048 converter: 4 hours (complex math)
- Pedersen Merkle: 2 hours
- Integration: 2 hours
- Testing: 2 hours

**Total**: ~12 hours to full working RSA proof pipeline

## Alternative: Hybrid Approach

If full RSA proving is too slow, consider:

1. **Verify RSA signature off-circuit** (using Node.js crypto)
2. **Only prove trust list membership in ZK**
3. Include signature hash as public input
4. Much faster: ~3 seconds instead of ~150 seconds
5. Still proves signer is in allowlist without revealing identity

Would you like me to implement any of these components?
