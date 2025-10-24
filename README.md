<div align="center">
  <a href="https://aztec.network">
    <img src="https://cdn.prod.website-files.com/6847005bc403085c1aa846e0/6847514dc37a9e8cfe8a66b8_aztec-logo.svg" alt="Aztec Protocol Logo" width="300">
  </a>
</div>

# Aztec Starter

## Sandbox

This repo is meant to be a starting point for learning to write Aztec contracts and tests on the Aztec sandbox (local development environment). It includes an example contract, useful commands in `package.json` and helpful scripts in `./scripts`.

You can find the **Easy Private Voting contract** in `./src/main.nr`. A simple integration test is in `./src/test/e2e/index.test.ts`.

## Testnet

This repo connects to a locally running Aztec Sandbox by default, but can be configured to connect to the testnet by specifying `AZTEC_ENV=testnet` in a `.env` file or by prefixing a command e.g. `AZTEC_ENV=testnet yarn deploy`.

<div align="center">

[![GitHub Repo stars](https://img.shields.io/github/stars/AztecProtocol/aztec-starter?logo=github&color=yellow)](https://github.com/AztecProtocol/aztec-starter/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/AztecProtocol/aztec-starter?logo=github&color=blue)](https://github.com/AztecProtocol/aztec-starter/network/members)
[![Build](https://github.com/AztecProtocol/aztec-starter/actions/workflows/update.yaml/badge.svg)](https://github.com/AztecProtocol/aztec-starter/actions)
[![GitHub last commit](https://img.shields.io/github/last-commit/AztecProtocol/aztec-starter?logo=git)](https://github.com/AztecProtocol/aztec-starter/commits/main)
[![License](https://img.shields.io/github/license/AztecProtocol/aztec-starter)](https://github.com/AztecProtocol/aztec-starter/blob/main/LICENSE)
[![Discord](https://img.shields.io/badge/discord-join%20chat-5B5EA6)](https://discord.gg/aztec)
[![Twitter Follow](https://img.shields.io/twitter/follow/aztecnetwork?style=flat&logo=twitter)](https://x.com/aztecnetwork)

</div>

---

## 🚀 **Getting Started**

Use **Node.js version 22.15.0**.

[Start your codespace from the codespace dropdown](https://docs.github.com/en/codespaces/getting-started/quickstart).

Get the **sandbox, aztec-cli, and other tooling** with this command:

```bash
bash -i <(curl -s https://install.aztec.network)
```

Install the correct version of the toolkit with:

```bash
aztec-up 2.0.2
```

### Environment Configuration

This project uses JSON configuration files to manage environment-specific settings:

- `config/sandbox.json` - Configuration for local sandbox development
- `config/testnet.json` - Configuration for testnet deployment

The system automatically loads the appropriate configuration file based on the `ENV` environment variable. If `ENV` is not set, it defaults to `sandbox`.

The configuration files contain network URLs, timeouts, and environment-specific settings. You can modify these files to customize your development environment.

### Running on Sandbox (Local Development)

Start the sandbox with:

```bash
aztec start --sandbox
```

Run scripts and tests with default sandbox configuration:

```bash
yarn deploy       # Deploy to sandbox
yarn test         # Run tests on sandbox
```

### Running on Testnet

All scripts support a `::testnet` suffix to automatically use testnet configuration:

```bash
yarn deploy::testnet              # Deploy to testnet
yarn test::testnet                # Run tests on testnet
yarn deploy-account::testnet      # Deploy account to testnet
yarn interaction-existing-contract::testnet  # Interact with testnet contracts
```

The `::testnet` suffix automatically sets `ENV=testnet`, loading configuration from `config/testnet.json`.

---

## 📦 **Install Packages**

```bash
yarn install
```

---

## 🏗 **Compile**

```bash
aztec-nargo compile
```

or

```bash
yarn compile
```

---

## 🔧 **Codegen**

Generate the **contract artifact JSON** and TypeScript interface:

```bash
yarn codegen
```

---

:warning: Tests and scripts set up and run the Private Execution Environment (PXE) and store PXE data in the `./store` directory. If you restart the sandbox, you will need to delete the `./store` directory to avoid errors.

## Transaction Profiling

**Make sure the sandbox is running before profiling.**

```bash
aztec start --sandbox
```

Then run an example contract deployment profile with:

```bash
yarn profile
```

## 🧪 **Test**

**Make sure the sandbox is running before running tests.**

```bash
aztec start --sandbox
```

Then test with:

```bash
yarn test
```

Testing will run the **TypeScript tests** defined in `index.test.ts` inside `./src/test/e2e`, as well as the [Aztec Testing eXecution Environment (TXE)](https://docs.aztec.network/developers/guides/smart_contracts/testing) tests defined in [`first.nr`](./src/test/first.nr) (imported in the contract file with `mod test;`).

Note: The Typescript tests spawn an instance of the sandbox to test against, and close it once the TS tests are complete.

---

---

# 🔐 ZK Qualified Signature - POC

This repository has been extended with a **Zero-Knowledge Qualified Signature** proof-of-concept that demonstrates:

- **PAdES signature verification** in zero-knowledge using Noir circuits
- **Artifact binding** to prevent document/ciphertext substitution
- **Trust list enforcement** via Merkle tree membership proofs
- **Encrypted exchange** with AES-GCM + ECDH key agreement
- **Protocol manifests** for complete verification traceability

## 🏛 Architecture

### Components

1. **Noir Circuit** (`circuits/pades_ecdsa/`)
   - ECDSA P-256 signature verification
   - Merkle tree membership proof (SHA-256 based, depth 8)
   - Document and artifact binding via public inputs

2. **Merkle Toolchain** (`tools/merkle/`)
   - Trust list builder: `yarn merkle:build allowlist.json --out out`
   - Proof retriever: `yarn merkle:prove --fingerprint <hex> --out <file>`

3. **Scripts** (`scripts/`)
   - `hash-byte-range.ts` - Extract PDF /ByteRange SHA-256
   - `extract-cms.ts` - Parse CMS/CAdES signature data
   - `encrypt-upload.ts` - AES-GCM encryption with doc_hash AAD
   - `decrypt.ts` - Decrypt and verify AAD binding
   - `prove.ts` - Generate ZK proof with all bindings
   - `verify.ts` - 5-step verification (manifest, binding, trust, ZK)
   - `e2e-test.ts` - End-to-end test suite

### Binding & Trust

The system enforces three types of binding:

#### 1. **Document Binding**
- Public input: `doc_hash` (SHA-256 of PDF /ByteRange)
- Proves: Signature is over the exact document bytes
- Attack prevented: Cannot swap documents while reusing signature

#### 2. **Artifact Binding**
- Public input: `artifact_hash` (SHA-256 of ciphertext)
- Proves: Proof is for the specific encrypted artifact
- Attack prevented: Cannot substitute ciphertext after proof generation
- Enforcement: AES-GCM AAD = `doc_hash` (binds plaintext to encryption)

#### 3. **Identity Binding (Trust List)**
- Public inputs: `signer_fpr` (cert fingerprint), `tl_root` (Merkle root)
- Private inputs: `merkle_path`, `index` (inclusion proof)
- Proves: Signer is in the authorized allow-list
- Attack prevented: Unauthorized signers cannot generate valid proofs

### Protocol Manifest

Each proof generates a `manifest.json` containing:

```json
{
  "version": 1,
  "doc_hash": "<sha256-hex>",
  "artifact": {
    "type": "cipher",
    "artifact_hash": "<sha256-hex>"
  },
  "signer": {
    "pub_x": "<hex32>",
    "pub_y": "<hex32>",
    "fingerprint": "<sha256-cert>"
  },
  "tl_root": "<hex>",
  "proof": "<base64>",
  "timestamp": "<iso8601>"
}
```

The manifest enables complete verification:
- Artifact hash comparison (tamper detection)
- Trust list validation (authorized signer check)
- Proof verification (ZK validity)

## 🚀 Quick Start

### Prerequisites

- Node.js 22.15.0
- Noir/Nargo (installed via Aztec)
- Sample PAdES-signed PDF

### Setup

```bash
# Install dependencies
yarn install

# Compile Noir circuit
cd circuits/pades_ecdsa && nargo compile && cd ../..

# Create trust list
# Edit allowlist.json with your certificate fingerprints
yarn merkle:build allowlist.json --out out
```

### End-to-End Flow

```bash
# 1. Extract document hash from signed PDF
yarn hash-byte-range sample_signed.pdf
# Output: out/doc_hash.bin, out/doc_hash.hex

# 2. Extract CMS signature and public key
yarn extract-cms sample_signed.pdf
# Output: out/VERIFIED_pubkey.json, out/VERIFIED_sig.json

# 3. Encrypt file with AAD binding
yarn encrypt-upload sample.pdf --to out/VERIFIED_pubkey.json
# Output: out/encrypted-file.bin, out/cipher_hash.bin

# 4. Generate ZK proof (auto-loads all inputs)
yarn prove
# Output: out/proof.bin, out/manifest.json

# 5. Verify proof with all bindings
yarn verify
# Checks: artifact hash, trust list, ZK proof validity
```

### Run Tests

```bash
# Full E2E test (positive + tamper detection)
yarn e2e-test
```

## 📊 Security Properties

### What the ZK Proof Guarantees

✅ **Signature Validity**: A valid ECDSA P-256 signature exists over `doc_hash`
✅ **Authorized Signer**: Signer is in the trusted allow-list (Merkle proof)
✅ **Zero-Knowledge**: Signature itself is never revealed
✅ **Artifact Binding**: Proof is cryptographically bound to the specific ciphertext
✅ **Document Binding**: Signature and encryption are both bound to the same document

### Attack Prevention

| Attack | Prevention Mechanism |
|--------|---------------------|
| Document substitution | ECDSA verifies `doc_hash` in circuit |
| Ciphertext swap | `artifact_hash` public input |
| Unauthorized signer | Merkle membership proof |
| Plaintext-ciphertext mismatch | AES-GCM AAD = `doc_hash` |
| Replay attacks | Timestamp in manifest |

## 🗂 File Structure

```
.
├── circuits/pades_ecdsa/        # Noir ZK circuit
│   └── src/main.nr              # ECDSA + Merkle verification
├── tools/merkle/                # Trust list toolchain
│   ├── build.ts                 # Build Merkle tree
│   └── prove.ts                 # Get inclusion proof
├── scripts/                     # Workflow scripts
│   ├── hash-byte-range.ts       # PDF hash extraction
│   ├── extract-cms.ts           # CMS signature parsing
│   ├── encrypt-upload.ts        # AES-GCM encryption
│   ├── decrypt.ts               # AES-GCM decryption
│   ├── prove.ts                 # ZK proof generation
│   ├── verify.ts                # Multi-step verification
│   └── e2e-test.ts              # End-to-end tests
├── allowlist.json               # Trust list (cert fingerprints)
└── out/                         # Generated artifacts
    ├── doc_hash.bin             # Document hash
    ├── cipher_hash.bin          # Artifact hash
    ├── tl_root.hex              # Merkle root
    ├── paths/*.json             # Merkle proofs
    ├── proof.bin                # ZK proof
    ├── manifest.json            # Protocol manifest
    └── encrypted-file.bin       # Encrypted artifact
```

## 📝 Available Commands

### Core Workflow

```bash
yarn hash-byte-range <pdf>               # Extract ByteRange hash
yarn extract-cms <pdf>                   # Parse CMS signature
yarn merkle:build <allowlist> --out dir  # Build trust list
yarn encrypt-upload <file> --to <pubkey> # Encrypt with binding
yarn prove                               # Generate ZK proof
yarn verify                              # Verify proof + bindings
yarn e2e-test                            # Run full test suite
```

### Merkle Toolchain

```bash
yarn merkle:build allowlist.json --out out
  # Generates: out/tl_root.hex, out/paths/*.json

yarn merkle:prove --fingerprint <hex> --out proof.json
  # Retrieves inclusion proof for specific cert
```

## 📚 Technical Details

### Circuit Parameters

- **Merkle tree depth**: 8 (supports 256 signers)
- **Hash function**: SHA-256 (both Merkle and bindings)
- **Curve**: ECDSA P-256 (secp256r1)
- **Proof system**: UltraHonk (via Barretenberg)

### Encryption Scheme

- **Key agreement**: ECDH with P-256
- **KDF**: HKDF-SHA256
- **Encryption**: AES-256-GCM
- **AAD**: `doc_hash` (binds plaintext to ciphertext)

### Certificate Fingerprint

Computed as `SHA-256(certificate-DER)`:

```bash
openssl x509 -in cert.pem -outform DER | openssl dgst -sha256 -hex
```

## 🔬 Development Status

**Current**: Task 2 Complete (100%)
- ✅ Circuit with binding and trust list
- ✅ Merkle toolchain
- ✅ Enhanced prover/verifier
- ✅ Protocol manifest
- ✅ Encryption hardening
- ✅ E2E tests
- ✅ Documentation

**Known Limitations**:
- PAdES-T (timestamped) signatures require full CAdES library
- Merkle tree uses SHA-256 (could optimize to Poseidon2 for smaller proofs)
- IPFS integration ready but uses local files by default

## 📖 References

- [PAdES Specification (ETSI EN 319 142)](https://www.etsi.org/deliver/etsi_en/319100_319199/31914201/01.01.01_60/en_31914201v010101p.pdf)
- [CMS/CAdES (RFC 5652)](https://datatracker.ietf.org/doc/html/rfc5652)
- [Noir Language Docs](https://noir-lang.org/)
- [Aztec Protocol](https://docs.aztec.network/)

---

## Scripts (Original Aztec Starter)

You can find a handful of scripts in the `./scripts` folder.

- `./scripts/deploy_account.ts` is an example of how to deploy a schnorr account.
- `./scripts/deploy_contract.ts` is an example of how to deploy a contract.
- `./scripts/fees.ts` is an example of how to pay for a contract deployment using various fee payment methods.
- `./scripts/multiple_pxe.ts` is an example of how to deploy a contract from one PXE instance and interact with it from another.
- `./scripts/profile_deploy.ts` shows how to profile a transaction and print the results.
- `./scripts/interaction_existing_contract.ts` demonstrates how to interact with an already deployed voting contract, including casting votes and checking vote counts.

### Utility Functions

The `./src/utils/` folder contains utility functions:

- `./src/utils/create_account_from_env.ts` provides functions to create Schnorr accounts from environment variables (SECRET, SIGNING_KEY, and SALT), useful for account management across different environments.
- `./src/utils/setup_pxe.ts` provides a function to set up and configure the Private Execution Environment (PXE) service with proper configuration based on the environment.
- `./src/utils/deploy_account.ts` provides a function to deploy Schnorr accounts to the network with sponsored fee payment, including key generation and deployment verification.
- `./config/config.ts` provides environment-aware configuration loading, automatically selecting the correct JSON config file based on the `ENV` variable.

## ❗ **Error Resolution**

:warning: Tests and scripts set up and run the Private Execution Environment (PXE) and store PXE data in the `./store` directory. If you restart the sandbox, you will need to delete the `./store` directory to avoid errors.

### 🔄 **Update Node.js and Noir Dependencies**

```bash
yarn update
```

### 🔄 **Update Contract**

Get the **contract code from the monorepo**. The script will look at the versions defined in `./Nargo.toml` and fetch that version of the code from the monorepo.

```bash
yarn update
```

You may need to update permissions with:

```bash
chmod +x .github/scripts/update_contract.sh
```

## AI Agent Contributor Guide

This repository includes an [AGENTS.md](./AGENTS.md) file with detailed
instructions for setting up your environment, running tests, and creating
pull requests. Please read it before contributing changes.

### 💬 Join the Community:

<p align="left">
  <a href="https://forum.aztec.network">
    <img src="https://img.shields.io/badge/Aztec%20%20Forum-5C4C9F?style=for-the-badge&logo=startrek&logoColor=white" alt="Forum">
  </a>  
  <a href="https://t.me/AztecAnnouncements_Official">
    <img src="https://img.shields.io/badge/Telegram-26A5E4?logo=telegram&logoColor=white&style=for-the-badge" alt="Telegram">
  </a>
  <a href="https://discord.gg/aztec">
    <img src="https://img.shields.io/badge/Discord-5865F2?logo=discord&logoColor=white&style=for-the-badge" alt="Discord">
  </a>
  <a href="https://x.com/aztecnetwork">
    <img src="https://img.shields.io/badge/Twitter-000000?logo=x&logoColor=white&style=for-the-badge" alt="Twitter (X)">
  </a>
</p>
