# DocumentRegistry - Quick Build Reference

## One-Line Build

```bash
rm -rf target/ store/ && aztec-nargo compile && aztec-postprocess-contract && aztec test
```

## Step-by-Step

```bash
# 1. Clean
rm -rf target/ store/

# 2. Compile
aztec-nargo compile

# 3. Postprocess (REQUIRED!)
aztec-postprocess-contract

# 4. Test
aztec test
```

## Expected Results

✅ **Compilation:** `target/document_registry-DocumentRegistry.json` (975 KB)
✅ **Postprocessing:** `target/document_registry-DocumentRegistry.json` (1.1 MB with "transpiled" key)
✅ **Tests:** `[document_registry] 3 tests passed`

## Common Issues

**Problem:** "Contract's public bytecode has not been transpiled"
**Solution:** Run `aztec-postprocess-contract` after compilation

**Problem:** Tests timeout or hang
**Solution:** `rm -rf store/` and retry

## Documentation

- **Full Guide:** [COMPILATION-AND-TESTING.md](./COMPILATION-AND-TESTING.md)
- **Errors Fixed:** [ERRORS-FIXED-STATUS.md](./ERRORS-FIXED-STATUS.md)
- **Contract Summary:** [DOCUMENT-REGISTRY-SUMMARY.md](./DOCUMENT-REGISTRY-SUMMARY.md)

---
**Last Updated:** 2025-11-10 | **Status:** ✅ All tests passing
