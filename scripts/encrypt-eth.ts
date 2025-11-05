#!/usr/bin/env node
/**
 * encrypt-eth.ts
 *
 * Encrypts a PDF file using Ethereum keys (secp256k1) with ECDH + AES-GCM.
 * Key agreement: ECDH with secp256k1 (Ethereum curve)
 * Encryption: AES-256-GCM with doc_hash as AAD
 *
 * Usage: yarn encrypt-eth <pdf-file> --sender-key <private-key-hex> --recipient <public-key-hex>
 *        yarn encrypt-eth sample.pdf --sender-key 0x1234... --recipient 0x04abcd...
 *
 * Note: Recipient public key must be full uncompressed 65 bytes (0x04 + x + y)
 *       To get it from an address, use: yarn eth-pubkey-from-sig
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ethers } from 'ethers';

interface EthEncryptedPackage {
    cid: string;
    iv: string;              // hex
    aad: string;             // hex (doc_hash)
    senderPublicKey: string; // Sender's full public key (65 bytes hex, for decryption)
    alg: string;
    encryptedSize: number;
    originalHash: string;    // SHA-256 of original file
    curve: string;           // "secp256k1" (Ethereum)
}

/**
 * Derive shared secret using ECDH with Ethereum keys (secp256k1)
 *
 * @param senderPrivateKey - Sender's private key (32 bytes hex, with or without 0x)
 * @param recipientPublicKey - Recipient's full public key (65 bytes hex, 0x04 + x + y)
 * @returns Shared secret (32 bytes)
 */
function deriveSharedSecretEth(
    senderPrivateKey: string,
    recipientPublicKey: string
): Buffer {
    // Ensure keys have 0x prefix
    if (!senderPrivateKey.startsWith('0x')) {
        senderPrivateKey = '0x' + senderPrivateKey;
    }
    if (!recipientPublicKey.startsWith('0x')) {
        recipientPublicKey = '0x' + recipientPublicKey;
    }

    // Validate recipient public key format
    if (recipientPublicKey.length !== 132) { // 0x + 130 hex chars (65 bytes)
        throw new Error(
            `Invalid recipient public key length: ${recipientPublicKey.length}. ` +
            `Expected 132 chars (0x04 + 64 bytes hex). ` +
            `Got: ${recipientPublicKey.substring(0, 20)}...`
        );
    }

    if (!recipientPublicKey.startsWith('0x04')) {
        throw new Error(
            `Recipient public key must be uncompressed format (start with 0x04). ` +
            `Got: ${recipientPublicKey.substring(0, 6)}`
        );
    }

    // Create signing key from private key
    const signingKey = new ethers.SigningKey(senderPrivateKey);

    // Compute shared secret using ECDH
    const sharedPoint = signingKey.computeSharedSecret(recipientPublicKey);

    // The shared secret is the x-coordinate of the ECDH point
    // ethers.js returns the full point, we take the x-coordinate (first 32 bytes after 0x04)
    const sharedSecret = Buffer.from(sharedPoint.slice(2), 'hex');

    return sharedSecret;
}

/**
 * Key Derivation Function - derives AES key from shared secret
 */
function kdf(sharedSecret: Buffer, salt: Buffer = Buffer.alloc(0)): Buffer {
    // HKDF-SHA256 to derive 32 bytes for AES-256
    return Buffer.from(crypto.hkdfSync('sha256', sharedSecret, salt, 'aes-256-gcm-key', 32));
}

/**
 * Get public key from private key
 */
function getPublicKeyFromPrivate(privateKey: string): string {
    if (!privateKey.startsWith('0x')) {
        privateKey = '0x' + privateKey;
    }

    const signingKey = new ethers.SigningKey(privateKey);
    return signingKey.publicKey; // Returns uncompressed format (0x04 + x + y)
}

