# ZK Qualified Signature - Production Deployment Guide

**Version:** 2.0.0
**Last Updated:** November 10, 2025
**Aztec Version:** 3.0.0-devnet.4

---

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Installation](#installation)
3. [Circuit Selection](#circuit-selection)
4. [Configuration](#configuration)
5. [Docker Deployment](#docker-deployment)
6. [Production Hardening](#production-hardening)
7. [Monitoring & Logging](#monitoring--logging)
8. [Performance Tuning](#performance-tuning)
9. [Troubleshooting](#troubleshooting)

---

## System Requirements

### Minimum Requirements

- **OS:** Linux (Ubuntu 20.04+), macOS, or Windows WSL2
- **CPU:** 4 cores, 2.5 GHz+
- **RAM:** 8 GB minimum, 16 GB recommended
- **Storage:** 10 GB free space
- **Node.js:** v22.x or later
- **Yarn:** v1.22+

### Additional Requirements for SHA-256 Circuit

- **Native bb CLI:** Required for SHA-256 proof generation
- Installation: `curl -L https://aztec-bb-artifacts.s3.amazonaws.com/bb-$(uname -m)-$(uname -s) -o bb && chmod +x bb && sudo mv bb /usr/local/bin/`

### Additional Requirements for Poseidon Circuit

- **No additional tools required** - works with bb.js

---

## Installation

### 1. Clone Repository

```bash
git clone <repository-url>
cd zk-qualified-signature
```

### 2. Install Dependencies

```bash
yarn install
```

### 3. Install Aztec (includes Nargo)

```bash
bash -i <(curl -s https://install.aztec.network)
aztec-up 3.0.0-devnet.4
```

This installs:
- `aztec` - Main CLI tool
- `aztec-nargo` - Noir compiler for Aztec contracts
- `aztec-wallet` - Wallet management
- `nargo` - Standard Noir compiler (for ZK circuits)

### 4. Compile Contracts and Circuits

**For Aztec smart contract:**
```bash
aztec-nargo compile
# Output: target/aztec_anchor-AztecAnchor.json (782 KB)
```

**For Noir ZK circuit:**
```bash
cd circuits/pades_ecdsa && nargo compile && cd ../..
# Or: yarn compile:circuit
```

### 5. Verify Installation

**Test Aztec contract:**
```bash
aztec test
# Expected: [aztec_anchor] 3 tests passed
```

**Test ZK circuit:**
```bash
yarn e2e-test
```

---

## Aztec Contract Testing

### ✅ Recommended: Use `aztec test`

```bash
aztec test
```

This command:
- Automatically starts TXE (Transaction Execution Environment) server
- Runs all integration tests
- Provides full oracle support
- Cleans up automatically

**Output:**
```
[aztec_anchor] Running 3 test functions
[aztec_anchor] Testing test::first::test_initializer ... ok
[aztec_anchor] Testing test::first::test_anchor_proof ... ok
[aztec_anchor] Testing test::first::test_multiple_anchors ... ok
[aztec_anchor] 3 tests passed
```

### ❌ Don't Use: `aztec-nargo test`

The `aztec-nargo test` command does **not** start the TXE server, causing integration tests to fail. Use `aztec test` instead.

## Circuit Selection

The project includes two components:

### 1. Aztec Smart Contract (On-Chain Anchoring)

- **File:** `src/main.nr`
- **Compiler:** `aztec-nargo compile`
- **Output:** `target/aztec_anchor-AztecAnchor.json`
- **Tests:** `aztec test`
- **Purpose:** On-chain proof registry with privacy

### 2. Noir ZK Circuit (Proof Generation)

- **File:** `circuits/pades_ecdsa/src/main.nr`
- **Compiler:** `nargo compile`
- **Purpose:** ECDSA P-256 signature verification in zero-knowledge
- **Tests:** `yarn e2e-test`

---

## Configuration

### Environment Variables

Create `.env` file in project root:

```bash
# Environment
NODE_ENV=production

# Logging
LOG_LEVEL=info

# Paths
OUTPUT_DIR=out
LOGS_DIR=logs
BENCHMARK_DIR=benchmarks

# Circuit selection (optional)
CIRCUIT=poseidon  # or 'sha256'

# Performance
MAX_PROOF_WORKERS=4
```

### Directory Structure

```
zk-qualified-signature/
├── circuits/
│   ├── pades_ecdsa/           # SHA-256 circuit
│   └── pades_ecdsa_poseidon/  # Poseidon circuit
├── scripts/                   # Proof generation scripts
├── utils/                     # Error handling & logging
├── out/                       # Proof outputs
├── logs/                      # Application logs
├── benchmarks/                # Performance data
└── test_files/                # Sample files
```

---

## Docker Deployment

### Build Image

```bash
docker build -t zk-qualified-signature .
```

### Run with Docker Compose

**Generate proof (SHA-256 with native bb):**
```bash
docker-compose up zk-signature
```

**Run benchmarks:**
```bash
docker-compose --profile benchmark up benchmark
```

**Run E2E tests:**
```bash
docker-compose --profile test up test
```

### Production Docker Deployment

```bash
# Run in detached mode
docker-compose up -d zk-signature

# View logs
docker-compose logs -f zk-signature

# Stop container
docker-compose down
```

---

## Production Hardening

### 1. Security

#### File Permissions

```bash
# Restrict access to sensitive files
chmod 600 .env
chmod 700 out/ logs/

# Run as non-root user
groupadd -r zkproof
useradd -r -g zkproof zkproof
chown -R zkproof:zkproof /app
```

#### Input Validation

All inputs are validated using `utils/validation.ts`:
- Hash formats (32 bytes hex)
- File existence
- Public key formats
- Signature formats
- Manifest structure

### 2. Error Handling

Custom error classes in `utils/errors.ts`:
- `ValidationError` - Invalid inputs
- `FileNotFoundError` - Missing files
- `CircuitError` - Circuit compilation/execution errors
- `ProofGenerationError` - Proof generation failures
- `VerificationError` - Proof verification failures

### 3. Resource Limits

**For Docker:**

```yaml
services:
  zk-signature:
    deploy:
      resources:
        limits:
          cpus: '4.0'
          memory: 16G
        reservations:
          cpus: '2.0'
          memory: 8G
```

**For Systemd:**

```ini
[Service]
MemoryLimit=16G
CPUQuota=400%
TasksMax=512
```

---

## Monitoring & Logging

### Log Files

Logs are written to `logs/` directory:

- **combined.log** - All application logs
- **error.log** - Error logs only
- **proofs.log** - Proof generation events
- **exceptions.log** - Uncaught exceptions
- **rejections.log** - Unhandled promise rejections

### Log Format

```json
{
  "level": "info",
  "message": "Proof generation completed",
  "event": "proof_generation",
  "circuit": "poseidon",
  "duration_ms": 92500,
  "success": true,
  "timestamp": "2025-10-27T14:30:45.123Z"
}
```

### Log Rotation

Winston is configured with automatic log rotation:
- Max file size: 10 MB
- Max files: 5
- Automatic compression

### Monitoring Metrics

Key metrics to monitor:

```typescript
import { logger, logProofGeneration } from './utils/logger';

// Track proof generation
const start = Date.now();
// ... generate proof ...
const duration = Date.now() - start;
logProofGeneration('poseidon', duration, true);
```

---

## Performance Tuning

### Benchmarking

Run performance benchmarks:

```bash
yarn benchmark
```

**Output:**
```
## Poseidon Circuit
  Runs: 3
  Average total time: 95.23s
  Proof size: 2144 bytes
  Constraints: 20000

## SHA-256 Circuit (Native bb)
  Runs: 3
  Average total time: 45.67s
  Proof size: 21284 bytes
  Constraints: 327939
```

### Optimization Tips

**1. Circuit Selection**
- Use Poseidon for 3x faster proof generation
- Use SHA-256 only when compatibility required

**2. Resource Allocation**
- Allocate 8-16 GB RAM for proof generation
- Use 4+ CPU cores for parallel operations

**3. Caching**
- Cache compiled circuits (in `target/` directories)
- Reuse Merkle tree builds when possible

**4. Batch Processing**
- Process multiple proofs in parallel
- Use worker threads for concurrent generation

---

## Troubleshooting

### Common Issues

#### 1. "bb: command not found"

**Problem:** Native bb CLI not installed (required for SHA-256 circuit)

**Solution:**
```bash
curl -L https://aztec-bb-artifacts.s3.amazonaws.com/bb-$(uname -m)-$(uname -s) -o bb
chmod +x bb
sudo mv bb /usr/local/bin/
```

#### 2. "Circuit not compiled"

**Problem:** Circuit bytecode not found in `target/` directory

**Solution:**
```bash
# For Poseidon
yarn compile:circuit:poseidon

# For SHA-256
cd circuits/pades_ecdsa && nargo compile
```

#### 3. "WASM unreachable" error (SHA-256 with bb.js)

**Problem:** Trying to use bb.js with SHA-256 circuit

**Solution:** Use native bb CLI instead:
```bash
yarn prove:bb  # Instead of yarn prove
```

#### 4. Out of memory during proof generation

**Problem:** Insufficient RAM

**Solution:**
```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=8192" yarn prove:bb

# Or use Docker with resource limits
docker-compose up --memory=16g zk-signature
```

#### 5. Permission denied errors

**Problem:** Insufficient file permissions

**Solution:**
```bash
chmod +x scripts/*.ts
chmod -R 755 out/ logs/
```

---

## Production Checklist

### Pre-Deployment

- [ ] All dependencies installed
- [ ] Circuits compiled successfully
- [ ] E2E tests passing
- [ ] Environment variables configured
- [ ] Log directories created with correct permissions
- [ ] Native bb installed (if using SHA-256)
- [ ] Docker image built and tested

### Post-Deployment

- [ ] Monitor logs for errors
- [ ] Verify proof generation works
- [ ] Check resource utilization
- [ ] Set up log rotation
- [ ] Configure backup strategy
- [ ] Document custom configuration
- [ ] Set up monitoring/alerting

### Security

- [ ] Input validation enabled
- [ ] File permissions restricted
- [ ] Running as non-root user
- [ ] Secrets not in version control
- [ ] Log sensitive data redacted
- [ ] Network access restricted (if applicable)

---

## Support & Resources

### Documentation

- **E2E Test Results:** `E2E-TEST-RESULTS.md`
- **SHA-256 Circuit Fix:** `SHA256-CIRCUIT-FIXED.md`
- **Task 6 Summary:** `TASK-6-PHASE-1-SUMMARY.md`

### Commands Quick Reference

```bash
# Aztec Contract
aztec-nargo compile     # Compile contract
aztec test              # Run tests (with TXE)

# ZK Circuit
nargo compile           # Compile circuit
yarn e2e-test           # End-to-end test

# Proof generation
yarn prove              # Generate ZK proof
yarn verify             # Verify ZK proof

# Docker
docker-compose up       # Run default service
docker-compose logs -f  # View logs
docker-compose down     # Stop services
```

---

## Version History

- **2.0.0** (2025-11-10) - Aztec 3.0.0-devnet.4 upgrade
  - ✅ Upgraded to Aztec 3.0.0-devnet.4
  - ✅ Contract API migration complete
  - ✅ All tests passing (3/3)
  - ✅ New test command: `aztec test`
  - See [checkpoint-aztec-3.0-upgrade.md](../.wip/checkpoints/checkpoint-aztec-3.0-upgrade.md)

- **1.0.0** (2025-10-27) - Initial production release
  - Both SHA-256 and Poseidon circuits production-ready
  - Native bb support for SHA-256
  - Docker containerization
  - CI/CD pipeline
  - Winston logging
  - Error handling utilities

---

**Status:** ✅ **PRODUCTION READY**
**Aztec Version:** 3.0.0-devnet.4
**Last Updated:** November 10, 2025
