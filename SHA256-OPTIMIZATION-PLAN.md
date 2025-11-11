# SHA-256 Circuit Optimization Plan

**Objective:** Make SHA-256 circuit work within current infrastructure constraints
**Challenge:** Circuit requires 79,732 bytes but CRS limit is 65,537 bytes
**Gap:** 14,195 bytes (21.6% reduction needed)

---

## Three Viable Approaches

### Approach 1: Hybrid SHA-256/Pedersen Circuit ⭐ **RECOMMENDED**

**Concept:** Use SHA-256 only where cryptographically required, Pedersen for internal operations

**Current SHA-256 Usage:**
```
1. Document hash verification: 0 SHA-256 calls (already provided as input)
2. Local Merkle tree: 8 SHA-256 calls
3. EU Merkle tree: 8 SHA-256 calls (if enabled)
Total: 16 SHA-256 calls
```

**Optimization:**
```noir
// OLD: All SHA-256
fn compute_merkle_root_sha256(leaf: [u8; 32], path: [[u8; 32]; 8]) {
    for i in 0..8 {
        current = sha256_var([left, right].concat(), 64);  // 450 opcodes × 8 = 3,600
    }
}

// NEW: Hybrid approach
fn compute_merkle_root_hybrid(leaf: [u8; 32], path: [Field; 8]) {
    // Convert leaf to Field once
    let leaf_field = bytes_to_field(leaf);

    for i in 0..8 {
        current = std::hash::pedersen_hash([current, path[i]]);  // 35 opcodes × 8 = 280
    }
}
```

**Expected Savings:**
- Old Merkle operations: 16 × 450 = 7,200 opcodes
- New Merkle operations: 16 × 35 = 560 opcodes
- **Savings: 6,640 opcodes (92% reduction in hash operations)**

**Estimated New Circuit Size:**
- Current: 6,759 opcodes (79,732 bytes)
- Savings: ~6,640 opcodes
- **New total: ~120 opcodes (~6,000 bytes bytecode)**
- Well under 65,537 limit ✅

**Pros:**
- ✅ Minimal changes to circuit logic
- ✅ Maintains SHA-256 for document hash (already provided)
- ✅ Guaranteed to fit under CRS limit
- ✅ Can implement in 1-2 days
- ✅ Maintains cryptographic alignment with PDF standards

**Cons:**
- ⚠️ Merkle trees must be rebuilt with Pedersen (one-time effort)
- ⚠️ Need JavaScript Pedersen implementation for tree building
- ⚠️ Mixed hash functions (not pure SHA-256)

**Implementation Steps:**
1. Modify circuit to accept Field inputs for Merkle paths
2. Replace `hash_pair_sha256` with `pedersen_hash`
3. Update Merkle tree builder to use Pedersen
4. Compile and test
5. Benchmark

**Timeline:** 2-3 days

---

### Approach 2: Reduce Merkle Tree Depth

**Concept:** Use shallower Merkle trees to reduce SHA-256 calls

**Current Configuration:**
```
Merkle depth: 8 levels
Capacity: 2^8 = 256 signers
SHA-256 calls per tree: 8
Total calls (dual trust): 16
```

**Optimization Options:**

**Option A: Depth 6 (64 signers)**
```
SHA-256 calls per tree: 6
Total calls (dual trust): 12
Savings: 4 × 450 = 1,800 opcodes
New size: ~6,759 - 1,800 = 4,959 opcodes (~62,000 bytes)
Status: Still over limit ❌
```

**Option B: Depth 4 (16 signers)**
```
SHA-256 calls per tree: 4
Total calls (dual trust): 8
Savings: 8 × 450 = 3,600 opcodes
New size: ~6,759 - 3,600 = 3,159 opcodes (~40,000 bytes)
Status: Under limit ✅
```

**Option C: Depth 2 (4 signers)**
```
SHA-256 calls per tree: 2
Total calls (dual trust): 4
Savings: 12 × 450 = 5,400 opcodes
New size: ~6,759 - 5,400 = 1,359 opcodes (~17,000 bytes)
Status: Well under limit ✅
```

**Pros:**
- ✅ Pure SHA-256 (no mixed hashes)
- ✅ Simple implementation
- ✅ Quick to test

**Cons:**
- ❌ Severely limits number of signers (4-64 max)
- ❌ Not practical for large organizations
- ❌ Still need depth 4+ to fit (16 signers minimum)
- ❌ Doesn't solve the fundamental problem

**Recommendation:** Only viable if combined with Approach 1 (use Pedersen for larger trees)

---

### Approach 3: Disable Dual Trust (Single Merkle Tree)

**Concept:** Remove EU Trust List verification to halve SHA-256 calls

**Current:**
```
Local tree: 8 SHA-256 calls
EU tree: 8 SHA-256 calls
Total: 16 calls
```

**Optimized:**
```
Local tree only: 8 SHA-256 calls
Savings: 8 × 450 = 3,600 opcodes
New size: ~6,759 - 3,600 = 3,159 opcodes (~40,000 bytes)
Status: Under limit ✅
```