async function uploadToIpfs(data: Buffer): Promise<string> {
    // For POC: Save locally (IPFS integration ready but optional)
    const encPath = path.join('out', 'encrypted-eth.bin');
    fs.writeFileSync(encPath, data);
    return 'local:' + encPath;
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 5 || !args.includes('--sender-key') || !args.includes('--recipient')) {
        console.error('Usage: yarn encrypt-eth <pdf-file> --sender-key <private-key-hex> --recipient <public-key-hex>');
        console.error('');
        console.error('Example:');
        console.error('  yarn encrypt-eth sample.pdf \\');
        console.error('    --sender-key 0x1234567890abcdef... \\');
        console.error('    --recipient 0x04abcdef... (65 bytes uncompressed)');
        console.error('');
        console.error('Note: To get recipient public key from address, use:');
        console.error('  yarn eth-pubkey-from-sig --address 0x...');
        process.exit(1);
    }

    const pdfPath = args[0];
    const senderPrivateKey = args[args.indexOf('--sender-key') + 1];
    const recipientPublicKey = args[args.indexOf('--recipient') + 1];

    if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF file not found: ${pdfPath}`);
    }

    console.log('╔════════════════════════════════════════════════╗');
    console.log('║   Ethereum Key Encryption (secp256k1)          ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    console.log('Loading files...');
    const pdfData = fs.readFileSync(pdfPath);
    console.log(`  PDF size: ${pdfData.length} bytes`);

    // Compute document hash
    const docHash = crypto.createHash('sha256').update(pdfData).digest();
    console.log(`  Document hash: ${docHash.toString('hex')}`);

    // Get sender's public key
    console.log('\nDeriving sender public key...');
    const senderPublicKey = getPublicKeyFromPrivate(senderPrivateKey);
    const senderAddress = ethers.computeAddress(senderPublicKey);
    console.log(`  Sender address: ${senderAddress}`);
    console.log(`  Sender pubkey:  ${senderPublicKey.substring(0, 20)}...`);

    console.log('\nValidating recipient public key...');
    try {
        const recipientAddress = ethers.computeAddress(recipientPublicKey);
        console.log(`  Recipient address: ${recipientAddress}`);
        console.log(`  Recipient pubkey:  ${recipientPublicKey.substring(0, 20)}...`);
    } catch (err) {
        throw new Error(`Invalid recipient public key: ${err}`);
    }

    console.log('\nPerforming ECDH (secp256k1)...');
    const sharedSecret = deriveSharedSecretEth(senderPrivateKey, recipientPublicKey);
    console.log(`  Shared secret: ${sharedSecret.toString('hex').substring(0, 32)}...`);

    console.log('\nDeriving encryption key...');
    const aesKey = kdf(sharedSecret);

    console.log('\nEncrypting PDF with AES-256-GCM...');
    const iv = crypto.randomBytes(12);  // 96-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);

    // Set AAD (Additional Authenticated Data) to doc_hash
    // This binds the encryption to the specific document
    cipher.setAAD(docHash);

    const encrypted = Buffer.concat([
        cipher.update(pdfData),
        cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    // Combine encrypted data + auth tag
    const encryptedPackage = Buffer.concat([encrypted, authTag]);

    console.log(`  Encrypted size: ${encryptedPackage.length} bytes`);
    console.log(`  Auth tag: ${authTag.toString('hex')}`);

    // Compute artifact hash (SHA-256 of ciphertext) for ZK proof binding
    const cipherHash = crypto.createHash('sha256').update(encryptedPackage).digest();
    console.log(`  Artifact hash: ${cipherHash.toString('hex')}`);

    console.log('\nSaving encrypted file...');
    const cid = await uploadToIpfs(encryptedPackage);
    console.log(`  ✅ Saved: ${cid}`);

    const metadata: EthEncryptedPackage = {
        cid,
        iv: iv.toString('hex'),
        aad: docHash.toString('hex'),
        senderPublicKey: senderPublicKey,  // Full public key for recipient to derive shared secret
        alg: 'ecdh-secp256k1+aes-256-gcm',
        encryptedSize: encryptedPackage.length,
        originalHash: docHash.toString('hex'),
        curve: 'secp256k1'
    };

    const outDir = 'out';
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const metadataPath = path.join(outDir, 'encrypted-eth-metadata.json');
    const cipherHashPath = path.join(outDir, 'cipher_hash_eth.bin');
    const cipherHashHexPath = path.join(outDir, 'cipher_hash_eth.hex');
    const encryptedFilePath = path.join(outDir, 'encrypted-eth-file.bin');

    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    fs.writeFileSync(cipherHashPath, cipherHash);
    fs.writeFileSync(cipherHashHexPath, cipherHash.toString('hex'));
    fs.writeFileSync(encryptedFilePath, encryptedPackage);

    console.log(`\n✓ Encryption complete!`);
    console.log(`  Metadata:       ${metadataPath}`);
    console.log(`  Encrypted file: ${encryptedFilePath}`);
    console.log(`  Cipher hash:    ${cipherHashPath}`);
    console.log(`\nTo decrypt, recipient runs:`);
    console.log(`  yarn decrypt-eth ${metadataPath} --key <recipient-private-key>`);

    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║   Encryption Details                           ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log(`  Curve:          secp256k1 (Ethereum)`);
    console.log(`  Key Agreement:  ECDH`);
    console.log(`  Encryption:     AES-256-GCM`);
    console.log(`  AAD:            doc_hash (prevents plaintext swap)`);
    console.log(`  Artifact Hash:  SHA-256(ciphertext) (for ZK proof)`);
}

main().catch(err => {
    console.error('\n❌ Error:', err.message);
    if (err.stack) {
        console.error('\nStack trace:', err.stack);
    }
    process.exit(1);
});
