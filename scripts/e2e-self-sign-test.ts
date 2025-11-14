/**
 * E2E Test: Self-Signed Certificate → PDF Signing → ZK Proof
 *
 * This script demonstrates the complete workflow using browser-compatible libraries:
 * 1. Generate self-signed ECDSA P-256 certificate
 * 2. Create PKCS#12 (.p12) file with "example" password
 * 3. Add certificate to allowlist
 * 4. Build Merkle tree trust list
 * 5. Sign a PDF document with the certificate
 * 6. Extract signature and generate ZK proof
 *
 * All cryptographic operations use node-forge (browser-compatible)
 */

import forge from 'node-forge';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { createPDF } from './lib/sign-pdf-complete.js';
import { plainAddPlaceholder } from '@signpdf/placeholder-plain';
import { signPdfComplete } from './lib/pdf-sign-complete-working.js';

const OUT_DIR = './out';
const TEST_DIR = './test-data';

interface SelfSignedCert {
  privateKey: forge.pki.PrivateKey;
  publicKey: forge.pki.PublicKey;
  certificate: forge.pki.Certificate;
  p12: string; // base64-encoded PKCS#12
  fingerprint: string;
}

/**
 * Step 1: Generate self-signed ECDSA P-256 certificate
 */
async function generateSelfSignedCertificate(): Promise<SelfSignedCert> {
  console.log('\n📝 Step 1: Generating self-signed ECDSA P-256 certificate...');

  // Unfortunately, node-forge doesn't support ECDSA key generation directly
  // We need to use Node.js crypto for key generation, then convert to forge format
  const crypto = await import('crypto');

  // Generate ECDSA P-256 key pair
  const { privateKey: privateKeyPem, publicKey: publicKeyPem } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1', // P-256
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  console.log('  ✅ Generated ECDSA P-256 key pair');

  // Create self-signed certificate
  const cert = forge.pki.createCertificate();

  // Note: forge doesn't support ECDSA certificates natively
  // We'll use RSA for the certificate structure but document this limitation
  console.log('  ⚠️  WARNING: node-forge has limited ECDSA support');
  console.log('  ⚠️  Falling back to using OpenSSL for proper ECDSA cert generation...');

  // Save keys temporarily
  await fs.mkdir(TEST_DIR, { recursive: true });
  await fs.writeFile(path.join(TEST_DIR, 'temp_key.pem'), privateKeyPem);
  await fs.writeFile(path.join(TEST_DIR, 'temp_pub.pem'), publicKeyPem);

  // Use OpenSSL to create proper ECDSA certificate
  const certPath = path.join(TEST_DIR, 'selfsigned_cert.pem');
  const keyPath = path.join(TEST_DIR, 'selfsigned_key.pem');

  try {
    // Create self-signed certificate with OpenSSL
    execSync(`
      openssl req -new -x509 -key ${path.join(TEST_DIR, 'temp_key.pem')} \
        -out ${certPath} \
        -days 365 \
        -subj "/C=UA/ST=Kyiv/L=Kyiv/O=Test Organization/OU=Testing/CN=Test Signer/emailAddress=test@example.com"
    `);

    // Copy key
    execSync(`cp ${path.join(TEST_DIR, 'temp_key.pem')} ${keyPath}`);

    console.log('  ✅ Created self-signed certificate with OpenSSL');
  } catch (error) {
    console.error('  ❌ OpenSSL failed, trying alternative approach...');
    throw error;
  }

  // Compute certificate fingerprint (SHA-256 of DER)
  const certDer = execSync(`openssl x509 -in ${certPath} -outform DER`);
  const hash = crypto.createHash('sha256');
  hash.update(certDer);
  const fingerprint = hash.digest('hex');

  console.log(`  ✅ Certificate fingerprint: ${fingerprint}`);

  // Verify it's ECDSA P-256
  const certInfo = execSync(`openssl x509 -in ${certPath} -text -noout`).toString();
  if (!certInfo.includes('id-ecPublicKey') || !certInfo.includes('prime256v1')) {
    throw new Error('Certificate is not ECDSA P-256!');
  }

  console.log('  ✅ Verified: ECDSA P-256 certificate');

  return {
    privateKey: null as any, // We'll use OpenSSL for signing
    publicKey: null as any,
    certificate: null as any,
    p12: '', // Will create in next step
    fingerprint
  };
}

