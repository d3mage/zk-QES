# Frontend PKCS#12 Signing - Browser-Based QES

## Can We Sign with PKCS#12 in the Browser? YES! ✅

### The Complete Frontend Signing Flow

```
User's PKCS#12 file (.p12/.pfx with password)
    ↓
Browser FileReader API
    ↓
JavaScript crypto libraries (forge.js, PKI.js)
    ↓
Extract private key (stays in browser memory)
    ↓
Sign PDF using private key
    ↓
Generate ZK proof
    ↓
Clear private key from memory
```

## 1. Browser-Based PKCS#12 Handling

### Option 1: Pure JavaScript with Forge.js

```javascript
// Frontend signing implementation
import forge from 'node-forge';

async function signPDFInBrowser(p12File, password, pdfFile) {
    // 1. Read PKCS#12 file
    const p12ArrayBuffer = await p12File.arrayBuffer();
    const p12Der = new Uint8Array(p12ArrayBuffer);

    // 2. Parse PKCS#12 with password
    try {
        const p12Asn1 = forge.asn1.fromDer(
            forge.util.createBuffer(p12Der)
        );
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

        // 3. Extract private key and certificate
        const keyBags = p12.getBags({
            bagType: forge.pki.oids.pkcs8ShroudedKeyBag
        });
        const privateKey = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0].key;

        const certBags = p12.getBags({
            bagType: forge.pki.oids.certBag
        });
        const certificate = certBags[forge.pki.oids.certBag][0].cert;

        // 4. Sign PDF
        const signedPDF = await signPDFWithKey(pdfFile, privateKey, certificate);

        // 5. IMPORTANT: Clear sensitive data
        clearSensitiveData(privateKey);

        return signedPDF;

    } catch (error) {
        if (error.message.includes('Invalid password')) {
            throw new Error('Incorrect password for certificate file');
        }
        throw error;
    }
}
```

### Option 2: WebCrypto API + PKI.js

```javascript
import * as pkijs from 'pkijs';
import * as asn1js from 'asn1js';

async function signWithWebCrypto(p12Buffer, password, dataToSign) {
    // 1. Parse PKCS#12
    const asn1 = asn1js.fromBER(p12Buffer);
    const pfx = new pkijs.PFX({ schema: asn1.result });

    // 2. Extract bags with password
    await pfx.parseInternalValues({
        password: password,
        checkIntegrity: true
    });

    // 3. Get private key as CryptoKey object
    const privateKeyInfo = pfx.parsedValue.authenticatedSafe
        .find(item => item.bagType === '1.2.840.113549.1.12.10.1.2')
        .bagValue;

    // 4. Import to WebCrypto
    const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        privateKeyInfo.toSchema().toBER(false),
        {
            name: 'ECDSA',
            namedCurve: 'P-256'
        },
        false,  // not extractable
        ['sign']
    );

    // 5. Sign with WebCrypto
    const signature = await crypto.subtle.sign(
        {
            name: 'ECDSA',
            hash: 'SHA-256'
        },
        privateKey,
        dataToSign
    );

    return signature;
}
```

### Option 3: OpenSSL WASM (Heavy but Complete)

```javascript
// Using OpenSSL compiled to WASM
import OpenSSL from 'openssl-wasm';

async function signWithOpenSSLWASM(p12File, password, pdfFile) {
    // 1. Initialize OpenSSL WASM
    const openssl = await OpenSSL.init();

    // 2. Load PKCS#12
    const p12Buffer = await p12File.arrayBuffer();
    openssl.FS.writeFile('cert.p12', new Uint8Array(p12Buffer));

    // 3. Extract private key
    const result = openssl.exec([
        'pkcs12',
        '-in', 'cert.p12',
        '-nocerts',
        '-nodes',
        '-passin', `pass:${password}`,
        '-out', 'key.pem'
    ]);

    if (result.code !== 0) {
        throw new Error('Failed to extract private key');
    }

    // 4. Sign PDF
    openssl.FS.writeFile('document.pdf', await pdfFile.arrayBuffer());

    openssl.exec([
        'dgst',
        '-sha256',
        '-sign', 'key.pem',
        '-out', 'signature.bin',
        'document.pdf'
    ]);

    // 5. Get signature
    const signature = openssl.FS.readFile('signature.bin');

    // 6. Clean up
    openssl.FS.unlink('cert.p12');
    openssl.FS.unlink('key.pem');
    openssl.FS.unlink('signature.bin');

    return signature;
}
```

