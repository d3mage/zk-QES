# QES Certificate Chain and Trust Validation

## 1. Certificate Chain Structure

### Typical QES Certificate Hierarchy

```
Root CA (Self-signed, in trust store)
└── Intermediate CA (Policy CA)
    └── Intermediate CA (Issuing CA)
        └── End-Entity Certificate (User's QES)

Example: Real eIDAS Certificate Chain
================================================
1. EU Trust List Root
   CN=DigiCert Qualified Trust Root G3
   ├── Fingerprint: SHA256:3B:2E:...
   ├── Valid: 2020-2040
   └── In EU LOTL: ✓

2. Policy CA
   CN=DigiCert Qualified CA-1 G3
   ├── Issued by: Root
   ├── Policy OID: 0.4.0.194112.1.2 (QCP-n-qscd)
   └── Qualified: Yes

3. Issuing CA
   CN=DigiCert QES Individual CA-1 G1
   ├── Issued by: Policy CA
   ├── Purpose: Issue end-entity certificates
   └── CRL/OCSP endpoints defined

4. End-Entity (User)
   CN=John Doe
   serialNumber=IDBE-1234567890
   ├── Issued by: Issuing CA
   ├── Key Usage: digitalSignature, nonRepudiation
   ├── Extended Key Usage: emailProtection, pdfSigning
   └── Qualified Certificate Statement: "QcCompliance"
```

## 2. Certificate Extensions for QES

### Critical Extensions in Qualified Certificates

```javascript
// Actual certificate parsing example
const certificate = {
    // Standard X.509v3 fields
    version: 3,
    serialNumber: "01:23:45:67:89:AB:CD:EF",

    // Issuer (CA that issued this cert)
    issuer: {
        CN: "DigiCert QES Individual CA-1 G1",
        O: "DigiCert, Inc.",
        C: "US"
    },

    // Subject (certificate owner)
    subject: {
        CN: "John Doe",
        serialNumber: "IDBE-1234567890",  // National ID
        GN: "John",
        SN: "Doe",
        C: "BE",
        O: "Personal Certificate",
        OU: "QES Certificate"
    },

    // Critical QES Extensions
    extensions: {
        // 1. Key Usage (CRITICAL)
        keyUsage: {
            critical: true,
            digitalSignature: true,
            nonRepudiation: true,  // REQUIRED for QES
            keyEncipherment: false,
            dataEncipherment: false
        },

        // 2. Certificate Policies (QES qualification)
        certificatePolicies: [
            {
                policyIdentifier: "0.4.0.194112.1.2",  // QCP-n-qscd
                policyQualifiers: [{
                    id: "cps",
                    uri: "https://www.digicert.com/CPS"
                }]
            }
        ],

        // 3. QC Statements (eIDAS specific)
        qcStatements: {
            // QcCompliance - This IS a qualified certificate
            "0.4.0.1862.1.1": true,

            // QcLimitValue - Transaction limit
            "0.4.0.1862.1.2": {
                currency: "EUR",
                amount: 50000,
                exponent: 0
            },

            // QcType - Certificate type
            "0.4.0.1862.1.6": {
                type: "0.4.0.1862.1.6.1"  // eSig (electronic signature)
            },

            // QcPDS - PDS locations (terms of service)
            "0.4.0.1862.1.5": [{
                url: "https://qtsp.example.com/pds/en",
                language: "en"
            }]
        },

        // 4. Authority Information Access
        authorityInfoAccess: {
            ocsp: ["http://ocsp.digicert.com"],
            caIssuers: ["http://cacerts.digicert.com/CA.crt"]
        },

        // 5. CRL Distribution Points
        crlDistributionPoints: [
            "http://crl.digicert.com/QES-CA.crl"
        ],

        // 6. Subject Alternative Name
        subjectAltName: {
            email: ["john.doe@example.com"],
            rfc822Name: ["john.doe@example.com"]
        }
    }
};
```

## 3. Certificate Validation Process

### Complete Validation Steps

