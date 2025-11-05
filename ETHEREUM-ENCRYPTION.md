# Ethereum Key Encryption Guide

This guide explains how to use Ethereum keys (secp256k1) for encrypting and decrypting files in the ZK Qualified Signature system.

## Overview

The system now supports two encryption modes:

1. **P-256 Mode** (Original) - Uses secp256r1 curve with ephemeral keys
2. **Ethereum Mode** (New) - Uses secp256k1 curve with Ethereum wallet keys

Both use ECDH for key agreement and AES-256-GCM for encryption.

---

## Why Use Ethereum Keys?

- **Familiar:** Use existing Ethereum wallets (MetaMask, hardware wallets, etc.)
- **Interoperable:** Compatible with Ethereum ecosystem
- **Convenient:** No need to manage separate key pairs
- **Verifiable:** Ethereum addresses provide identity verification
- **Standard:** Uses secp256k1, the same curve as Bitcoin and Ethereum

---

## Quick Start

### 1. Generate Key Pairs

```bash
# Generate a new Ethereum key pair (sender)
yarn eth-recover-pubkey --generate
# Output: out/eth-new-keypair.json

# Generate another key pair (recipient)
yarn eth-recover-pubkey --generate
```

**Output example:**
```
Generated new key pair:
  Address:     0x231aDD13C4286C080c288281F4984392825310AF
  Private Key: 0xa043c88950dac11473b12b4f4386421be533d6c29be5edf38a57b68093b17472
  Public Key:  0x04b9e10f68520f463103edb54e6f4a1ccf8bc8ca87f3dc03e98bce24e8b05005c6...
```

⚠️ **Security Warning:** Store private keys securely! Never commit them to git.

---

### 2. Encrypt a File

```bash
yarn encrypt-eth <file> --sender-key <your-private-key> --recipient <their-public-key>
```

**Example:**
```bash
yarn encrypt-eth sample.pdf \
  --sender-key 0xa043c88950dac11473b12b4f4386421be533d6c29be5edf38a57b68093b17472 \
  --recipient 0x04347adb6bad8e965bd64079881acf4cb4c57783275f9e5463354b7df862da3ec4...
```

**Output:**
```
✓ Encryption complete!
  Metadata:       out/encrypted-eth-metadata.json
  Encrypted file: out/encrypted-eth-file.bin
  Cipher hash:    out/cipher_hash_eth.bin
```

---

### 3. Decrypt a File

```bash
yarn decrypt-eth <metadata-json> --key <your-private-key> --out <output-file>
```

**Example:**
```bash
yarn decrypt-eth out/encrypted-eth-metadata.json \
  --key 0xf6e09cdb93decd3bd83b5bf89d1bbe8262987dfaf1af0c29e63c904354192245 \
  --out decrypted.pdf
```

**Output:**
```
✓ Decryption complete!
  Output: decrypted.pdf
  Hash Verified:  ✓ (file integrity confirmed)
  From:           0x231aDD13C4286C080c288281F4984392825310AF
  To:             0x172375FEe0d773E49cc3AFa14d3e305C399d72cA
```

---

## How It Works

### ECDH Key Agreement

```
Alice (Sender)                          Bob (Recipient)
==============                          ===============

Private Key: privKey_Alice              Private Key: privKey_Bob
Public Key:  pubKey_Alice               Public Key:  pubKey_Bob

Step 1: Alice computes shared secret
┌──────────────────────────────────────────┐
│ shared_secret = ECDH(                    │
│   privKey_Alice,    ← Alice's private    │
│   pubKey_Bob        ← Bob's public       │
│ )                                        │
└──────────────────────────────────────────┘

Step 2: Bob computes SAME shared secret
┌──────────────────────────────────────────┐
│ shared_secret = ECDH(                    │
│   privKey_Bob,      ← Bob's private      │
│   pubKey_Alice      ← Alice's public     │
│ )                                        │
└──────────────────────────────────────────┘

Both get the SAME shared_secret! ✅

Step 3: Derive encryption key
┌──────────────────────────────────────────┐
│ AES_key = HKDF-SHA256(shared_secret)     │
└──────────────────────────────────────────┘

Step 4: Encrypt/Decrypt with AES-256-GCM
```

### Security Properties

