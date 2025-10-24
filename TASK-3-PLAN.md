# Task 3: PAdES-T/LT, DocMDP, EU Trust Snapshot - Implementation Plan

## Executive Summary

**Goal:** Augment the POC with production-grade PAdES features and EU trust list integration.

**Complexity:** HIGH (8-12 hours estimated)
**Dependencies:** Task 2 complete ✅
**Priority Components:**
1. **PAdES-T/LT** - Production signature validation
2. **EU Trust List** - Real-world trust anchors
3. **Circuit Enhancement** - Optional EU trust verification
4. **Aztec Anchor** - Optional on-chain commitment

---

## 📋 Task Breakdown

### Component Overview

| Component | Difficulty | Time Est. | Priority | Blocker? |
|-----------|-----------|-----------|----------|----------|
| A) DocMDP | Medium | 2h | High | No |
| B) PAdES-T (Timestamp) | High | 3h | High | PKI.js |
| C) PAdES-LT (DSS/VRI) | High | 4h | High | PKI.js |
| D) EU Trust Snapshot | Medium | 2h | Medium | No |
| E) Circuit Update | Low | 1h | Medium | No |
| F) Aztec Anchor | Medium | 2h | Low | Optional |
| G) Tests & Docs | Medium | 2h | High | No |

**Total:** 16 hours (8-12h with optimizations)

### Known Blockers from Task 1/2

⚠️ **PAdES-T/LT Blocker:** Full CAdES/PKI.js integration required
- Task 1 was blocked at 70% due to CAdES complexity
- Need proper PKI.js library for timestamp/OCSP handling
- Alternative: Use external tool (pdfsig) for validation, focus on creation

---

## 🏗 Architecture Design

### System Flow

```
┌─────────────┐
│  Plain PDF  │
└──────┬──────┘
       │
       v
┌─────────────────────┐
│ DocMDP Certifying   │ ← A) pades-certify.ts
│ (First signature)   │    Transform params, no changes
└──────┬──────────────┘
       │
       v
┌─────────────────────┐
│ Add RFC-3161 TSA    │ ← B) pades-timestamp.ts
│ (PAdES-T)           │    Call TSA, embed token
└──────┬──────────────┘
       │
       v
┌─────────────────────┐
│ Embed DSS/VRI       │ ← C) pades-lt.ts
│ (PAdES-LT)          │    OCSP/CRL + chain
└──────┬──────────────┘
       │
       v
┌─────────────────────┐
│ Extract Signature   │ ← Existing: extract-cms.ts
│ Verify with EU TL   │ ← D) EU trust check
└──────┬──────────────┘
       │
       v
┌─────────────────────┐
│ ZK Proof Generation │ ← E) prove.ts (updated)
│ + EU Trust Merkle   │    Optional tl_root_eu
└──────┬──────────────┘
       │
       v
┌─────────────────────┐
│ Verification        │ ← verify.ts (updated)
│ + Optional Anchor   │ ← F) Aztec contract
└─────────────────────┘
```

### Data Flow

```
PDF → DocMDP → PAdES-T → PAdES-LT
                           │
                           v
                    Extract Signature
                           │
                           ├─→ Local Allowlist (Task 2)
                           │   └─→ Merkle Root: tl_root
                           │
                           └─→ EU Trust List (Task 3)
                               ├─→ LOTL/TL Mirror
                               ├─→ Qualified CAs
                               └─→ Merkle Root: tl_root_eu
                                   │
                                   v
                           ZK Circuit (dual trust)
                                   │
                                   v
                           Proof + Manifest
                                   │
                                   v
                           Verify + Anchor
```

---

## 📝 Detailed Subtask Plans

### A) DocMDP Certifying Signature (2 hours)

**File:** `scripts/pades-certify.ts`

**Goal:** Create first signature with DocMDP transform parameters

**Approach:**
1. Use `pdf-lib` to create signature dictionary
2. Set `/DocMDP` transformation dictionary
3. Set transform params:
   - `P=1` - No changes allowed
   - `P=2` - Filling forms allowed
   - `P=3` - Filling forms + annotations allowed
4. Compute `/ByteRange`, reserve space for signature
5. Sign with ECDSA P-256 key
6. Validate in Adobe/Okular

**Libraries:**
- `pdf-lib` - PDF manipulation
- `node-forge` or `pkijs` - Signing
- Node `crypto` - ECDSA operations

**CLI:**
```bash
yarn pades:certify sample.pdf --policy no-changes --key signer.pem --out certified.pdf
```

**Output:**
- Certified PDF with DocMDP signature
- Signature dictionary with `/DocMDP` entry

**Acceptance:**
- Adobe shows "Certified Document"
- No changes allowed after certification

