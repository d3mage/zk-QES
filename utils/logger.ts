/**
 * logger.ts
 *
 * Winston logging infrastructure for ZK Qualified Signature system
 */

import winston from 'winston';
import path from 'node:path';
import fs from 'node:fs';

// Ensure logs directory exists
const logsDir = 'logs';
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} ${level}: ${message} ${metaStr}`;
    })
);

// Custom format for file output
const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Create logger instance
export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: fileFormat,
    defaultMeta: { service: 'zk-qualified-signature' },
    transports: [
        // Write all logs to combined.log
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
            tailable: true
        }),

        // Write error logs to error.log
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
            tailable: true
        }),

        // Write proof generation logs to proofs.log
        new winston.transports.File({
            filename: path.join(logsDir, 'proofs.log'),
            level: 'info',
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
            tailable: true,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format((info) => {
                    // Only log proof-related events
                    return info.event?.includes('proof') ? info : false;
                })(),
                winston.format.json()
            )
        })
    ],
    // Handle uncaught exceptions
    exceptionHandlers: [
        new winston.transports.File({
            filename: path.join(logsDir, 'exceptions.log')
        })
    ],
    // Handle unhandled promise rejections
    rejectionHandlers: [
        new winston.transports.File({
            filename: path.join(logsDir, 'rejections.log')
        })
    ]
});

// Add console transport for non-production environments
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat,
        level: process.env.LOG_LEVEL || 'debug'
    }));
}

// Convenience methods for common logging patterns
export const logProofGeneration = (circuit: string, duration: number, success: boolean) => {
    logger.info('Proof generation completed', {
        event: 'proof_generation',
        circuit,
        duration_ms: duration,
        success,
        timestamp: new Date().toISOString()
    });
};

export const logProofVerification = (success: boolean, duration?: number) => {
    logger.info('Proof verification completed', {
        event: 'proof_verification',
        success,
        duration_ms: duration,
        timestamp: new Date().toISOString()
    });
};

export const logFileOperation = (operation: string, filePath: string, success: boolean) => {
    logger.debug('File operation', {
        event: 'file_operation',
        operation,
        filePath,
        success,
        timestamp: new Date().toISOString()
    });
};

export const logCircuitCompilation = (circuit: string, constraintCount: number) => {
    logger.info('Circuit compiled', {
        event: 'circuit_compilation',
        circuit,
        constraint_count: constraintCount,
        timestamp: new Date().toISOString()
    });
};

export const logError = (error: Error, context?: string) => {
    logger.error('Error occurred', {
        event: 'error',
        context,
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack
        },
        timestamp: new Date().toISOString()
    });
};

// Export logger as default
export default logger;
