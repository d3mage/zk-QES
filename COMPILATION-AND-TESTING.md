# DocumentRegistry - Compilation and Testing Guide

**Date:** 2025-11-10
**Status:** ✅ ALL TESTS PASSING (3/3)
**Contract:** DocumentRegistry
**Aztec Version:** 3.0.0-devnet.4

---

## Quick Start

```bash
# 1. Clean and compile
rm -rf target/ && aztec-nargo compile

# 2. Postprocess contract (REQUIRED for tests to work)
aztec-postprocess-contract

# 3. Run tests
aztec test
```

---

## Detailed Workflow

### Step 1: Compile Contract

```bash
rm -rf target/
aztec-nargo compile
```

**Output:**
```
warning: unused global STATE_UNCOMMITTED
   ┌─ src/main.nr:20:12
   │
20 │     global STATE_UNCOMMITTED: u8 = 0;
   │            ----------------- unused global
```

**Artifact generated:**
- `target/document_registry-DocumentRegistry.json` (975 KB)

### Step 2: Postprocess Contract ⚠️ **CRITICAL STEP**

```bash
aztec-postprocess-contract
```

**What this does:**
- Transpiles the contract bytecode for Aztec VM
- Adds `"transpiled"` key to the artifact JSON
- Generates verification keys for private functions
- Required for tests to work with TXE (Transaction Execution Environment)

**Output:**
```
Searching for contract artifacts in target/ directories...
Scheme is: ultra_honk, num threads: 8 (mem: 8.12 MiB)
Found 4 contract artifact(s) to process (mem: 8.75 MiB)
Transpiling: ./target/document_registry-DocumentRegistry.json -> ./target/document_registry-DocumentRegistry.json (mem: 8.75 MiB)
Transpiled: ./target/document_registry-DocumentRegistry.json -> ./target/document_registry-DocumentRegistry.json (mem: 12.50 MiB)
Generating verification keys for functions in document_registry-DocumentRegistry.json (mem: 12.50 MiB)
Cache directory: /home/alik/.bb/00000000.00000000.00000000/vk_cache (mem: 12.50 MiB)
No private constrained functions found (mem: 13.53 MiB)
```

**Artifact updated:**
- `target/document_registry-DocumentRegistry.json` (1.1 MB - now includes transpiled bytecode)
- Backup created: `target/document_registry-DocumentRegistry.json.bak`

**Verify transpilation:**
```bash
jq 'keys' target/document_registry-DocumentRegistry.json
```

**Should see:**
```json
[
  "file_map",
  "functions",
  "name",
  "noir_version",
  "outputs",
  "transpiled"  ← This key is added by postprocessing
]
```

### Step 3: Run Tests

```bash
aztec test
```

**Output:**
```
[document_registry] Running 3 test functions
[21:54:16.189] INFO: kv-store:lmdb-v2:txe-session Starting data store with maxReaders 16
...
[document_registry] Testing test::basic_test::test_initializer ... ok
[document_registry] Testing test::basic_test::test_create_document ... ok
[document_registry] Testing test::basic_test::test_add_signature ... ok
[document_registry] 3 tests passed
```

---

## Tests Overview

### Test 1: `test_initializer`

**Purpose:** Verify contract initialization

**Steps:**
1. Deploy contract
2. Check initial document count = 0
3. Check initial proof count = 0

**Result:** ✅ PASS

### Test 2: `test_create_document`

**Purpose:** Test document creation with counterparties

**Steps:**
1. Create document with CID and 2 counterparties
2. Verify document_id = 1
3. Verify state = STATE_COMMITTED (1)
4. Verify signature counts (0 current, 2 required)
5. Verify document count incremented to 1

**Result:** ✅ PASS

### Test 3: `test_add_signature`

**Purpose:** Test adding a signature to a document

**Steps:**
1. Create document with 2 counterparties
2. Add signature from first counterparty
3. Verify state changed to STATE_PARTIALLY_SIGNED (2)
4. Verify signature count = 1
5. Verify proof was anchored (proof_count = 1)

**Result:** ✅ PASS

---

## Errors Fixed During Implementation

### Error 1: Field Comparison

**Error:**
```
error: Fields cannot be compared, try casting to an integer first
   ┌─ src/main.nr:127:16
   │
127 │         assert(required_sigs > 0, "At least one signature required");
   │                -----------------
```

**Fix:**
Changed from `required_sigs > 0` to checking if counterparty_count is non-zero:
```noir
assert(counterparty_count != 0 as Field, "At least one signature required");
```

**Reason:** Noir Fields cannot use comparison operators (<, >, <=, >=), only equality (==, !=)