## 2. Complete Frontend Implementation

### Full Browser-Based QES Signing + ZK Proof

```javascript
// Complete frontend implementation
class FrontendQESSigner {
    constructor() {
        this.forge = require('node-forge');
        this.pdfLib = require('pdf-lib');
    }

    async signAndProve(p12File, password, pdfFile) {
        try {
            // Step 1: Parse PKCS#12
            const { privateKey, certificate, chain } =
                await this.parsePKCS12(p12File, password);

            // Step 2: Validate certificate is QES
            if (!this.isQualifiedCertificate(certificate)) {
                throw new Error('Certificate is not qualified (QES)');
            }

            // Step 3: Sign PDF
            const signedPDF = await this.signPDF(
                pdfFile,
                privateKey,
                certificate,
                chain
            );

            // Step 4: Extract signature for ZK proof
            const signatureData = this.extractSignature(signedPDF);

            // Step 5: Generate ZK proof (2-3 seconds)
            const zkProof = await this.generateZKProof(signatureData);

            // Step 6: Clear sensitive data
            this.clearPrivateKey(privateKey);

            return {
                signedPDF,
                zkProof,
                certificate: certificate.subject.getField('CN').value
            };

        } catch (error) {
            console.error('Signing failed:', error);
            throw error;
        }
    }

    async parsePKCS12(file, password) {
        const buffer = await file.arrayBuffer();
        const p12Der = this.forge.util.createBuffer(new Uint8Array(buffer));
        const p12Asn1 = this.forge.asn1.fromDer(p12Der);
        const p12 = this.forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

        // Extract all components
        const keyBags = p12.getBags({
            bagType: this.forge.pki.oids.pkcs8ShroudedKeyBag
        });
        const privateKey = keyBags[this.forge.pki.oids.pkcs8ShroudedKeyBag][0].key;

        const certBags = p12.getBags({
            bagType: this.forge.pki.oids.certBag
        });
        const allCerts = certBags[this.forge.pki.oids.certBag];

        // Separate end-entity from chain
        const certificate = allCerts[0].cert;
        const chain = allCerts.slice(1).map(bag => bag.cert);

        return { privateKey, certificate, chain };
    }

    async signPDF(pdfFile, privateKey, certificate, chain) {
        // Read PDF
        const pdfBuffer = await pdfFile.arrayBuffer();
        const pdfDoc = await this.pdfLib.PDFDocument.load(pdfBuffer);

        // Prepare signature
        const signatureDict = {
            Type: 'Sig',
            Filter: 'Adobe.PPKLite',
            SubFilter: 'adbe.pkcs7.detached',
            ByteRange: [0, 0, 0, 0],  // Placeholder
            Contents: new Uint8Array(8192),  // Placeholder
            Reason: 'Agreement',
            M: new Date()
        };

        // Add signature field
        const page = pdfDoc.getPage(0);
        const signatureField = pdfDoc.createSignatureField();
        signatureField.addToPage(page, {
            x: 50,
            y: 50,
            width: 200,
            height: 50
        });

        // Calculate ByteRange
        const pdfBytes = await pdfDoc.save({ incremental: true });
        const byteRange = this.calculateByteRange(pdfBytes);

        // Extract bytes to sign
        const bytesToSign = this.extractBytesToSign(pdfBytes, byteRange);

        // Create PKCS#7 signature
        const p7 = this.forge.pkcs7.createSignedData();
        p7.content = this.forge.util.createBuffer(bytesToSign);
        p7.addCertificate(certificate);
        chain.forEach(cert => p7.addCertificate(cert));

        p7.addSigner({
            key: privateKey,
            certificate: certificate,
            digestAlgorithm: this.forge.pki.oids.sha256,
            authenticatedAttributes: [{
                type: this.forge.pki.oids.contentType,
                value: this.forge.pki.oids.data
            }, {
                type: this.forge.pki.oids.messageDigest,
                value: this.forge.md.sha256.create().update(bytesToSign).digest()
            }, {
                type: this.forge.pki.oids.signingTime,
                value: new Date()
            }]
        });

        p7.sign();

        // Embed signature in PDF
        const signature = this.forge.asn1.toDer(p7.toAsn1()).getBytes();
        return this.embedSignature(pdfBytes, signature, byteRange);
    }

    extractSignature(signedPDF) {
        // Extract signature, public key, and document hash
        const signatureDict = this.parseSignatureDict(signedPDF);
        const cms = this.forge.pkcs7.messageFromAsn1(
            this.forge.asn1.fromDer(signatureDict.Contents)
        );

        const signerInfo = cms.signerInfos[0];
        const signature = this.parseECDSASignature(signerInfo.signature);
        const cert = cms.certificates[0];

        return {
            signature: {
                r: signature.r.toString('hex'),
                s: signature.s.toString('hex')
            },
            publicKey: {
                x: cert.publicKey.x.toString('hex'),
                y: cert.publicKey.y.toString('hex')
            },
            documentHash: this.calculateDocumentHash(signedPDF),
            certificate: cert
        };
    }

    async generateZKProof(signatureData) {
        // Prepare inputs for ZK circuit
        const inputs = {
            // Public inputs
            doc_hash: signatureData.documentHash,
            pub_key_x: signatureData.publicKey.x,
            pub_key_y: signatureData.publicKey.y,
            signer_fpr: this.sha256(signatureData.certificate.raw),

            // Private inputs
            signature: signatureData.signature.r + signatureData.signature.s,
            merkle_path: await this.getMerklePath(signatureData.certificate),
            merkle_index: await this.getMerkleIndex(signatureData.certificate)
        };

        // Generate proof (2-3 seconds with hybrid circuit)
        return await generateProof(inputs);
    }

    clearPrivateKey(privateKey) {
        // Overwrite private key in memory
        if (privateKey && privateKey.d) {
            // For forge.js RSA/ECDSA keys
            privateKey.d = null;
            privateKey.p = null;
            privateKey.q = null;
            privateKey.dP = null;
            privateKey.dQ = null;
            privateKey.qInv = null;
        }

        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }
    }

    isQualifiedCertificate(cert) {
        // Check for QES policy OIDs
        const qcpOIDs = [
            '0.4.0.194112.1.2',  // QCP-n-qscd
            '0.4.0.194112.1.4',  // QCP-l-qscd
        ];

        const extensions = cert.extensions || [];
        const certPolicies = extensions.find(
            ext => ext.id === '2.5.29.32'  // certificatePolicies
        );

        if (!certPolicies) return false;

        // Check if any policy OID matches QES
        return certPolicies.value.some(policy =>
            qcpOIDs.includes(policy.id)
        );
    }
}
```

