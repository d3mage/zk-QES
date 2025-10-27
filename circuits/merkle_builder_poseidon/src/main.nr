use dep::std::hash::poseidon2::Poseidon2;

// Merkle tree builder using Poseidon2
// Builds a depth-8 tree (256 leaf capacity) from input leaves
// Returns the root and Merkle paths for verification

global TREE_DEPTH: u32 = 8;
global TREE_SIZE: Field = 256; // 2^8

// Poseidon2 hash function for Merkle tree (2 inputs)
fn poseidon2_hash(left: Field, right: Field) -> Field {
    Poseidon2::hash([left, right], 2)
}

// Build a single layer of the Merkle tree
fn build_layer(current_layer: [Field; 256]) -> [Field; 128] {
    let mut next_layer = [0; 128];

    for i in 0..128 {
        let left = current_layer[i * 2];
        let right = current_layer[i * 2 + 1];
        next_layer[i] = poseidon2_hash(left, right);
    }

    next_layer
}

// Get Merkle proof for a specific index
fn get_merkle_proof(
    layer0: [Field; 256],
    layer1: [Field; 128],
    layer2: [Field; 64],
    layer3: [Field; 32],
    layer4: [Field; 16],
    layer5: [Field; 8],
    layer6: [Field; 4],
    layer7: [Field; 2],
    index: Field
) -> [Field; 8] {
    let mut proof = [0; 8];
    let idx = index as u32;

    // Layer 0 (leaves)
    let sibling_idx = if idx % 2 == 0 { idx + 1 } else { idx - 1 };
    proof[0] = layer0[sibling_idx];

    // Layer 1
    let idx1 = idx / 2;
    let sibling_idx1 = if idx1 % 2 == 0 { idx1 + 1 } else { idx1 - 1 };
    proof[1] = layer1[sibling_idx1];

    // Layer 2
    let idx2 = idx1 / 2;
    let sibling_idx2 = if idx2 % 2 == 0 { idx2 + 1 } else { idx2 - 1 };
    proof[2] = layer2[sibling_idx2];

    // Layer 3
    let idx3 = idx2 / 2;
    let sibling_idx3 = if idx3 % 2 == 0 { idx3 + 1 } else { idx3 - 1 };
    proof[3] = layer3[sibling_idx3];

    // Layer 4
    let idx4 = idx3 / 2;
    let sibling_idx4 = if idx4 % 2 == 0 { idx4 + 1 } else { idx4 - 1 };
    proof[4] = layer4[sibling_idx4];

    // Layer 5
    let idx5 = idx4 / 2;
    let sibling_idx5 = if idx5 % 2 == 0 { idx5 + 1 } else { idx5 - 1 };
    proof[5] = layer5[sibling_idx5];

    // Layer 6
    let idx6 = idx5 / 2;
    let sibling_idx6 = if idx6 % 2 == 0 { idx6 + 1 } else { idx6 - 1 };
    proof[6] = layer6[sibling_idx6];

    // Layer 7
    let idx7 = idx6 / 2;
    let sibling_idx7 = if idx7 % 2 == 0 { idx7 + 1 } else { idx7 - 1 };
    proof[7] = layer7[sibling_idx7];

    proof
}

fn main(
    // Input: Up to 256 leaves (certificate fingerprints as Field elements)
    // Unused slots should be filled with 0
    leaves: pub [Field; 256],

    // Number of actual leaves (rest are padding zeros)
    leaf_count: pub Field
) -> pub (
    Field,              // Merkle root
    [Field; 8],         // Proof for leaf 0
    [Field; 8],         // Proof for leaf 1
    [Field; 8],         // Proof for leaf 2
    [Field; 8]          // Proof for leaf 3
) {
    // Build the tree layer by layer
    let layer0 = leaves; // 256 leaves

    // Layer 1: 128 nodes
    let mut layer1 = [0; 128];
    for i in 0..128 {
        layer1[i] = poseidon2_hash(layer0[i * 2], layer0[i * 2 + 1]);
    }

    // Layer 2: 64 nodes
    let mut layer2 = [0; 64];
    for i in 0..64 {
        layer2[i] = poseidon2_hash(layer1[i * 2], layer1[i * 2 + 1]);
    }

    // Layer 3: 32 nodes
    let mut layer3 = [0; 32];
    for i in 0..32 {
        layer3[i] = poseidon2_hash(layer2[i * 2], layer2[i * 2 + 1]);
    }

    // Layer 4: 16 nodes
    let mut layer4 = [0; 16];
    for i in 0..16 {
        layer4[i] = poseidon2_hash(layer3[i * 2], layer3[i * 2 + 1]);
    }

    // Layer 5: 8 nodes
    let mut layer5 = [0; 8];
    for i in 0..8 {
        layer5[i] = poseidon2_hash(layer4[i * 2], layer4[i * 2 + 1]);
    }

    // Layer 6: 4 nodes
    let mut layer6 = [0; 4];
    for i in 0..4 {
        layer6[i] = poseidon2_hash(layer5[i * 2], layer5[i * 2 + 1]);
    }

    // Layer 7: 2 nodes
    let mut layer7 = [0; 2];
    for i in 0..2 {
        layer7[i] = poseidon2_hash(layer6[i * 2], layer6[i * 2 + 1]);
    }

    // Layer 8: Root
    let root = poseidon2_hash(layer7[0], layer7[1]);

    // Generate proofs for first 4 leaves (adjust if needed)
    let proof0 = get_merkle_proof(layer0, layer1, layer2, layer3, layer4, layer5, layer6, layer7, 0);
    let proof1 = get_merkle_proof(layer0, layer1, layer2, layer3, layer4, layer5, layer6, layer7, 1);
    let proof2 = get_merkle_proof(layer0, layer1, layer2, layer3, layer4, layer5, layer6, layer7, 2);
    let proof3 = get_merkle_proof(layer0, layer1, layer2, layer3, layer4, layer5, layer6, layer7, 3);

    (root, proof0, proof1, proof2, proof3)
}