---

### B) RFC-3161 Timestamp (PAdES-T) (3 hours)

**File:** `scripts/pades-timestamp.ts`

⚠️ **Blocker:** Requires proper CAdES/PKI.js integration

**Goal:** Add trusted timestamp to existing signature

**Approach:**
1. Read existing signature from PDF
2. Compute message imprint (SHA-256 of signed ranges)
3. Create RFC-3161 TimeStampReq
4. Call TSA endpoint (e.g., FreeTSA.org)
5. Parse TimeStampResp, extract token
6. Embed token in signature's unsigned attributes
7. Update PDF with modified signature

**Libraries:**
- `pkijs` - RFC-3161 structures
- `asn1js` - ASN.1 encoding/decoding
- `axios` - HTTP requests to TSA

**TSA Options:**
- FreeTSA: https://freetsa.org/tsr
- DigiCert: https://timestamp.digicert.com
- GlobalSign: http://timestamp.globalsign.com/scripts/timstamp.dll

**CLI:**
```bash
yarn pades:tsa certified.pdf --tsa https://freetsa.org/tsr --out certified_t.pdf
```

**Output:**
- PAdES-T PDF with embedded timestamp
- Timestamp token in unsigned attributes

**Acceptance:**
- Adobe shows "Signed at: [timestamp]"
- Offline validation shows trusted time

**Alternative (if blocked):**
- Use OpenSSL/pdfsig CLI for validation
- Document the requirement in README

---

### C) PAdES-LT (DSS/VRI) (4 hours)

**File:** `scripts/pades-lt.ts`

⚠️ **Blocker:** Requires full PKI.js + OCSP/CRL handling

**Goal:** Embed long-term validation data for offline verification

**Approach:**
1. **Build certificate chain:**
   - Extract EE cert from signature
   - Fetch issuing CA cert (AIA)
   - Fetch root CA cert

2. **Fetch revocation data:**
   - OCSP: Call OCSP responder (AIA extension)
   - Fallback: Download CRL

3. **Create DSS dictionary:**
   - `/Certs` - Certificate chain
   - `/OCSPs` - OCSP responses
   - `/CRLs` - CRL data

4. **Create VRI dictionary:**
   - Per-signature validation data
   - Link to DSS entries

5. **Embed in PDF:**
   - Add `/DSS` to document catalog
   - Add `/VRI` entries

**Libraries:**
- `pkijs` - Certificate chain validation
- `axios` - OCSP/CRL fetching
- `pdf-lib` - PDF manipulation
- `asn1js` - ASN.1 structures

**CLI:**
```bash
yarn pades:lt certified_t.pdf --out certified_lt.pdf
```

**Output:**
- PAdES-LT PDF with DSS/VRI
- All validation data embedded

**Acceptance:**
- Offline validation works (no network needed)
- Adobe shows complete certificate chain
- OCSP/CRL data visible

**Challenge:**
- Large file size (chain + OCSP can be 10-50KB)
- Need proper ASN.1 handling

---

### D) EU Trust List Snapshot (2 hours)

**Files:** `tools/eutl/fetch.ts`, `root.ts`, `prove.ts`

**Goal:** Mirror EU trust list and build Merkle tree

#### D1) Fetch LOTL/TLs (`fetch.ts`)

**EU Trust List Structure:**
```
LOTL (List of Trusted Lists)
  ├─→ MS TL (Member State Trust Lists)
  │   ├─→ Belgium
  │   ├─→ Germany
  │   ├─→ France
  │   └─→ ... (27 member states)
  └─→ Each TL contains:
      ├─→ Trust Service Providers (TSPs)
      └─→ Qualified CAs
```

**API Endpoint:**
- LOTL: https://ec.europa.eu/tools/lotl/eu-lotl.xml
- TLs: Individual MS endpoints

**Implementation:**
```typescript
interface TrustSnapshot {
  lotl_url: string;
  lotl_hash: string;
  tls: {
    country: string;
    url: string;
    hash: string;
    cas: {
      name: string;
      cert_der: string;
      fingerprint: string;
    }[];
  }[];
  snapshot_date: string;
}
```

**CLI:**
```bash
yarn eutl:fetch --out tools/eutl/cache/
```

**Output:**
- `cache/lotl.xml` - LOTL data
- `cache/tls/*.xml` - Member state TLs
- `cache/snapshot.json` - Snapshot metadata
- `cache/qualified_cas.json` - Extracted CA fingerprints

#### D2) Build Merkle Root (`root.ts`)

**Approach:**
1. Load `qualified_cas.json`
2. Extract certificate fingerprints (SHA-256 of DER)
3. Build Merkle tree (reuse Task 2 logic)
4. Output `tl_root_eu.hex`

