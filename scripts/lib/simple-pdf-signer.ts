/**
 * Simple PAdES PDF Signer - Browser Compatible
 *
 * Manually constructs PAdES signature structure without complex libraries.
 * Based on understanding that PAdES is just:
 * 1. Add signature dictionary with placeholder
 * 2. Compute hash of ByteRange
 * 3. Sign the hash
 * 4. Insert signature into /Contents field
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';

interface PdfSignatureInfo {
  byteRange: [number, number, number, number];
  contentsStart: number;
  contentsEnd: number;
  signaturePlaceholderSize: number;
}

/**
 * Find or add signature placeholder in PDF
 */
function addSignaturePlaceholder(pdfBuffer: Buffer): { pdf: Buffer, info: PdfSignatureInfo } {
  const pdf = pdfBuffer.toString('latin1');

  // Find trailer and xref
  const xrefMatch = pdf.match(/xref\s+(\d+)\s+(\d+)/);
  if (!xrefMatch) {
    throw new Error('Could not find xref table');
  }

  // Create signature dictionary
  // We'll reserve 20000 bytes for the signature (hex-encoded, so 10000 bytes of actual signature)
  const signaturePlaceholderSize = 20000;
  const placeholder = '0'.repeat(signaturePlaceholderSize);

  const signatureDict = `
<<
  /Type /Sig
  /Filter /Adobe.PPKLite
  /SubFilter /ETSI.CAdES.detached
  /ByteRange [0 /********** /********** /**********]
  /Contents <${placeholder}>
>>`;

  // For simplicity, we'll add signature to existing PDF structure
  // In production, you'd need to:
  // 1. Add signature object
  // 2. Update xref table
  // 3. Update trailer
  // 4. Add signature field to page annotations

  // For now, let's create a minimal example that shows the concept
  console.log('⚠️  Simple signer: This is a proof-of-concept');
  console.log('⚠️  For production, use a proper PDF library for structure manipulation');

  // We'll work with the existing PDF and just demonstrate the signing algorithm
  // The key insight: signing is just computing hash(ByteRange) and inserting signature

  return {
    pdf: pdfBuffer,
    info: {
      byteRange: [0, 0, 0, 0], // Will be computed
      contentsStart: 0,
      contentsEnd: 0,
      signaturePlaceholderSize
    }
  };
}

/**
 * Compute hash of ByteRange for signing
 */
function computeByteRangeHash(
  pdfBuffer: Buffer,
  byteRange: [number, number, number, number]
): Buffer {
  const [r1Start, r1Len, r2Start, r2Len] = byteRange;

  // Extract the two ranges
  const range1 = pdfBuffer.slice(r1Start, r1Start + r1Len);
  const range2 = pdfBuffer.slice(r2Start, r2Start + r2Len);

  // Concatenate and hash
  const combined = Buffer.concat([range1, range2]);
  return crypto.createHash('sha256').update(combined).digest();
}

/**
 * Sign PDF using PKCS#12 certificate
 *
 * This demonstrates the core algorithm:
 * 1. Hash = SHA-256(ByteRange[0..1] + ByteRange[2..3])
 * 2. Signature = ECDSA_sign(Hash, PrivateKey)
 * 3. CMS = wrap_in_pkcs7(Signature, Certificate)
 * 4. Insert CMS into /Contents field
 */
