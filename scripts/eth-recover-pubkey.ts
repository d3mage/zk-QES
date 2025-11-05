#!/usr/bin/env node
/**
 * eth-recover-pubkey.ts
 *
 * Utility to recover full public key from an Ethereum address by signing a message.
 * This is necessary because Ethereum addresses only contain a hash of the public key.
 *
 * Usage: yarn eth-recover-pubkey --key <private-key-hex>
 *        yarn eth-recover-pubkey --message <msg> --signature <sig>
 */

import { ethers } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';

async function recoverFromPrivateKey(privateKey: string) {
    if (!privateKey.startsWith('0x')) {
        privateKey = '0x' + privateKey;
    }

    console.log('╔════════════════════════════════════════════════╗');
    console.log('║   Ethereum Public Key Recovery                 ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    const wallet = new ethers.Wallet(privateKey);

    console.log('Deriving public key from private key...');
    console.log(`  Address:    ${wallet.address}`);
    console.log(`  Public Key: ${wallet.signingKey.publicKey}`);
    console.log(`  Compressed: ${wallet.signingKey.compressedPublicKey}\n`);

    // Save to file
    const output = {
        address: wallet.address,
        publicKey: wallet.signingKey.publicKey,
        compressedPublicKey: wallet.signingKey.compressedPublicKey,
        publicKeyHex: wallet.signingKey.publicKey,
        x: '0x' + wallet.signingKey.publicKey.slice(4, 68),
        y: '0x' + wallet.signingKey.publicKey.slice(68, 132)
    };

    const outDir = 'out';
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const outputPath = path.join(outDir, 'eth-pubkey.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    console.log('✓ Public key exported to:', outputPath);
    console.log('\nYou can now use this public key for encryption:');
    console.log(`  yarn encrypt-eth <file> --sender-key <your-key> --recipient ${output.publicKey}`);
}

async function recoverFromSignature(message: string, signature: string) {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║   Ethereum Public Key Recovery (from sig)      ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    console.log('Recovering public key from signature...');
    console.log(`  Message:   "${message}"`);
    console.log(`  Signature: ${signature.substring(0, 20)}...\n`);

    // Hash the message (ethers does this automatically for signMessage)
    const messageHash = ethers.hashMessage(message);
    console.log(`  Message hash: ${messageHash}`);

    // Recover public key
    const recoveredPublicKey = ethers.SigningKey.recoverPublicKey(messageHash, signature);
    const recoveredAddress = ethers.computeAddress(recoveredPublicKey);

    console.log(`  Recovered address:    ${recoveredAddress}`);
    console.log(`  Recovered public key: ${recoveredPublicKey}\n`);

    // Save to file
    const output = {
        message,
        signature,
        messageHash,
        address: recoveredAddress,
        publicKey: recoveredPublicKey,
        x: '0x' + recoveredPublicKey.slice(4, 68),
        y: '0x' + recoveredPublicKey.slice(68, 132)
    };

    const outDir = 'out';
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const outputPath = path.join(outDir, 'eth-recovered-pubkey.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    console.log('✓ Public key recovered and exported to:', outputPath);
    console.log('\nYou can now use this public key for encryption:');
    console.log(`  yarn encrypt-eth <file> --sender-key <your-key> --recipient ${output.publicKey}`);
}

async function generateNewKeyPair() {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║   Generate New Ethereum Key Pair               ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    const wallet = ethers.Wallet.createRandom();

    console.log('Generated new key pair:');
    console.log(`  Address:     ${wallet.address}`);
    console.log(`  Private Key: ${wallet.privateKey}`);
    console.log(`  Public Key:  ${wallet.signingKey.publicKey}\n`);

    console.log('⚠️  WARNING: Keep your private key secure!');
    console.log('   Never share it or commit it to version control.\n');

    // Save to file (in practice, private key should be stored securely)
    const output = {
        address: wallet.address,
        privateKey: wallet.privateKey,
        publicKey: wallet.signingKey.publicKey,
        compressedPublicKey: wallet.signingKey.compressedPublicKey,
        mnemonic: wallet.mnemonic?.phrase || null,
        x: '0x' + wallet.signingKey.publicKey.slice(4, 68),
        y: '0x' + wallet.signingKey.publicKey.slice(68, 132)
    };

    const outDir = 'out';
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const outputPath = path.join(outDir, 'eth-new-keypair.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    console.log('✓ Key pair exported to:', outputPath);
    console.log('\nExample usage:');
    console.log(`  # Encrypt (sender):`);
    console.log(`  yarn encrypt-eth sample.pdf \\`);
    console.log(`    --sender-key ${wallet.privateKey} \\`);
    console.log(`    --recipient <recipient-pubkey>`);
    console.log('');
    console.log(`  # Decrypt (recipient):`);
    console.log(`  yarn decrypt-eth out/encrypted-eth-metadata.json \\`);
    console.log(`    --key ${wallet.privateKey}`);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log('Usage:');
        console.log('  yarn eth-recover-pubkey --key <private-key-hex>');
        console.log('    Derive public key from private key');
        console.log('');
        console.log('  yarn eth-recover-pubkey --message <msg> --signature <sig>');
        console.log('    Recover public key from message signature');
        console.log('');
        console.log('  yarn eth-recover-pubkey --generate');
        console.log('    Generate new random key pair');
        console.log('');
        console.log('Examples:');
        console.log('  yarn eth-recover-pubkey --key 0x1234567890abcdef...');
        console.log('  yarn eth-recover-pubkey --message "Hello" --signature 0xabcd...');
        console.log('  yarn eth-recover-pubkey --generate');
        process.exit(0);
    }

    if (args.includes('--generate')) {
        await generateNewKeyPair();
    } else if (args.includes('--key')) {
        const privateKey = args[args.indexOf('--key') + 1];
        await recoverFromPrivateKey(privateKey);
    } else if (args.includes('--message') && args.includes('--signature')) {
        const message = args[args.indexOf('--message') + 1];
        const signature = args[args.indexOf('--signature') + 1];
        await recoverFromSignature(message, signature);
    } else {
        console.error('Error: Invalid arguments');
        console.error('Run with --help for usage information');
        process.exit(1);
    }
}

main().catch(err => {
    console.error('\n❌ Error:', err.message);
    if (err.stack) {
        console.error('\nStack trace:', err.stack);
    }
    process.exit(1);
});
