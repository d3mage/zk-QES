# RSA vs ECDSA Circuit Benchmark Comparison

## Circuit Statistics (November 11, 2024)

### RSA-2048 Circuit (`pades_rsa`)

| Metric | Value |
|--------|-------|
| **ACIR Opcodes** | 10,313 |
| **Brillig Opcodes** | 4,105 |
| **Total Opcodes** | 14,418 |
| **Compiled Size** | 567 KB |
| **Expression Width** | 4 (Bounded) |

**Brillig Functions:**
- `__mul`: 1,599 opcodes
- `compute_quadratic_expression_with_borrow_flags`: 2,442 opcodes
- Supporting functions: ~64 opcodes

### ECDSA P-256 Hybrid Circuit (`pades_ecdsa_hybrid`)

| Metric | Value |
|--------|-------|
| **ACIR Opcodes** | 261 |
| **Brillig Opcodes** | 30 |
| **Total Opcodes** | 291 |
| **Compiled Size** | 35 KB |
| **Expression Width** | 4 (Bounded) |

## Comparison

| Metric | RSA-2048 | ECDSA P-256 | RSA/ECDSA Ratio |
|--------|----------|-------------|-----------------|
| ACIR Opcodes | 10,313 | 261 | **39.5x larger** |
| Brillig Opcodes | 4,105 | 30 | **136.8x larger** |
| Total Opcodes | 14,418 | 291 | **49.5x larger** |
| Compiled Size | 567 KB | 35 KB | **16.2x larger** |

## Performance Estimates

### ECDSA P-256 Hybrid (Known Performance)
- **Proof Generation**: 2-3 seconds
- **Verification**: <1 second
- **Memory Usage**: ~500 MB

### RSA-2048 (Estimated)

Based on the 49.5x opcode increase:

| Operation | Estimated Time | Confidence |
|-----------|---------------|------------|
| **Proof Generation** | 100-150 seconds (1.5-2.5 min) | Medium |
| **Verification** | 10-20 seconds | Medium |
| **Memory Usage** | ~2-4 GB | Low |

**Note**: These are theoretical estimates based on opcode count. Actual performance may vary due to:
- Brillig function overhead
- BigNum operations complexity
- Barretenberg backend optimizations

## Why is RSA Slower?

1. **Large Integer Arithmetic**
   - RSA-2048 requires 2048-bit modular exponentiation
   - ECDSA P-256 works with 256-bit field elements
   - ~8x more bits to process

2. **Modular Exponentiation**
   - RSA: O(log(e)) multiplications where e ≈ 65537
   - ECDSA: Native field operations

3. **Brillig Overhead**
   - RSA uses 4,105 Brillig opcodes vs 30 for ECDSA
   - Brillig functions are less constrained but slower

4. **Circuit Complexity**
   - RSA needs bignum library (noir-bignum)
   - ECDSA uses stdlib native operations

## Recommendations

### Use RSA Circuit When:
- ✅ Working with existing RSA-signed qualified certificates
- ✅ Need compatibility with RSA-only QTSPs
- ✅ Proof time <3 minutes is acceptable
- ✅ Can generate proofs offline/asynchronously

### Use ECDSA P-256 Circuit When:
- ✅ Need fast proof generation (<5 seconds)
- ✅ Interactive/real-time use cases
- ✅ Browser-based proving
- ✅ Can choose signing algorithm (recommend ECDSA for new deployments)

## Next Steps: Real-World Benchmark

To get accurate performance data, we need to:

1. **Create test inputs** with real RSA-2048 signature
2. **Generate proof** with bb backend
3. **Measure actual times**:
   ```bash
   time bb prove -b target/pades_rsa.json -w Prover.toml -o proof
   time bb verify -k vk -p proof -b target/pades_rsa.json
   ```
4. **Profile memory usage** during proving
5. **Compare with ECDSA hybrid** head-to-head

## Optimization Opportunities

If RSA proves too slow:

1. **RSA-1024** instead of RSA-2048
   - Half the opcodes (~7,000 vs 14,000)
   - Still accepted by some QTSPs
   - Security trade-off

2. **Precomputation**
   - Cache modular exponentiation results
   - Reduce runtime computation

3. **Hardware Acceleration**
   - GPU proving (if supported by bb)
   - Distributed proving

4. **Hybrid Approach**
   - Verify RSA signature off-circuit
   - Only prove trust list membership in ZK
   - Trade full ZK for performance