**CLI:**
```bash
yarn eutl:root --snapshot cache/snapshot.json --out out/tl_root_eu.hex
```

**Output:**
- `out/tl_root_eu.hex` - Merkle root
- `out/eu_paths/*.json` - Inclusion proofs

#### D3) Prove Inclusion (`prove.ts`)

**CLI:**
```bash
yarn eutl:prove --fingerprint <hex> --out out/eu_path.json
```

**Output:**
- Merkle inclusion proof for specific CA

---

### E) Circuit Feature Flag (1 hour)

**File:** `circuits/pades_ecdsa/src/main.nr`

**Goal:** Add optional EU trust verification

**Approach:**
```rust
fn main(
    // Existing inputs
    doc_hash: pub [u8; 32],
    artifact_hash: pub [u8; 32],
    pub_key_x: pub [u8; 32],
    pub_key_y: pub [u8; 32],
    signer_fpr: pub [u8; 32],
    tl_root: pub Field,           // Local allowlist
    signature: [u8; 64],
    merkle_path: [Field; 8],
    index: Field,

    // NEW: EU trust support
    eu_trust_enabled: pub bool,   // Feature flag
    tl_root_eu: pub Field,        // EU trust root
    eu_merkle_path: [Field; 8],   // EU inclusion proof
    eu_index: Field,              // EU leaf index
) {
    // Existing verification
    verify_signature(...);
    verify_merkle(signer_fpr, tl_root, merkle_path, index);

    // NEW: Optional EU trust verification
    if eu_trust_enabled {
        verify_merkle(signer_fpr, tl_root_eu, eu_merkle_path, eu_index);
    }
}
```

**Optimization:**
- Use same Merkle verification function
- Minimal proof size increase

---

### F) Aztec Anchor Contract (2 hours - OPTIONAL)

**File:** `contracts/AztecAnchor/src/main.nr`

**Goal:** On-chain commitment to proofs

**Contract Interface:**
```rust
contract AztecAnchor {
    #[aztec(public)]
    fn anchor(
        proof: [u8],
        doc_hash: [u8; 32],
        artifact_hash: [u8; 32],
        signer_fpr: [u8; 32],
        tl_root_eu: Field,
        timestamp: u64
    ) {
        // Verify proof (requires vkey on-chain)
        // Emit event
        emit Anchored {
            doc_hash,
            signer_fpr,
            tl_root_eu,
            timestamp
        };
    }
}
```

**Script:** `scripts/anchor.ts`
```bash
yarn anchor --manifest out/manifest.json --proof out/proof.bin
```

**Output:**
- Transaction hash
- Event log
- On-chain commitment

---

### G) Tests & Documentation (2 hours)

**E2E Test:** `scripts/e2e-test-full.ts`

**Test Scenarios:**
```
TEST 1: Complete PAdES Pipeline
  ✅ Certify with DocMDP
  ✅ Add RFC-3161 timestamp
  ✅ Embed DSS/VRI
  ✅ Validate offline
  ✅ Extract signature
  ✅ Generate proof with EU trust
  ✅ Verify proof

TEST 2: EU Trust Verification
  ✅ Fetch EU trust list
  ✅ Build Merkle root
  ✅ Prove inclusion for sample QTSP
  ✅ Verify with circuit

TEST 3: Negative Cases
  ❌ Missing OCSP → LT build fails
  ❌ Invalid timestamp → verification fails
  ❌ Signer not in EU list → inclusion fails
  ❌ Modified document → signature invalid

TEST 4: Aztec Anchor (Optional)
  ✅ Deploy contract
  ✅ Submit anchor
  ✅ Verify event
  ✅ Match manifest
```

**Documentation Updates:**
- README: Add PAdES-T/LT section
- README: Add EU Trust List section
- Diagrams: Flow charts
- API reference: New commands

---

## 📦 New Dependencies

```json
{
  "dependencies": {
    "pkijs": "^3.3.1",        // Already installed ✅
    "asn1js": "^3.0.6",        // Already installed ✅
    "pvutils": "^1.1.3",       // Already installed ✅
    "axios": "^1.6.0",         // For HTTP requests (TSA, OCSP)
    "xml2js": "^0.6.0",        // For EU trust list XML parsing
    "node-forge": "^1.3.1"     // Alternative PKI library
  }
}
```

---

## 🚧 Implementation Strategy

### Phase 1: Foundation (4 hours)
1. ✅ Install additional dependencies
2. ✅ Implement DocMDP certifying signature
3. ✅ Test with Adobe/Okular validation
4. ✅ Create sample certified PDF

