#!/usr/bin/env node
/**
 * decrypt-eth.ts
 *
 * Decrypts a PDF file encrypted with Ethereum keys (secp256k1) using ECDH + AES-GCM.
 * Uses recipient's private key to perform ECDH with sender's public key.
 *
 * Usage: yarn decrypt-eth <metadata-json> --key <private-key-hex> --out <output-pdf>
 *        yarn decrypt-eth out/encrypted-eth-metadata.json --key 0x1234... --out decrypted.pdf
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ethers } from 'ethers';

interface EthEncryptedPackage {
    cid: string;
    iv: string;
    aad: string;
    senderPublicKey: string;
    alg: string;
    encryptedSize: number;
    originalHash: string;
    curve: string;
}

/**
 * Derive shared secret using ECDH with Ethereum keys (secp256k1)
 *
 * @param recipientPrivateKey - Recipient's private key (32 bytes hex)
 * @param senderPublicKey - Sender's full public key (65 bytes hex)
 * @returns Shared secret (32 bytes)
 */
function deriveSharedSecretEth(
    recipientPrivateKey: string,
    senderPublicKey: string
): Buffer {
    // Ensure keys have 0x prefix
    if (!recipientPrivateKey.startsWith('0x')) {
        recipientPrivateKey = '0x' + recipientPrivateKey;
    }
    if (!senderPublicKey.startsWith('0x')) {
        senderPublicKey = '0x' + senderPublicKey;
    }

    // Create signing key from private key
    const signingKey = new ethers.SigningKey(recipientPrivateKey);

    // Compute shared secret using ECDH
    const sharedPoint = signingKey.computeSharedSecret(senderPublicKey);

    // The shared secret is the x-coordinate of the ECDH point
    const sharedSecret = Buffer.from(sharedPoint.slice(2), 'hex');

    return sharedSecret;
}

/**
 * Key Derivation Function - derives AES key from shared secret
 */
function kdf(sharedSecret: Buffer, salt: Buffer = Buffer.alloc(0)): Buffer {
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
    return signingKey.publicKey;
}

