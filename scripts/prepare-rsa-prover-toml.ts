import fs from 'fs';

async function main() {
  console.log('Preparing Prover.toml for RSA circuit...\n');
  
  // Load RBN2048 data
  const rbn2048Data = JSON.parse(fs.readFileSync('test-data/rbn2048_test.json', 'utf-8'));
  const signature = rbn2048Data.signature;
  const exponent = rbn2048Data.exponent;
  
  // Load hash
  const docHash = fs.readFileSync('test-data/test_hash.bin');
  const docHashArray = Array.from(docHash);
  
  // Load Merkle data
  const merklePath = JSON.parse(fs.readFileSync('out/paths-poseidon/63cdef374744975f1cbe3a668ee6f6d7657c6723e56cbe9adf44bb8859b9a414.json', 'utf-8'));
  const signerFpr = '0x63cdef374744975f1cbe3a668ee6f6d7657c6723e56cbe9adf44bb8859b9a414';
  
  // Build TOML
  const toml = \`# RSA-2048 Circuit Prover Inputs
# Generated: \${new Date().toISOString()}

# Document hash (SHA-256 of test message)
doc_hash = [\${docHashArray.join(', ')}]

# RSA exponent (typically 65537)
exponent = \${exponent}

# Signer fingerprint (SHA-256 of certificate)
signer_fpr = "\${BigInt(signerFpr).toString()}"

# Trust list root (Pedersen hash)
tl_root = "\${merklePath.root_decimal}"

# Merkle path for inclusion proof
merkle_path = [\${merklePath.merkle_path_decimal.map((p: string) => \`"\${p}"\`).join(', ')}]
index = "\${merklePath.index}"

# EU trust (disabled for test)
eu_trust_enabled = false
tl_root_eu = "0"
eu_merkle_path = ["0", "0", "0", "0", "0", "0", "0", "0"]
eu_index = "0"

# RSA-2048 signature (RBN2048 format)
[signature]
limbs = [\${signature.limbs.map((l: string) => \`"\${l}"\`).join(', ')}]

[signature.params]
modulus = [\${signature.params.modulus.map((m: string) => \`"\${m}"\`).join(', ')}]
double_modulus = [\${signature.params.double_modulus.map((dm: string) => \`"\${dm}"\`).join(', ')}]
redc_param = [\${signature.params.redc_param.map((r: string) => \`"\${r}"\`).join(', ')}]
has_multiplicative_inverse = \${signature.params.has_multiplicative_inverse}
\`;
  
  const outPath = 'circuits/pades_rsa/Prover.toml';
  fs.writeFileSync(outPath, toml);
  
  console.log(\`✅ Generated \${outPath}\`);
  console.log(\`\nContents:\`);
  console.log(\`  - doc_hash: \${docHashArray.length} bytes\`);
  console.log(\`  - exponent: \${exponent}\`);
  console.log(\`  - signer_fpr: \${signerFpr.slice(0, 20)}...\`);
  console.log(\`  - tl_root: \${merklePath.root_decimal.slice(0, 20)}...\`);
  console.log(\`  - signature limbs: \${signature.limbs.length}\`);
  console.log(\`  - modulus limbs: \${signature.params.modulus.length}\`);
}

main().catch(console.error);
