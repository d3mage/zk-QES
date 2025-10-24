import crypto from 'crypto';
import fs from 'fs';

const cert = crypto.createPublicKey(fs.readFileSync('out/cms_embedded_cert.pem'));
const sig = fs.readFileSync('out/MAIN_sig.bin');
const hash = fs.readFileSync('out/FINAL_signed_attrs_hash.bin');

console.log('Testing Node.js crypto verification...');
console.log(`Hash:      ${hash.toString('hex')}`);
console.log(`Signature: ${sig.toString('hex').slice(0, 32)}...`);

try {
  const verify = crypto.verify(
    null, // prehashed
    hash,
    { key: cert, dsaEncoding: 'ieee-p1363' },
    sig
  );
  console.log('\n✅ VERIFICATION:', verify ? 'SUCCESS' : 'FAILED');
} catch (e: any) {
  console.log('\n❌ ERROR:', e.message);
}
