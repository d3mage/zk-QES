/**
 * Complete PDF Signing with node-signpdf
 *
 * Creates and signs PDFs using the node-signpdf library
 * Supports ECDSA P-256 certificates
 */

import * as fs from 'fs/promises';
import PDFDocument from 'pdfkit';
import { plainAddPlaceholder } from '@signpdf/placeholder-plain';
import { P12Signer } from '@signpdf/signer-p12';

export interface SignPdfOptions {
  p12Path: string;
  p12Password: string;
  outputPath: string;
  documentText?: string;
}

/**
 * Create a simple PDF with text content
 */
export async function createPDF(text: string = 'Test Document for ZK Qualified Signature'): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const doc = new PDFDocument({
      autoFirstPage: true,
      size: 'A4',
      bufferPages: true,
    });

    // Collect chunks
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Add content
    doc.fontSize(24);
    doc.text(text, 100, 100);

    doc.fontSize(12);
    doc.text('This document is signed with an ECDSA P-256 certificate.', 100, 150);
    doc.text('The signature will be verified using zero-knowledge proofs.', 100, 170);

    doc.fontSize(10);
    doc.text(`Generated: ${new Date().toISOString()}`, 100, 700);

    // Finalize
    doc.end();
  });
}

/**
 * Sign a PDF with a PKCS#12 certificate
 */
export async function signPdfWithP12(options: SignPdfOptions): Promise<void> {
  console.log('  📄 Creating PDF document...');

  // Create PDF
  const pdfBuffer = await createPDF(options.documentText);
  console.log(`  ✅ PDF created (${pdfBuffer.length} bytes)`);

  console.log('  📝 Adding signature placeholder...');

  // Add placeholder for signature
  const pdfWithPlaceholder = plainAddPlaceholder({
    pdfBuffer,
    reason: 'ZK Qualified Signature Test',
    contactInfo: 'test@example.com',
    name: 'Test Signer',
    location: 'Test Location',
  });

  console.log(`  ✅ Placeholder added (${pdfWithPlaceholder.length} bytes)`);

  console.log('  🔐 Loading P12 certificate...');

  // Load P12 certificate
  const p12Buffer = await fs.readFile(options.p12Path);

  console.log('  ✍️  Signing PDF with ECDSA P-256...');

  // Create signer
  const signer = new P12Signer(p12Buffer, {
    passphrase: options.p12Password,
  });

  // Sign the PDF
  const signedPdf = await signer.sign(pdfWithPlaceholder);

  console.log(`  ✅ PDF signed (${signedPdf.length} bytes)`);

  // Save signed PDF
  await fs.writeFile(options.outputPath, signedPdf);

  console.log(`  ✅ Signed PDF saved: ${options.outputPath}`);
}

/**
 * Sign an existing PDF file
 */
export async function signExistingPdf(
  inputPdfPath: string,
  p12Path: string,
  p12Password: string,
  outputPath: string
): Promise<void> {
  console.log(`  📄 Loading PDF: ${inputPdfPath}...`);

  const pdfBuffer = await fs.readFile(inputPdfPath);
  console.log(`  ✅ PDF loaded (${pdfBuffer.length} bytes)`);

  console.log('  📝 Adding signature placeholder...');

  const pdfWithPlaceholder = plainAddPlaceholder({
    pdfBuffer,
    reason: 'ZK Qualified Signature Test',
    contactInfo: 'test@example.com',
    name: 'Test Signer',
    location: 'Test Location',
  });

  console.log('  🔐 Loading P12 certificate...');

  const p12Buffer = await fs.readFile(p12Path);

  console.log('  ✍️  Signing PDF...');

  const signer = new P12Signer(p12Buffer, {
    passphrase: p12Password,
  });

  const signedPdf = await signer.sign(pdfWithPlaceholder);

  await fs.writeFile(outputPath, signedPdf);

  console.log(`  ✅ Signed PDF saved: ${outputPath}`);
}
