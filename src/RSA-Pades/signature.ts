import fs from 'node:fs';
import path from 'node:path';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { sha256 } from '../utils.ts';

interface RsaSignatureData {
    signature: Buffer;    // raw RSA signature bytes (big-endian integer)
}

interface RsaPublicKeyData {
    n: Buffer;            // modulus
    e: number;            // public exponent as u32
}

function extractCMSfromPDF(pdfBuffer: Buffer): Buffer | null {
    const pdfStr = pdfBuffer.toString('latin1');

    // Find /Contents <hex_string>
    const match = pdfStr.match(/\/Contents\s*<([0-9a-fA-F\s]+)>/);
    if (!match) {
        return null;
    }

    const hexStr = match[1].replace(/\s+/g, '');
    return Buffer.from(hexStr, 'hex');
}

function parseCMSWithPKIjsRSA(
    cmsBuffer: Buffer
): {
    signedAttrsHash: Buffer;
    signature: RsaSignatureData;
    certificate: Buffer;
    publicKey: RsaPublicKeyData;
} {
    const asn1 = asn1js.fromBER(cmsBuffer);
    if (asn1.offset === -1) {
        throw new Error('Failed to parse CMS ASN.1');
    }

    const cmsContentSimpl = new pkijs.ContentInfo({ schema: asn1.result });
    const cmsContent = new pkijs.SignedData({ schema: cmsContentSimpl.content });

    const signerInfo = cmsContent.signerInfos[0];

    if (!signerInfo.signedAttrs) {
        throw new Error('No signed attributes found');
    }

    // Build the SET OF signed attributes exactly as they were encoded for signing
    const attrsForSigning = new asn1js.Set({
        value: signerInfo.signedAttrs.attributes.map((attr: any) => attr.toSchema())
    });

    const signedAttrsForSigning = attrsForSigning.toBER();
    const signedAttrsHash = Buffer.from(
        sha256(new Uint8Array(signedAttrsForSigning))
    );

    // In CMS for RSA, signatureValue is already the raw signature bytes
    const signatureBytes = Buffer.from(
        signerInfo.signature.valueBlock.valueHex
    );
    const signature: RsaSignatureData = { signature: signatureBytes };

    if (!cmsContent.certificates || cmsContent.certificates.length === 0) {
        throw new Error('No certificates in CMS');
    }

    const cert = cmsContent.certificates[0] as pkijs.Certificate;
    const certDer = Buffer.from(cert.toSchema().toBER());

    // Ensure this is an RSA key
    const algOid = cert.subjectPublicKeyInfo.algorithm.algorithmId;
    if (algOid !== '1.2.840.113549.1.1.1') { // rsaEncryption
        throw new Error(`Not an RSA certificate (alg OID: ${algOid})`);
    }

    // subjectPublicKey is a BIT STRING containing an RSAPublicKey structure:
    // RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER }
    const spki = cert.subjectPublicKeyInfo;
    const pubAsn1 = asn1js.fromBER(
        spki.subjectPublicKey.valueBlock.valueHex
    );
    if (pubAsn1.offset === -1) {
        throw new Error('Failed to parse RSA public key');
    }

    const pubSeq = pubAsn1.result as asn1js.Sequence;
    const modulus = pubSeq.valueBlock.value[0] as asn1js.Integer;
    const exponent = pubSeq.valueBlock.value[1] as asn1js.Integer;

    let n = Buffer.from(modulus.valueBlock.valueHexView);
    const eBuf = Buffer.from(exponent.valueBlock.valueHexView);

    // Strip optional leading 0x00 from modulus if present (ASN.1 signed integer)
    if (n.length > 0 && n[0] === 0x00) {
        n = n.slice(1);
    }

    const eBigInt = BigInt('0x' + eBuf.toString('hex'));
    if (eBigInt > BigInt(0xffffffff)) {
        throw new Error(`RSA exponent too large for u32: ${eBigInt.toString(10)}`);
    }
    const e = Number(eBigInt);

    const publicKey: RsaPublicKeyData = { n, e };

    return {
        signedAttrsHash,
        signature,
        certificate: certDer,
        publicKey
    };
}

export async function extractRsaSignatureFromPDF(
    pdfBuffer: Buffer,
    outDir: string,
    isDump: boolean = false
): Promise<{
    signature: RsaSignatureData;
    publicKey: RsaPublicKeyData;
    certificate: Buffer;
    signedAttrsHash: Buffer;
}> {
    const cmsBuffer = extractCMSfromPDF(pdfBuffer);
    if (!cmsBuffer) {
        throw new Error('Error: CMS not found in PDF');
    }

    console.log(`CMS length: ${cmsBuffer.length} bytes`);

    const {
        signedAttrsHash,
        signature,
        certificate,
        publicKey
    } = parseCMSWithPKIjsRSA(cmsBuffer);

    console.log(
        `  signature (${signature.signature.length} bytes): ${signature.signature.toString('hex')}`
    );
    console.log(`\nCertificate extracted (${certificate.length} bytes)`);
    console.log(`  n (modulus):  ${publicKey.n.toString('hex')}`);
    console.log(`  e (exponent): 0x${publicKey.e.toString(16)} (${publicKey.e})`);
    console.log(`\nSigned Attrs Hash: ${signedAttrsHash.toString('hex')}`);

    if (isDump) {
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }

        const sigJsonPath = path.join(outDir, 'sig-rsa.json');
        const pubkeyJsonPath = path.join(outDir, 'pubkey-rsa.json');
        const certDerPath = path.join(outDir, 'cert-rsa.der');
        const signedAttrsHashPath = path.join(outDir, 'signed_attrs_hash-rsa.bin');

        fs.writeFileSync(
            sigJsonPath,
            JSON.stringify(
                {
                    signature: signature.signature.toString('hex')
                },
                null,
                2
            )
        );

        fs.writeFileSync(
            pubkeyJsonPath,
            JSON.stringify(
                {
                    n: publicKey.n.toString('hex'),
                    e_hex: '0x' + publicKey.e.toString(16),
                    e_dec: publicKey.e.toString(10)
                },
                null,
                2
            )
        );

        fs.writeFileSync(certDerPath, certificate);
        fs.writeFileSync(signedAttrsHashPath, signedAttrsHash);

        console.log('\nOutputs written:');
        console.log(`  ${sigJsonPath}`);
        console.log(`  ${pubkeyJsonPath}`);
        console.log(`  ${certDerPath}`);
        console.log(`  ${signedAttrsHashPath}`);
    }

    return {
        signature,
        publicKey,
        certificate,
        signedAttrsHash
    };
}
