# Task 6 Progress Update - Poseidon2 Migration

**Date:** October 26, 2025
**Phase:** Task 6 - Performance Optimization (Phase 1)
**Progress:** 35% Complete

---

## Summary of Work Completed

Successfully completed the Poseidon2 circuit and Merkle tree infrastructure. Major compilation issue resolved, tooling created and tested.

---

## Completed Items ✅

### 1. Poseidon2 Circuit Development ✅
**File:** `circuits/pades_ecdsa_poseidon/src/main.nr`

**Key Improvements:**
- Circuit reduced from 122 lines → 87 lines (29% smaller)
- Changed from byte array inputs to Field inputs for Merkle tree
- Simplified hash function calls (Poseidon2 native to ZK)
- Removed helper functions (bytes_to_field, field_to_bytes)

**Circuit Structure:**
```noir
pub fn main(
    doc_hash: pub [u8; 32],           // SHA-256 (bytes)
    artifact_hash: pub [u8; 32],      // SHA-256 (bytes)
    pub_key_x: pub [u8; 32],          // ECDSA public key
    pub_key_y: pub [u8; 32],
    signature: [u8; 64],              // ECDSA signature (r || s)
    signer_fpr: pub Field,            // NEW: Field instead of bytes
    tl_root: pub Field,               // NEW: Field instead of bytes
    merkle_path: [Field; 8],          // NEW: Field array instead of bytes
    index: Field                      // Leaf index
)
```

**Compilation:**
- ✅ Compiles successfully
- ⚠️ One warning: unused variable `artifact_hash` (cosmetic)
- Output: `circuits/pades_ecdsa_poseidon/target/pades_ecdsa_poseidon.json`

### 2. Workspace Compilation Issue Resolved ✅

**Problem:**
```
Error: Selected package `aztec_anchor` was not found
```

**Root Cause:**
- Root `Nargo.toml` defines Aztec contract package
- nargo was picking up root config when compiling circuit directories

**Solution:**
- Temporarily rename root `Nargo.toml` during circuit compilation
- Added package.json script: `compile:circuit:poseidon`
- Script: `mv Nargo.toml Nargo.toml.aztec; (cd circuits/pades_ecdsa_poseidon && nargo compile); mv Nargo.toml.aztec Nargo.toml`

### 3. Poseidon Hash Library Installed ✅

**Library:** `circomlibjs@0.1.7`

**Verification:**
- ✅ Uses BN254 field (matches Noir)
- ✅ Field modulus: `21888242871839275222246405745257275088548364400416034343698204186575808495617`
- ✅ Poseidon hash function working
- ⚠️ Note: circomlibjs has regular Poseidon, not Poseidon2 (needs compatibility testing)

**Test Results:**
```
Hash([1, 2]): 7853200120776062878684798364095072458815029376092732009249414926327459813530
Field modulus match: ✅ true
```

### 4. Poseidon Merkle Tree Tooling Created ✅

**Files:**
- `tools/merkle-poseidon/build.ts` - Tree builder with Poseidon hash
- `tools/merkle-poseidon/prove.ts` - Inclusion proof retriever

**Features:**
- Depth-8 tree (256 leaf capacity, matches circuit)
- Field-based hash function (Poseidon from circomlibjs)
- Outputs both hex and decimal formats (for Noir inputs)
- Auto-pads to 256 leaves

**Package.json Scripts:**
- `yarn merkle-poseidon:build` - Build tree from allowlist
- `yarn merkle-poseidon:prove` - Get inclusion proof

### 5. Poseidon Merkle Tree Tested ✅

**Test Command:**
```bash
yarn merkle-poseidon:build allowlist.json --out out
```

**Results:**
```
✓ Poseidon initialized
Found 4 fingerprints
Building Merkle tree with Poseidon hash...

Tree built successfully:
  Root:  199db48e6e7472a4e37551416ee53c419b43c3b85b4d00dc0a6aa9fe657fba5f
  Root (decimal): 11586462358038971027612867030839352504344552965067187771335511419555533535839
  Depth: 8
  Leaves: 4

✓ 4 inclusion proofs generated
```

