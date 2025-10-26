import { AztecAnchorContract } from "../src/artifacts/AztecAnchor.js";
import { createLogger, PXE, Fr } from "@aztec/aztec.js";
import { setupPXE } from "../src/utils/setup_pxe.js";
import { getAccountFromFile } from "../src/utils/deploy_account.js";
import * as fs from "fs";

async function main() {
    const logger = createLogger('aztec:query-anchor');

    // Parse CLI arguments
    const args = process.argv.slice(2);
    let doc_hash: string | null = null;
    let signer_fpr: string | null = null;
    let contractAddressFile = 'out/anchor_contract_address.txt';
    let showCount = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--doc-hash' && i + 1 < args.length) {
            doc_hash = args[i + 1];
            i++;
        } else if (args[i] === '--signer-fpr' && i + 1 < args.length) {
            signer_fpr = args[i + 1];
            i++;
        } else if (args[i] === '--contract' && i + 1 < args.length) {
            contractAddressFile = args[i + 1];
            i++;
        } else if (args[i] === '--count') {
            showCount = true;
        } else if (args[i] === '--help') {
            console.log(`
Usage: yarn query-anchor [options]

Options:
  --doc-hash <hex>     Document hash (64 hex chars)
  --signer-fpr <hex>   Signer fingerprint (64 hex chars)
  --count              Show total count of anchored proofs
  --contract <path>    Path to contract address file (default: out/anchor_contract_address.txt)
  --help               Show this help message

Examples:
  yarn query-anchor --doc-hash <hash> --signer-fpr <fpr>
  yarn query-anchor --count
            `);
            process.exit(0);
        }
    }

    // Load contract address
    if (!fs.existsSync(contractAddressFile)) {
        logger.error(`Contract address file not found: ${contractAddressFile}`);
        logger.info('Hint: Deploy the contract first with "yarn deploy"');
        process.exit(1);
    }

    const contractAddressStr = fs.readFileSync(contractAddressFile, 'utf8').trim();
    logger.info(`📍 Contract address: ${contractAddressStr}`);

    // Setup PXE
    logger.info('📡 Connecting to Aztec PXE...');
    const pxe: PXE = await setupPXE();

    // Get wallet
    logger.info('👤 Loading account...');
    const wallet = await getAccountFromFile(pxe);

    const contract = await AztecAnchorContract.at(
        Fr.fromString(contractAddressStr),
        wallet
    );

    // Show count if requested
    if (showCount) {
        try {
            const count = await contract.methods.get_proof_count().simulate();
            logger.info('');
            logger.info(`📊 Total proofs anchored: ${count}`);
            logger.info('');
            return;
        } catch (error: any) {
            logger.error('❌ Failed to query proof count:');
            logger.error(error.message || error);
            process.exit(1);
        }
    }

    // Query specific proof
    if (!doc_hash || !signer_fpr) {
        logger.error('Error: --doc-hash and --signer-fpr are required (or use --count)');
        logger.info('Run "yarn query-anchor --help" for usage information');
        process.exit(1);
    }

    // Parse hashes
    const doc_hash_buf = Buffer.from(doc_hash, 'hex');
    const signer_fpr_buf = Buffer.from(signer_fpr, 'hex');

    if (doc_hash_buf.length !== 32 || signer_fpr_buf.length !== 32) {
        logger.error('Error: doc-hash and signer-fpr must be 32 bytes (64 hex characters)');
        process.exit(1);
    }

    const doc_hash_array = Array.from(doc_hash_buf);
    const signer_fpr_array = Array.from(signer_fpr_buf);

    logger.info('');
    logger.info('🔍 Querying proof...');
    logger.info(`  Doc hash:    ${doc_hash}`);
    logger.info(`  Signer FPR:  ${signer_fpr}`);
    logger.info('');

    try {
        // Check if proof exists
        const exists = await contract.methods
            .get_proof_exists(doc_hash_array, signer_fpr_array)
            .simulate();

        if (exists) {
            logger.info('✅ Proof found on-chain!');
            logger.info('');

            // Get proof ID
            const proof_id = await contract.methods
                .get_proof_id_for(doc_hash_array, signer_fpr_array)
                .simulate();

            logger.info('  Proof Data:');
            logger.info(`    Proof ID:     ${proof_id.toString()}`);
            logger.info(`    Doc hash:     ${doc_hash}`);
            logger.info(`    Signer FPR:   ${signer_fpr}`);
            logger.info('');
            logger.info('  ✓ Proof exists on-chain');
            logger.info('  ✓ Can be verified by anyone');
            logger.info('');
        } else {
            logger.info('❌ Proof not found on-chain');
            logger.info('');
            logger.info('  This proof has not been anchored yet.');
            logger.info('  Run "yarn anchor" to anchor your proof.');
            logger.info('');
        }
    } catch (error: any) {
        logger.error('❌ Failed to query proof:');
        logger.error(error.message || error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
