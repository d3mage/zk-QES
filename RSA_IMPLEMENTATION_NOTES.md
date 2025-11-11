# RSA Implementation in ZK Circuits

## The Challenge

RSA is significantly more difficult to implement in ZK circuits than ECDSA due to:

### 1. Modular Exponentiation Size
```
RSA-2048 verification: s^65537 mod n
- n is 2048 bits (vs 256 for ECDSA)
- Exponent e = 65537 requires 17 multiplications
- Each multiplication is 2048-bit × 2048-bit
```

### 2. Circuit Constraints Explosion

**Current ECDSA P-256 Circuit:**
- ~20,000 constraints (Poseidon)
- ~328,000 constraints (SHA-256)
- Proof time: 45-95 seconds

**Estimated RSA-2048 Circuit:**
- 2-5 MILLION constraints (100x larger!)
- Proof time: 30-60 MINUTES (unviable)
- Memory: 32-64 GB

### 3. BigInt Arithmetic in Noir

Noir doesn't have native big integer support, so we need to:

```noir
// Represent 2048-bit number as array of limbs
struct RSABigInt {
    limbs: [u64; 32]  // 32 × 64 = 2048 bits
}

// Implement modular multiplication
fn mod_mul(a: RSABigInt, b: RSABigInt, n: RSABigInt) -> RSABigInt {
    // Complex: Need Montgomery multiplication
    // Or school-book multiplication + Barrett reduction
    // Each operation = thousands of constraints
}

// Implement modular exponentiation
fn mod_exp(base: RSABigInt, exp: u32, n: RSABigInt) -> RSABigInt {
    // Square-and-multiply algorithm
    // For e=65537: 16 squares + 1 multiply
    // Each square = mod_mul = thousands of constraints
}
```

## Implementation Approaches

### Approach 1: Native BigInt Library (Current Best)

```noir
use dep::bigint;  // Noir BigInt library

fn verify_rsa_signature(
    message_hash: [u8; 32],
    signature: [u8; 256],     // 2048 bits
    public_key_n: [u8; 256],   // modulus
    public_key_e: u32          // exponent (65537)
) -> bool {
    let s = BigInt::from_bytes(signature);
    let n = BigInt::from_bytes(public_key_n);

    // s^e mod n
    let decrypted = s.mod_exp(e, n);

    // Check PKCS#1 v1.5 padding
    return check_pkcs1_padding(decrypted, message_hash);
}
```

**Problems:**
- BigInt operations in ZK are expensive
- Each limb multiplication creates hundreds of constraints
- Proof generation would take 30+ minutes

### Approach 2: Optimizations

#### 2a. Smaller Exponents
Some CAs use e=3 instead of e=65537:
- Only 2 multiplications instead of 17
- ~10x faster but still slow
- Security concerns with small exponents

#### 2b. Precomputation
Precompute powers of signature offline:
```noir
// Provide s^2, s^4, s^8, ... as private inputs
// Verify consistency in circuit
// Reduces online computation
```

#### 2c. Lookup Tables
Use lookup tables for small multiplications:
- Trade constraints for memory
- Helps with limb arithmetic
- Still doesn't solve core issue

### Approach 3: Alternative - RSA Proof Aggregation

Instead of proving RSA in ZK directly:

1. **Verify RSA signature normally (outside ZK)**
2. **Generate a simpler proof that verification happened**
3. **Use recursive proofs or attestation**

```
RSA Signature → Classical Verifier → Attestation → ZK Proof of Attestation
```

This is cheating but might be practical.

### Approach 4: Hybrid System

Support both ECDSA and RSA, but:
- Use ECDSA for new certificates
- Only support RSA for legacy with longer proof times
- Gradually phase out RSA support

## PKCS#11 Relationship

PKCS#11 is NOT directly related to the RSA problem:

**PKCS#11**: Cryptographic Token Interface
- API for hardware security modules (HSMs)
- Defines how to access keys stored in hardware
- Used for key management, not signature format

**PKCS#1**: RSA Cryptography Standard
- Defines RSA signature formats
- v1.5: Deterministic padding (common)
- PSS: Probabilistic padding (more secure)

For ZK circuits, we care about PKCS#1 (signature format), not PKCS#11 (hardware API).

## Realistic RSA Timeline

### Phase 1: Research (2-3 months)
- Prototype RSA-2048 circuit
- Measure actual constraints/performance
- Explore optimization techniques

### Phase 2: Optimization (3-6 months)
- Implement best approach from research
- Target: <5 minute proof generation
- May require GPU acceleration

### Phase 3: Production (6-12 months)
- Full RSA-2048/3072 support
- Integrate with existing system
- Handle PKCS#1 v1.5 and PSS padding

## Recommendation

**For Grant Proposal:**
1. Acknowledge RSA is critical (60-70% market)
2. Be honest about complexity (100x harder than ECDSA)
3. Propose phased approach:
   - Year 1: ECDSA only (early adopters)
   - Year 2: RSA research & prototype
   - Year 3: Production RSA support

**Alternative Strategy:**
Push for ECDSA adoption:
- Work with CAs to issue ECDSA certificates
- Target forward-looking organizations
- Position as "next-generation" solution
- Leave RSA for legacy systems

## Why This Matters

Without RSA support, we exclude:
- Most government-issued certificates
- Legacy enterprise systems
- Older smart cards
- ~60-70% of current QES market

But implementing RSA in ZK might make the system unusable (30+ minute proofs).

This is a fundamental technical challenge, not just an engineering task.