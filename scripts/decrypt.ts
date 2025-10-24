#!/usr/bin/env node
/**
 * decrypt.ts
 *
 * Decrypts a PDF file from IPFS using ECIES + AES-GCM.
 * Uses recipient's private key to perform ECDH with sender's ephemeral public key.
 *
 * Usage: yarn decrypt <metadata-json> --key <private-key-pem> --out <output-pdf>
 *        yarn decrypt out/encrypted-metadata.json --out decrypted.pdf
 *
 * Note: For POC, we'll use the same key pair (simulate recipient having the private key)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { create as createIpfsClient } from 'ipfs-http-client';

interface EncryptedPackage {
    cid: string;
    iv: string;
    aad: string;
    ephemeralPub: {
        x: string;
        y: string;
    };
    alg: string;
    encryptedSize: number;
    originalHash: string;
}

function deriveSharedSecret(
    recipientPrivateKey: crypto.KeyObject,
    ephemeralPubX: Buffer,
    ephemeralPubY: Buffer
): Buffer {
    // Create ephemeral public key from x,y coordinates
    const pubKeyPoint = Buffer.concat([
        Buffer.from([0x04]),  // Uncompressed point
        ephemeralPubX,
        ephemeralPubY
    ]);

    // Wrap in SubjectPublicKeyInfo (SPKI) format
    const algorithmIdentifier = Buffer.from([
        0x30, 0x13,  // SEQUENCE (19 bytes)
        0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,  // OID: ecPublicKey
        0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07  // OID: prime256v1
    ]);

    const spki = Buffer.concat([
        Buffer.from([0x30, 0x59]),  // SEQUENCE (89 bytes)
        algorithmIdentifier,
        Buffer.from([0x03, 0x42, 0x00]),  // BIT STRING (66 bytes, 0 unused bits)
        pubKeyPoint
    ]);

    const ephemeralPublicKey = crypto.createPublicKey({
        key: spki,
        format: 'der',
        type: 'spki'
    });

    // Perform ECDH
    const sharedSecret = crypto.diffieHellman({
        privateKey: recipientPrivateKey,
        publicKey: ephemeralPublicKey
    });

    return sharedSecret;
}

function kdf(sharedSecret: Buffer, salt: Buffer = Buffer.alloc(0)): Buffer {
    return crypto.hkdfSync('sha256', sharedSecret, salt, 'aes-256-gcm-key', 32);
}

async function fetchFromIpfs(cid: string): Promise<Buffer> {
    if (cid.startsWith('local:')) {
        // Local file fallback
        const localPath = cid.substring(6);
        return fs.readFileSync(localPath);
    }

    // Connect to local IPFS node on port 8002
    const ipfs = createIpfsClient({ url: 'http://127.0.0.1:8002' });

    const chunks: Uint8Array[] = [];
    for await (const chunk of ipfs.cat(cid)) {
        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
}

async function generateRecipientKeyPair(): Promise<crypto.KeyObject> {
    // For POC: Generate a recipient key pair
    // In production, this would be loaded from secure storage
    const { privateKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
    });
    return privateKey;
}

function extractPublicKey(privateKey: crypto.KeyObject): { x: Buffer; y: Buffer } {
    const publicKey = crypto.createPublicKey(privateKey);
    const pubKeyDer = publicKey.export({ type: 'spki', format: 'der' });

    const pointStart = pubKeyDer.length - 65;
    const point = pubKeyDer.subarray(pointStart);

    if (point[0] !== 0x04) {
        throw new Error('Expected uncompressed point format');
    }

    const x = point.subarray(1, 33);
    const y = point.subarray(33, 65);

    return { x, y };
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.error('Usage: yarn decrypt <metadata-json> [--out <output-pdf>]');
        console.error('Example: yarn decrypt out/encrypted-metadata.json --out decrypted.pdf');
        process.exit(1);
    }

    const metadataPath = args[0];
    const outPath = args.includes('--out')
        ? args[args.indexOf('--out') + 1]
        : 'out/decrypted.pdf';

    if (!fs.existsSync(metadataPath)) {
        throw new Error(`Metadata file not found: ${metadataPath}`);
    }

    console.log('Loading metadata...');
    const metadata: EncryptedPackage = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

    console.log(`  CID: ${metadata.cid}`);
    console.log(`  Algorithm: ${metadata.alg}`);
    console.log(`  Expected size: ${metadata.encryptedSize} bytes`);

    console.log('\nFetching encrypted data...');
    const encryptedData = await fetchFromIpfs(metadata.cid);
    console.log(`  Downloaded: ${encryptedData.length} bytes`);

    if (encryptedData.length !== metadata.encryptedSize) {
        throw new Error(`Size mismatch: expected ${metadata.encryptedSize}, got ${encryptedData.length}`);
    }

    // For POC: Generate recipient key pair
    // In production, load from --key parameter
    console.log('\nGenerating recipient key pair (POC mode)...');
    console.log('  (In production, this would load the recipient\'s private key)');
    const recipientPrivKey = await generateRecipientKeyPair();
    const recipientPubKey = extractPublicKey(recipientPrivKey);

    // Save recipient public key for sender to use in next round
    const outDir = 'out';
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const recipientPubKeyPath = path.join(outDir, 'recipient_pubkey.json');
    fs.writeFileSync(recipientPubKeyPath, JSON.stringify({
        x: recipientPubKey.x.toString('hex'),
        y: recipientPubKey.y.toString('hex')
    }, null, 2));
    console.log(`  Recipient pubkey saved: ${recipientPubKeyPath}`);
    console.log(`  (Sender should use this for encryption)`);

    console.log('\nPerforming ECDH...');
    const ephemeralX = Buffer.from(metadata.ephemeralPub.x, 'hex');
    const ephemeralY = Buffer.from(metadata.ephemeralPub.y, 'hex');
    const sharedSecret = deriveSharedSecret(recipientPrivKey, ephemeralX, ephemeralY);

    console.log(`  Shared secret: ${sharedSecret.toString('hex').substring(0, 32)}...`);

    console.log('\nDeriving decryption key...');
    const aesKey = kdf(sharedSecret);

    console.log('\nDecrypting...');
    const iv = Buffer.from(metadata.iv, 'hex');
    const aad = Buffer.from(metadata.aad, 'hex');

    // Split encrypted data and auth tag (last 16 bytes)
    const authTag = encryptedData.subarray(encryptedData.length - 16);
    const ciphertext = encryptedData.subarray(0, encryptedData.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);

    try {
        const decrypted = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final()
        ]);

        console.log(`  Decrypted size: ${decrypted.length} bytes`);

        // Verify hash
        const actualHash = crypto.createHash('sha256').update(decrypted).digest();
        const expectedHash = Buffer.from(metadata.originalHash, 'hex');

        if (!actualHash.equals(expectedHash)) {
            throw new Error('Hash verification failed! File may be corrupted or tampered.');
        }

        console.log(`  ✅ Hash verified: ${actualHash.toString('hex')}`);

        // Save decrypted file
        fs.writeFileSync(outPath, decrypted);

        console.log(`\n✅ Decryption successful!`);
        console.log(`  Output: ${outPath}`);
        console.log(`  Size: ${decrypted.length} bytes`);
        console.log(`  Hash matches AAD: ${actualHash.equals(aad) ? '✅' : '❌'}`);

    } catch (err) {
        console.error('\n❌ Decryption failed!');
        if (err instanceof Error && err.message.includes('auth')) {
            console.error('  Authentication tag verification failed.');
            console.error('  The file may have been tampered with or corrupted.');
        }
        throw err;
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
});
