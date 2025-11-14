# Example 1: Local Trust List Only

This example demonstrates the complete workflow using **local trust list verification only** (Task 2 functionality).

## Overview

- **Trust model**: Local allowlist of trusted signers
- **Use case**: Private document exchange within an organization
- **Trust source**: Manually curated `allowlist.json`
- **ZK proof**: Verifies signer is in local trust list

## Prerequisites

- Signed PDF document (`sample_signed.pdf`)
- Certificate of the signer added to `allowlist.json`
- Recipient's public key for encryption

## Step-by-Step Walkthrough

### 1. Setup Trust List

Create `allowlist.json` with trusted certificate fingerprints:

```json
{
  "signers": [
    {
      "name": "Alice (Internal Signer)",
      "fingerprint": "06a02856c08dde5c6679377c06f6fe7be1855d586bd1448343db2736b1473cd3",
      "organization": "Example Corp",
      "added": "2025-01-15"
    },
    {
      "name": "Bob (Finance Department)",
      "fingerprint": "a7b3c4d5e6f7890123456789abcdef0123456789abcdef0123456789abcdef01",
      "organization": "Example Corp",
      "added": "2025-01-20"
    }
  ]
}
```

### 2. Build Merkle Tree

```bash
yarn merkle:build allowlist.json --out out
```

**Expected Output:**
```
Building Merkle tree from allowlist...
  Signers: 2
  Depth: 8
  Capacity: 256 signers

✓ Merkle tree built successfully
  Root: 2c22e22941cefc488db7e86be3c2b467f4efe8fa15fc057bc4a7cfddc917bbf2

Outputs:
  out/tl_root.hex
  out/tl_root.json
  out/paths/06a02856c08dde5c6679377c06f6fe7be1855d586bd1448343db2736b1473cd3.json
  out/paths/a7b3c4d5e6f7890123456789abcdef0123456789abcdef0123456789abcdef01.json
```

### 3. Extract Document Hash

```bash
yarn hash-byte-range test_files/sample_signed.pdf
```

**Expected Output:**
```
Reading PDF: test_files/sample_signed.pdf
ByteRange: [0 840 960 1234]
  Part 1: bytes 0 to 839 (length 840)
  Part 2: bytes 960 to 2193 (length 1234)
Combined length: 2074 bytes

SHA-256 digest: 28327db146121652074521fef547918d6b96773d62234e77709d07fc0c589434

Outputs written:
  Binary: out/doc_hash.bin
  Hex:    out/doc_hash.hex
```

### 4. Extract CMS Signature

```bash
yarn extract-cms test_files/sample_signed.pdf
```

**Expected Output:**
```
Reading PDF: test_files/sample_signed.pdf
Extracting CMS signature...

✓ Signature extracted successfully

Algorithm: ECDSA
Curve: prime256v1 (P-256)
Public Key:
  x: 83db162f9d339482c2d4f638ce909581bd972626583718d3c7e5231cce78c1a5
  y: 251449d534548cc8c93d4294c28baea40d7889f1384d477fdb0c011c18766319

Signature:
  r: 3045022100a1b2c3d4e5f6...
  s: 021f98765432109876543210...

Certificate Fingerprint:
  SHA-256: 06a02856c08dde5c6679377c06f6fe7be1855d586bd1448343db2736b1473cd3

Outputs:
  out/VERIFIED_pubkey.json
  out/VERIFIED_sig.json
  out/VERIFIED_cert_fpr.hex
```

### 5. Encrypt Document

```bash
yarn encrypt-upload test_files/sample.pdf --to out/VERIFIED_pubkey.json
```

**Expected Output:**
```
Loading recipient public key...
  x: 83db162f9d339482...
  y: 251449d534548cc8...

Reading plaintext file...
  Size: 45,231 bytes

Generating ephemeral key pair...
Performing ECDH key agreement...
Deriving AES-256 key with HKDF-SHA256...

Encrypting with AES-256-GCM...
  AAD: 28327db146121652074521fef547918d6b96773d62234e77709d07fc0c589434
  IV:  a1b2c3d4e5f6g7h8i9j0
  Auth tag: 16 bytes

Computing ciphertext hash...
  SHA-256: 67f593a9c4a0e194aaeac072d41f97371ae202742f0db833f37d59a5d5b9c926

Outputs:
  out/encrypted-file.bin (45,263 bytes)
  out/cipher_hash.bin
  out/encrypted-metadata.json
```

### 6. Generate ZK Proof (Local Trust Only)

```bash
yarn prove
```