**Output Files:**
- `out/tl_root_poseidon.hex` - Root in hex format
- `out/tl_root_poseidon.txt` - Root in decimal format (for Noir)
- `out/tl_root_poseidon.json` - Metadata
- `out/paths-poseidon/*.json` - Inclusion proofs (4 files)

### 6. Poseidon Circuit Test Script Created ✅

**File:** `scripts/test-poseidon-circuit.ts`

**Functionality:**
- Loads Poseidon2 circuit
- Loads Poseidon Merkle proof
- Loads existing signature data (VERIFIED files)
- Prepares Field-based inputs
- Generates witness and proof
- Verifies proof
- Reports timing and proof size

**Command:** `yarn test-poseidon`

**Status:** 🔄 Currently running (started at checkpoint time)

---

## Files Created/Modified

### New Files
1. `circuits/pades_ecdsa_poseidon/Nargo.toml`
2. `circuits/pades_ecdsa_poseidon/src/main.nr`
3. `tools/merkle-poseidon/build.ts`
4. `tools/merkle-poseidon/prove.ts`
5. `scripts/test-poseidon-circuit.ts`
6. `checkpoints/checkpoint-task6-progress.md` (this file)

### Modified Files
1. `package.json` - Added scripts:
   - `compile:circuit:poseidon`
   - `merkle-poseidon:build`
   - `merkle-poseidon:prove`
   - `test-poseidon`

2. `.gitignore` - Added (already done in previous session):
   - `.env` and `.env.local`
   - `logs/`

### Generated Outputs
1. `circuits/pades_ecdsa_poseidon/target/pades_ecdsa_poseidon.json`
2. `out/tl_root_poseidon.hex`
3. `out/tl_root_poseidon.txt`
4. `out/tl_root_poseidon.json`
5. `out/paths-poseidon/*.json` (4 files)
6. `out/proof-poseidon.bin` (pending test completion)

---

## Technical Achievements

### Circuit Optimization
| Metric | SHA-256 Version | Poseidon2 Version | Improvement |
|--------|----------------|-------------------|-------------|
| Lines of code | 122 | 87 | -29% |
| Merkle input type | `[[u8; 32]; 8]` | `[Field; 8]` | Simpler |
| Root input type | `[u8; 32]` | `Field` | Simpler |
| Helper functions | 2 needed | 0 needed | Cleaner |
| Hash function | SHA-256 | Poseidon2 | ZK-native |

### Expected Performance Gains
- **Constraint reduction:** 30-50% (estimated)
- **Proof generation time:** <3 minutes (target, from ~5-10 min)
- **Proof size:** 20-30% reduction (estimated)

---

## Current Status

### Running Test
- **Test:** `yarn test-poseidon`
- **Status:** 🔄 Running in background (shell ID: d9bbf9)
- **Expected duration:** 5-10 minutes
- **Testing:** Circuit compatibility with circomlibjs Poseidon

### Critical Question
**Does circomlibjs Poseidon match Noir's Poseidon2?**

- Circomlibjs uses standard Poseidon hash
- Noir stdlib uses Poseidon2 (different parameters)
- Test will reveal if they're compatible
- If incompatible, we may need to find Poseidon2 library or use Barretenberg backend

---

## Next Steps

### Immediate (After Test Completes)

1. **If test passes ✅:**
   - Benchmark proof generation time
   - Compare with SHA-256 version
   - Document performance improvements
   - Move to Phase 2 (error handling, logging)

2. **If test fails ❌:**
   - Investigate Poseidon vs Poseidon2 compatibility
   - Options:
     - Find Poseidon2 TypeScript implementation
     - Use Barretenberg Poseidon2 directly
     - Modify circuit to use standard Poseidon
   - Re-test after fix

### Phase 1 Remaining (if test passes)
- Create benchmarking script
- Measure constraint count
- Compare SHA-256 vs Poseidon2 performance
- Document results

### Phase 2-4 (Not Started)
- Error handling & validation
- Winston logging
- Docker containerization
- CI/CD pipeline
- Performance dashboard
- Deployment guide

---

## Lessons Learned

### Workspace Configuration
**Problem:** Root Nargo.toml conflicting with circuit compilation

**Solution:** Temporary rename during compilation

**Better Long-term Solution:**
- Move Aztec contract to separate directory
- Or use proper Nargo workspace configuration
- Or use separate nargo installation for circuits

