# Example 4: DocMDP Certifying Signatures

This example demonstrates how to create **DocMDP (Document Modification Detection and Prevention)** certifying signatures that control what changes are allowed to a PDF after signing.

## Overview

- **Purpose**: Create the first signature that certifies a document
- **Technology**: DocMDP transformation parameters
- **Policies**: Control post-signing modifications
- **Validation**: Adobe Acrobat, Okular, pdfsig

## What is DocMDP?

**DocMDP** is a PDF transformation method that allows the **first signature** in a document to:
1. Certify the document (mark it as "Certified")
2. Specify what changes are allowed after signing
3. Trigger validation warnings if policy is violated

### DocMDP vs. Approval Signatures

| Type | Purpose | Position | Modifications Allowed |
|------|---------|----------|----------------------|
| **Certifying (DocMDP)** | Certify document as complete | First signature | Controlled by policy (P=1/2/3) |
| **Approval** | Approve/sign document | Any (after certifying) | Depends on certifying policy |

## DocMDP Policies

### Policy 1: No Changes Allowed (P=1)

**Most restrictive** - Document is **locked** after signing

✅ Allowed:
- View the document
- Print the document
- Extract content

❌ Blocked:
- Add any annotations
- Fill form fields
- Add additional signatures
- Modify any content

**Use Case:**
- Final contracts
- Completed reports
- Archived documents
- Legal filings

**Example:**
```bash
yarn pades:certify contract_final.pdf --policy no-changes --out contract_certified.pdf
```

---

### Policy 2: Form Filling Allowed (P=2)

**Moderate** - Forms can be filled, but no other changes

✅ Allowed:
- View, print
- **Fill form fields** (text boxes, checkboxes, dropdowns)
- Add approval signatures to signature fields

❌ Blocked:
- Add annotations (comments, highlights)
- Modify document structure
- Add new fields

**Use Case:**
- Tax forms
- Application forms
- Survey documents
- Employment contracts with fillable fields

**Example:**
```bash
yarn pades:certify tax_form.pdf --policy form-fill --out tax_form_certified.pdf
```

---

### Policy 3: Form Filling and Annotations Allowed (P=3)

**Least restrictive** - Most changes allowed

✅ Allowed:
- View, print
- **Fill form fields**
- **Add annotations** (comments, highlights, stamps)
- Add approval signatures

❌ Blocked:
- Modify original document content
- Delete pages
- Change document structure

**Use Case:**
- Collaborative documents
- Review workflows
- Documents needing feedback
- Educational materials

**Example:**
```bash
yarn pades:certify review_doc.pdf --policy annotations --out review_doc_certified.pdf
```

---

## Complete Workflow

### Step 1: Prepare PDF Document

Start with an unsigned or signed PDF:

```bash
# Option A: Use existing unsigned PDF
cp documents/contract.pdf input.pdf

# Option B: Use existing signed PDF (will add certifying as first sig)
cp documents/signed_contract.pdf input.pdf
```

### Step 2: Create DocMDP Certifying Signature

**Policy: No Changes**
```bash
yarn pades:certify input.pdf --policy no-changes --out certified_locked.pdf
```

**Expected Output:**
```
╔════════════════════════════════════════════════════╗
║   DocMDP Certifying Signature                      ║
╚════════════════════════════════════════════════════╝

Input:  input.pdf
Output: certified_locked.pdf
Policy: no-changes (P=1)

[1/5] Creating signature field...
  ✓ Signature field created

[2/5] Adding DocMDP transformation parameters...
  ✓ TransformParams added (P=1)

[3/5] Adding Perms dictionary to document catalog...
  ✓ Perms/DocMDP reference added

[4/5] Setting up signature field in AcroForm...
  ✓ AcroForm configured
  ✓ SigFlags = 3 (SignaturesExist | AppendOnly)

[5/5] Saving certified PDF...
  ✓ PDF saved

✅ DocMDP signature structure created successfully!

Policy: NO-CHANGES
  P=1 - No changes to document allowed

Structure added:
  ✓ Signature field with DocMDP transformation
  ✓ /Perms dictionary in catalog
  ✓ Transform parameters (P=1)
  ✓ SigFlags = 3 (SignaturesExist | AppendOnly)

⚠️  Note: This creates the DocMDP structure but does not contain
   a cryptographic signature yet. To fully sign, use:
   - OpenSSL: openssl cms -sign ...
   - pdfsig: pdfsig -sign <key> <cert> ...
   - Adobe Acrobat: Sign with certificate

Validation:
  Adobe Acrobat:  Open and check signature panel
  Okular:         Document → Signatures
  pdfsig:         pdfsig -list certified_locked.pdf

Expected behavior after proper signing:
  - Adobe shows "Certified Document" badge
  - Policy enforced: No changes to document allowed
  - Modifications after signing trigger warnings
```