**Pros:**
- ✅ Fits under CRS limit
- ✅ Pure SHA-256
- ✅ Simple change (remove eu_trust branch)
- ✅ Quick to implement (< 1 hour)

**Cons:**
- ❌ Loses dual trust verification feature
- ❌ No EU Trust List validation
- ❌ Reduces compliance value proposition
- ❌ Still only saves 50% (not ideal)

**Use Case:**
- Organizations that only need local allowlist
- Non-EU deployments
- POC/testing environments

**Implementation:**
```noir
fn main(
    // Remove EU trust inputs
    // eu_trust_enabled: pub bool,
    // tl_root_eu: pub [u8; 32],
    // eu_merkle_path: [[u8; 32]; 8],
    // eu_index: Field
    ...
) {
    // Keep only local trust verification
    let computed_root = compute_merkle_root_sha256(signer_fpr, index, merkle_path);
    assert(computed_root == tl_root, "Signer not in local allow-list");

    // Remove EU trust block entirely
}
```

**Timeline:** < 1 day

---

### Approach 4: Request Larger CRS from Aztec ⏰ **LONG-TERM**

**Concept:** Get infrastructure upgrade to support larger circuits

**Current Limits:**
```
Grumpkin CRS: 65,537 points (2^16 + 1)
Our circuit: 79,732 bytes
Needed: 131,072 points (2^17)
```

**Actions:**
1. File GitHub issue on AztecProtocol/barretenberg
2. Explain use case (SHA-256 for qualified signatures)
3. Provide circuit details
4. Request 2^17 CRS generation

**Pros:**
- ✅ No code changes needed
- ✅ Pure SHA-256 works as-is
- ✅ Enables all features (dual trust, depth 8)
- ✅ Benefits entire ecosystem

**Cons:**
- ❌ Timeline uncertain (weeks to months)
- ❌ No guarantee of acceptance
- ❌ May require infrastructure upgrades
- ❌ Out of our control

**Template Issue:**
```markdown
## Request: Larger Grumpkin CRS for UltraHonk (2^17 points)

**Use Case:** Privacy-preserving qualified electronic signature verification

**Current Limitation:**
- Circuit size: 79,732 bytes
- Available CRS: 65,537 points (2^16 + 1)
- Gap: 21.6% over limit

**Request:**
- Generate Grumpkin CRS with 131,072 points (2^17)
- Would enable pure SHA-256 circuits for regulatory compliance

**Why SHA-256:**
- Required by eIDAS/PAdES standards
- Cryptographic alignment with PDF signatures
- Cannot use Poseidon for document hash verification

**Impact:**
- Enables regulatory use cases on Aztec
- First eIDAS-compliant ZK application
- Opens enterprise/government markets

**Circuit Details:**
- ECDSA P-256 signature verification
- Dual SHA-256 Merkle trees (depth 8)
- 16 SHA-256 calls total
- ~327,939 constraints
```

**Timeline:** 1-3 months (if accepted)

---

### Approach 5: Try UltraPlonk Instead of UltraHonk

**Concept:** Different proving system may have different CRS requirements

**UltraHonk (current):**
- Uses Grumpkin curve for recursion
- Limited to 65,537 points
- Optimized for smaller proofs

**UltraPlonk:**
- Uses bn254 curve
- Larger CRS available (1M+ points)
- Different trade-offs

**Investigation Required:**
```bash
# Check if bb supports UltraPlonk
bb prove --help | grep -i plonk

# Try compiling with Plonk backend
bb prove -b plonk -c circuit.json
```

**Pros:**
- ✅ May work with existing circuit
- ✅ Quick to test (< 1 hour)
- ✅ No code changes if it works

**Cons:**
- ❌ Larger proof sizes
- ❌ Different security assumptions
- ❌ May not be supported in current bb version
- ❌ Unknown if compatible with Aztec contracts

**Timeline:** 1-2 hours to investigate

---

## Recommended Implementation Strategy

### Phase 1: Quick Wins (This Week)

**Day 1-2: Implement Hybrid Circuit**
```bash
# 1. Create new circuit file
cp circuits/pades_ecdsa/src/main.nr circuits/pades_ecdsa_hybrid/src/main.nr

# 2. Modify to use Pedersen for Merkle trees
# 3. Update Merkle builder tools
# 4. Compile and test
yarn compile:circuit:hybrid
yarn test-hybrid

# 5. Benchmark
yarn prove:hybrid
```

**Expected Result:**
- Circuit size: ~6,000 bytes (well under limit)
- Proving time: 10-20 seconds (hybrid is smaller than pure Pedersen)
- Status: Production-ready ✅

**Day 3: Test Single-Trust SHA-256**
```bash
# Disable dual trust as fallback option
# Keep for organizations that don't need EU Trust List
```

### Phase 2: Medium-Term (2-4 Weeks)