1. **Key Agreement:** ECDH on secp256k1
2. **Encryption:** AES-256-GCM
3. **Key Derivation:** HKDF-SHA256
4. **AAD (Additional Authenticated Data):** Document hash
5. **Artifact Binding:** SHA-256 of ciphertext (for ZK proof)

---

## Complete Workflow

### Scenario: Alice sends encrypted PDF to Bob

**Alice has:**
- Her private key: `0xaaaa...`
- Bob's public key: `0x04bbbb...`

**Bob has:**
- His private key: `0xbbbb...`
- Alice's public key: `0x04aaaa...` (from metadata)

**Step-by-step:**

```bash
# 1. Alice encrypts for Bob
yarn encrypt-eth confidential.pdf \
  --sender-key 0xaaaa... \
  --recipient 0x04bbbb...

# Output:
#   - out/encrypted-eth-metadata.json (contains Alice's public key)
#   - out/encrypted-eth-file.bin
#   - out/cipher_hash_eth.bin

# 2. Alice sends to Bob:
#   - encrypted-eth-metadata.json
#   - encrypted-eth-file.bin

# 3. Bob decrypts
yarn decrypt-eth encrypted-eth-metadata.json \
  --key 0xbbbb... \
  --out confidential.pdf

# ✓ Success! Bob now has the original file
```

---

## Getting Public Keys

### Problem: Ethereum Addresses Are Not Public Keys

Ethereum addresses (like `0x1234...`) are **20 bytes** - they're only a **hash** of the public key!

```
Ethereum Address = keccak256(publicKey)[12:32]
                   ↑
                   Only last 20 bytes
```

You need the **full 65-byte public key** (uncompressed format: `0x04` + 64 bytes).

### Solutions

#### Option 1: From Private Key (Recommended)

If you control the wallet:

```bash
yarn eth-recover-pubkey --key 0x1234567890abcdef...
```

Output:
```json
{
  "address": "0x231aDD13C4286C080c288281F4984392825310AF",
  "publicKey": "0x04b9e10f68520f463103edb54e6f4a1ccf8bc8ca87f3dc03e98bce24e8b05005c6...",
  "x": "0xb9e10f68520f463103edb54e6f4a1ccf8bc8ca87f3dc03e98bce24e8b05005c6",
  "y": "0x762bfa9b9701a3b614769cdefbf456d1d3f6156964ed5834b362b7041c01de56"
}
```

#### Option 2: From Message Signature

Ask the user to sign a message, then recover their public key:

```bash
# User signs a message with their wallet (e.g., MetaMask)
# You get: message + signature

yarn eth-recover-pubkey \
  --message "Please share your public key for encryption" \
  --signature 0xabcd1234...
```

This recovers the full public key from the signature!

#### Option 3: From Blockchain Transaction

If the user has sent a transaction, you can recover their public key from any signed transaction on Ethereum.

---

## Integration with ZK Proofs

The Ethereum encryption system is **fully compatible** with the ZK proof workflow:

```bash
# 1. Extract document hash from signed PDF
yarn hash-byte-range signed.pdf
# Output: out/doc_hash.hex

# 2. Encrypt with Ethereum keys
yarn encrypt-eth signed.pdf \
  --sender-key 0x... \
  --recipient 0x04...
# Output: out/cipher_hash_eth.hex

# 3. Generate ZK proof (works with Ethereum-encrypted files!)
yarn prove
# The proof binds to cipher_hash_eth.hex

# 4. Verify
yarn verify
# ✓ All bindings verified
```

The `artifact_hash` in the ZK proof is the **SHA-256 of the ciphertext**, which works identically whether encrypted with P-256 or secp256k1.

---

## Metadata Format

The encryption metadata includes all information needed for decryption:

```json
{
  "cid": "local:out/encrypted-eth.bin",
  "iv": "a1b2c3d4e5f6...",
  "aad": "3b95e4ce3c63567bbf1f071bd042bd68188d14d0539a4402807ae0b83072e61f",
  "senderPublicKey": "0x04b9e10f68520f463103edb54e6f4a1ccf8bc8ca87f3dc03e98bce24e8b05005c6...",
  "alg": "ecdh-secp256k1+aes-256-gcm",
  "encryptedSize": 51144,
  "originalHash": "3b95e4ce3c63567bbf1f071bd042bd68188d14d0539a4402807ae0b83072e61f",
  "curve": "secp256k1"
}
```

