# Privacy-Preserving Electronic Signature Verification Library

## 1. Problem

Smart contracts work well when all relevant state lives on-chain. As soon as a system needs to depend on real-world actions, however, things break down. In practice, many important actions are expressed through legally signed documents and governed by existing legal systems, not blockchains. Smart contracts are yet to become smart.

Consider two organizations that enter into a legally binding agreement off-chain — for example, a partnership or service contract signed using a standard electronic signature scheme. Later, an on-chain system needs to act based on the existence of that agreement: as soon as it receives signed documents from both sides, it acknowledges that a deal was finalized and transfers funds. Currently, the system cannot verify these requirements on its own. Verification can be delegated to an external service, which reintroduces centralized trust and opaque decision-making. Or the existence of the agreement can be asserted manually, which makes the on-chain logic depend on unverifiable off-chain claims.

We can call the problem as the lack of a privacy-preserving and machine-verifiable way to work with signed documents on-chain.

## 2. Solution

We propose a verification library that lets on-chain systems check electronic signatures without seeing the underlying documents.

The library allows someone to prove, that there exists a signed document with a valid electronic signature issued under a certain legal and cryptographic policy. The document itself, the certificate, and the raw signature data never leave the prover’s control.

## 3. Legal Overview

Most countries around the world have already adopted laws that recognize simple, advanced and qualified electronic signatures to have the same legal effect as a handwritten one under the appropriate conditions. Each country defines its own criteria for what constitutes a valid signature, who is allowed to issue certificates, and how those certificates are published or audited. For these reasons, we need to keep separate trust lists for different regions. For example:

| Jurisdiction | Trust List |
| --- | --- |
| **EU** | LOTL (XML) |
| **US** | AATL |
| **Switzerland** | WebTrust |
| **Japan** | JIPDEC |
| **Others** | Custom |

## 4. Technical design

At a high level, the library parses a signed document in an off-chain environment, validates the electronic signature according to the relevant standard, and checks additional constraints such as membership of the signer’s certificate in a jurisdiction-specific trust list. It then creates a zero-knowledge proof that the constraints are satisfied, without revealing the document contents, the full certificate, or the raw signature. On chain, a verifier contract only needs to accept the proof and the associated public inputs, such as a document hash and a trust-list root, to attest that “this document was signed by a legally trusted signer”.

There are three main standardized families for the signing of different file types.

| Standard | Document Type | Typical Use | Underlying Container |
| --- | --- | --- | --- |
| **PAdES** | PDF documents | Contracts, agreements, scanned documents | PDF + CAdES signature embedded in the PDF structure |
| **XAdES** | XML documents | Web services, e-government forms, machine-to-machine | XML Signature (XMLDSig) |
| **CAdES** | Binary files | Any non-PDF, non-XML data such as binaries, archives, application data | CMS/PKCS#7 (SignedData) |

We will take a deeper look only at PAdES. Given a signed PDF, we do the following steps off-chain to prepare it:

- load the file
- locates the signature dictionary
- recover the ByteRange (it defines which segments of the file are covered by the signature)
- compute a SHA-256 hash of ByteRange contents (this step binds the proof to the visible contents of the document)
- parse the embedded CMS container
- extracts the signer’s certificate chain
- reconstruct the ECDSA P-256 public key coordinates
- recovers the raw signature components
- derives the digest of the CMS SignedAttributes (this is the actual message signed in a PAdES setup).

After that, it creates a verification that the certificate is valid:

- Computes a fingerprint of the signer’s certificate, for example by hashing the DER-encoded certificate with SHA-256 and mapping the digest into the proof system’s field.
- Uses this fingerprint as a leaf in a Merkle tree representing the trust list
- Retrieves the corresponding Merkle path and index for the signer, and records the Merkle root representing the current trust policy.

Now, let's focus on the circuit. The circuit takes as inputs:

- the digest of the CMS SignedAttributes (the message that was actually signed in PAdES),
- the signer’s public key
- the ECDSA P-256 signature
- the Merkle data that describe the signer’s position in a chosen trust list
Inside the circuit, two checks are performed: the ECDSA gadget verifies that the public key produced a valid signature over the supplied message digest, and the Merkle gadget reconstructs the Poseidon-based tree root from the certificate fingerprint, the Merkle path, and the index. If and only if both checks succeed, the circuit outputs a proof that there exists a certificate and a signature satisfying these constraints.

The library is structured so that only a minimal subset of this data has to be exposed as public inputs. At a minimum, the verifier sees a document identifier or hash and the Merkle root representing the current trust configuration; the raw signature, the full certificate, and the Merkle path remain private to the prover. The same proof object can be verified on Ethereum L1, on any EVM compatible chain, on Aztec L2, where these circuits can be incorporated into bigger systems. In both cases, the zk layer serves as a jurisdiction-agnostic bridge: the only thing that changes between the EU, the United States, or any other country is how the trust-list root is constructed.

## 4. Roadmap

Phase 1: Core PAdES + ECDSA Support

- extract CMS structures, public key, and signature
- compute the SignedAttributes digest
- derive a certificate fingerprint
- build a Merkle tree for the trust list
- generate a ZK proof verifying the signature and trust-list membership
- verify the proof on Ethereum L1 and Aztec L2

Phase 2: Add RSA Signature Support

- parsing RSA-based CMS containers
- verifying RSA signatures inside the zero-knowledge circuit

Phase 3: Add different file formats

- validate signatures on non-PDF files (CAdES, XAdES)