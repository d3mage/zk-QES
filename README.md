# Proposal: Privacy-Preserving Electronic Signature Verification Library

## 1. Problem
The current issue with Ethereum is its full transparency. While it is fine for on-chain apps, the problems arise when we try to design elaborate systems that interact with the real world. Smart contracts are not living up to their name *yet*, thus we still have to rely on existing legal system to protect us from any malicious activities by other counterparties. The cornerstone of a modern legal system is the ability to use electronic signatures, but the lack of thereof on Ethereum makes it way harder for Ethereum to establish itself as a decentalized alternative to existing way of things.

## 2. Solution
We want to bridge the gap between legal and blockchain and propose a library for verifying the validity of a signed document using zero-knowledge proofs. Instead of submitting the entire file to the chain (ergo transmitting it for anyone intrested), we generate a succint proof that the file was validly signed under a given and cryptographic policy. This library should work with different file formats and signature containers, as well as with different certificates.

## 3. Legal Overview
Most countries around the world have already adopted laws that recognize simple, advanced and qualified electronic signatures to have the same legal effect as a handwritten one under the appropriate conditions. Each country defines its own criteria for what constitutes a valid signature, who is allowed to issue certificates, and how those certificates are published or audited. For these reasons, we need to keep separate trust lists for different regions. For example:

| Jurisdiction | Trust List | 
|--------------|-----------|
| **EU** | LOTL (XML) |
| **US** | AATL | 
| **Switzerland** | WebTrust |
| **Japan** | JIPDEC | 
| **Others** | Custom | 

## 4. Technical design

At a high level, the library parses a signed document in an off-chain environment, validates the electronic signature according to the relevant standard, and checks additional constraints such as membership of the signer’s certificate in a jurisdiction-specific trust list. It then creates a zero-knowledge proof that the constraints are satisfied, without revealing the document contents, the full certificate, or the raw signature. On chain, a verifier contract only needs to accept the proof and the associated public inputs, such as a document hash and a trust-list root, to attest that “this document was signed by a legally trusted signer”.

There are three main standardized families for the signing of different file types. 
| Standard  | Document Type | Typical Use | Underlying Container |
| --- | --- | --- | --- |
| **PAdES** | PDF documents | Contracts, agreements, scanned documents | PDF + CAdES signature embedded in the PDF structure |
| **XAdES** | XML documents | Web services, e-government forms, machine-to-machine | XML Signature (XMLDSig)                           |
| **CAdES** | Binary files  | Any non-PDF, non-XML data such as binaries, archives, application data | CMS/PKCS#7 (SignedData)|

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

Phase 4: Jurisdiction-Aware Trust-List Modules
- automatically constructing Merkle roots from custom regional or enterprise trust lists