**Fields:**
- `senderPublicKey` - Sender's full public key (so recipient can derive shared secret)
- `iv` - Random initialization vector for AES-GCM
- `aad` - Additional Authenticated Data (document hash)
- `curve` - "secp256k1" (Ethereum curve)

---

## Security Considerations

### ✅ What's Secure

1. **Forward Secrecy:** Each encryption uses a unique shared secret
2. **Authentication:** AAD binds encryption to specific document
3. **Integrity:** GCM auth tag prevents tampering
4. **Identity:** Ethereum addresses verify sender/recipient
5. **Non-repudiation:** Only holder of private key can decrypt

### ⚠️ Important Notes

1. **Private Key Security:**
   - Never expose private keys in logs, environment variables, or code
   - Use hardware wallets when possible
   - Consider key management systems (AWS KMS, HashiCorp Vault)

2. **Public Key Verification:**
   - Always verify recipient's public key matches their claimed address
   - Use checksums to prevent typos
   - Consider using ENS names for human-readable addresses

3. **Metadata Integrity:**
   - The metadata file must not be tampered with
   - Consider signing the metadata with sender's key
   - Store metadata securely alongside ciphertext

---

## Comparison: P-256 vs Ethereum

| Aspect | P-256 (Original) | Ethereum (secp256k1) |
|--------|------------------|----------------------|
| **Curve** | secp256r1 | secp256k1 |
| **Used by** | TLS, government | Bitcoin, Ethereum |
| **Key Management** | Ephemeral keys | Persistent wallet keys |
| **Identity** | One-time use | Ethereum addresses |
| **Ecosystem** | Limited | Vast (wallets, tools) |
| **Security** | NIST standard | Battle-tested (Bitcoin) |
| **Recommendation** | Compliance required | General use |

Both are cryptographically secure. Choose based on your requirements:
- **P-256:** Regulatory compliance, government use
- **secp256k1:** Ethereum ecosystem, wallet integration

---

## Troubleshooting

### Error: Invalid recipient public key length

**Problem:** Public key must be 65 bytes (132 hex chars) in uncompressed format.

**Solution:**
```bash
# Wrong (20 bytes - this is an address!)
0x231aDD13C4286C080c288281F4984392825310AF

# Correct (65 bytes - full public key)
0x04b9e10f68520f463103edb54e6f4a1ccf8bc8ca87f3dc03e98bce24e8b05005c6762bfa9b9701a3b614769cdefbf456d1d3f6156964ed5834b362b7041c01de56
```

Use `yarn eth-recover-pubkey` to get the full public key.

---

### Error: Decryption failed - Authentication failed

**Possible causes:**
1. **Wrong private key** - Shared secret doesn't match
2. **Corrupted ciphertext** - File was modified
3. **AAD mismatch** - Metadata was altered

**Solution:** Verify you're using the correct recipient private key that corresponds to the public key used for encryption.

---

### Error: Hash mismatch! File may be corrupted

**Problem:** Decrypted file's hash doesn't match expected hash in metadata.

**Solution:** Re-download or re-encrypt the file. The ciphertext may have been corrupted during transfer.

---

## API Reference

### `yarn encrypt-eth`

Encrypts a file using Ethereum keys with ECDH + AES-256-GCM.

**Usage:**
```bash
yarn encrypt-eth <file> --sender-key <private-key> --recipient <public-key>
```

**Arguments:**
- `<file>` - Path to file to encrypt
- `--sender-key` - Sender's private key (32 bytes hex, with or without 0x)
- `--recipient` - Recipient's public key (65 bytes hex, uncompressed)

**Outputs:**
- `out/encrypted-eth-metadata.json` - Encryption metadata
- `out/encrypted-eth-file.bin` - Encrypted file
- `out/cipher_hash_eth.bin` - SHA-256 of ciphertext (for ZK proof)
- `out/cipher_hash_eth.hex` - Hex-encoded cipher hash

---

### `yarn decrypt-eth`

Decrypts a file encrypted with Ethereum keys.

**Usage:**
```bash
yarn decrypt-eth <metadata-json> --key <private-key> [--out <output-file>]
```

**Arguments:**
- `<metadata-json>` - Path to encryption metadata
- `--key` - Recipient's private key (32 bytes hex)
- `--out` - Output file path (default: `out/decrypted-eth.pdf`)