### Step 3: Validate DocMDP Structure

**Using pdfsig (Poppler utils):**
```bash
pdfsig certified_locked.pdf
```

**Expected Output:**
```
Digital Signature Info of: certified_locked.pdf
Signature #1:
  - Signer Certificate: (Not signed yet)
  - Signature Type: DocMDP
  - DocMDP Level: 1 (no changes allowed)
  - Signature Field: DocMDP_Signature
  - Signature Validation: Not yet signed
```

**Using Adobe Acrobat:**
1. Open `certified_locked.pdf`
2. Click signature panel icon
3. Should show: "Document has been certified by..."
4. Policy displayed: "No changes allowed"
5. Blue ribbon badge: "Certified"

**Using Okular:**
1. Open `certified_locked.pdf`
2. Menu: Document → Signatures
3. Shows certifying signature
4. Policy: No modifications allowed

### Step 4: Test Policy Enforcement

**Test 1: Try to Modify (Should Trigger Warning)**

```bash
# Try to add annotation using pdftk or Adobe
# Result: Adobe shows "Document has been altered" warning
```

**Test 2: Fill Form (Policy 2 or 3 only)**

For policy 2 or 3, forms can still be filled:
```bash
# Create PDF with form-fill policy
yarn pades:certify form.pdf --policy form-fill --out form_certified.pdf

# Fill forms using Adobe/pdftk
# Result: Form fields can be filled, signature remains valid
```

---

## DocMDP Structure (Technical)

### PDF Internal Structure

```pdf
% Document Catalog
1 0 obj
<<
  /Type /Catalog
  /Pages 2 0 R
  /AcroForm 3 0 R
  /Perms <<                    % ← DocMDP permissions
    /DocMDP 4 0 R              % ← Reference to signature
  >>
>>
endobj

% Signature Dictionary
4 0 obj
<<
  /Type /Sig
  /Filter /Adobe.PPKLite
  /SubFilter /adbe.pkcs7.detached
  /ByteRange [0 840 960 1234]
  /Contents <...signature...>
  /M (D:20251025123045Z)
  /Name (DocMDP Certifying Signature)
  /Reason (Document certification)
  /Reference [5 0 R]           % ← Reference to transform
>>
endobj

% Transform Reference
5 0 obj
<<
  /Type /SigRef
  /TransformMethod /DocMDP     % ← DocMDP method
  /TransformParams 6 0 R       % ← Parameters
  /Data 1 0 R                  % ← Applies to catalog
>>
endobj

% Transform Parameters
6 0 obj
<<
  /Type /TransformParams
  /P 1                         % ← Policy: 1, 2, or 3
  /V /1.2                      % ← Version
>>
endobj
```

### Key Components

1. **Perms Dictionary**: Added to document catalog
   - Points to the certifying signature
   - Only first signature can be DocMDP

2. **Signature Reference**: Links signature to transformation
   - TransformMethod: `/DocMDP`
   - TransformParams: Policy P=1/2/3

3. **Transform Parameters**:
   - `/P 1`: No changes
   - `/P 2`: Form filling allowed
   - `/P 3`: Forms + annotations allowed

---

## Integration with ZK Qualified Signatures

DocMDP can be combined with the ZK qualified signature workflow:

### Workflow: Certify → Sign → Prove

```bash
# 1. Create DocMDP structure
yarn pades:certify document.pdf --policy no-changes --out certified.pdf

# 2. Sign the PDF with qualified certificate
# (Use OpenSSL, Adobe, or other signing tool)
openssl cms -sign -in certified.pdf -out signed_certified.pdf ...

# 3. Extract signature for ZK proof
yarn hash-byte-range signed_certified.pdf
yarn extract-cms signed_certified.pdf

# 4. Generate ZK proof (local or dual trust)
yarn prove
# or
yarn prove -- --eu-trust

# 5. Verify
yarn verify
```

**Benefits:**
- ✅ Document is certified (policy enforced)
- ✅ Signature is qualified (meets eIDAS requirements)
- ✅ Proof is zero-knowledge (privacy-preserving)
- ✅ Dual trust (local + EU verification)

---

## Command Reference

### Basic Usage

```bash
yarn pades:certify <input.pdf> --policy <policy> --out <output.pdf>
```

### Parameters