### Field vs Bytes
**Insight:** Poseidon2 works with Field elements, much simpler than byte arrays

**Benefits:**
- Cleaner circuit code
- Fewer type conversions
- More efficient constraints
- Matches ZK ecosystem standards

### Library Selection
**Challenge:** Finding compatible Poseidon2 implementation

**Approach:**
1. Try circomlibjs (standard Poseidon, BN254)
2. Test compatibility with Noir
3. If fails, find Poseidon2 or use Barretenberg

**Status:** Testing in progress

---

## Performance Targets (Task 6)

| Metric | Current (SHA-256) | Target | Status |
|--------|------------------|--------|--------|
| Proof generation | 5-10 min | <3 min | ⏳ Testing |
| Proof size | 2.1 KB | <1.5 KB | ⚠️ Unrealistic? |
| Constraints | ~50k | 15-25k | ⏳ To measure |
| Circuit LOC | 122 | <100 | ✅ 87 lines |

**Note:** 1.5KB proof size target appears unrealistic for UltraPlonk. Current realistic target: 20-30% reduction (2.1KB → ~1.5-1.7KB). Need stakeholder clarification.

---

## Task 6 Overall Progress

**Phase 1 (Core Optimizations):** 35% complete
- ✅ Circuit created (100%)
- ✅ Compilation working (100%)
- ✅ Merkle tooling (100%)
- 🔄 Testing (60% - test running)
- ⏳ Benchmarking (0%)

**Phase 2 (Production Hardening):** 0% complete

**Phase 3 (DevOps):** 0% complete

**Phase 4 (Documentation):** 0% complete

**Overall Task 6:** ~15% complete

---

## Risk Assessment

### Current Risks

| Risk | Level | Status | Mitigation |
|------|-------|--------|------------|
| Poseidon/Poseidon2 mismatch | 🟡 MEDIUM | Testing | Have fallback options |
| Proof size expectation gap | 🔴 HIGH | Identified | Need stakeholder clarification |
| Time estimate accuracy | 🟡 MEDIUM | Monitoring | Phased approach allows adjustment |

### Fallback Options (if Poseidon test fails)

1. **Find Poseidon2 library:**
   - Check @noble/curves
   - Check Aztec.js exports
   - Search npm for poseidon2

2. **Use Barretenberg directly:**
   - bb.js might expose Poseidon2
   - Use WASM interface
   - Guaranteed compatibility

3. **Modify circuit:**
   - Use standard Poseidon instead of Poseidon2
   - Update circuit hash function
   - Re-compile and test

4. **Keep SHA-256:**
   - If Poseidon proves too complex
   - SHA-256 version works
   - Focus on other optimizations

---

## Commands Reference

### Compilation
```bash
# Compile Poseidon2 circuit
yarn compile:circuit:poseidon

# Compile SHA-256 circuit (for comparison)
yarn compile:circuit
```

### Merkle Tree (Poseidon)
```bash
# Build Poseidon Merkle tree
yarn merkle-poseidon:build allowlist.json --out out

# Get inclusion proof
yarn merkle-poseidon:prove --fingerprint 06a02856... --out out/proof.json
```

### Testing
```bash
# Test Poseidon2 circuit
yarn test-poseidon

# Check background test status
# (Use BashOutput tool with shell ID: d9bbf9)
```

### Comparison
```bash
# Compare outputs
cat out/tl_root.hex           # SHA-256 Merkle root
cat out/tl_root_poseidon.hex  # Poseidon Merkle root

# Compare circuit sizes
wc -l circuits/pades_ecdsa/src/main.nr              # 122 lines
wc -l circuits/pades_ecdsa_poseidon/src/main.nr    # 87 lines
```

---

## Conclusion

**Phase 1 Progress:** Strong foundation established
- Circuit compiled and optimized
- Tooling created and tested
- Compatibility test in progress

**Next Milestone:** Await test results and benchmark performance

**Estimated Time to Phase 1 Complete:** 2-4 hours (depending on test results)

**Task 6 Overall Estimate:** On track for ~20 hours total (original estimate: 20-21 hours)

---

**Checkpoint saved:** October 26, 2025
**Resume point:** Monitor `yarn test-poseidon` (shell d9bbf9)
**Next action:** Analyze test results when complete
