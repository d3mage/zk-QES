import fs from 'node:fs';
import path from 'node:path';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { sha256 } from '../common/utils.ts';

interface SignatureData {
    r: Buffer;
    s: Buffer;
}

interface PublicKeyData {
    x: Buffer;
    y: Buffer;
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

function parseCMSWithPKIjs(cmsBuffer: Buffer): {
    signedAttrsHash: Buffer;
    signature: SignatureData;
    certificate: Buffer;
    publicKey: PublicKeyData;
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

    const attrsForSigning = new asn1js.Set({
        value: (signerInfo.signedAttrs.attributes as Array<{ toSchema(): asn1js.BaseBlock }>).map((attr) =>
            attr.toSchema(),
        ),
    });
    const signedAttrsForSigning = attrsForSigning.toBER();
    const signedAttrsHash = Buffer.from(sha256(new Uint8Array(signedAttrsForSigning)));

    const signatureValue = Buffer.from(signerInfo.signature.valueBlock.valueHex);
    const sigAsn1 = asn1js.fromBER(signatureValue);
    if (sigAsn1.offset === -1) {
        throw new Error('Failed to parse signature');
    }

    const sigSequence = sigAsn1.result as asn1js.Sequence;
    const rValue = (sigSequence.valueBlock.value[0] as asn1js.Integer).valueBlock.valueHexView;
    const sValue = (sigSequence.valueBlock.value[1] as asn1js.Integer).valueBlock.valueHexView;

    const padTo32 = (buf: Uint8Array): Buffer => {
        const b = Buffer.from(buf);
        if (b[0] === 0 && b.length === 33) return b.slice(1);
        if (b.length === 32) return b;
        if (b.length < 32) {
            const padded = Buffer.alloc(32);
            b.copy(padded, 32 - b.length);
            return padded;
        }
        return b.slice(-32);
    };

    const r = padTo32(rValue);
    const s = padTo32(sValue);

    if (!cmsContent.certificates || cmsContent.certificates.length === 0) {
        throw new Error('No certificates in CMS');
    }

    const cert = cmsContent.certificates[0] as pkijs.Certificate;
    const certDer = Buffer.from(cert.toSchema().toBER());

    const pubKeyBytes = Buffer.from(cert.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView);

    if (pubKeyBytes[0] !== 0x04 || pubKeyBytes.length !== 65) {
        throw new Error(`Invalid EC public key format: ${pubKeyBytes.length} bytes`);
    }

    const pubX = pubKeyBytes.slice(1, 33);
    const pubY = pubKeyBytes.slice(33, 65);

    return {
        signedAttrsHash,
        signature: { r, s },
        certificate: certDer,
        publicKey: { x: pubX, y: pubY },
    };
}

export async function extractSignatureFromPDF(
    pdfBuffer: Buffer,
    outDir: string,
    isDump: boolean = false,
): Promise<{
    signature: SignatureData;
    publicKey: PublicKeyData;
    certificate: Buffer;
    signedAttrsHash: Buffer;
}> {
    const cmsBuffer = extractCMSfromPDF(pdfBuffer);
    if (!cmsBuffer) {
        throw new Error('Error: CMS not found in PDF');
    }

    console.log(`CMS length: ${cmsBuffer.length} bytes`);

    const { signedAttrsHash, signature, certificate, publicKey } = parseCMSWithPKIjs(cmsBuffer);

    console.log(`  r (32 bytes): ${signature.r.toString('hex')}`);
    console.log(`  s (32 bytes): ${signature.s.toString('hex')}`);
    console.log(`\nCertificate extracted (${certificate.length} bytes)`);
    console.log(`  x (32 bytes): ${publicKey.x.toString('hex')}`);
    console.log(`  y (32 bytes): ${publicKey.y.toString('hex')}`);
    console.log(`\nSigned attrs hash: ${signedAttrsHash.toString('hex')}`);

    if (isDump) {
        const sigJsonPath = path.join(outDir, 'sig.json');
        const pubkeyJsonPath = path.join(outDir, 'pubkey.json');
        const certDerPath = path.join(outDir, 'cert.der');
        const signedAttrsHashPath = path.join(outDir, 'signed_attrs_hash.bin');

        fs.writeFileSync(
            sigJsonPath,
            JSON.stringify(
                {
                    r: signature.r.toString('hex'),
                    s: signature.s.toString('hex'),
                    signature: Buffer.concat([signature.r, signature.s]).toString('hex'),
                },
                null,
                2,
            ),
        );

        fs.writeFileSync(
            pubkeyJsonPath,
            JSON.stringify(
                {
                    x: publicKey.x.toString('hex'),
                    y: publicKey.y.toString('hex'),
                },
                null,
                2,
            ),
        );

        fs.writeFileSync(certDerPath, certificate);
        fs.writeFileSync(signedAttrsHashPath, signedAttrsHash);

        console.log(`\nOutputs written:`);
        console.log(`  ${sigJsonPath}`);
        console.log(`  ${pubkeyJsonPath}`);
        console.log(`  ${certDerPath}`);
        console.log(`  ${signedAttrsHashPath}`);
    }

    return {
        signature,
        publicKey: publicKey,
        certificate,
        signedAttrsHash,
    };
}
