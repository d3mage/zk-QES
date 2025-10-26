import { AztecAnchorContract } from "../src/artifacts/AztecAnchor.js";
import { createLogger, PXE, Logger, Fr, AztecAddress, SponsoredFeePaymentMethod } from "@aztec/aztec.js";
import { setupPXE } from "../src/utils/setup_pxe.js";
import { getAccountFromEnv } from "../src/utils/create_account_from_env.js";
import { getSponsoredFPCInstance } from "../src/utils/sponsored_fpc.js";
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import * as fs from "fs";
import * as path from "path";

interface Manifest {
    version: number;
    doc_hash: string;
    artifact: {
        artifact_hash: string;
    };
    signer: {
        fingerprint: string;
    };
    tl_root: string;
    eu_trust?: {
        enabled: boolean;
        tl_root_eu?: string;
    };
    proof: string;
    timestamp: string;
}

async function main() {
    const logger = createLogger('aztec:anchor');

    // Parse CLI arguments
    const args = process.argv.slice(2);
    let manifestPath = 'out/manifest.json';
    let contractAddressFile = 'out/anchor_contract_address.txt';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--manifest' && i + 1 < args.length) {
            manifestPath = args[i + 1];
            i++;
        } else if (args[i] === '--contract' && i + 1 < args.length) {
            contractAddressFile = args[i + 1];
            i++;
        } else if (args[i] === '--help') {
            console.log(`
Usage: yarn anchor [options]

Options:
  --manifest <path>    Path to manifest.json (default: out/manifest.json)
  --contract <path>    Path to contract address file (default: out/anchor_contract_address.txt)
  --help               Show this help message
            `);
            process.exit(0);
        }
    }

    // Load manifest
    if (!fs.existsSync(manifestPath)) {
        logger.error(`Manifest not found: ${manifestPath}`);
        logger.info('Hint: Run "yarn prove" first to generate manifest.json');
        process.exit(1);
    }

    const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    logger.info(`📄 Loaded manifest from: ${manifestPath}`);

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

    // Setup sponsored FPC
    logger.info('💰 Setting up sponsored fee payment...');
    const sponsoredFPC = await getSponsoredFPCInstance();
    await pxe.registerContract({ instance: sponsoredFPC, artifact: SponsoredFPCContract.artifact });
    const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address);

    // Get wallet
    logger.info('👤 Loading account from environment...');
    const accountManager = await getAccountFromEnv(pxe);
    const wallet = await accountManager.getWallet();

    // Parse manifest data
    const doc_hash = Buffer.from(manifest.doc_hash, 'hex');
    const artifact_hash = Buffer.from(manifest.artifact.artifact_hash, 'hex');
    const signer_fpr = Buffer.from(manifest.signer.fingerprint, 'hex');
    const tl_root = Buffer.from(manifest.tl_root, 'hex');

    let tl_root_eu = Buffer.alloc(32);
    let eu_trust_enabled = false;

    if (manifest.eu_trust && manifest.eu_trust.enabled && manifest.eu_trust.tl_root_eu) {
        tl_root_eu = Buffer.from(manifest.eu_trust.tl_root_eu, 'hex');
        eu_trust_enabled = true;
    }

    // Validate lengths
    if (doc_hash.length !== 32 || artifact_hash.length !== 32 || signer_fpr.length !== 32 || tl_root.length !== 32 || tl_root_eu.length !== 32) {
        logger.error('Invalid hash lengths in manifest');
        process.exit(1);
    }

    // Convert buffers to number arrays
    const doc_hash_array = Array.from(doc_hash);
    const artifact_hash_array = Array.from(artifact_hash);
    const signer_fpr_array = Array.from(signer_fpr);
    const tl_root_array = Array.from(tl_root);
    const tl_root_eu_array = Array.from(tl_root_eu);

    logger.info('');
    logger.info('🔗 Anchoring proof to Aztec...');
    logger.info(`  Doc hash:     ${manifest.doc_hash}`);
    logger.info(`  Signer FPR:   ${manifest.signer.fingerprint}`);
    logger.info(`  EU trust:     ${eu_trust_enabled ? 'ENABLED' : 'DISABLED'}`);
    logger.info('');

    // Submit transaction
    try {
        const contract = await AztecAnchorContract.at(
            AztecAddress.fromString(contractAddressStr),
            wallet
        );

        logger.info('📤 Submitting transaction...');
        const tx = await contract.methods
            .anchor_proof(
                doc_hash_array,
                artifact_hash_array,
                signer_fpr_array,
                tl_root_array,
                tl_root_eu_array,
                eu_trust_enabled
            )
            .send({
                from: wallet.getAddress(),
                fee: { paymentMethod: sponsoredPaymentMethod }
            })
            .wait();

        logger.info('');
        logger.info('✅ Proof anchored successfully!');
        logger.info(`  Transaction hash: ${tx.txHash}`);
        logger.info(`  Block number:     ${tx.blockNumber}`);
        logger.info('');

        // Query proof count
        const proofCount = await contract.methods.get_proof_count().simulate({
            from: wallet.getAddress()
        });
        logger.info(`  Total proofs anchored: ${proofCount}`);

        // Compute and display proof_id
        const proof_id = await contract.methods
            .get_proof_id_for(doc_hash_array, signer_fpr_array)
            .simulate({
                from: wallet.getAddress()
            });
        logger.info(`  Proof ID: ${proof_id.toString()}`);

    } catch (error: any) {
        logger.error('❌ Failed to anchor proof:');
        logger.error(error.message || error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
