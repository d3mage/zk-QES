/**
 * Browser-compatible PDF signing using node-signpdf
 *
 * This module provides PDF signing functionality that can work in both Node.js and browser environments.
 * Uses node-signpdf which is compatible with browser bundlers.
 */

import { SignPdf } from 'node-signpdf';
import { P12Signer } from '@signpdf/signer-p12';
import { plainAddPlaceholder } from '@signpdf/placeholder-plain';
import * as fs from 'fs/promises';

export interface SignPdfOptions {
  pdfPath: string;
  p12Path: string;
  password: string;
  outputPath: string;
}

/**
 * Sign a PDF document with a PKCS#12 certificate
 *
 * @param options Signing options
 * @returns Path to the signed PDF
 */
export async function signPdfWithP12(options: SignPdfOptions): Promise<string> {
  const { pdfPath, p12Path, password, outputPath } = options;

  // Read PDF
  const pdfBuffer = await fs.readFile(pdfPath);

  // Read P12 certificate
  const p12Buffer = await fs.readFile(p12Path);

  // Add placeholder for signature
  const pdfWithPlaceholder = plainAddPlaceholder({
    pdfBuffer,
    reason: 'E2E Test Signing',
    contactInfo: 'test@example.com',
    name: 'Test Self-Signed Certificate',
    location: 'Browser',
  });

  // Create signer
  const signer = new P12Signer(p12Buffer, { passphrase: password });

  // Sign PDF (old API - pass p12 buffer directly)
  const signPdf = new SignPdf();
  const signedPdf = await signPdf.sign(pdfWithPlaceholder, p12Buffer, {
    passphrase: password
  });

  // Save signed PDF
  await fs.writeFile(outputPath, signedPdf);

  return outputPath;
}

/**
 * Check if a PDF has a digital signature
 */
export async function hasPdfSignature(pdfPath: string): Promise<boolean> {
  const pdfBuffer = await fs.readFile(pdfPath);
  const pdfString = pdfBuffer.toString('latin1');

  // Look for signature dictionary
  return pdfString.includes('/Type/Sig') || pdfString.includes('/ByteRange');
}