## 3. Security Considerations

### Browser Security Model

```javascript
// Security best practices for frontend signing
class SecureSigningManager {
    constructor() {
        this.sensitiveData = new WeakMap();
    }

    async handleP12Upload(file, password) {
        // 1. Validate file type
        if (!file.name.match(/\.(p12|pfx)$/i)) {
            throw new Error('Invalid file type');
        }

        // 2. Check file size (prevent DoS)
        if (file.size > 10 * 1024 * 1024) {  // 10MB max
            throw new Error('File too large');
        }

        // 3. Process in isolated context
        return await this.processInWorker(file, password);
    }

    async processInWorker(file, password) {
        // Use Web Worker for isolation
        const worker = new Worker('signing-worker.js');

        return new Promise((resolve, reject) => {
            worker.onmessage = (e) => {
                if (e.data.error) {
                    reject(new Error(e.data.error));
                } else {
                    resolve(e.data.result);
                }
                worker.terminate();  // Clean up
            };

            worker.postMessage({
                action: 'sign',
                file: file,
                password: password
            });

            // Timeout after 30 seconds
            setTimeout(() => {
                worker.terminate();
                reject(new Error('Signing timeout'));
            }, 30000);
        });
    }

    // Secure memory cleanup
    secureCleanup(privateKey) {
        // 1. Overwrite memory
        if (typeof privateKey === 'object') {
            Object.keys(privateKey).forEach(key => {
                if (typeof privateKey[key] === 'string') {
                    privateKey[key] = crypto.getRandomValues(
                        new Uint8Array(privateKey[key].length)
                    );
                }
                delete privateKey[key];
            });
        }

        // 2. Remove from WeakMap
        this.sensitiveData.delete(privateKey);

        // 3. Trigger GC if possible
        if (typeof global !== 'undefined' && global.gc) {
            global.gc();
        }
    }
}
```

## 4. Comparison: Frontend vs Backend Signing

### Frontend (Browser) Signing