async function fetchFromIpfs(cid: string): Promise<Buffer> {
    if (cid.startsWith('local:')) {
        // Local file fallback
        const localPath = cid.substring(6);
        return fs.readFileSync(localPath);
    }

    throw new Error('IPFS fetching not implemented. Use local files for now.');
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 3 || !args.includes('--key')) {
        console.error('Usage: yarn decrypt-eth <metadata-json> --key <private-key-hex> [--out <output-pdf>]');
        console.error('');
        console.error('Example:');
        console.error('  yarn decrypt-eth out/encrypted-eth-metadata.json \\');
        console.error('    --key 0x1234567890abcdef... \\');
        console.error('    --out decrypted.pdf');
        process.exit(1);
    }

    const metadataPath = args[0];
    const recipientPrivateKey = args[args.indexOf('--key') + 1];
    const outPath = args.includes('--out')
        ? args[args.indexOf('--out') + 1]
        : 'out/decrypted-eth.pdf';

    if (!fs.existsSync(metadataPath)) {
        throw new Error(`Metadata file not found: ${metadataPath}`);
    }

    console.log('╔════════════════════════════════════════════════╗');
    console.log('║   Ethereum Key Decryption (secp256k1)          ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    console.log('Loading metadata...');
    const metadata: EthEncryptedPackage = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

    console.log(`  CID: ${metadata.cid}`);
    console.log(`  Algorithm: ${metadata.alg}`);
    console.log(`  Curve: ${metadata.curve}`);
    console.log(`  Expected size: ${metadata.encryptedSize} bytes`);

    // Verify curve
    if (metadata.curve !== 'secp256k1') {
        throw new Error(`Wrong curve! Expected secp256k1, got ${metadata.curve}`);
    }

    console.log('\nDeriving recipient public key...');
    const recipientPublicKey = getPublicKeyFromPrivate(recipientPrivateKey);
    const recipientAddress = ethers.computeAddress(recipientPublicKey);
    console.log(`  Recipient address: ${recipientAddress}`);
    console.log(`  Recipient pubkey:  ${recipientPublicKey.substring(0, 20)}...`);

    console.log('\nValidating sender public key...');
    const senderAddress = ethers.computeAddress(metadata.senderPublicKey);
    console.log(`  Sender address: ${senderAddress}`);
    console.log(`  Sender pubkey:  ${metadata.senderPublicKey.substring(0, 20)}...`);

    console.log('\nFetching encrypted data...');
    const encryptedData = await fetchFromIpfs(metadata.cid);
    console.log(`  Downloaded: ${encryptedData.length} bytes`);

    if (encryptedData.length !== metadata.encryptedSize) {
        console.warn(`  ⚠️  Size mismatch! Expected ${metadata.encryptedSize}, got ${encryptedData.length}`);
    }

    console.log('\nPerforming ECDH (secp256k1)...');
    const sharedSecret = deriveSharedSecretEth(recipientPrivateKey, metadata.senderPublicKey);
    console.log(`  Shared secret: ${sharedSecret.toString('hex').substring(0, 32)}...`);

    console.log('\nDeriving decryption key...');
    const aesKey = kdf(sharedSecret);

    console.log('\nDecrypting with AES-256-GCM...');

    // Split encrypted data and auth tag
    // Last 16 bytes are the auth tag
    const authTag = encryptedData.subarray(-16);
    const ciphertext = encryptedData.subarray(0, -16);

    console.log(`  Ciphertext: ${ciphertext.length} bytes`);
    console.log(`  Auth tag: ${authTag.toString('hex')}`);

    const iv = Buffer.from(metadata.iv, 'hex');
    const aad = Buffer.from(metadata.aad, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(authTag);
    decipher.setAAD(aad);

    try {
        const decrypted = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final()
        ]);

        console.log(`  Decrypted: ${decrypted.length} bytes`);

        // Verify hash
        const decryptedHash = crypto.createHash('sha256').update(decrypted).digest('hex');
        console.log(`  Decrypted hash: ${decryptedHash}`);
        console.log(`  Expected hash:  ${metadata.originalHash}`);

        if (decryptedHash === metadata.originalHash) {
            console.log(`  ✅ Hash verification passed!`);
        } else {
            console.error(`  ❌ Hash mismatch! File may be corrupted.`);
            throw new Error('Hash verification failed');
        }

        // Save decrypted file
        fs.writeFileSync(outPath, decrypted);

        console.log(`\n✓ Decryption complete!`);
        console.log(`  Output: ${outPath}`);

        console.log('\n╔════════════════════════════════════════════════╗');
        console.log('║   Decryption Details                           ║');
        console.log('╚════════════════════════════════════════════════╝');
        console.log(`  Curve:          secp256k1 (Ethereum)`);
        console.log(`  Key Agreement:  ECDH`);
        console.log(`  Decryption:     AES-256-GCM`);
        console.log(`  AAD Verified:   ✓ (prevents plaintext swap)`);
        console.log(`  Hash Verified:  ✓ (file integrity confirmed)`);
        console.log(`  From:           ${senderAddress}`);
        console.log(`  To:             ${recipientAddress}`);

    } catch (err) {
        console.error('\n❌ Decryption failed!');
        if ((err as Error).message.includes('Unsupported state or unable to authenticate data')) {
            console.error('  Reason: Authentication failed');
            console.error('  Possible causes:');
            console.error('    - Wrong private key (shared secret mismatch)');
            console.error('    - Corrupted ciphertext');
            console.error('    - AAD mismatch');
        }
        throw err;
    }
}

main().catch(err => {
    console.error('\n❌ Error:', err.message);
    if (err.stack) {
        console.error('\nStack trace:', err.stack);
    }
    process.exit(1);
});