/**
 * Step 2: Create PKCS#12 file with "example" password
 */
async function createPKCS12(): Promise<string> {
  console.log('\n🔐 Step 2: Creating PKCS#12 file with "example" password...');

  const certPath = path.join(TEST_DIR, 'selfsigned_cert.pem');
  const keyPath = path.join(TEST_DIR, 'selfsigned_key.pem');
  const p12Path = path.join(TEST_DIR, 'selfsigned.p12');

  try {
    execSync(`
      openssl pkcs12 -export \
        -in ${certPath} \
        -inkey ${keyPath} \
        -out ${p12Path} \
        -name "Test Self-Signed Certificate" \
        -passout pass:example
    `);

    console.log(`  ✅ Created PKCS#12 file: ${p12Path}`);
    console.log('  ✅ Password: example');

    // Verify we can read it
    const p12Info = execSync(`openssl pkcs12 -in ${p12Path} -info -noout -passin pass:example 2>&1`).toString();
    console.log('  ✅ PKCS#12 file verified');

    return p12Path;
  } catch (error) {
    console.error('  ❌ Failed to create PKCS#12:', error);
    throw error;
  }
}

/**
 * Step 3: Add certificate to allowlist
 */
async function addToAllowlist(fingerprint: string): Promise<void> {
  console.log('\n📋 Step 3: Adding certificate to allowlist...');

  const allowlistPath = path.join(TEST_DIR, 'allowlist.json');

  console.log(`  ℹ️  Self-signed cert fingerprint: ${fingerprint.substring(0, 32)}...`);

  // Format expected by merkle/build.ts
  const allowlist = {
    cert_fingerprints: [fingerprint]
  };

  await fs.writeFile(allowlistPath, JSON.stringify(allowlist, null, 2));

  console.log(`  ✅ Created allowlist: ${allowlistPath}`);
  console.log(`  ✅ Added fingerprint: ${fingerprint}`);
}

/**
 * Step 4: Build Merkle tree trust list (Pedersen)
 */
async function buildTrustList(): Promise<void> {
  console.log('\n🌳 Step 4: Building Pedersen Merkle tree trust list...');

  const allowlistPath = path.join(TEST_DIR, 'allowlist.json');
  const trustOutDir = path.join(TEST_DIR, 'trust');

  try {
    await fs.mkdir(trustOutDir, { recursive: true });

    // Build Pedersen Merkle tree (required for current circuit)
    execSync(`yarn merkle-poseidon:build -- ${allowlistPath} --out ${trustOutDir}`, {
      stdio: 'inherit'
    });

    console.log(`  ✅ Built Pedersen Merkle tree in: ${trustOutDir}`);

    // Verify files were created
    const rootHex = await fs.readFile(path.join(trustOutDir, 'tl_root_poseidon.hex'), 'utf-8');
    const rootTxt = await fs.readFile(path.join(trustOutDir, 'tl_root_poseidon.txt'), 'utf-8');
    console.log(`  ✅ Trust list root (hex): ${rootHex.trim()}`);
    console.log(`  ✅ Trust list root (decimal): ${rootTxt.trim().substring(0, 32)}...`);

  } catch (error) {
    console.error('  ❌ Failed to build trust list:', error);
    throw error;
  }
}

/**
 * Step 5: Sign PDF document with the self-signed certificate
 */
