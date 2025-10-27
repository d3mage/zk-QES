/**
 * validation.ts
 *
 * Validation utilities for ZK Qualified Signature system
 */

import fs from 'node:fs';
import { ValidationError, FileNotFoundError } from './errors.js';

/**
 * Validate a hash is 32 bytes in hex format
 */
export function validateHash(hash: string, fieldName: string = 'hash'): void {
    if (!hash) {
        throw new ValidationError(`${fieldName} is required`, fieldName);
    }

    if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
        throw new ValidationError(
            `${fieldName} must be 64 hex characters (32 bytes)`,
            fieldName
        );
    }
}

/**
 * Validate a hash buffer is 32 bytes
 */
export function validateHashBuffer(buffer: Buffer | Uint8Array, fieldName: string = 'hash'): void {
    if (!buffer) {
        throw new ValidationError(`${fieldName} is required`, fieldName);
    }

    if (buffer.length !== 32) {
        throw new ValidationError(
            `${fieldName} must be 32 bytes, got ${buffer.length}`,
            fieldName
        );
    }
}

/**
 * Validate a file exists
 */
export function validateFile(filePath: string): void {
    if (!fs.existsSync(filePath)) {
        throw new FileNotFoundError(filePath);
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
        throw new ValidationError(`Path is not a file: ${filePath}`, 'filePath');
    }
}

/**
 * Validate a directory exists
 */
export function validateDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        throw new FileNotFoundError(dirPath, `Directory not found: ${dirPath}`);
    }

    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
        throw new ValidationError(`Path is not a directory: ${dirPath}`, 'dirPath');
    }
}

/**
 * Validate a public key (x, y coordinates)
 */
export function validatePublicKey(pubKey: { x: string; y: string }): void {
    if (!pubKey) {
        throw new ValidationError('Public key is required', 'publicKey');
    }

    validateHash(pubKey.x, 'publicKey.x');
    validateHash(pubKey.y, 'publicKey.y');
}

/**
 * Validate a signature (r, s values)
 */
export function validateSignature(sig: { r: string; s: string }): void {
    if (!sig) {
        throw new ValidationError('Signature is required', 'signature');
    }

    validateHash(sig.r, 'signature.r');
    validateHash(sig.s, 'signature.s');
}

/**
 * Validate proof manifest structure
 */
export function validateManifest(manifest: any): void {
    if (!manifest) {
        throw new ValidationError('Manifest is required', 'manifest');
    }

    // Required fields
    const requiredFields = [
        'version',
        'circuit',
        'doc_hash',
        'artifact',
        'signer',
        'tl_root'
    ];

    for (const field of requiredFields) {
        if (!(field in manifest)) {
            throw new ValidationError(`Manifest missing required field: ${field}`, field);
        }
    }

    // Validate version
    if (typeof manifest.version !== 'number' || manifest.version < 1) {
        throw new ValidationError('Manifest version must be >= 1', 'version');
    }

    // Validate circuit type
    if (!['sha256', 'poseidon'].includes(manifest.circuit)) {
        throw new ValidationError(
            `Invalid circuit type: ${manifest.circuit} (expected 'sha256' or 'poseidon')`,
            'circuit'
        );
    }

    // Validate hashes
    if (manifest.circuit === 'sha256') {
        validateHash(manifest.doc_hash, 'doc_hash');
        validateHash(manifest.tl_root, 'tl_root');
    } else {
        // Poseidon uses Field values (decimal strings)
        if (typeof manifest.tl_root !== 'string' || !manifest.tl_root.match(/^\d+$/)) {
            throw new ValidationError('Poseidon tl_root must be decimal string', 'tl_root');
        }
    }

    // Validate artifact
    if (!manifest.artifact || typeof manifest.artifact !== 'object') {
        throw new ValidationError('Manifest.artifact must be an object', 'artifact');
    }

    if (!manifest.artifact.type) {
        throw new ValidationError('Manifest.artifact.type is required', 'artifact.type');
    }

    // Validate signer
    if (!manifest.signer || typeof manifest.signer !== 'object') {
        throw new ValidationError('Manifest.signer must be an object', 'signer');
    }

    validatePublicKey({
        x: manifest.signer.pub_x,
        y: manifest.signer.pub_y
    });
}

/**
 * Validate Merkle proof structure
 */
export function validateMerkleProof(proof: any, circuitType: 'sha256' | 'poseidon' = 'sha256'): void {
    if (!proof) {
        throw new ValidationError('Merkle proof is required', 'proof');
    }

    if (!Array.isArray(proof.path) && !Array.isArray(proof.merkle_path)) {
        throw new ValidationError('Proof must contain path or merkle_path array', 'path');
    }

    const path = proof.path || proof.merkle_path;

    if (path.length === 0) {
        throw new ValidationError('Merkle path cannot be empty', 'path');
    }

    if (path.length > 32) {
        throw new ValidationError(`Merkle path too deep: ${path.length} (max 32)`, 'path');
    }

    if (typeof proof.index !== 'number' && typeof proof.index !== 'string') {
        throw new ValidationError('Proof index must be number or string', 'index');
    }
}
