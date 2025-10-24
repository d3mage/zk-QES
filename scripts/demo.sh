#!/bin/bash
# Quick demo of the ZK Qualified Signature POC

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║   ZK Qualified Signature POC - Quick Demo                ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

echo "📄 STEP 1: Extract PAdES Signature"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node scripts/extract-cades.mjs test_files/sample_signed.pdf | grep -E "(messageDigest|Signature:|Public Key|✓)"
echo ""

echo "🔐 STEP 2: ZK Proof Already Generated"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ls -lh out/proof.bin out/vkey.bin
echo ""

echo "✓ STEP 3: Verify ZK Proof"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npx tsx scripts/verify.ts 2>/dev/null | grep -A 5 "✅"
echo ""

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                    ✅ POC COMPLETE!                       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "Key achievements:"
echo "  ✅ Extracted ECDSA P-256 signature from PAdES PDF"
echo "  ✅ Generated 14KB zero-knowledge proof"
echo "  ✅ Verified proof successfully"
echo "  ✅ ECIES encryption/decryption implemented"
echo ""
echo "Files generated:"
echo "  • out/VERIFIED_signed_attrs_hash.bin - Signed attributes hash"
echo "  • out/VERIFIED_sig.json              - Signature (r, s)"
echo "  • out/VERIFIED_pubkey.json           - Public key (x, y)"
echo "  • out/proof.bin                      - Zero-knowledge proof"
echo "  • out/vkey.bin                       - Verification key"
echo ""