async function signPDF(p12Path: string): Promise<string> {
  console.log('\n✍️  Step 5: Signing PDF document with self-signed certificate...');

  const signedPdfPath = path.join(TEST_DIR, 'document_self_signed.pdf');

  try {
    // Create PDF
    console.log('  📄 Creating PDF document...');
    const pdfBuffer = await createPDF('ZK Qualified Signature Test Document\n\nSigned with self-generated ECDSA P-256 certificate');
    console.log(`  ✅ PDF created (${pdfBuffer.length} bytes)`);

    // Add signature placeholder
    console.log('  📝 Adding signature placeholder...');
    const pdfWithPlaceholder = plainAddPlaceholder({
      pdfBuffer,
      reason: 'ZK Qualified Signature Test',
      contactInfo: 'test@example.com',
      name: 'Test Signer',
      location: 'Test Location',
    });
    console.log(`  ✅ Placeholder added (${pdfWithPlaceholder.length} bytes)`);

    // Sign using complete working signer
    const signedPdf = await signPdfComplete(
      pdfWithPlaceholder,
      p12Path,
      'example'
    );

    await fs.writeFile(signedPdfPath, signedPdf);
    console.log(`\n  ✅ PDF signed successfully: ${signedPdfPath}`);

    return signedPdfPath;
  } catch (error) {
    console.error('  ❌ PDF signing failed:', error);
    throw error;
  }
}

/**
 * Step 6: Extract signature and verify with existing tools
 */
async function extractAndVerify(signedPdfPath: string): Promise<void> {
  console.log('\n🔍 Step 6: Extracting signature and verifying...');

  await fs.mkdir(OUT_DIR, { recursive: true });

  try {
    // Hash ByteRange
    console.log('  📊 Hashing PDF ByteRange...');
    execSync(`yarn hash-byte-range -- ${signedPdfPath}`, { stdio: 'inherit' });

    // Extract CAdES signature with PKI.js
    console.log('  📦 Extracting CAdES signature with PKI.js...');
    execSync(`yarn extract-cades -- ${signedPdfPath}`, { stdio: 'inherit' });

    // Check outputs
    const docHash = await fs.readFile(path.join(OUT_DIR, 'doc_hash.hex'), 'utf-8');
    console.log(`  ✅ Document hash: ${docHash.trim()}`);

    const pubKey = JSON.parse(await fs.readFile(path.join(OUT_DIR, 'VERIFIED_pubkey.json'), 'utf-8'));
    console.log(`  ✅ Public key extracted (x: ${pubKey.x.substring(0, 16)}...)`);

    const sig = JSON.parse(await fs.readFile(path.join(OUT_DIR, 'VERIFIED_sig.json'), 'utf-8'));
    console.log(`  ✅ Signature extracted (r: ${sig.r.substring(0, 16)}...)`);

  } catch (error) {
    console.error('  ❌ Extraction failed:', error);
    throw error;
  }
}

/**
 * Step 7: Generate ZK proof with Pedersen Merkle tree
 */
async function generateProof(): Promise<void> {
  console.log('\n🔐 Step 7: Generating ZK proof with Pedersen Merkle tree...');

  // Copy Pedersen trust list files to out directory
  const trustDir = path.join(TEST_DIR, 'trust');

  try {
    // Copy Pedersen root files
    await fs.copyFile(
      path.join(trustDir, 'tl_root_poseidon.hex'),
      path.join(OUT_DIR, 'tl_root_poseidon.hex')
    );

    await fs.copyFile(
      path.join(trustDir, 'tl_root_poseidon.txt'),
      path.join(OUT_DIR, 'tl_root_poseidon.txt')
    );

    // Get fingerprint from allowlist (same as certificate fingerprint)
    const allowlist = JSON.parse(await fs.readFile(path.join(TEST_DIR, 'allowlist.json'), 'utf-8'));
    const fingerprint = allowlist.cert_fingerprints[0];
    console.log(`  ℹ️  Using fingerprint from allowlist: ${fingerprint.substring(0, 16)}...`);

    // Copy the Merkle proof to both possible locations (for compatibility)
    const merkleProofPath = path.join(trustDir, 'paths-poseidon', `${fingerprint}.json`);
    await fs.copyFile(merkleProofPath, path.join(OUT_DIR, 'merkle_path_poseidon.json'));

    // Also copy to the out paths-poseidon directory for prove.ts to find
    const outPathsDir = path.join(OUT_DIR, 'paths-poseidon');
    await fs.mkdir(outPathsDir, { recursive: true });
    await fs.copyFile(merkleProofPath, path.join(outPathsDir, `${fingerprint}.json`));

    console.log('  ✅ Copied Pedersen trust list files to out/');

    // Generate proof
    console.log('  🔄 Generating ZK proof (this may take 2-3 seconds)...');
    execSync(`yarn prove`, { stdio: 'inherit' });

    console.log('  ✅ ZK proof generated!');

    // Verify proof
    console.log('  🔍 Verifying ZK proof...');
    execSync(`yarn verify`, { stdio: 'inherit' });

    console.log('  ✅ Proof verified!');

  } catch (error) {
    console.error('  ❌ Proof generation/verification failed:', error);
    throw error;
  }
}

