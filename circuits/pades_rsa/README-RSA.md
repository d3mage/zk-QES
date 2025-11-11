# RSA-2048 Circuit for Qualified Signatures

## Overview

This circuit implements RSA-2048 signature verification for PAdES documents using the [zkpassport/noir_rsa](https://github.com/zkpassport/noir_rsa) library (v0.9.1).

## Features

- **RSA-2048 PKCS#1 v1.5** signature verification with SHA-256
- **Dual trust verification**: Local allowlist + EU Trust List (optional)
- **Pedersen Merkle trees** for efficient trust list membership proofs
- **Zero-knowledge**: Signature validity proven without revealing signature values

## Circuit Inputs

### Public Inputs
- `doc_hash: [u8; 32]` - SHA-256 hash of PDF ByteRange
- `signature: RBN2048` - RSA-2048 signature (RuntimeBigNum type)
- `exponent: u32` - RSA public exponent (typically 65537)
- `signer_fpr: Field` - Signer certificate fingerprint
- `tl_root: Field` - Merkle root of local allowlist
- `eu_trust_enabled: bool` - Enable EU Trust List verification
- `tl_root_eu: Field` - Merkle root of EU Trust List

### Private Inputs
- `merkle_path: [Field; 8]` - Merkle inclusion proof (local)
- `index: Field` - Leaf index in local tree
- `eu_merkle_path: [Field; 8]` - Merkle inclusion proof (EU)
- `eu_index: Field` - Leaf index in EU tree

## Compilation

```bash
cd circuits/pades_rsa
nargo check    # Verify syntax
nargo compile  # Compile circuit
```

## Note on Constraints

The circuit uses the `noir-bignum` library which generates Brillig calls. You may see warnings about "Brillig function call isn't properly covered by a manual constraint" - this is expected for RSA operations and doesn't affect circuit correctness.

## Dependencies

- `noir_rsa` v0.9.1 - RSA signature verification
  - Internally depends on `noir-bignum` v0.8.0 for big integer arithmetic

## Circuit Size

RSA-2048 verification is computationally expensive in ZK circuits:
- **Expected proof time**: 10-30 minutes (significantly slower than ECDSA P-256)
- **Constraint count**: ~500,000+ constraints (vs ~50,000 for ECDSA)

For production use with qualified signatures, **ECDSA P-256 is recommended** over RSA for ZK circuits.

## Integration Notes

To use this circuit with the existing PAdES workflow:

1. Extract RSA signature from PDF (instead of ECDSA)
2. Convert signature to RBN2048 RuntimeBigNum format
3. Use Pedersen Merkle trees (same as hybrid circuit)
4. Verify locally before generating proof (RSA proof generation is slow)

## TODO

- [ ] Create TypeScript tooling to convert RSA signatures to RBN2048 format
- [ ] Add test with real RSA-signed PDF
- [ ] Benchmark proof generation time
- [ ] Compare with ECDSA P-256 performance