```javascript
async function validateQESCertificate(cert, chain, trustedRoots) {
    // Step 1: Basic X.509 validation
    if (!validateX509Structure(cert)) {
        throw new Error("Invalid X.509 structure");
    }

    // Step 2: Check certificate validity period
    const now = new Date();
    if (now < cert.notBefore || now > cert.notAfter) {
        throw new Error("Certificate expired or not yet valid");
    }

    // Step 3: Verify QES-specific requirements
    if (!cert.extensions.keyUsage.nonRepudiation) {
        throw new Error("Certificate lacks nonRepudiation key usage");
    }

    // Step 4: Check QC Statements (eIDAS)
    const qcCompliance = cert.extensions.qcStatements?.["0.4.0.1862.1.1"];
    if (!qcCompliance) {
        throw new Error("Certificate is not qualified (missing QcCompliance)");
    }

    // Step 5: Validate certificate policies
    const qualifiedPolicies = [
        "0.4.0.194112.1.0",  // QCP-public
        "0.4.0.194112.1.1",  // QCP-public + SSCD
        "0.4.0.194112.1.2",  // QCP-natural
        "0.4.0.194112.1.3",  // QCP-natural + SSCD
        "0.4.0.194112.1.4",  // QCP-legal
        "0.4.0.194112.1.5",  // QCP-legal + SSCD
    ];

    const hasQualifiedPolicy = cert.extensions.certificatePolicies
        .some(policy => qualifiedPolicies.includes(policy.policyIdentifier));

    if (!hasQualifiedPolicy) {
        throw new Error("Certificate lacks qualified policy OID");
    }

    // Step 6: Build and verify certificate chain
    const chainValidation = await verifyCertificateChain(cert, chain, trustedRoots);
    if (!chainValidation.valid) {
        throw new Error(`Chain validation failed: ${chainValidation.error}`);
    }

    // Step 7: Check revocation status (OCSP/CRL)
    const revocationStatus = await checkRevocationStatus(cert);
    if (revocationStatus.revoked) {
        throw new Error(`Certificate revoked: ${revocationStatus.reason}`);
    }

    // Step 8: Verify issuer is a QTSP
    const issuerInTrustList = await verifyIssuerInEUTrustList(cert.issuer);
    if (!issuerInTrustList) {
        throw new Error("Issuer is not a recognized QTSP");
    }

    return {
        valid: true,
        qualified: true,
        trustLevel: "QES",
        issuer: cert.issuer.CN,
        subject: cert.subject.CN,
        validUntil: cert.notAfter
    };
}
```

## 4. Chain Building and Verification

### Path Building Algorithm

```javascript
function buildCertificatePath(endEntity, intermediates, roots) {
    const path = [endEntity];
    let current = endEntity;

    while (!isRoot(current)) {
        // Find issuer in intermediates
        const issuer = findIssuer(current, intermediates);

        if (!issuer) {
            // Try to fetch from AIA
            const aiaIssuer = fetchFromAIA(current);
            if (!aiaIssuer) {
                throw new Error("Cannot build complete chain");
            }
            issuer = aiaIssuer;
        }

        path.push(issuer);
        current = issuer;

        // Check if we reached a trusted root
        if (roots.includes(current)) {
            return path;
        }
    }

    return path;
}

function verifyCertificateChain(path) {
    for (let i = 0; i < path.length - 1; i++) {
        const cert = path[i];
        const issuer = path[i + 1];

        // Verify signature
        if (!verifySignature(cert, issuer.publicKey)) {
            return { valid: false, error: `Invalid signature at position ${i}` };
        }

        // Check basic constraints
        if (i < path.length - 2 && !issuer.extensions.basicConstraints?.ca) {
            return { valid: false, error: `Non-CA certificate at position ${i+1}` };
        }

        // Verify validity periods
        if (cert.notBefore < issuer.notBefore) {
            return { valid: false, error: "Certificate issued before CA valid" };
        }
    }

    return { valid: true };
}
```

## 5. OCSP and CRL Checking

### Online Certificate Status Protocol (OCSP)

```javascript
async function checkOCSP(cert, issuerCert) {
    // 1. Build OCSP request
    const ocspRequest = {
        version: 0,
        requestList: [{
            reqCert: {
                hashAlgorithm: 'sha256',
                issuerNameHash: sha256(issuerCert.subject),
                issuerKeyHash: sha256(issuerCert.publicKey),
                serialNumber: cert.serialNumber
            }
        }]
    };

    // 2. Send to OCSP responder
    const ocspUrl = cert.extensions.authorityInfoAccess.ocsp[0];
    const response = await fetch(ocspUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/ocsp-request' },
        body: encodeOCSPRequest(ocspRequest)
    });

    // 3. Parse OCSP response
    const ocspResponse = parseOCSPResponse(await response.buffer());

    // 4. Check certificate status
    const status = ocspResponse.responses[0].certStatus;

    return {
        good: status === 'good',
        revoked: status === 'revoked',
        unknown: status === 'unknown',
        revokedAt: ocspResponse.responses[0].revocationTime,
        reason: ocspResponse.responses[0].revocationReason
    };
}
```

### Certificate Revocation List (CRL)

```javascript
async function checkCRL(cert) {
    // 1. Get CRL distribution point
    const crlUrl = cert.extensions.crlDistributionPoints[0];

    // 2. Fetch CRL (often cached)
    const crlData = await fetchWithCache(crlUrl);
    const crl = parseCRL(crlData);

    // 3. Check if certificate is in CRL
    const revokedCert = crl.revokedCertificates
        .find(rc => rc.serialNumber === cert.serialNumber);

    if (revokedCert) {
        return {
            revoked: true,
            revokedAt: revokedCert.revocationDate,
            reason: revokedCert.reason || 'unspecified'
        };
    }

    return { revoked: false };
}
```

## 6. EU Trust List Integration

### Fetching and Parsing EU LOTL