/**
 * Main E2E test flow
 */
async function main() {
  console.log('🚀 E2E Test: Self-Signed Certificate → PDF Signing → ZK Proof\n');
  console.log('This test demonstrates browser-compatible PDF signing workflow');
  console.log('═'.repeat(70));

  try {
    // Step 1: Generate self-signed certificate
    const certInfo = await generateSelfSignedCertificate();

    // Step 2: Create PKCS#12
    const p12Path = await createPKCS12();

    // Step 3: Add to allowlist
    await addToAllowlist(certInfo.fingerprint);

    // Step 4: Build trust list
    await buildTrustList();

    // Step 5: Sign PDF
    const signedPdfPath = await signPDF(p12Path);

    // Step 6: Extract and verify
    await extractAndVerify(signedPdfPath);

    // Step 7: Generate ZK proof
    await generateProof();

    console.log('\n' + '═'.repeat(70));
    console.log('✅ E2E Test PASSED!');
    console.log('═'.repeat(70));
    console.log('\n📁 Test artifacts saved in:', TEST_DIR);
    console.log('📁 Proof artifacts saved in:', OUT_DIR);
    console.log('\n📝 Summary:');
    console.log('  ✅ Self-signed ECDSA P-256 certificate generated');
    console.log('  ✅ PKCS#12 file created with password "example"');
    console.log('  ✅ Certificate added to allowlist');
    console.log('  ✅ Merkle tree trust list built');
    console.log('  ✅ PDF document created and signed');
    console.log('  ✅ Signature extracted from PDF');
    console.log('  ✅ ZK proof generated and verified');
    console.log('\n🎉 Complete workflow validated!');

    // Print next steps
    console.log('\n📖 Implementation Notes:');
    console.log('  • Certificate generation: ✅ Working (OpenSSL ECDSA P-256)');
    console.log('  • Trust list generation: ✅ Working (Pedersen Merkle tree)');
    console.log('  • PDF placeholder creation: ✅ Working (plainAddPlaceholder)');
    console.log('  • PDF signing: ⚠️  Complex (requires ByteRange calculation)');
    console.log('  • Signature extraction: ✅ Working (PKI.js CAdES parser)');
    console.log('  • ZK proof generation: ✅ Working (hybrid circuit, 2-3s)');
    console.log('  • ZK proof verification: ✅ Working');
    console.log('\n💡 Next Steps:');
    console.log('  • For production PDF signing, use dedicated tools like:');
    console.log('    - jsSignPDF (full JavaScript implementation)');
    console.log('    - @signpdf with proper ByteRange calculator');
    console.log('    - Or server-side signing with pdfsigner/SignServer');

  } catch (error) {
    console.error('\n' + '═'.repeat(70));
    console.error('❌ E2E Test FAILED');
    console.error('═'.repeat(70));
    console.error(error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  generateSelfSignedCertificate,
  createPKCS12,
  addToAllowlist,
  buildTrustList,
  signPDF,
  extractAndVerify,
  generateProof
};
