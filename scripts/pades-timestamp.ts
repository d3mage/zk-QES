#!/usr/bin/env node
/**
 * pades-timestamp.ts
 *
 * Add RFC-3161 trusted timestamp to PAdES signature (PAdES-B → PAdES-T)
 * This embeds a timestamp token from a TSA into the signature's unsigned attributes.
 *
 * Usage:
 *   yarn pades:timestamp <input.pdf> --tsa <tsa-url> [--out <output.pdf>]
 *
 * Example:
 *   yarn pades:timestamp sample_signed.pdf --tsa https://freetsa.org/tsr
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

// Configure PKI.js crypto engine
const webcrypto = crypto.webcrypto as any;
pkijs.setEngine(
    'nodejs',
    new pkijs.CryptoEngine({
        name: 'nodejs',
        crypto: crypto as any,
        subtle: webcrypto.subtle
    })
);

// TSA endpoints (configurable)
const TSA_ENDPOINTS = {
    freetsa: 'https://freetsa.org/tsr',
    digicert: 'https://timestamp.digicert.com',
    globalsign: 'http://timestamp.globalsign.com/scripts/timstamp.dll',
};

interface PDFSignatureInfo {
    byteRange: number[];
    signatureHex: string;
    signatureOffset: number;
    signedData: Buffer;
}

function extractSignatureFromPDF(pdfPath: string): PDFSignatureInfo {
    const pdf = fs.readFileSync(pdfPath);
    const pdfStr = pdf.toString('latin1');

    // Extract ByteRange
    const byteRangeMatch = pdfStr.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
    if (!byteRangeMatch) throw new Error('ByteRange not found in PDF');

    const byteRange = byteRangeMatch.slice(1, 5).map(Number);
    const [offset1, length1, offset2, length2] = byteRange;

    // Extract signature hex
    const contentsMatch = pdfStr.match(/\/Contents\s*<([0-9a-fA-F\s]+)>/);
    if (!contentsMatch) throw new Error('Signature Contents not found in PDF');

    const signatureHex = contentsMatch[1].replace(/\s+/g, '');
    const signatureOffset = pdfStr.indexOf(contentsMatch[0]) + '/Contents <'.length;

    // Extract signed data (ByteRange parts)
    const part1 = pdf.subarray(offset1, offset1 + length1);
    const part2 = pdf.subarray(offset2, offset2 + length2);
    const signedData = Buffer.concat([part1, part2]);

    return { byteRange, signatureHex, signatureOffset, signedData };
}

async function createTimestampRequest(messageImprint: Buffer): Promise<Buffer> {
    console.log('Creating RFC-3161 TimeStampReq...');

    // Create TimeStampReq according to RFC 3161
    const timestampReq = new pkijs.TimeStampReq({
        version: 1,
        messageImprint: new pkijs.MessageImprint({
            hashAlgorithm: new pkijs.AlgorithmIdentifier({
                algorithmId: '2.16.840.1.101.3.4.2.1', // SHA-256
            }),
            hashedMessage: new asn1js.OctetString({ valueHex: messageImprint }),
        }),
        // Don't specify reqPolicy - let TSA use default
        nonce: new asn1js.Integer({ value: Date.now() }), // Nonce for replay protection
        certReq: true, // Request TSA certificate in response
    });

    const requestDER = timestampReq.toSchema().toBER();
    console.log(`  TimeStampReq size: ${requestDER.byteLength} bytes`);
    console.log(`  Message imprint (SHA-256): ${Buffer.from(messageImprint).toString('hex')}`);

    return Buffer.from(requestDER);
}

async function callTSA(tsaUrl: string, requestDER: Buffer): Promise<Buffer> {
    console.log(`\nCalling TSA: ${tsaUrl}`);

    const response = await fetch(tsaUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/timestamp-query',
            'Content-Length': requestDER.length.toString(),
        },
        body: requestDER,
    });

    if (!response.ok) {
        throw new Error(`TSA request failed: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('timestamp-reply')) {
        console.warn(`Warning: Unexpected content-type: ${contentType}`);
    }

    const responseDER = Buffer.from(await response.arrayBuffer());
    console.log(`  Response size: ${responseDER.length} bytes`);

    return responseDER;
}

async function parseTimestampResponse(responseDER: Buffer): Promise<pkijs.TimeStampResp> {
    console.log('\nParsing TimeStampResp...');

    const asn1 = asn1js.fromBER(responseDER);
    if (asn1.offset === -1) {
        throw new Error('Failed to parse TimeStampResp ASN.1');
    }

    const timestampResp = new pkijs.TimeStampResp({ schema: asn1.result });

    // Check status
    const status = timestampResp.status.status;
    const statusMessages: { [key: number]: string } = {
        0: 'granted',
        1: 'grantedWithMods',
        2: 'rejection',
        3: 'waiting',
        4: 'revocationWarning',
        5: 'revocationNotification',
    };

    const statusText = statusMessages[status] || `unknown(${status})`;
    console.log(`  Status: ${statusText}`);

    if (status !== 0 && status !== 1) {
        if (timestampResp.status.statusStrings) {
            const statusStrings = timestampResp.status.statusStrings.map((s: any) =>
                Buffer.from(s.valueBlock.valueHex).toString('utf8')
            ).join(', ');
            throw new Error(`Timestamp request failed: ${statusText} - ${statusStrings}`);
        }
        throw new Error(`Timestamp request failed: ${statusText}`);
    }

    if (!timestampResp.timeStampToken) {
        throw new Error('No timestamp token in response');
    }

    console.log('  ✓ Timestamp token received');

    return timestampResp;
}

function addTimestampToSignature(
    pdfBuffer: Buffer,
    signatureHex: string,
    timestampToken: pkijs.ContentInfo
): Buffer {
    console.log('\nAdding timestamp to signature...');

    // Parse original CMS SignedData
    const originalCMS = Buffer.from(signatureHex, 'hex');
    const asn1 = asn1js.fromBER(originalCMS);
    if (asn1.offset === -1) {
        throw new Error('Failed to parse original signature');
    }

    const contentInfo = new pkijs.ContentInfo({ schema: asn1.result });
    const signedData = new pkijs.SignedData({ schema: contentInfo.content });

    if (signedData.signerInfos.length === 0) {
        throw new Error('No SignerInfo in signature');
    }

    const signerInfo = signedData.signerInfos[0];

    // Create timestamp attribute (id-aa-signatureTimeStampToken)
    const timestampAttr = new pkijs.Attribute({
        type: '1.2.840.113549.1.9.16.2.14', // id-aa-signatureTimeStampToken
        values: [
            timestampToken.toSchema()
        ]
    });

    // Add to unsigned attributes
    if (!signerInfo.unsignedAttrs) {
        signerInfo.unsignedAttrs = new pkijs.SignedAndUnsignedAttributes({
            type: 1, // unsigned
            attributes: []
        });
    }

    signerInfo.unsignedAttrs.attributes.push(timestampAttr);

    console.log(`  Unsigned attributes: ${signerInfo.unsignedAttrs.attributes.length}`);

    // Re-encode the SignedData
    const newContentInfo = new pkijs.ContentInfo({
        contentType: '1.2.840.113549.1.7.2', // SignedData
        content: signedData.toSchema()
    });

    const newCMSDER = newContentInfo.toSchema().toBER();
    const newCMSHex = Buffer.from(newCMSDER).toString('hex');

    console.log(`  Original CMS size: ${originalCMS.length} bytes`);
    console.log(`  New CMS size: ${newCMSDER.byteLength} bytes`);

    // Check if new signature fits in existing space
    const pdfStr = pdfBuffer.toString('latin1');
    const contentsMatch = pdfStr.match(/\/Contents\s*<([0-9a-fA-F\s]+)>/);
    if (!contentsMatch) throw new Error('Cannot find Contents in PDF');

    const existingHexLength = contentsMatch[1].replace(/\s+/g, '').length;
    const requiredHexLength = newCMSHex.length;

    if (requiredHexLength > existingHexLength) {
        throw new Error(
            `New signature (${requiredHexLength} hex chars) doesn't fit in existing space (${existingHexLength} hex chars).\n` +
            `The PDF signature field needs to be created with more space.\n` +
            `Required: at least ${Math.ceil(requiredHexLength / 2)} bytes.`
        );
    }

    // Pad with zeros to fit existing space
    const paddedHex = newCMSHex.padEnd(existingHexLength, '0');

    // Replace signature in PDF
    const newPdfStr = pdfStr.replace(
        /\/Contents\s*<[0-9a-fA-F\s]+>/,
        `/Contents <${paddedHex}>`
    );

    console.log('  ✓ Signature updated in PDF');

    return Buffer.from(newPdfStr, 'latin1');
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log('Usage: pades-timestamp <input.pdf> [options]');
        console.log('');
        console.log('Options:');
        console.log('  --tsa <url>     TSA endpoint URL (default: freetsa.org)');
        console.log('  --out <file>    Output PDF path (default: <input>_timestamped.pdf)');
        console.log('');
        console.log('Available TSA endpoints:');
        Object.entries(TSA_ENDPOINTS).forEach(([name, url]) => {
            console.log(`  ${name}: ${url}`);
        });
        console.log('');
        console.log('Example:');
        console.log('  yarn pades:timestamp sample_signed.pdf --tsa https://freetsa.org/tsr');
        process.exit(0);
    }

    const inputPDF = args[0];
    const tsaUrl = args.includes('--tsa')
        ? args[args.indexOf('--tsa') + 1]
        : TSA_ENDPOINTS.freetsa;

    const outputPDF = args.includes('--out')
        ? args[args.indexOf('--out') + 1]
        : inputPDF.replace('.pdf', '_timestamped.pdf');

    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║          PAdES-T Timestamp Implementation          ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    console.log(`Input:  ${inputPDF}`);
    console.log(`TSA:    ${tsaUrl}`);
    console.log(`Output: ${outputPDF}`);
    console.log('');

    try {
        // Step 1: Extract signature from PDF
        console.log('[1/5] Extracting signature from PDF...');
        const sigInfo = extractSignatureFromPDF(inputPDF);
        console.log(`  ByteRange: [${sigInfo.byteRange.join(', ')}]`);
        console.log(`  Signature size: ${sigInfo.signatureHex.length / 2} bytes`);
        console.log('');

        // Step 2: Compute message imprint (hash of signature value)
        console.log('[2/5] Computing message imprint...');
        const signatureValue = Buffer.from(sigInfo.signatureHex, 'hex');

        // Parse CMS to get actual signature octets
        const asn1 = asn1js.fromBER(signatureValue);
        const contentInfo = new pkijs.ContentInfo({ schema: asn1.result });
        const signedData = new pkijs.SignedData({ schema: contentInfo.content });
        const signerInfo = signedData.signerInfos[0];

        // Message imprint is hash of the signature value
        const signatureOctets = Buffer.from(signerInfo.signature.valueBlock.valueHex);
        const messageImprint = crypto.createHash('sha256').update(signatureOctets).digest();
        console.log(`  Signature octets: ${signatureOctets.length} bytes`);
        console.log('');

        // Step 3: Create timestamp request
        console.log('[3/5] Creating timestamp request...');
        const timestampReq = await createTimestampRequest(messageImprint);
        console.log('');

        // Step 4: Call TSA
        console.log('[4/5] Calling TSA...');
        const timestampResp = await callTSA(tsaUrl, timestampReq);
        const parsedResp = await parseTimestampResponse(timestampResp);
        console.log('');

        // Step 5: Embed timestamp in PDF
        console.log('[5/5] Embedding timestamp in PDF...');
        const pdfBuffer = fs.readFileSync(inputPDF);
        const timestampedPDF = addTimestampToSignature(
            pdfBuffer,
            sigInfo.signatureHex,
            parsedResp.timeStampToken!
        );

        fs.writeFileSync(outputPDF, timestampedPDF);
        console.log(`  Output: ${outputPDF}`);
        console.log('');

        console.log('╔════════════════════════════════════════════════════╗');
        console.log('║              ✅ PAdES-T Complete! ✅               ║');
        console.log('╚════════════════════════════════════════════════════╝\n');

        console.log('Verification:');
        console.log(`  - Open ${outputPDF} in Adobe Acrobat`);
        console.log(`  - Signature should show timestamp information`);
        console.log(`  - Or use: pdfsig ${outputPDF}`);
        console.log('');

    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}

main();