export async function signPdfSimple(
  pdfBuffer: Buffer,
  p12Buffer: Buffer,
  password: string
): Promise<{ signedPdf: Buffer, signature: Buffer, hash: Buffer }> {

  console.log('\n🔧 Simple PDF Signer - Demonstrating Core Algorithm');
  console.log('=' .repeat(60));

  // Step 1: Parse PKCS#12 to get private key and certificate
  console.log('📦 Step 1: Extracting key and certificate from P12...');

  // Use OpenSSL to extract (in browser, use WebCrypto or PKI.js)
  const tempDir = '/tmp/simple-signer-' + Date.now();
  await fs.mkdir(tempDir, { recursive: true });

  const p12Path = `${tempDir}/cert.p12`;
  const keyPath = `${tempDir}/key.pem`;
  const certPath = `${tempDir}/cert.pem`;

  await fs.writeFile(p12Path, p12Buffer);

  // Extract using OpenSSL
  const { execSync } = await import('child_process');

  try {
    // Extract private key
    execSync(`openssl pkcs12 -in ${p12Path} -nocerts -nodes -passin pass:${password} -out ${keyPath}`);

    // Extract certificate
    execSync(`openssl pkcs12 -in ${p12Path} -clcerts -nokeys -passin pass:${password} -out ${certPath}`);

    console.log('  ✅ Extracted private key and certificate');

  } catch (error) {
    throw new Error(`Failed to extract P12: ${error}`);
  }

  // Step 2: Find ByteRange in PDF
  console.log('📄 Step 2: Analyzing PDF structure...');

  const pdfString = pdfBuffer.toString('latin1');
  const byteRangeMatch = pdfString.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);

  if (!byteRangeMatch) {
    throw new Error('PDF does not have a signature placeholder with /ByteRange');
  }

  const byteRange: [number, number, number, number] = [
    parseInt(byteRangeMatch[1]),
    parseInt(byteRangeMatch[2]),
    parseInt(byteRangeMatch[3]),
    parseInt(byteRangeMatch[4])
  ];

  console.log(`  ✅ ByteRange: [${byteRange.join(', ')}]`);

  // Step 3: Compute hash of ByteRange
  console.log('🔐 Step 3: Computing SHA-256 hash of ByteRange...');

  const hash = computeByteRangeHash(pdfBuffer, byteRange);
  console.log(`  ✅ Hash: ${hash.toString('hex')}`);

  // Step 4: Sign the hash with ECDSA
  console.log('✍️  Step 4: Signing hash with ECDSA P-256...');

  // Save hash to file
  const hashPath = `${tempDir}/hash.bin`;
  await fs.writeFile(hashPath, hash);

  // Sign with OpenSSL (in browser, use WebCrypto)
  const sigPath = `${tempDir}/signature.der`;
  execSync(`openssl dgst -sha256 -sign ${keyPath} -out ${sigPath} ${hashPath}`);

  const rawSignature = await fs.readFile(sigPath);
  console.log(`  ✅ Raw ECDSA signature: ${rawSignature.length} bytes`);

  // Step 5: Wrap signature in CMS/PKCS#7 structure
  console.log('📦 Step 5: Wrapping in CMS/PKCS#7 (ETSI.CAdES.detached)...');

  // Create detached CMS signature
  const cmsPath = `${tempDir}/signature.p7s`;
  execSync(`openssl cms -sign -in ${hashPath} -binary -outform DER -out ${cmsPath} -signer ${certPath} -inkey ${keyPath} -noattr`);

  const cmsSignature = await fs.readFile(cmsPath);
  console.log(`  ✅ CMS signature: ${cmsSignature.length} bytes`);

  // Step 6: Insert signature into PDF /Contents field
  console.log('🔄 Step 6: Inserting signature into PDF...');

  // Find /Contents < >
  const contentsMatch = pdfString.match(/\/Contents\s*<([0-9A-Fa-f\s]+)>/);
  if (!contentsMatch) {
    throw new Error('/Contents field not found');
  }

  // Convert CMS to hex
  const cmsHex = cmsSignature.toString('hex').toUpperCase();

  // Pad to placeholder size
  const placeholder = contentsMatch[1].replace(/\s/g, '');
  const paddedCms = cmsHex.padEnd(placeholder.length, '0');

  if (paddedCms.length > placeholder.length) {
    throw new Error(`Signature too large: ${cmsHex.length} > ${placeholder.length}`);
  }

  // Replace placeholder with actual signature
  const signedPdfString = pdfString.replace(
    `/Contents <${contentsMatch[1]}>`,
    `/Contents <${paddedCms}>`
  );

  const signedPdf = Buffer.from(signedPdfString, 'latin1');

  console.log('  ✅ Signature inserted into PDF');
  console.log('✅ PDF signing complete!');
  console.log('=' .repeat(60));

  // Cleanup
  await fs.rm(tempDir, { recursive: true, force: true });

  return {
    signedPdf,
    signature: cmsSignature,
    hash
  };
}

/**
 * Browser-compatible version using WebCrypto
 *
 * This shows how the same algorithm works in browser:
 */
export async function signPdfBrowser(
  pdfBuffer: ArrayBuffer,
  privateKey: CryptoKey,
  certificate: ArrayBuffer
): Promise<ArrayBuffer> {

  // Step 1: Find ByteRange
  const pdf = new Uint8Array(pdfBuffer);
  const pdfString = new TextDecoder('latin1').decode(pdf);

  const byteRangeMatch = pdfString.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
  if (!byteRangeMatch) throw new Error('No ByteRange found');

  const byteRange: [number, number, number, number] = [
    parseInt(byteRangeMatch[1]),
    parseInt(byteRangeMatch[2]),
    parseInt(byteRangeMatch[3]),
    parseInt(byteRangeMatch[4])
  ];

  // Step 2: Extract ranges to hash
  const range1 = pdf.slice(byteRange[0], byteRange[0] + byteRange[1]);
  const range2 = pdf.slice(byteRange[2], byteRange[2] + byteRange[3]);

  // Step 3: Hash the ranges
  const combined = new Uint8Array(range1.length + range2.length);
  combined.set(range1, 0);
  combined.set(range2, range1.length);

  const hash = await crypto.subtle.digest('SHA-256', combined);

  // Step 4: Sign with ECDSA
  const signature = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' }
    },
    privateKey,
    hash
  );

  // Step 5: Wrap in CMS (would need PKI.js or similar)
  // const cms = await wrapInCMS(signature, certificate);

  // Step 6: Insert into PDF
  // ... similar to Node.js version

  return pdfBuffer; // placeholder
}