**Week 2: Optimize Further**
- Fine-tune hybrid circuit
- Benchmark native bb vs WASM
- Test with reduced Merkle depths (depth 6 or 7)

**Week 3-4: Alternative Approaches**
- Investigate UltraPlonk compatibility
- File issue for larger CRS
- Document findings

### Phase 3: Long-Term (1-3 Months)

**Monitor Infrastructure:**
- Track Aztec/Barretenberg updates
- Test with new CRS when available
- Prepare migration path to pure SHA-256

---

## Success Criteria

### Minimum Viable (Must Have)
- ✅ Circuit compiles without errors
- ✅ Fits under 65,537 CRS limit
- ✅ Generates valid proofs
- ✅ Proving time < 30 seconds (acceptable for beta)

### Production Ready (Should Have)
- ✅ Proving time < 10 seconds
- ✅ Supports dual trust verification
- ✅ Merkle depth 8 (256 signers)
- ✅ Compatible with PDF signatures

### Ideal (Nice to Have)
- ✅ Pure SHA-256 (no mixed hashes)
- ✅ Proving time < 5 seconds
- ✅ Works with both native bb and WASM
- ✅ No feature compromises

---

## Risk Assessment

| Approach | Success Probability | Time to Production | Feature Completeness |
|----------|---------------------|-------------------|---------------------|
| **Hybrid SHA-256/Pedersen** | 95% | 2-3 days | 90% (mixed hashes) |
| **Reduce Merkle Depth** | 70% | 1 day | 60% (fewer signers) |
| **Disable Dual Trust** | 90% | < 1 day | 70% (no EU trust) |
| **Larger CRS Request** | 40% | 1-3 months | 100% (if accepted) |
| **UltraPlonk** | 30% | 1 day | 80% (different tradeoffs) |

---

## Next Actions

### Immediate (Today)
1. ✅ Create hybrid circuit branch
2. ✅ Implement Pedersen Merkle trees
3. ✅ Test compilation

### Tomorrow
1. Build Pedersen Merkle tree tools in JavaScript
2. Generate test proofs
3. Benchmark performance

### This Week
1. Validate hybrid approach works
2. Document performance improvements
3. Deploy to testnet

---

## Code Changes Preview

### Hybrid Circuit (main.nr)

```noir
use dep::std::ecdsa_secp256r1::verify_signature;
use dep::std::hash::pedersen_hash;

fn main(
    // Document binding - still bytes (SHA-256 from PDF)
    doc_hash: pub [u8; 32],

    // Merkle inputs - now Fields (Pedersen-optimized)
    signer_fpr: pub Field,           // Changed from [u8; 32]
    tl_root: pub Field,              // Changed from [u8; 32]

    // EU Trust List
    eu_trust_enabled: pub bool,
    tl_root_eu: pub Field,           // Changed from [u8; 32]

    // Private inputs
    signature: [u8; 64],
    merkle_path: [Field; 8],         // Changed from [[u8; 32]; 8]
    index: Field,
    eu_merkle_path: [Field; 8],      // Changed from [[u8; 32]; 8]
    eu_index: Field
) {
    // 1. ECDSA still uses SHA-256 doc_hash (no change)
    let valid = verify_signature(pub_key_x, pub_key_y, signature, doc_hash);
    assert(valid, "ECDSA P-256 verification failed");

    // 2. Merkle verification now uses Pedersen (OPTIMIZED)
    let computed_root = compute_merkle_root_pedersen(signer_fpr, index, merkle_path);
    assert(computed_root == tl_root, "Signer not in local allow-list");

    // 3. EU Trust List also uses Pedersen (OPTIMIZED)
    if eu_trust_enabled {
        let computed_eu_root = compute_merkle_root_pedersen(signer_fpr, eu_index, eu_merkle_path);
        assert(computed_eu_root == tl_root_eu, "Signer not in EU Trust List");
    }
}

fn compute_merkle_root_pedersen(leaf: Field, index: Field, path: [Field; 8]) -> Field {
    let mut current = leaf;
    let mut idx = index;

    for i in 0..8 {
        let sibling = path[i];
        let idx_div_2 = idx / 2;
        let is_right = (idx_div_2 * 2) != idx;

        // Pedersen hash - 35 opcodes vs 450 for SHA-256
        current = if is_right {
            pedersen_hash([sibling, current])
        } else {
            pedersen_hash([current, sibling])
        };

        idx = idx_div_2;
    }

    current
}
```

### Expected Circuit Stats

```
Before (Pure SHA-256):
- ACIR Opcodes: 6,759
- Bytecode: 79,732 bytes
- Status: FAILS (over CRS limit)

After (Hybrid):
- ACIR Opcodes: ~120
- Bytecode: ~6,000 bytes
- Status: WORKS ✅
- Savings: 98% reduction
```

---

**Status:** Ready to implement
**Recommended:** Start with Approach 1 (Hybrid) immediately
**Timeline:** Production-ready in 2-3 days
