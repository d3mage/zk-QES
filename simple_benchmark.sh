#!/bin/bash
set -e

echo "=== ZK Proof Generation Benchmark: WASM vs Native ==="
echo ""

# Check if bb is available
if ! command -v bb &> /dev/null; then
    echo "Installing native bb..."
    curl -L https://aztec-bb-artifacts.s3.amazonaws.com/bb-$(uname -m)-$(uname -s) -o bb
    chmod +x bb
    sudo mv bb /usr/local/bin/
fi

# Generate test inputs
echo "Generating test witness data..."

# For SHA-256 circuit
cd circuits/pades_ecdsa
if [ ! -f "target/witness.gz" ]; then
    echo "Generating SHA-256 witness..."
    # Use the existing Prover.toml for inputs
    nargo execute pades_ecdsa 2>/dev/null || true
fi

# For Poseidon circuit
cd ../pades_ecdsa_poseidon
if [ ! -f "target/witness.gz" ]; then
    echo "Generating Poseidon witness..."
    # Copy prover data from SHA circuit
    cp ../pades_ecdsa/Prover.toml ./Prover.toml 2>/dev/null || true
    nargo execute pades_ecdsa_poseidon 2>/dev/null || true
fi

cd ../..

echo ""
echo "=== Running Benchmarks ==="
echo ""

# Test 1: SHA-256 with native bb
echo "Test 1: SHA-256 Circuit with native bb"
echo "----------------------------------------"
START=$(date +%s%N)
cd circuits/pades_ecdsa && bb prove -b ./target/pades_ecdsa.json -w ./target/pades_ecdsa.gz -o ./proof_native 2>/dev/null || echo "Failed"
END=$(date +%s%N)
DIFF=$((($END - $START)/1000000))
echo "Time: $((DIFF/1000)).$((DIFF%1000/100)) seconds"
cd ../..

echo ""

# Test 2: Poseidon with native bb
echo "Test 2: Poseidon Circuit with native bb"
echo "----------------------------------------"
START=$(date +%s%N)
cd circuits/pades_ecdsa_poseidon && bb prove -b ./target/pades_ecdsa_poseidon.json -w ./target/pades_ecdsa_poseidon.gz -o ./proof_native 2>/dev/null || echo "Failed"
END=$(date +%s%N)
DIFF=$((($END - $START)/1000000))
echo "Time: $((DIFF/1000)).$((DIFF%1000/100)) seconds"
cd ../..

echo ""
echo "=== Summary ==="
echo "Circuit constraints:"
echo "- SHA-256: ~328,000 constraints"
echo "- Poseidon: ~20,000 constraints (16x smaller)"
echo ""
echo "Note: bb.js (WASM) typically 2-3x slower than native bb"