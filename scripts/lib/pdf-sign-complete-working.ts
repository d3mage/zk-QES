/**
 * Complete Working PDF Signing Implementation
 *
 * Handles the full PDF signing workflow:
 * 1. Calculate actual ByteRange values from placeholder
 * 2. Update PDF with calculated ByteRange
 * 3. Hash the ByteRange content
 * 4. Sign with ECDSA
 * 5. Wrap in CMS/PKCS#7
 * 6. Insert into PDF
 */

import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

const SIGNATURE_LENGTH = 8192; // Hex characters for signature placeholder

/**
 * Calculate ByteRange values from PDF with placeholder
 */
export function calculateByteRange(pdfBuffer: Buffer): [number, number, number, number] {
  const pdfString = pdfBuffer.toString('latin1');

  // Find the /Contents placeholder
  const contentsMatch = pdfString.match(/\/Contents\s*<([0-9A-Fa-f\s]+)>/);
  if (!contentsMatch) {
    throw new Error('No /Contents placeholder found');
  }

  const placeholder = contentsMatch[1].replace(/\s/g, '');
  const contentsStart = pdfString.indexOf(`/Contents <`) + 11; // After "<"
  const contentsLength = placeholder.length;
  const contentsEnd = contentsStart + contentsLength;

  // ByteRange is [0, contents_start, contents_end, rest_of_file_length]
  const byteRange: [number, number, number, number] = [
    0,
    contentsStart,
    contentsEnd,
    pdfBuffer.length - contentsEnd
  ];

  return byteRange;
}

/**
 * Update PDF with calculated ByteRange values
 */
export function updateByteRange(pdfBuffer: Buffer, byteRange: [number, number, number, number]): Buffer {
  const pdfString = pdfBuffer.toString('latin1');

  // Replace ByteRange placeholder with actual values
  const byteRangeString = `[${byteRange[0]} ${byteRange[1]} ${byteRange[2]} ${byteRange[3]}]`;

  // Pad to ensure we don't change PDF size
  const placeholderMatch = pdfString.match(/\/ByteRange\s*\[[^\]]+\]/);
  if (!placeholderMatch) {
    throw new Error('No ByteRange placeholder found');
  }

  const paddedByteRange = byteRangeString.padEnd(placeholderMatch[0].length, ' ');

  const updatedPdf = pdfString.replace(
    /\/ByteRange\s*\[[^\]]+\]/,
    `/ByteRange ${paddedByteRange}`
  );

  return Buffer.from(updatedPdf, 'latin1');
}

/**
 * Hash the ByteRange content
 */
export function hashByteRange(pdfBuffer: Buffer, byteRange: [number, number, number, number]): Buffer {
  const [r1Start, r1Len, r2Start, r2Len] = byteRange;

  const range1 = pdfBuffer.slice(r1Start, r1Start + r1Len);
  const range2 = pdfBuffer.slice(r2Start, r2Start + r2Len);

  const combined = Buffer.concat([range1, range2]);
  return crypto.createHash('sha256').update(combined).digest();
}

/**
 * Sign PDF with P12 certificate - Complete Working Implementation
 */
export async function signPdfComplete(
  pdfWithPlaceholder: Buffer,
  p12Path: string,
  p12Password: string
): Promise<Buffer> {
  console.log('\n🔧 Complete PDF Signing Process');
  console.log('=' .repeat(60));

  // Step 1: Calculate ByteRange
  console.log('📐 Step 1: Calculating ByteRange values...');
  const byteRange = calculateByteRange(pdfWithPlaceholder);
  console.log(`  ByteRange: [${byteRange.join(', ')}]`);

  // Step 2: Update PDF with calculated ByteRange
  console.log('📝 Step 2: Updating PDF with ByteRange...');
  const pdfWithByteRange = updateByteRange(pdfWithPlaceholder, byteRange);

  // Step 3: Hash ByteRange content
  console.log('🔐 Step 3: Hashing ByteRange content...');
  const hash = hashByteRange(pdfWithByteRange, byteRange);
  console.log(`  Hash: ${hash.toString('hex')}`);

  // Step 4: Extract key and cert from P12
  console.log('🔑 Step 4: Extracting key and certificate from P12...');
  const tempDir = `/tmp/pdf-sign-${Date.now()}`;
  await fs.mkdir(tempDir, { recursive: true });

  const p12TempPath = `${tempDir}/cert.p12`;
  const keyPath = `${tempDir}/key.pem`;
  const certPath = `${tempDir}/cert.pem`;
  const hashPath = `${tempDir}/hash.bin`;

  await fs.writeFile(p12TempPath, await fs.readFile(p12Path));
  await fs.writeFile(hashPath, hash);

  try {
    // Extract private key
    execSync(`openssl pkcs12 -in ${p12TempPath} -nocerts -nodes -passin pass:${p12Password} -out ${keyPath}`, { stdio: 'pipe' });

    // Extract certificate
    execSync(`openssl pkcs12 -in ${p12TempPath} -clcerts -nokeys -passin pass:${p12Password} -out ${certPath}`, { stdio: 'pipe' });

    console.log('  ✅ Key and certificate extracted');

    // Step 5: Create CMS signature with correct signed attributes
    console.log('📦 Step 5: Creating CMS/PKCS#7 signature...');
    const cmsPath = `${tempDir}/signature.p7s`;

    // Extract ByteRange content and save to file for signing
    const [r1Start, r1Len, r2Start, r2Len] = byteRange;
    const range1 = pdfWithByteRange.slice(r1Start, r1Start + r1Len);
    const range2 = pdfWithByteRange.slice(r2Start, r2Start + r2Len);
    const byteRangeContent = Buffer.concat([range1, range2]);
    const byteRangeContentPath = `${tempDir}/byterange_content.bin`;
    await fs.writeFile(byteRangeContentPath, byteRangeContent);

    // Create CMS signature in detached mode (messageDigest will be hash of ByteRange content)
    execSync(`openssl cms -sign -in ${byteRangeContentPath} -binary -outform DER -out ${cmsPath} -signer ${certPath} -inkey ${keyPath}`, { stdio: 'pipe' });

    const cmsSignature = await fs.readFile(cmsPath);
    console.log(`  ✅ CMS signature created (${cmsSignature.length} bytes)`);

    // Step 6: Insert signature into PDF
    console.log('🔄 Step 6: Inserting signature into PDF...');

    const pdfString = pdfWithByteRange.toString('latin1');
    const contentsMatch = pdfString.match(/\/Contents\s*<([0-9A-Fa-f\s]+)>/);
    if (!contentsMatch) {
      throw new Error('/Contents field not found');
    }

    const cmsHex = cmsSignature.toString('hex').toUpperCase();
    const placeholder = contentsMatch[1].replace(/\s/g, '');

    // Pad signature to placeholder size
    const paddedCms = cmsHex.padEnd(placeholder.length, '0');

    if (paddedCms.length > placeholder.length) {
      throw new Error(`Signature too large: ${cmsHex.length} > ${placeholder.length}`);
    }

    // Replace placeholder with signature
    const signedPdfString = pdfString.replace(
      `/Contents <${contentsMatch[1]}>`,
      `/Contents <${paddedCms}>`
    );

    const signedPdf = Buffer.from(signedPdfString, 'latin1');

    console.log('  ✅ Signature inserted');
    console.log('✅ PDF signing complete!');
    console.log('=' .repeat(60));

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });

    return signedPdf;

  } catch (error) {
    // Cleanup on error
    await fs.rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}
