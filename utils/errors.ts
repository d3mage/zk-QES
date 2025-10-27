/**
 * errors.ts
 *
 * Custom error classes for ZK Qualified Signature system
 */

export class ValidationError extends Error {
    constructor(message: string, public field?: string) {
        super(message);
        this.name = 'ValidationError';
        Error.captureStackTrace(this, this.constructor);
    }
}

export class FileNotFoundError extends Error {
    constructor(public filePath: string, message?: string) {
        super(message || `File not found: ${filePath}`);
        this.name = 'FileNotFoundError';
        Error.captureStackTrace(this, this.constructor);
    }
}

export class CircuitError extends Error {
    constructor(message: string, public circuit?: string) {
        super(message);
        this.name = 'CircuitError';
        Error.captureStackTrace(this, this.constructor);
    }
}

export class ProofGenerationError extends Error {
    constructor(message: string, public cause?: Error) {
        super(message);
        this.name = 'ProofGenerationError';
        Error.captureStackTrace(this, this.constructor);
    }
}

export class VerificationError extends Error {
    constructor(message: string, public cause?: Error) {
        super(message);
        this.name = 'VerificationError';
        Error.captureStackTrace(this, this.constructor);
    }
}

export class MerkleTreeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MerkleTreeError';
        Error.captureStackTrace(this, this.constructor);
    }
}

export class SignatureError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SignatureError';
        Error.captureStackTrace(this, this.constructor);
    }
}
