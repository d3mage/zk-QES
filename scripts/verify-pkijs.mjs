import fs from 'node:fs';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import crypto from 'node:crypto';

// Set crypto engine
pkijs.setEngine("newEngine", crypto, new pkijs.CryptoEngine({ name: "", crypto, subtle: crypto.webcrypto.subtle }));

const pdfPath = 'test_files/sample_signed.pdf';

// Extract ByteRange data
const pdf = fs.readFileSync(pdfPath);
const pdfStr = pdf.toString('latin1');
const match = pdfStr.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
const [offset1, length1, offset2, length2] = match.slice(1).map(Number);
const byteRangeData = Buffer.concat([
    pdf.subarray(offset1, offset1 + length1),
    pdf.subarray(offset2, offset2 + length2)
]);

// Extract CMS
const cmsMatch = pdfStr.match(/\/Contents\s*<([0-9a-fA-F\s]+)>/);
const cmsBuffer = Buffer.from(cmsMatch[1].replace(/\s+/g, ''), 'hex');

// Parse with PKI.js
const asn1 = asn1js.fromBER(cmsBuffer);
const cmsContent = new pkijs.ContentInfo({ schema: asn1.result });
const signedData = new pkijs.SignedData({ schema: cmsContent.content });

console.log('Verifying signature using PKI.js...');

try {
    // Verify the signature
    const verifyResult = await signedData.verify({
        signer: 0,
        data: byteRangeData.buffer,
        checkChain: false,
        extendedMode: true
    });

    console.log('\n✅ PKI.js verification result:', verifyResult);
    console.log('Signature code:', verifyResult.signatureVerified);
    console.log('Message digest:', verifyResult.messageDigestVerified);
} catch (e) {
    console.error('❌ Verification failed:', e.message);
}
