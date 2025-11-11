#!/usr/bin/env node
/**
 * Test Poseidon2 compatibility between Noir circuit and JavaScript
 *
 * The circuit uses: std::hash::poseidon2_permutation([a, b, 0, 0], 4) and takes state[0]
 * We need to find the JS implementation that matches this
 */

import { poseidon2 } from 'poseidon-lite';

// Test values
const left = BigInt("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
const right = BigInt("0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321");

console.log('Testing Poseidon2 compatibility...\n');
console.log('Left:  ', left.toString(16));
console.log('Right: ', right.toString(16));
console.log('');

// Test 1: poseidon-lite's poseidon2 with 2 inputs
const result1 = poseidon2([left, right]);
console.log('poseidon-lite poseidon2([left, right]):');
console.log('  Result:', result1.toString(16));
console.log('');

// Test 2: poseidon-lite's poseidon2 with 4 inputs (matching circuit padding)
const result2 = poseidon2([left, right, BigInt(0), BigInt(0)]);
console.log('poseidon-lite poseidon2([left, right, 0, 0]):');
console.log('  Result:', result2.toString(16));
console.log('');

console.log('Note: The circuit uses poseidon2_permutation which is different from poseidon2 hash.');
console.log('poseidon2_permutation is a lower-level primitive (sponge permutation)');
console.log('while poseidon2 from poseidon-lite is a complete hash function.');
