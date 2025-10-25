#!/usr/bin/env node
/**
 * pades-certify.ts
 *
 * Creates a DocMDP certifying signature for a PDF.
 * DocMDP (Document Modification Detection and Prevention) transformation allows
 * the first signature to specify what changes are permitted after signing.
 *
 * Policies:
 *   - no-changes (P=1): No modifications allowed
 *   - form-fill (P=2): Form filling allowed
 *   - annotations (P=3): Form filling and annotations allowed
 *
 * Note: This implementation creates a DocMDP structure but requires external
 * signing tools (OpenSSL, pdfsig) for full cryptographic signature embedding.
 *
 * Usage:
 *   yarn pades:certify sample.pdf --policy no-changes --key signer.pem --out certified.pdf
 *   yarn pades:certify sample.pdf --policy form-fill --out certified.pdf
 */

import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, PDFDict, PDFName, PDFNumber, PDFArray, PDFHexString, PDFString } from 'pdf-lib';

interface CertifyOptions {
    inputPath: string;
    outputPath: string;
    policy: 'no-changes' | 'form-fill' | 'annotations';
    keyPath?: string;
}

function parseArgs(): CertifyOptions {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
DocMDP Certifying Signature Tool

Usage: yarn pades:certify <input.pdf> --policy <policy> --out <output.pdf> [--key <key.pem>]

Arguments:
  input.pdf              Input PDF file to certify

Options:
  --policy <policy>      Certification policy (required):
                           no-changes  - P=1: No modifications allowed
                           form-fill   - P=2: Form filling allowed
                           annotations - P=3: Form filling and annotations allowed
  --out <output.pdf>     Output file path (required)
  --key <key.pem>        Private key for signing (optional, for future use)

Examples:
  yarn pades:certify sample.pdf --policy no-changes --out certified.pdf
  yarn pades:certify form.pdf --policy form-fill --out certified_form.pdf
  yarn pades:certify doc.pdf --policy annotations --out certified_annotate.pdf

Note: This creates a DocMDP signature field. For full signing with crypto,
use external tools like OpenSSL or pdfsig after running this script.
        `);
        process.exit(0);
    }

    const inputPath = args[0];
    let policy: 'no-changes' | 'form-fill' | 'annotations' = 'no-changes';
    let outputPath = '';
    let keyPath: string | undefined;

    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--policy' && args[i + 1]) {
            const p = args[i + 1];
            if (p !== 'no-changes' && p !== 'form-fill' && p !== 'annotations') {
                console.error(`Error: Invalid policy "${p}". Must be: no-changes, form-fill, or annotations`);
                process.exit(1);
            }
            policy = p;
            i++;
        } else if (args[i] === '--out' && args[i + 1]) {
            outputPath = args[i + 1];
            i++;
        } else if (args[i] === '--key' && args[i + 1]) {
            keyPath = args[i + 1];
            i++;
        }
    }

    if (!inputPath) {
        console.error('Error: Input PDF path required');
        process.exit(1);
    }

    if (!outputPath) {
        console.error('Error: --out <output.pdf> required');
        process.exit(1);
    }

    if (!fs.existsSync(inputPath)) {
        console.error(`Error: Input file not found: ${inputPath}`);
        process.exit(1);
    }

    return { inputPath, outputPath, policy, keyPath };
}

function getPolicyNumber(policy: string): number {
    switch (policy) {
        case 'no-changes': return 1;
        case 'form-fill': return 2;
        case 'annotations': return 3;
        default: return 1;
    }
}

async function addDocMDPSignature(options: CertifyOptions): Promise<void> {
    const { inputPath, outputPath, policy } = options;

    console.log(`\n╔════════════════════════════════════════════════════╗`);
    console.log(`║   DocMDP Certifying Signature                      ║`);
    console.log(`╚════════════════════════════════════════════════════╝\n`);

    console.log(`Input:  ${inputPath}`);
    console.log(`Output: ${outputPath}`);
    console.log(`Policy: ${policy} (P=${getPolicyNumber(policy)})\n`);

    // Load the PDF
    const pdfBytes = fs.readFileSync(inputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Get the document catalog
    const catalog = pdfDoc.context.lookup(pdfDoc.catalog.get());

    // Create a signature field
    console.log('[1/5] Creating signature field...');

    // Create signature dictionary
    const signatureDict = pdfDoc.context.obj({
        Type: PDFName.of('Sig'),
        Filter: PDFName.of('Adobe.PPKLite'),
        SubFilter: PDFName.of('adbe.pkcs7.detached'),
        // Placeholder for signature value (would be filled by actual signing process)
        Contents: PDFHexString.fromText('0'.repeat(4096)), // Reserve space
        ByteRange: PDFArray.withContext(pdfDoc.context),
        M: PDFString.of(`D:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 14)}Z`),
        Name: PDFString.of('DocMDP Certifying Signature'),
        Reason: PDFString.of('Document certification'),
        Location: PDFString.of('ZK Qualified Signature POC'),
    });

    // Create DocMDP transformation parameters
    console.log('[2/5] Adding DocMDP transformation parameters...');

    const policyNum = getPolicyNumber(policy);
    const transformParams = pdfDoc.context.obj({
        Type: PDFName.of('TransformParams'),
        P: PDFNumber(policyNum),
        V: PDFName.of('1.2')
    });

    // Register the transform params
    const transformParamsRef = pdfDoc.context.register(transformParams);

    // Add Reference dictionary for DocMDP
    const reference = pdfDoc.context.obj({
        Type: PDFName.of('SigRef'),
        TransformMethod: PDFName.of('DocMDP'),
        TransformParams: transformParamsRef,
        Data: pdfDoc.catalog
    });

    const referenceRef = pdfDoc.context.register(reference);

    // Add Reference array to signature
    signatureDict.set(PDFName.of('Reference'), pdfDoc.context.obj([referenceRef]));

    // Register signature dictionary
    const signatureDictRef = pdfDoc.context.register(signatureDict);

    // Add Perms dictionary to catalog with DocMDP reference
    console.log('[3/5] Adding Perms dictionary to document catalog...');

    const perms = pdfDoc.context.obj({
        DocMDP: signatureDictRef
    });

    catalog.set(PDFName.of('Perms'), perms);

    // Create AcroForm if it doesn't exist
    console.log('[4/5] Setting up signature field in AcroForm...');

    let acroForm = catalog.get(PDFName.of('AcroForm'));
    let acroFormRef;

    if (!acroForm) {
        acroForm = pdfDoc.context.obj({
            Fields: pdfDoc.context.obj([]),
            SigFlags: PDFNumber(3) // SignaturesExist | AppendOnly
        });
        acroFormRef = pdfDoc.context.register(acroForm);
        catalog.set(PDFName.of('AcroForm'), acroFormRef);
    } else {
        acroFormRef = catalog.get(PDFName.of('AcroForm'));
        // Update SigFlags
        const acroFormDict = pdfDoc.context.lookup(acroFormRef);
        acroFormDict.set(PDFName.of('SigFlags'), PDFNumber(3));
    }

    // Create signature field widget
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();

    // Create signature field annotation (invisible)
    const sigField = pdfDoc.context.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Widget'),
        FT: PDFName.of('Sig'),
        T: PDFString.of('DocMDP_Signature'),
        V: signatureDictRef,
        P: firstPage.ref,
        Rect: pdfDoc.context.obj([0, 0, 0, 0]), // Invisible
        F: PDFNumber(132) // Hidden + Print
    });

    const sigFieldRef = pdfDoc.context.register(sigField);

    // Add to AcroForm fields
    const acroFormDict = pdfDoc.context.lookup(acroFormRef);
    const fields = acroFormDict.get(PDFName.of('Fields'));
    const fieldsArray = pdfDoc.context.lookup(fields) as PDFArray;
    fieldsArray.push(sigFieldRef);

    // Add annotation to first page
    let annots = firstPage.node.get(PDFName.of('Annots'));
    if (!annots) {
        annots = pdfDoc.context.obj([]);
        firstPage.node.set(PDFName.of('Annots'), annots);
    }
    const annotsArray = pdfDoc.context.lookup(annots) as PDFArray;
    annotsArray.push(sigFieldRef);

    // Save the PDF
    console.log('[5/5] Saving certified PDF...');
    const modifiedPdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, modifiedPdfBytes);

    console.log(`\n✅ DocMDP signature structure created successfully!`);
    console.log(`\nPolicy: ${policy.toUpperCase()}`);
    console.log(`  P=${policyNum} - ${getPolicyDescription(policy)}`);

    console.log(`\nStructure added:`);
    console.log(`  ✓ Signature field with DocMDP transformation`);
    console.log(`  ✓ /Perms dictionary in catalog`);
    console.log(`  ✓ Transform parameters (P=${policyNum})`);
    console.log(`  ✓ SigFlags = 3 (SignaturesExist | AppendOnly)`);

    console.log(`\n⚠️  Note: This creates the DocMDP structure but does not contain`);
    console.log(`   a cryptographic signature yet. To fully sign, use:`);
    console.log(`   - OpenSSL: openssl cms -sign ...`);
    console.log(`   - pdfsig: pdfsig -sign <key> <cert> ...`);
    console.log(`   - Adobe Acrobat: Sign with certificate`);

    console.log(`\nValidation:`);
    console.log(`  Adobe Acrobat:  Open and check signature panel`);
    console.log(`  Okular:         Document → Signatures`);
    console.log(`  pdfsig:         pdfsig -list ${outputPath}`);

    console.log(`\nExpected behavior after proper signing:`);
    console.log(`  - Adobe shows "Certified Document" badge`);
    console.log(`  - Policy enforced: ${getPolicyDescription(policy)}`);
    console.log(`  - Modifications after signing trigger warnings\n`);
}

function getPolicyDescription(policy: string): string {
    switch (policy) {
        case 'no-changes':
            return 'No changes to document allowed';
        case 'form-fill':
            return 'Filling forms allowed';
        case 'annotations':
            return 'Filling forms and adding annotations allowed';
        default:
            return 'Unknown policy';
    }
}

async function main() {
    try {
        const options = parseArgs();
        await addDocMDPSignature(options);
    } catch (error) {
        console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
    }
}

main();