**Pros:**
- ✅ Private key never leaves user's device
- ✅ No server trust required
- ✅ User maintains full control
- ✅ Works offline after loading
- ✅ True end-to-end encryption possible

**Cons:**
- ❌ Limited to software certificates
- ❌ No hardware token support (smart cards)
- ❌ JavaScript performance limitations
- ❌ Browser memory constraints
- ❌ User must upload PKCS#12 file

### Backend Signing

**Pros:**
- ✅ Can integrate with HSMs
- ✅ Better performance for bulk signing
- ✅ Centralized certificate management
- ✅ Can use native libraries

**Cons:**
- ❌ Private key on server (trust issue)
- ❌ Regulatory compliance complexity
- ❌ Single point of failure
- ❌ Network dependency

## 5. Libraries and Tools

### JavaScript Libraries for Frontend Signing

```json
{
  "dependencies": {
    // Crypto and PKI
    "node-forge": "^1.3.1",         // PKCS#12, X.509, signing
    "pkijs": "^3.0.15",              // Modern PKI library
    "asn1js": "^3.0.5",              // ASN.1 parsing

    // PDF manipulation
    "pdf-lib": "^1.17.1",            // PDF creation/modification
    "pdfjs-dist": "^3.11.174",       // PDF parsing/rendering

    // WebAssembly options
    "openssl-wasm": "^1.0.0",        // OpenSSL in browser
    "@peculiar/webcrypto": "^1.4.3", // WebCrypto polyfill

    // Utilities
    "buffer": "^6.0.3",              // Node Buffer for browser
    "crypto-browserify": "^3.12.0"   // Crypto polyfills
  }
}
```

### Example: Minimal Frontend Implementation

```html
<!DOCTYPE html>
<html>
<head>
    <title>QES Browser Signing</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/forge/1.3.1/forge.min.js"></script>
</head>
<body>
    <h1>Sign PDF with Your QES Certificate</h1>

    <div>
        <label>Certificate File (.p12/.pfx):</label>
        <input type="file" id="certFile" accept=".p12,.pfx">
    </div>

    <div>
        <label>Password:</label>
        <input type="password" id="password">
    </div>

    <div>
        <label>PDF to Sign:</label>
        <input type="file" id="pdfFile" accept=".pdf">
    </div>

    <button onclick="signDocument()">Sign Document</button>

    <script>
        async function signDocument() {
            const certFile = document.getElementById('certFile').files[0];
            const password = document.getElementById('password').value;
            const pdfFile = document.getElementById('pdfFile').files[0];

            if (!certFile || !password || !pdfFile) {
                alert('Please provide all required files');
                return;
            }

            try {
                // Read certificate
                const p12Buffer = await certFile.arrayBuffer();
                const p12Der = forge.util.createBuffer(new Uint8Array(p12Buffer));
                const p12Asn1 = forge.asn1.fromDer(p12Der);
                const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

                // Extract private key
                const bags = p12.getBags({bagType: forge.pki.oids.pkcs8ShroudedKeyBag});
                const privateKey = bags[forge.pki.oids.pkcs8ShroudedKeyBag][0].key;

                alert('Certificate loaded successfully!');

                // Here you would continue with PDF signing...
                // This is just a minimal example

            } catch (error) {
                alert('Error: ' + error.message);
            }
        }
    </script>
</body>
</html>
```

## 6. Integration with Our ZK System

### Complete Frontend Flow

```
1. User uploads PKCS#12 file + password
2. Browser extracts private key (stays in browser)
3. User selects PDF to sign
4. Browser signs PDF with private key
5. Browser extracts signature from signed PDF
6. Browser generates ZK proof (2-3 seconds)
7. Browser submits proof to Aztec
8. Private key cleared from memory
9. User downloads signed PDF
```

### Key Advantages for Our System

1. **Full Client-Side**: Everything happens in browser
2. **No Key Custody**: We never see private keys
3. **Legal Compliance**: Real QES signatures
4. **Privacy**: ZK proof generation client-side
5. **User Control**: User keeps their certificates

## Summary

YES, we can absolutely:
1. Import PKCS#12 files in the browser
2. Extract private keys with password
3. Sign PDFs entirely client-side
4. Generate ZK proofs in browser
5. Never touch private keys server-side

This makes our system even more powerful:
- Users sign with their real QES certificates
- Everything happens client-side (privacy)
- We only handle proofs, never keys
- Fully compliant with regulations
- Works with existing certificate infrastructure