| Parameter | Required | Values | Description |
|-----------|----------|--------|-------------|
| `input.pdf` | Yes | File path | Input PDF to certify |
| `--policy` | Yes | `no-changes`, `form-fill`, `annotations` | DocMDP policy |
| `--out` | Yes | File path | Output certified PDF |
| `--key` | No | File path | Private key for signing (future) |

### Examples

**Lock Document:**
```bash
yarn pades:certify contract.pdf --policy no-changes --out contract_locked.pdf
```

**Allow Form Filling:**
```bash
yarn pades:certify application.pdf --policy form-fill --out application_fillable.pdf
```

**Allow Annotations:**
```bash
yarn pades:certify review.pdf --policy annotations --out review_annotate.pdf
```

**Help:**
```bash
yarn pades:certify --help
```

---

## Validation Tools

### pdfsig (Poppler)

```bash
# Install (Ubuntu/Debian)
sudo apt-get install poppler-utils

# Check signature
pdfsig certified.pdf

# Expected output
Signature #1:
  - Signature Type: DocMDP
  - DocMDP Level: 1
```

### Adobe Acrobat

1. Open PDF
2. Signature panel (Ctrl+D)
3. Check for:
   - "Certified" badge
   - Policy description
   - Modification warnings

### Okular

```bash
# Install (Ubuntu/Debian)
sudo apt-get install okular

# Open and check
okular certified.pdf
# Menu: Document → Signatures
```

---

## Policy Selection Guide

### Choose Policy Based on Use Case

```
Is the document final and complete?
├─ Yes → Is it a legal/compliance document?
│         ├─ Yes → Policy 1 (no-changes)
│         └─ No → Does it need signatures from others?
│                  ├─ Yes → Policy 2 (form-fill)
│                  └─ No → Policy 1 (no-changes)
└─ No → Does it need review/feedback?
          ├─ Yes → Policy 3 (annotations)
          └─ No → Policy 2 (form-fill)
```

### Decision Matrix

| Use Case | Needs Signatures | Needs Feedback | Recommended Policy |
|----------|------------------|----------------|-------------------|
| Final contract | Maybe | No | P=1 (no-changes) |
| Tax form | Yes | No | P=2 (form-fill) |
| Review draft | Yes | Yes | P=3 (annotations) |
| Legal filing | No | No | P=1 (no-changes) |
| Application | Yes | No | P=2 (form-fill) |
| Collaborative doc | Yes | Yes | P=3 (annotations) |

---

## Limitations & Future Work

### Current Implementation

✅ **What Works:**
- DocMDP structure creation
- Policy parameter setting (P=1/2/3)
- Perms dictionary configuration
- Signature field setup
- Validation with external tools

⚠️ **Limitations:**
- No cryptographic signature embedded
- Requires external tools (OpenSSL, Adobe) for actual signing
- No automated signature with private key

### Full Signing Workflow (Manual)

For complete DocMDP with crypto signature:

**Option 1: OpenSSL**
```bash
# Create PKCS#7 signature
openssl cms -sign \
  -in certified.pdf \
  -out signed.pdf \
  -signer cert.pem \
  -inkey key.pem \
  -outform DER \
  -binary \
  -nodetach
```

**Option 2: Adobe Acrobat**
1. Open certified PDF
2. Tools → Certificates → Digitally Sign
3. Select signature field
4. Sign with certificate
5. Save

**Option 3: pdfsig**
```bash
pdfsig -sign <key> <cert> certified.pdf signed.pdf
```

### Future Enhancements

Potential improvements for `pades-certify.ts`:

1. **Integrated Signing**
   - Accept `--key` parameter
   - Sign with Node.js crypto
   - Embed PKCS#7 signature

2. **Signature Appearance**
   - Visible signature field
   - Custom text/image
   - Positioning options

3. **Validation**
   - Built-in signature verification
   - Policy enforcement checking
   - Modification detection

4. **Timestamp Support**
   - Add RFC-3161 timestamp
   - Create PAdES-T signatures
   - Long-term validation (PAdES-LT)

---

## Next Steps

- Review Examples 1-3 for complete ZK qualified signature workflow
- Combine DocMDP with EU trust verification for maximum compliance
- See `scripts/pades-certify.ts` for implementation details
- Explore PAdES-T and PAdES-LT (blocked in current POC, see TASK-3-PROGRESS.md)

---

## References

- **PAdES Specification**: [ETSI EN 319 142-1](https://www.etsi.org/deliver/etsi_en/319100_319199/31914201/01.01.01_60/en_31914201v010101p.pdf)
- **PDF Reference**: ISO 32000-2:2020 (PDF 2.0)
- **DocMDP**: PDF Reference section 12.8.2.2
- **Signature Workflows**: ISO 19005-3 (PDF/A-3)
