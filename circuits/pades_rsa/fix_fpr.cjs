const fs = require('fs');

const rbn2048 = JSON.parse(fs.readFileSync('../../test-data/rbn2048_test.json'));
const merklePath = JSON.parse(fs.readFileSync('../../out/paths-poseidon/63cdef374744975f1cbe3a668ee6f6d7657c6723e56cbe9adf44bb8859b9a414.json'));
const docHash = fs.readFileSync('../../test-data/test_hash.bin');

// Reduce signer_fpr to fit in BN254 field
const fpr = '63cdef374744975f1cbe3a668ee6f6d7657c6723e56cbe9adf44bb8859b9a414';
const fprBigInt = BigInt('0x' + fpr);
const fieldModulus = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
const fprReduced = fprBigInt % fieldModulus;

console.log(`Reducing fingerprint for BN254 field:`);
console.log(`  Original: ${fprBigInt.toString().slice(0, 40)}...`);
console.log(`  Reduced:  ${fprReduced.toString()}`);

const toml = `# RSA-2048 Circuit Prover Inputs

doc_hash = [${Array.from(docHash).join(', ')}]
exponent = ${rbn2048.exponent}
signer_fpr = "${fprReduced.toString()}"
tl_root = "${merklePath.root_decimal}"
merkle_path = [${merklePath.merkle_path_decimal.map(p => `"${p}"`).join(', ')}]
index = "${merklePath.index}"
eu_trust_enabled = false
tl_root_eu = "0"
eu_merkle_path = ["0", "0", "0", "0", "0", "0", "0", "0"]
eu_index = "0"

[signature]
limbs = [${rbn2048.signature.limbs.map(l => `"${l}"`).join(', ')}]

[signature.params]
modulus = [${rbn2048.signature.params.modulus.map(m => `"${m}"`).join(', ')}]
double_modulus = [${rbn2048.signature.params.double_modulus.map(dm => `"${dm}"`).join(', ')}]
redc_param = [${rbn2048.signature.params.redc_param.map(r => `"${r}"`).join(', ')}]
has_multiplicative_inverse = ${rbn2048.signature.params.has_multiplicative_inverse}
`;

fs.writeFileSync('Prover.toml', toml);
console.log('✅ Fixed Prover.toml\n');
