#!/usr/bin/env node
/**
 * pades-lt.ts
 *
 * Add long-term validation data to PAdES signature (PAdES-T → PAdES-LT)
 * Embeds certificate chains, OCSP responses, and CRLs in DSS/VRI dictionaries.
 *
 * Usage:
 *   yarn pades:lt <input.pdf> [--out <output.pdf>]
 *
 * Example:
 *   yarn pades:lt sample_timestamped.pdf --out sample_lt.pdf
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

interface CertificateChainData {
    certificates: pkijs.Certificate[];
    ocspResponses: Buffer[];
    crls: Buffer[];
}

interface PDFDSSData {
    certs: Buffer[];
    ocsps: Buffer[];
    crls: Buffer[];
    vriEntries: Map<string, { certs: number[]; ocsps: number[]; crls: number[] }>;
}

function extractCMSFromPDF(pdfPath: string): Buffer {
    const pdf = fs.readFileSync(pdfPath);
    const pdfStr = pdf.toString('latin1');
    const match = pdfStr.match(/\/Contents\s*<([0-9a-fA-F\s]+)>/);
    if (!match) throw new Error('CMS signature not found in PDF');
    const hexStr = match[1].replace(/\s+/g, '');
    return Buffer.from(hexStr, 'hex');
}

async function buildCertificateChain(cert: pkijs.Certificate): Promise<pkijs.Certificate[]> {
    console.log('  Building certificate chain...');
    const chain: pkijs.Certificate[] = [cert];

    try {
        // Check if cert is self-signed (root CA)
        const issuer = cert.issuer.typesAndValues.map((tv: any) =>
            `${tv.type}=${tv.value.valueBlock.value}`
        ).join(', ');
        const subject = cert.subject.typesAndValues.map((tv: any) =>
            `${tv.type}=${tv.value.valueBlock.value}`
        ).join(', ');

        console.log(`    Subject: ${subject}`);
        console.log(`    Issuer:  ${issuer}`);

        if (issuer === subject) {
            console.log('    ✓ Self-signed certificate (root CA)');
            return chain;
        }

        // Try to extract AIA (Authority Information Access) for CA issuer
        if (cert.extensions) {
            const aiaExt = cert.extensions.find((ext: any) =>
                ext.extnID === '1.3.6.1.5.5.7.1.1' // id-pe-authorityInfoAccess
            );

            if (aiaExt) {
                console.log('    ! AIA extension found, but automatic chain building not implemented');
                console.log('    ! Manual chain: Include issuer certificate in PDF manually');
            }
        }

        console.log('    ⚠ Chain building stopped at end-entity cert');
        console.log('    ! For production: Implement AIA following and chain building');

    } catch (error: any) {
        console.warn(`    Warning: Chain building error: ${error.message}`);
    }

    return chain;
}

async function fetchOCSPResponse(cert: pkijs.Certificate, issuerCert?: pkijs.Certificate): Promise<Buffer | null> {
    console.log('  Fetching OCSP response...');

    try {
        // Check for OCSP URL in AIA extension
        if (!cert.extensions) {
            console.log('    ⚠ No extensions found in certificate');
            return null;
        }

        const aiaExt = cert.extensions.find((ext: any) =>
            ext.extnID === '1.3.6.1.5.5.7.1.1' // id-pe-authorityInfoAccess
        );

        if (!aiaExt) {
            console.log('    ⚠ No AIA extension found');
            return null;
        }

        // In production, would parse AIA to extract OCSP URL
        console.log('    ! OCSP fetching not implemented in POC');
        console.log('    ! For production: Parse AIA, create OCSPRequest, call responder');

        // Example of what would be done:
        // 1. Parse AIA extension to get OCSP URL
        // 2. Create OCSPRequest with cert serial number
        // 3. POST to OCSP responder
        // 4. Parse OCSPResponse
        // 5. Return response DER

        return null;

    } catch (error: any) {
        console.warn(`    Warning: OCSP fetch error: ${error.message}`);
        return null;
    }
}

async function fetchCRL(cert: pkijs.Certificate): Promise<Buffer | null> {
    console.log('  Fetching CRL...');

    try {
        // Check for CRL distribution points
        if (!cert.extensions) {
            console.log('    ⚠ No extensions found in certificate');
            return null;
        }

        const crlExt = cert.extensions.find((ext: any) =>
            ext.extnID === '2.5.29.31' // id-ce-cRLDistributionPoints
        );

        if (!crlExt) {
            console.log('    ⚠ No CRL distribution points found');
            return null;
        }

        console.log('    ! CRL fetching not implemented in POC');
        console.log('    ! For production: Parse CDP, download CRL, validate');

        return null;

    } catch (error: any) {
        console.warn(`    Warning: CRL fetch error: ${error.message}`);
        return null;
    }
}

async function gatherValidationData(signedData: pkijs.SignedData): Promise<CertificateChainData> {
    console.log('[2/4] Gathering validation data...');

    if (!signedData.certificates || signedData.certificates.length === 0) {
        throw new Error('No certificates in CMS SignedData');
    }

    // Filter to get only Certificate objects (not AttributeCertificate)
    const signerCert = signedData.certificates[0];
    if (!(signerCert instanceof pkijs.Certificate)) {
        throw new Error('First certificate is not an X.509 certificate');
    }

    console.log(`  Found ${signedData.certificates.length} certificate(s) in signature`);

    // Build certificate chain
    const chain = await buildCertificateChain(signerCert);
    console.log(`  Certificate chain length: ${chain.length}`);

    // Fetch OCSP response
    const ocspResp = await fetchOCSPResponse(signerCert);
    const ocspResponses = ocspResp ? [ocspResp] : [];
    console.log(`  OCSP responses: ${ocspResponses.length}`);

    // Fetch CRL (fallback if OCSP not available)
    const crl = await fetchCRL(signerCert);
    const crls = crl ? [crl] : [];
    console.log(`  CRLs: ${crls.length}`);

    console.log('');

    return {
        certificates: chain,
        ocspResponses,
        crls
    };
}

function createPDFDSSStructure(chainData: CertificateChainData, signatureHash: string): PDFDSSData {
    console.log('[3/4] Creating DSS/VRI structure...');

    // Convert certificates to DER
    const certsDER = chainData.certificates.map(cert => {
        const der = cert.toSchema().toBER();
        return Buffer.from(der);
    });

    console.log(`  DSS Certificates: ${certsDER.length}`);
    console.log(`  DSS OCSPs: ${chainData.ocspResponses.length}`);
    console.log(`  DSS CRLs: ${chainData.crls.length}`);

    // Create VRI entry for this signature
    const vriEntries = new Map<string, { certs: number[]; ocsps: number[]; crls: number[] }>();
    vriEntries.set(signatureHash, {
        certs: certsDER.map((_, idx) => idx), // Indices into DSS Certs array
        ocsps: chainData.ocspResponses.map((_, idx) => idx),
        crls: chainData.crls.map((_, idx) => idx)
    });

    console.log(`  VRI entries: ${vriEntries.size}`);
    console.log('');

    return {
        certs: certsDER,
        ocsps: chainData.ocspResponses,
        crls: chainData.crls,
        vriEntries
    };
}

function embedDSSInPDF(pdfBuffer: Buffer, dssData: PDFDSSData): Buffer {
    console.log('[4/4] Embedding DSS in PDF...');

    // This is a simplified implementation that demonstrates the structure
    // Full implementation would require proper PDF parser/writer

    console.log('  ⚠ PDF DSS embedding is complex and requires full PDF library');
    console.log('  ! This POC shows the DATA STRUCTURE that would be embedded');
    console.log('');
    console.log('  DSS Dictionary Structure:');
    console.log('  {');
    console.log('    /Type /DSS');
    console.log(`    /Certs [ ${dssData.certs.length} certificate streams ]`);
    console.log(`    /OCSPs [ ${dssData.ocsps.length} OCSP response streams ]`);
    console.log(`    /CRLs [ ${dssData.crls.length} CRL streams ]`);
    console.log('    /VRIs <<');
    Array.from(dssData.vriEntries.entries()).forEach(([hash, vri]) => {
        console.log(`      /${hash} <<`);
        console.log(`        /Cert [ ${vri.certs.join(' ')} ]`);
        console.log(`        /OCSP [ ${vri.ocsps.join(' ')} ]`);
        console.log(`        /CRL [ ${vri.crls.join(' ')} ]`);
        console.log('      >>');
    });
    console.log('    >>');
    console.log('  }');
    console.log('');

    // Save DSS data to files for inspection
    const outDir = 'out/dss';
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    dssData.certs.forEach((cert, idx) => {
        fs.writeFileSync(path.join(outDir, `cert_${idx}.der`), cert);
    });

    dssData.ocsps.forEach((ocsp, idx) => {
        fs.writeFileSync(path.join(outDir, `ocsp_${idx}.der`), ocsp);
    });

    dssData.crls.forEach((crl, idx) => {
        fs.writeFileSync(path.join(outDir, `crl_${idx}.der`), crl);
    });

    fs.writeFileSync(
        path.join(outDir, 'dss_structure.json'),
        JSON.stringify({
            certs: dssData.certs.map((c, i) => ({ index: i, size: c.length })),
            ocsps: dssData.ocsps.map((o, i) => ({ index: i, size: o.length })),
            crls: dssData.crls.map((c, i) => ({ index: i, size: c.length })),
            vri: Array.from(dssData.vriEntries.entries()).map(([hash, vri]) => ({
                signatureHash: hash,
                certIndices: vri.certs,
                ocspIndices: vri.ocsps,
                crlIndices: vri.crls
            }))
        }, null, 2)
    );

    console.log(`  ✓ DSS data saved to ${outDir}/`);
    console.log('');

    console.log('  For full PAdES-LT implementation:');
    console.log('  1. Use pdf-lib or similar to parse PDF structure');
    console.log('  2. Create DSS dictionary as PDF indirect object');
    console.log('  3. Add /Certs, /OCSPs, /CRLs arrays as PDF streams');
    console.log('  4. Create /VRIs dictionary with references');
    console.log('  5. Add DSS reference to document catalog');
    console.log('  6. Perform incremental update to preserve signatures');
    console.log('');

    // For POC, return original PDF unchanged
    console.log('  ! Returning original PDF (DSS structure documented above)');
    return pdfBuffer;
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log('Usage: pades-lt <input.pdf> [options]');
        console.log('');
        console.log('Options:');
        console.log('  --out <file>    Output PDF path (default: <input>_lt.pdf)');
        console.log('');
        console.log('Description:');
        console.log('  Adds long-term validation data (DSS/VRI) to a PAdES signature.');
        console.log('  Embeds certificate chains, OCSP responses, and CRLs for offline validation.');
        console.log('');
        console.log('Example:');
        console.log('  yarn pades:lt sample_timestamped.pdf --out sample_lt.pdf');
        console.log('');
        console.log('Note:');
        console.log('  This POC implementation demonstrates the data structures required.');
        console.log('  Full PDF modification requires specialized PDF library integration.');
        process.exit(0);
    }

    const inputPDF = args[0];
    const outputPDF = args.includes('--out')
        ? args[args.indexOf('--out') + 1]
        : inputPDF.replace('.pdf', '_lt.pdf');

    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║         PAdES-LT Long-term Validation              ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    console.log(`Input:  ${inputPDF}`);
    console.log(`Output: ${outputPDF}`);
    console.log('');

    try {
        // Step 1: Extract signature from PDF
        console.log('[1/4] Extracting signature from PDF...');
        const cmsBuffer = extractCMSFromPDF(inputPDF);
        console.log(`  CMS size: ${cmsBuffer.length} bytes`);

        // Parse CMS SignedData
        const asn1 = asn1js.fromBER(cmsBuffer);
        if (asn1.offset === -1) {
            throw new Error('Failed to parse CMS ASN.1');
        }

        const contentInfo = new pkijs.ContentInfo({ schema: asn1.result });
        const signedData = new pkijs.SignedData({ schema: contentInfo.content });

        console.log(`  SignedData version: ${signedData.version}`);
        console.log(`  SignerInfos: ${signedData.signerInfos.length}`);
        console.log('');

        // Compute signature hash for VRI key
        const signatureHash = crypto.createHash('sha256').update(cmsBuffer).digest('hex').toUpperCase();
        console.log(`  Signature hash (for VRI): ${signatureHash.substring(0, 16)}...`);
        console.log('');

        // Step 2: Gather validation data
        const chainData = await gatherValidationData(signedData);

        // Step 3: Create DSS structure
        const dssData = createPDFDSSStructure(chainData, signatureHash);

        // Step 4: Embed in PDF
        const pdfBuffer = fs.readFileSync(inputPDF);
        const ltPDF = embedDSSInPDF(pdfBuffer, dssData);

        fs.writeFileSync(outputPDF, ltPDF);
        console.log(`  Output: ${outputPDF}`);
        console.log('');

        console.log('╔════════════════════════════════════════════════════╗');
        console.log('║       ✅ PAdES-LT Structure Complete! ✅          ║');
        console.log('╚════════════════════════════════════════════════════╝\n');

        console.log('What was delivered:');
        console.log('  ✓ Certificate chain extraction');
        console.log('  ✓ DSS/VRI data structure specification');
        console.log('  ✓ Validation data saved to out/dss/');
        console.log('');
        console.log('For full implementation:');
        console.log('  - Implement AIA following for chain building');
        console.log('  - Implement OCSP request/response handling');
        console.log('  - Implement CRL download and parsing');
        console.log('  - Use pdf-lib for proper PDF DSS embedding');
        console.log('');
        console.log('Files:');
        console.log('  - out/dss/cert_*.der - Certificate DER files');
        console.log('  - out/dss/dss_structure.json - Complete DSS structure');
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

main().catch(err => {
    console.error('\n❌ Fatal error:', err.message || err);
    process.exit(1);
});
