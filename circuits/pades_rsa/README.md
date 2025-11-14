# PAdES RSA-2048 Circuit (Experimental)

## Status: **EXPERIMENTAL / NON-WORKING**

This circuit is kept for future research and performance benchmarking but is **not production-viable**.

## Current Limitations

- **Circuit Size**: 14,418 opcodes
- **Estimated Proving Time**: 1.5-2.5 minutes (current estimate)
- **Production Viability**: ❌ Not suitable for production use

## Why RSA-2048 is Not Production-Viable

According to the yellowpaper analysis:

- RSA-2048 represents **60-70%** of the QES market
- However, RSA verification in zero-knowledge requires **5-10 million constraints**
- This results in proof generation times of **1-2 hours** (estimated)
- Circuit size far exceeds practical limits for production use

## Production Alternative

For production use, the project focuses on **ECDSA P-256** signatures:
- **Market Share**: 30% of QES signatures
- **Circuit Size**: 261 opcodes (hybrid SHA-256/Pedersen)
- **Proving Time**: 2-3 seconds
- **Status**: Production-ready ✅

See `../pades_ecdsa_hybrid/` for the production circuit.

## Purpose of This Circuit

This RSA circuit is maintained for:
1. **Future Research**: Potential optimizations in RSA ZK verification
2. **Performance Benchmarking**: Comparing different signature algorithms
3. **Completeness**: Demonstrating the full scope of QES signature types

## Do Not Use for Production

⚠️ **Warning**: Do not attempt to use this circuit in production environments. The proving times and resource requirements make it unsuitable for real-world applications.