### Phase 2: PAdES-T (3 hours)
1. ⚠️ Implement RFC-3161 client
2. ⚠️ Add timestamp to signature
3. ⚠️ Test with TSA endpoint
4. ⚠️ Validate timestamp in Adobe

**Blocker Mitigation:**
- If PKI.js integration is complex, create simple demo with external tool
- Document the requirement clearly
- Provide manual validation steps

### Phase 3: PAdES-LT (4 hours)
1. ⚠️ Implement certificate chain builder
2. ⚠️ Add OCSP/CRL fetcher
3. ⚠️ Embed DSS/VRI dictionaries
4. ⚠️ Test offline validation

**Blocker Mitigation:**
- Focus on structure creation
- Use sample OCSP/CRL data if live fetching fails
- Document manual validation process

### Phase 4: EU Trust (2 hours)
1. ✅ Implement EU TL fetcher
2. ✅ Build Merkle tree
3. ✅ Generate inclusion proofs
4. ✅ Update manifest schema

### Phase 5: Circuit & Contract (3 hours)
1. ✅ Update circuit with EU flag
2. ✅ Test proof generation
3. ⚙️ (Optional) Implement Aztec anchor
4. ⚙️ (Optional) Test on-chain

### Phase 6: Testing & Docs (2 hours)
1. ✅ Write E2E tests
2. ✅ Update README
3. ✅ Create diagrams
4. ✅ Document commands

---

## 🎯 Success Criteria Checklist

From task specification:

- [ ] **DocMDP:** Adobe/Okular shows "certifying signature" with policy
- [ ] **PAdES-T:** Timestamp token embedded, verifier shows trusted time
- [ ] **PAdES-LT:** DSS/VRI contains chain + revocation, offline validation OK
- [ ] **EU Trust:** Local mirror built, Merkle root produced, inclusion proof generated
- [ ] **ZK Proof:** Still verifies with EU trust option
- [ ] **Negative Tests:** Missing OCSP fails, signer not in EU root fails
- [ ] **Aztec Anchor (Optional):** Contract emits event, manifest matches

---

## 📊 Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| PKI.js complexity | HIGH | HIGH | Use external tools, document manual steps |
| TSA endpoint issues | MEDIUM | MEDIUM | Use multiple TSA options, fallback |
| OCSP/CRL fetching | MEDIUM | MEDIUM | Cache sample data, document requirements |
| EU TL parsing | LOW | MEDIUM | Use xml2js, handle errors gracefully |
| Circuit proof size | LOW | LOW | Benchmark, optimize if needed |
| Aztec deployment | LOW | LOW | Optional component |

---

## 📈 Estimated Timeline

### Minimum Viable (8 hours)
- DocMDP certifying ✓
- EU Trust List integration ✓
- Circuit update ✓
- Basic tests ✓
- Documentation ✓

### Full Implementation (12 hours)
- + PAdES-T (with workarounds) ✓
- + PAdES-LT (structure only) ✓
- + Complete E2E tests ✓
- + Comprehensive docs ✓

### Complete with Optional (16 hours)
- + Full PAdES-T/LT (if PKI.js resolved) ✓
- + Aztec anchor contract ✓
- + Performance benchmarks ✓
- + Diagrams and examples ✓

---

## 🔧 Development Commands

### Quick Start
```bash
# Install new dependencies
yarn add axios xml2js

# Phase 1: DocMDP
yarn pades:certify sample.pdf --policy no-changes --out certified.pdf

# Phase 4: EU Trust
yarn eutl:fetch --out tools/eutl/cache/
yarn eutl:root --out out/tl_root_eu.hex

# Phase 5: Proof with EU trust
yarn prove --eu-trust

# Phase 6: Verify
yarn verify
```

### Full Pipeline
```bash
# Complete PAdES flow (when implemented)
yarn pades:certify sample.pdf --out step1.pdf
yarn pades:tsa step1.pdf --out step2.pdf
yarn pades:lt step2.pdf --out certified_lt.pdf

# ZK proof flow
yarn extract-cms certified_lt.pdf
yarn prove --eu-trust
yarn verify

# Optional anchor
yarn anchor
```

---

## 📝 Next Steps

1. **Review this plan** - Confirm approach
2. **Install dependencies** - Add axios, xml2js
3. **Start Phase 1** - DocMDP implementation
4. **Iterative development** - Test each component
5. **Document blockers** - Track PKI.js issues
6. **Update checkpoints** - Regular progress saves

---

**Status:** PLAN COMPLETE
**Complexity:** HIGH (multiple new technologies)
**Blockers:** PAdES-T/LT require CAdES expertise
**Recommendation:** Start with DocMDP + EU Trust (lower risk), then tackle PAdES-T/LT

Ready to begin implementation? 🚀