**Expected Output:**
```
╔════════════════════════════════════════════════════╗
║   ZK Qualified Signature - Proof Generation        ║
╚════════════════════════════════════════════════════╝

Loading inputs...
  doc_hash:     28327db146121652074521fef547918d6b96773d62234e77709d07fc0c589434
  artifact_hash: 67f593a9c4a0e194aaeac072d41f97371ae202742f0db833f37d59a5d5b9c926
  pub_key_x:    83db162f9d339482c2d4f638ce909581bd972626583718d3c7e5231cce78c1a5
  pub_key_y:    251449d534548cc8c93d4294c28baea40d7889f1384d477fdb0c011c18766319
  signer_fpr:   06a02856c08dde5c6679377c06f6fe7be1855d586bd1448343db2736b1473cd3
  tl_root:      2c22e22941cefc488db7e86be3c2b467f4efe8fa15fc057bc4a7cfddc917bbf2
  eu_trust:     disabled
  index:        0

Compiling circuit...
✓ Circuit compiled

Initializing Noir...
✓ Noir initialized

Initializing Barretenberg backend...
✓ Backend initialized

Generating witness...
✓ Witness generated (took 2.3s)

Generating proof...
✓ Proof generated (took 5m 23s)

Saving outputs...
  out/proof.bin (2.1 KB)
  out/vkey.bin (1.8 KB)
  out/manifest.json

✅ Proof generation complete!
```

### 7. Verify Proof

```bash
yarn verify
```

**Expected Output:**
```
╔════════════════════════════════════════════════════╗
║   ZK Qualified Signature Verification              ║
╚════════════════════════════════════════════════════╝

[1/6] Loading manifest...
  Version: 1
  Document hash: 2832...9434
  Artifact hash: 67f5...c926
  Signer fingerprint: 06a0...3cd3
  Trust list root: 2c22...bbf2
  EU Trust: disabled
  Timestamp: 2025-10-25T10:30:45.123Z

[2/6] Verifying artifact binding...
  Loading ciphertext: out/encrypted-file.bin
  Computing SHA-256...
  ✓ Artifact hash matches ciphertext

[3/6] Verifying local trust list membership...
  Loading trust list root: out/tl_root.hex
  Comparing roots...
  ✓ Trust list root matches

[4/6] Verifying EU Trust List membership...
  ⊘ EU Trust verification disabled

[5/6] Loading proof...
  Proof size: 2,134 bytes
  ✓ Proof loaded

[6/6] Verifying zero-knowledge proof...
  Initializing Barretenberg verifier...
  ✓ ZK proof verified! (took 87s)

╔════════════════════════════════════════════════════╝
║              ✅ ALL VERIFICATIONS PASSED! ✅        ║
╚════════════════════════════════════════════════════╝

Summary:
  ✓ Signature is valid (proven in ZK)
  ✓ Signer is in local trust list
  ✓ Document hash matches signed bytes
  ✓ Artifact binding verified (no substitution)
  ✓ Proof cryptographically sound
```

## Manifest Example

The generated `out/manifest.json`:

```json
{
  "version": 1,
  "doc_hash": "28327db146121652074521fef547918d6b96773d62234e77709d07fc0c589434",
  "artifact": {
    "type": "cipher",
    "artifact_hash": "67f593a9c4a0e194aaeac072d41f97371ae202742f0db833f37d59a5d5b9c926"
  },
  "signer": {
    "pub_x": "83db162f9d339482c2d4f638ce909581bd972626583718d3c7e5231cce78c1a5",
    "pub_y": "251449d534548cc8c93d4294c28baea40d7889f1384d477fdb0c011c18766319",
    "fingerprint": "06a02856c08dde5c6679377c06f6fe7be1855d586bd1448343db2736b1473cd3"
  },
  "tl_root": "2c22e22941cefc488db7e86be3c2b467f4efe8fa15fc057bc4a7cfddc917bbf2",
  "eu_trust": {
    "enabled": false
  },
  "proof": "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiMkJSYnKCkqKywtLi8wMTIzNDU2Nzg5Ojs8PT4/QEFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaW1xdXl9gYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXp7fH1+fw==",
  "timestamp": "2025-10-25T10:30:45.123Z"
}
```

## Security Properties

This workflow provides:

✅ **Signature Validity**: ZK proof confirms ECDSA signature is valid over `doc_hash`
✅ **Authorized Signer**: Merkle proof verifies signer is in `allowlist.json`
✅ **Document Binding**: Signature cryptographically bound to exact PDF bytes
✅ **Artifact Binding**: Proof bound to specific ciphertext (prevents swaps)
✅ **Plaintext-Ciphertext Binding**: AES-GCM AAD ensures encryption matches document
✅ **Zero-Knowledge**: Signature value never revealed

## Use Cases

- **Internal audits**: Prove document was signed by authorized employee
- **Private compliance**: Verify signer without revealing identity
- **Controlled access**: Only parties with local trust list can verify
- **Custom trust**: Organization defines own trusted signers

## Next Steps

- **Example 2**: See how to add EU Trust List verification (dual trust)
- **Example 3**: Learn about the verification process in detail
- **Example 4**: Explore DocMDP certifying signatures
