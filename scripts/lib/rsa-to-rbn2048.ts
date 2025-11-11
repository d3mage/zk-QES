import fs from 'fs';
import crypto from 'crypto';

/**
 * Convert RSA-2048 signature and modulus to RBN2048 format for Noir circuit
 *
 * RBN2048 uses:
 * - 18 limbs of 120 bits each (2160 bits total, fits 2048-bit RSA)
 * - Montgomery reduction for efficient modular arithmetic
 * - BigInt for arbitrary precision
 */

const NUM_LIMBS = 18;
const LIMB_BITS = 120;
const LIMB_BYTES = Math.ceil(LIMB_BITS / 8); // 15 bytes per limb

interface RBN2048 {
  limbs: string[];
  params: {
    modulus: string[];
    double_modulus: string[];
    redc_param: string[];
    has_multiplicative_inverse: boolean;
  };
}

/**
 * Convert big-endian bytes to limbs (little-endian limb order)
 */
function bytesToLimbs(bytes: Buffer): string[] {
  const limbs: string[] = [];
  const paddedBytes = Buffer.alloc(NUM_LIMBS * LIMB_BYTES);

  // Copy bytes to padded buffer (right-aligned for big-endian)
  bytes.copy(paddedBytes, paddedBytes.length - bytes.length);

  // Extract limbs (little-endian order)
  for (let i = 0; i < NUM_LIMBS; i++) {
    const start = i * LIMB_BYTES;
    const end = start + LIMB_BYTES;
    const limbBytes = paddedBytes.slice(start, end);

    // Convert to bigint (big-endian within limb)
    let limbValue = 0n;
    for (const byte of limbBytes) {
      limbValue = (limbValue << 8n) | BigInt(byte);
    }

    limbs.push(limbValue.toString());
  }

  return limbs;
}

/**
 * Convert limbs back to BigInt
 */
function limbsToBigInt(limbs: string[]): bigint {
  let result = 0n;
  const limbMask = (1n << BigInt(LIMB_BITS)) - 1n;

  for (let i = 0; i < limbs.length; i++) {
    const limb = BigInt(limbs[i]) & limbMask;
    result |= limb << BigInt(i * LIMB_BITS);
  }

  return result;
}

/**
 * Convert BigInt to limbs (little-endian order)
 */
function bigIntToLimbs(value: bigint): string[] {
  const limbs: string[] = [];
  const mask = (1n << BigInt(LIMB_BITS)) - 1n;
  let remaining = value;

  for (let i = 0; i < NUM_LIMBS; i++) {
    limbs.push((remaining & mask).toString());
    remaining >>= BigInt(LIMB_BITS);
  }

  return limbs;
}

/**
 * Calculate 2 * modulus (for Montgomery reduction)
 */
function calculateDoubleModulus(modLimbs: string[]): string[] {
  const mod = limbsToBigInt(modLimbs);
  const doubleMod = mod * 2n;
  return bigIntToLimbs(doubleMod);
}

/**
 * Calculate R^2 mod N for Montgomery reduction
 * R = 2^(LIMB_BITS * NUM_LIMBS) = 2^2160
 */
function calculateRedcParam(modLimbs: string[]): string[] {
  const mod = limbsToBigInt(modLimbs);
  const R = 1n << BigInt(LIMB_BITS * NUM_LIMBS); // 2^2160
  const R2 = (R * R) % mod;
  return bigIntToLimbs(R2);
}

/**
 * Convert RSA signature to RBN2048 format
 */
export function rsaToRBN2048(signature: Buffer, modulus: Buffer): RBN2048 {
  console.log(`Converting RSA signature:`);
  console.log(`  Signature: ${signature.length} bytes`);
  console.log(`  Modulus: ${modulus.length} bytes`);

  // Convert to limbs
  const sigLimbs = bytesToLimbs(signature);
  const modLimbs = bytesToLimbs(modulus);

  console.log(`  Signature limbs: ${sigLimbs.length}`);
  console.log(`  Modulus limbs: ${modLimbs.length}`);

  // Calculate Montgomery parameters
  console.log(`  Calculating Montgomery parameters...`);
  const doubleModulus = calculateDoubleModulus(modLimbs);
  const redcParam = calculateRedcParam(modLimbs);

  console.log(`  ✅ Conversion complete`);

  return {
    limbs: sigLimbs,
    params: {
      modulus: modLimbs,
      double_modulus: doubleModulus,
      redc_param: redcParam,
      has_multiplicative_inverse: true
    }
  };
}

/**
 * CLI: Convert RSA test signature to RBN2048
 */
async function main() {
  const sigPath = process.argv[2] || 'test-data/test_rsa_sig.bin';
  const certPath = process.argv[3] || 'test-data/rsa_cert.pem';

  console.log('RSA to RBN2048 Converter\n');

  // Read signature
  const signature = fs.readFileSync(sigPath);

  // Extract modulus from certificate
  const certPem = fs.readFileSync(certPath, 'utf-8');
  const cert = crypto.X509Certificate ? new crypto.X509Certificate(certPem) : null;

  if (!cert) {
    console.error('❌ crypto.X509Certificate not available');
    process.exit(1);
  }

  // Extract public key
  const publicKey = crypto.createPublicKey(certPem);
  const keyDetails = publicKey.export({ format: 'jwk' }) as any;

  if (!keyDetails.n) {
    console.error('❌ Not an RSA key');
    process.exit(1);
  }

  // Decode base64url modulus
  const modulusBase64 = keyDetails.n.replace(/-/g, '+').replace(/_/g, '/');
  const modulus = Buffer.from(modulusBase64, 'base64');
  const exponent = parseInt(keyDetails.e ? Buffer.from(keyDetails.e, 'base64').toString('hex') : '010001', 16);

  console.log(`Modulus length: ${modulus.length} bytes`);
  console.log(`Modulus bits: ${modulus.length * 8}`);
  console.log(`Exponent: ${exponent}\n`);

  // Convert
  const rbn2048 = rsaToRBN2048(signature, modulus);

  // Save
  const output = {
    signature: rbn2048,
    exponent,
    modulus_hex: modulus.toString('hex'),
    signature_hex: signature.toString('hex')
  };

  const outPath = 'test-data/rbn2048_test.json';
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log(`\n✅ Saved RBN2048 data to ${outPath}`);
  console.log(`\nFirst limb (signature): ${rbn2048.limbs[0]}`);
  console.log(`First limb (modulus): ${rbn2048.params.modulus[0]}`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