```javascript
async function fetchEUTrustList() {
    // 1. Download List of Trusted Lists (LOTL)
    const lotlUrl = 'https://ec.europa.eu/tools/lotl/eu-lotl.xml';
    const lotlXml = await fetch(lotlUrl).then(r => r.text());

    // 2. Parse XML structure
    const lotl = parseXML(lotlXml);

    // 3. Extract national trust lists
    const nationalLists = [];
    for (const pointer of lotl.TrustServicePointerList) {
        const nationalUrl = pointer.TSLLocation;
        const nationalXml = await fetch(nationalUrl).then(r => r.text());
        const nationalTSL = parseXML(nationalXml);

        nationalLists.push({
            country: pointer.Territory,
            operators: extractTrustServiceProviders(nationalTSL)
        });
    }

    // 4. Build unified trust list
    return buildUnifiedTrustList(nationalLists);
}

function extractTrustServiceProviders(tsl) {
    const providers = [];

    for (const tsp of tsl.TrustServiceProviderList) {
        // Check if TSP issues qualified certificates
        const services = tsp.Services.filter(service => {
            const status = service.ServiceStatus;
            const type = service.ServiceTypeIdentifier;

            return status.includes('granted') &&
                   type.includes('CA/QC');  // Qualified Certificate issuer
        });

        if (services.length > 0) {
            providers.push({
                name: tsp.Name,
                certificates: services.map(s => s.ServiceDigitalIdentity),
                status: 'qualified'
            });
        }
    }

    return providers;
}
```

## 7. What Our ZK System Does

### From Certificate to Merkle Proof

```javascript
function prepareCertificateForZKProof(cert, euTrustList) {
    // 1. Extract certificate fingerprint
    const certDER = cert.raw;  // DER encoded certificate
    const fingerprint = sha256(certDER);

    // 2. Find certificate in EU Trust List
    const trustEntry = euTrustList.find(entry =>
        entry.fingerprint === fingerprint ||
        isIssuedBy(cert, entry.certificate)
    );

    if (!trustEntry) {
        throw new Error("Certificate not in EU Trust List");
    }

    // 3. Generate Merkle proof
    const merkleTree = new MerkleTree(
        euTrustList.map(e => e.fingerprint),
        sha256
    );

    const proof = merkleTree.getProof(fingerprint);
    const root = merkleTree.getRoot();

    // 4. Return data for ZK circuit
    return {
        // Public inputs
        signerFingerprint: fingerprint,
        trustListRoot: root,

        // Private inputs
        merklePath: proof.path,
        merkleIndex: proof.index,

        // Certificate data (for signature verification)
        publicKey: {
            x: cert.publicKey.x,
            y: cert.publicKey.y
        }
    };
}
```

## 8. Real-World Trust List Examples

### Sample EU Trust List Entry

```xml
<!-- From actual EU Trust List XML -->
<TrustServiceProvider>
    <TSPInformation>
        <TSPName>
            <Name xml:lang="en">DigiCert Europe Limited</Name>
        </TSPName>
        <TSPTradeName>
            <Name xml:lang="en">DigiCert</Name>
        </TSPTradeName>
        <TSPAddress>
            <PostalAddress>
                <StreetAddress>Suite 4.24 One Pancras Square</StreetAddress>
                <Locality>London</Locality>
                <PostalCode>N1C 4AG</PostalCode>
                <CountryName>UK</CountryName>
            </PostalAddress>
        </TSPAddress>
    </TSPInformation>

    <TSPServices>
        <TSPService>
            <ServiceInformation>
                <ServiceTypeIdentifier>
                    http://uri.etsi.org/TrstSvc/Svctype/CA/QC
                </ServiceTypeIdentifier>
                <ServiceName>
                    <Name xml:lang="en">DigiCert Qualified CA-1 G3</Name>
                </ServiceName>
                <ServiceDigitalIdentity>
                    <DigitalId>
                        <X509Certificate>
                            MIIGxTCCBK2gAwIBAgIQCr...
                            <!-- Base64 encoded certificate -->
                        </X509Certificate>
                    </DigitalId>
                </ServiceDigitalIdentity>
                <ServiceStatus>
                    http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/granted
                </ServiceStatus>
                <StatusStartingTime>2020-01-01T00:00:00Z</StatusStartingTime>
            </ServiceInformation>
        </TSPService>
    </TSPServices>
</TrustServiceProvider>
```

## Summary

The complete certificate validation for QES involves:

1. **Structure Validation**: Valid X.509v3 format
2. **QES Extensions**: QcStatements, qualified policies, nonRepudiation
3. **Chain Building**: Path from end-entity to trusted root
4. **Chain Verification**: Each certificate properly signed by issuer
5. **Revocation Checking**: OCSP or CRL status
6. **Trust List Verification**: Issuer is recognized QTSP in EU LOTL
7. **Merkle Proof Generation**: For ZK circuit inclusion

Our ZK system takes validated certificates and creates privacy-preserving proofs of their inclusion in trust lists, without revealing the certificate itself.