### Error 2: Self Keyword in Internal Function Call

**Error:**
```
error: cannot find `self` in this scope
    ┌─ src/main.nr:240:13
    │
240 │             self,
    │             ---- not found in this scope
```

**Fix:**
Inlined the ZK proof anchoring logic instead of calling a separate internal function.

**Reason:** Aztec contract functions cannot use `self` to call other functions. Functions must be called directly or inlined.

### Error 3: Test Setup Not Unconstrained

**Error:**
```
error: Call to unconstrained function is unsafe and must be in an unconstrained function or unsafe block
  ┌─ src/test/basic_test.nr:5:19
  │
5 │     let mut env = TestEnvironment::new();
  │                   ----------------------
```

**Fix:**
Added `unconstrained` keyword to setup function:
```noir
unconstrained fn setup() -> (...) {
    let mut env = TestEnvironment::new();
    ...
}
```

### Error 4: Contract Bytecode Not Transpiled

**Error:**
```
Failed calling external resolver. ErrorObject { code: ServerError(-32702),
message: "Could not generate contract artifact for DocumentRegistry:
Error: Contract's public bytecode has not been transpiled", data: None }
```

**Fix:**
Run `aztec-postprocess-contract` after compilation.

**Reason:** Aztec tests use TXE (Transaction Execution Environment) which requires transpiled bytecode to execute public functions.

---

## Common Issues and Solutions

### Issue: "Contract's public bytecode has not been transpiled"

**Solution:**
Always run `aztec-postprocess-contract` after compilation:
```bash
aztec-nargo compile
aztec-postprocess-contract  # Don't forget this!
aztec test
```

### Issue: Tests timeout or hang

**Solution:**
1. Clean up old TXE sessions:
```bash
rm -rf store/
```

2. Restart with clean compilation:
```bash
rm -rf target/ store/
aztec-nargo compile
aztec-postprocess-contract
aztec test
```

### Issue: "unused global STATE_UNCOMMITTED" warning

**Status:** ⚠️ Warning only, not an error

**Reason:** The STATE_UNCOMMITTED constant is defined but not currently used in the contract (documents start in STATE_COMMITTED).

**Action:** No action required. Can be removed or will be used in future if we add a pre-commit state.

---

## Contract Statistics

| Metric | Value |
|--------|-------|
| **Compiled size** | 975 KB |
| **Postprocessed size** | 1.1 MB |
| **Functions** | 17 (2 state-changing, 15 view) |
| **Storage maps** | 20+ |
| **Tests** | 3/3 passing ✅ |
| **Test duration** | ~10 seconds |

---

## Complete Build Script

Create a file `build.sh`:

```bash
#!/bin/bash
set -e

echo "🧹 Cleaning..."
rm -rf target/ store/

echo "🔨 Compiling contract..."
aztec-nargo compile

echo "⚙️  Postprocessing..."
aztec-postprocess-contract

echo "✅ Build complete! Run 'aztec test' to test."
```

Make it executable:
```bash
chmod +x build.sh
```

Run:
```bash
./build.sh
```

---

## Integration with Existing Scripts

The DocumentRegistry contract maintains backward compatibility with existing proof anchoring:

**No changes needed for:**
- `scripts/prove.ts` - ZK proof generation
- `scripts/verify.ts` - ZK proof verification
- `circuits/pades_ecdsa/` - ECDSA circuit

**New scripts to create:**
- `scripts/create-document.ts` - Create document on-chain
- `scripts/add-signature.ts` - Add signature to document
- `scripts/query-document.ts` - Query document state

---

## Next Steps

1. ✅ **Compilation** - Working
2. ✅ **Postprocessing** - Working
3. ✅ **Tests** - All passing (3/3)
4. ⏭️ **TypeScript Integration** - Create helper scripts
5. ⏭️ **E2E Workflow** - Test with real IPFS CIDs
6. ⏭️ **Documentation** - Update README with new workflow

---

## Key Takeaways

### ✅ Must Do

1. Always run `aztec-postprocess-contract` after compilation
2. Tests require transpiled bytecode to work with TXE
3. Use `unconstrained` for test setup functions
4. Clean build: `rm -rf target/ store/` if issues occur

### ⚠️ Gotchas

1. **Field comparisons** - Use `==`/`!=` only, not `<`/`>`
2. **Self keyword** - Not available in Aztec contracts, inline or use direct calls
3. **Postprocessing** - Not automatic, must run manually
4. **TXE sessions** - Can get stale, clean with `rm -rf store/`

---

**Status:** ✅ **FULLY WORKING**
**Last Updated:** 2025-11-10
**Tested On:** Aztec 3.0.0-devnet.4
