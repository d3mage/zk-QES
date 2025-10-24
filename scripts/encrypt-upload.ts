#!/usr/bin/env node
/**
 * encrypt-upload.ts
 *
 * Encrypts a PDF file using ECIES + AES-GCM and uploads to IPFS.
 * Key agreement: ECDH with P-256 (secp256r1)
 * Encryption: AES-256-GCM with doc_hash as AAD
 *
 * Usage: yarn encrypt-upload <pdf-file> --to <recipient-pubkey-json>
 *        yarn encrypt-upload sample.pdf --to out/VERIFIED_pubkey.json
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
// import { create as createIpfsClient } from 'ipfs-http-client';

interface RecipientPubKey {
    x: string;  // hex
    y: string;  // hex
}

interface EncryptedPackage {
    cid: string;
    iv: string;              // hex
    aad: string;             // hex (doc_hash)
    ephemeralPub: {          // Ephemeral public key for ECDH
        x: string;
        y: string;
    };
    alg: string;
    encryptedSize: number;
    originalHash: string;    // SHA-256 of original file
}

async function generateEphemeralKeyPair(): Promise<crypto.KeyObject> {
    // Generate P-256 key pair
    const { privateKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',  // P-256
    });
    return privateKey;
}

function extractPublicKey(privateKey: crypto.KeyObject): { x: Buffer; y: Buffer } {
    const publicKey = crypto.createPublicKey(privateKey);
    const pubKeyDer = publicKey.export({ type: 'spki', format: 'der' });

    // Extract uncompressed point (04 || x || y) from SubjectPublicKeyInfo
    // SPKI structure: skip ASN.1 header to get to the 65-byte point
    const pointStart = pubKeyDer.length - 65;
    const point = pubKeyDer.subarray(pointStart);

    if (point[0] !== 0x04) {
        throw new Error('Expected uncompressed point format');
    }

    const x = point.subarray(1, 33);
    const y = point.subarray(33, 65);

    return { x, y };
}

function deriveSharedSecret(
    privateKey: crypto.KeyObject,
    recipientPubX: Buffer,
    recipientPubY: Buffer
): Buffer {
    // Create recipient public key from x,y coordinates
    const pubKeyPoint = Buffer.concat([
        Buffer.from([0x04]),  // Uncompressed point
        recipientPubX,
        recipientPubY
    ]);

    // Wrap in SubjectPublicKeyInfo (SPKI) format for Node.js
    // This is a minimal ASN.1 structure for P-256 public key
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

    const recipientPublicKey = crypto.createPublicKey({
        key: spki,
        format: 'der',
        type: 'spki'
    });

    // Perform ECDH
    const sharedSecret = crypto.diffieHellman({
        privateKey: privateKey,
        publicKey: recipientPublicKey
    });

    return sharedSecret;
}

function kdf(sharedSecret: Buffer, salt: Buffer = Buffer.alloc(0)): Buffer {
    // Simple KDF using HKDF-SHA256
    // Derive 32 bytes for AES-256
    return Buffer.from(crypto.hkdfSync('sha256', sharedSecret, salt, 'aes-256-gcm-key', 32));
}

async function uploadToIpfs(data: Buffer): Promise<string> {
    // For POC: Save locally (IPFS integration ready but optional)
    // To enable IPFS: ensure node is running on port 8002
    const encPath = path.join('out', 'encrypted.bin');
    fs.writeFileSync(encPath, data);
    return 'local:' + encPath;

    /* IPFS integration (uncomment when node is available):
    try {
        const ipfs = createIpfsClient({ url: 'http://127.0.0.1:8002' });
        const { cid } = await ipfs.add(data);
        return cid.toString();
    } catch (err) {
        console.warn('  ⚠️  IPFS upload failed, saving locally');
        const encPath = path.join('out', 'encrypted.bin');
        fs.writeFileSync(encPath, data);
        return 'local:' + encPath;
    }
    */
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 3 || !args.includes('--to')) {
        console.error('Usage: yarn encrypt-upload <pdf-file> --to <recipient-pubkey-json>');
        console.error('Example: yarn encrypt-upload sample.pdf --to out/VERIFIED_pubkey.json');
        process.exit(1);
    }

    const pdfPath = args[0];
    const recipientPubKeyPath = args[args.indexOf('--to') + 1];

    if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF file not found: ${pdfPath}`);
    }

    if (!fs.existsSync(recipientPubKeyPath)) {
        throw new Error(`Recipient public key not found: ${recipientPubKeyPath}`);
    }

    console.log('Loading files...');
    const pdfData = fs.readFileSync(pdfPath);
    const recipientPubKey: RecipientPubKey = JSON.parse(fs.readFileSync(recipientPubKeyPath, 'utf-8'));

    console.log(`  PDF size: ${pdfData.length} bytes`);
    console.log(`  Recipient pubkey: ${recipientPubKey.x.substring(0, 16)}...`);

    // Compute document hash
    const docHash = crypto.createHash('sha256').update(pdfData).digest();
    console.log(`  Document hash: ${docHash.toString('hex')}`);

    console.log('\nGenerating ephemeral key pair...');
    const ephemeralPrivKey = await generateEphemeralKeyPair();
    const ephemeralPubKey = extractPublicKey(ephemeralPrivKey);

    console.log(`  Ephemeral pub X: ${ephemeralPubKey.x.toString('hex')}`);

    console.log('\nPerforming ECDH...');
    const recipientX = Buffer.from(recipientPubKey.x, 'hex');
    const recipientY = Buffer.from(recipientPubKey.y, 'hex');
    const sharedSecret = deriveSharedSecret(ephemeralPrivKey, recipientX, recipientY);

    console.log(`  Shared secret: ${sharedSecret.toString('hex').substring(0, 32)}...`);

    console.log('\nDeriving encryption key...');
    const aesKey = kdf(sharedSecret);

    console.log('\nEncrypting PDF...');
    const iv = crypto.randomBytes(12);  // 96-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);

    // Set AAD (Additional Authenticated Data) to doc_hash
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

    // Compute artifact hash (SHA-256 of ciphertext) for binding
    const cipherHash = crypto.createHash('sha256').update(encryptedPackage).digest();
    console.log(`  Cipher hash: ${cipherHash.toString('hex')}`);

    console.log('\nUploading to IPFS...');
    const cid = await uploadToIpfs(encryptedPackage);
    if (cid.startsWith('local:')) {
        console.log(`  ✅ Saved locally: ${cid}`);
    } else {
        console.log(`  ✅ Uploaded to IPFS: ${cid}`);
    }

    const metadata: EncryptedPackage = {
        cid,
        iv: iv.toString('hex'),
        aad: docHash.toString('hex'),
        ephemeralPub: {
            x: ephemeralPubKey.x.toString('hex'),
            y: ephemeralPubKey.y.toString('hex')
        },
        alg: 'ecdh-p256+aes-256-gcm',
        encryptedSize: encryptedPackage.length,
        originalHash: docHash.toString('hex')
    };

    const outDir = 'out';
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const metadataPath = path.join(outDir, 'encrypted-metadata.json');
    const cipherHashPath = path.join(outDir, 'cipher_hash.bin');
    const encryptedFilePath = path.join(outDir, 'encrypted-file.bin');

    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    fs.writeFileSync(cipherHashPath, cipherHash);
    fs.writeFileSync(encryptedFilePath, encryptedPackage);

    console.log(`\n✓ Encryption complete!`);
    console.log(`  Metadata:       ${metadataPath}`);
    console.log(`  Encrypted file: ${encryptedFilePath}`);
    console.log(`  Cipher hash:    ${cipherHashPath}`);
    console.log(`\nTo decrypt, recipient runs:`);
    console.log(`  yarn decrypt ${metadataPath} --key <their-private-key>`);
}

main().catch(err => {
    console.error('Error:', err);
    if (err && err.message) {
        console.error('Message:', err.message);
    }
    if (err && err.stack) {
        console.error('Stack:', err.stack);
    }
    process.exit(1);
});