**Outputs:**
- Decrypted file at specified path

---

### `yarn eth-recover-pubkey`

Utility to generate keys or recover public keys from addresses.

**Usage:**
```bash
# Generate new key pair
yarn eth-recover-pubkey --generate

# Derive public key from private key
yarn eth-recover-pubkey --key <private-key>

# Recover public key from signature
yarn eth-recover-pubkey --message <msg> --signature <sig>
```

**Outputs:**
- `out/eth-new-keypair.json` - Generated key pair (with --generate)
- `out/eth-pubkey.json` - Derived public key (with --key)
- `out/eth-recovered-pubkey.json` - Recovered public key (with --message/--signature)

---

## Examples

### Example 1: Simple Encryption

```bash
# Generate keys
yarn eth-recover-pubkey --generate
# Sender: 0xaaaa..., pubkey: 0x04aaaa...

yarn eth-recover-pubkey --generate
# Recipient: 0xbbbb..., pubkey: 0x04bbbb...

# Encrypt
yarn encrypt-eth document.pdf \
  --sender-key 0xaaaa... \
  --recipient 0x04bbbb...

# Decrypt
yarn decrypt-eth out/encrypted-eth-metadata.json \
  --key 0xbbbb...
```

---

### Example 2: With Existing MetaMask Wallet

```bash
# 1. Export private key from MetaMask
#    (Account Details → Export Private Key)
#    Example: 0xaaaa1111bbbb2222...

# 2. Get your public key
yarn eth-recover-pubkey --key 0xaaaa1111bbbb2222...
# Saves to: out/eth-pubkey.json
# Public key: 0x04ccccdddd...

# 3. Share your public key with sender
#    Sender uses: 0x04ccccdddd...

# 4. When you receive encrypted file:
yarn decrypt-eth received-metadata.json \
  --key 0xaaaa1111bbbb2222... \
  --out document.pdf
```

---

### Example 3: Recover Recipient's Public Key from Signature

```bash
# 1. Ask recipient to sign a message
#    (e.g., in MetaMask: "Sign message for encryption key exchange")
#    You get: signature = 0xabcd1234...

# 2. Recover their public key
yarn eth-recover-pubkey \
  --message "Sign message for encryption key exchange" \
  --signature 0xabcd1234...

# 3. Use recovered public key for encryption
#    Public key from out/eth-recovered-pubkey.json
yarn encrypt-eth document.pdf \
  --sender-key 0x... \
  --recipient <recovered-pubkey>
```

---

## Integration with Smart Contracts

The Ethereum encryption system can be integrated with smart contracts for access control:

```solidity
// Example: Store encrypted file hash on-chain
contract EncryptedFileRegistry {
    struct EncryptedFile {
        bytes32 cipherHash;     // SHA-256 of ciphertext
        address sender;         // Ethereum address of sender
        address recipient;      // Ethereum address of recipient
        uint256 timestamp;
    }

    mapping(bytes32 => EncryptedFile) public files;

    function registerFile(
        bytes32 fileId,
        bytes32 cipherHash,
        address recipient
    ) external {
        files[fileId] = EncryptedFile({
            cipherHash: cipherHash,
            sender: msg.sender,
            recipient: recipient,
            timestamp: block.timestamp
        });
    }

    function verifyFile(bytes32 fileId, bytes32 hash)
        external view returns (bool) {
        return files[fileId].cipherHash == hash;
    }
}
```

This allows on-chain verification of encrypted file integrity!

---

## Summary

**Ethereum encryption provides:**
- ✅ Seamless integration with Ethereum wallets
- ✅ Standard ECDH + AES-256-GCM encryption
- ✅ Full compatibility with ZK proof system
- ✅ Identity verification via Ethereum addresses
- ✅ Battle-tested cryptography (secp256k1)

**Commands:**
```bash
yarn eth-recover-pubkey --generate     # Generate keys
yarn encrypt-eth <file> ...            # Encrypt
yarn decrypt-eth <metadata> ...        # Decrypt
```

**For more details, see:**
- Main README: `README.md`
- Source code: `scripts/encrypt-eth.ts`, `scripts/decrypt-eth.ts`
- ZK proof integration: `scripts/prove.ts`
