import { AztecAnchorContract } from "../src/artifacts/AztecAnchor.js"
import { createLogger, PXE, Logger, SponsoredFeePaymentMethod, Fr } from "@aztec/aztec.js";
import { TokenContract } from "@aztec/noir-contracts.js/Token"
import { setupPXE } from "../src/utils/setup_pxe.js";
import { getSponsoredFPCInstance } from "../src/utils/sponsored_fpc.js";
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import { deploySchnorrAccount } from "../src/utils/deploy_account.js";
import { getTimeouts } from "../config/config.js";
import * as fs from "fs";
import * as path from "path";

async function main() {
    let pxe: PXE;
    let logger: Logger;

    logger = createLogger('aztec:deploy-anchor');
    logger.info(`🚀 Starting AztecAnchor contract deployment...`);
    
    const timeouts = getTimeouts();

    // Setup PXE
    logger.info('📡 Setting up PXE connection...');
    pxe = await setupPXE();
    const nodeInfo = await pxe.getNodeInfo();
    logger.info(`📊 Connected to node`);

    // Setup sponsored FPC
    logger.info('💰 Setting up sponsored fee payment contract...');
    const sponsoredFPC = await getSponsoredFPCInstance();
    logger.info(`💰 Sponsored FPC instance obtained at: ${sponsoredFPC.address}`);

    logger.info('📝 Registering sponsored FPC contract with PXE...');
    await pxe.registerContract({ instance: sponsoredFPC, artifact: SponsoredFPCContract.artifact });
    const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address);
    logger.info('✅ Sponsored fee payment method configured');

    // Deploy account
    logger.info('👤 Deploying Schnorr account...');
    let accountManager = await deploySchnorrAccount(pxe);
    const wallet = await accountManager.getWallet();
    const address = await accountManager.getAddress();
    logger.info(`✅ Account deployed successfully at: ${address}`);

    // Deploy AztecAnchor contract
    logger.info('🔗 Starting AztecAnchor contract deployment...');
    logger.info(`📋 Deployer address: ${address}`);

    const deployTx = AztecAnchorContract.deploy(wallet).send({
        from: wallet.getAddress(),
        fee: { paymentMethod: sponsoredPaymentMethod }
    });

    logger.info('⏳ Waiting for deployment transaction to be mined...');
    const anchorContract = await deployTx.deployed({ timeout: timeouts.deployTimeout });

    logger.info(`🎉 AztecAnchor Contract deployed successfully!`);
    logger.info(`📍 Contract address: ${anchorContract.address}`);
    logger.info(`👤 Deployer address: ${address}`);

    // Save contract address to file for anchor and query scripts
    const outputDir = 'out';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(
        path.join(outputDir, 'anchor_contract_address.txt'),
        anchorContract.address.toString()
    );
    logger.info(`💾 Contract address saved to: ${outputDir}/anchor_contract_address.txt`);

    // Verify deployment
    logger.info('🔍 Verifying contract deployment...');
    try {
        // Test a read operation
        logger.info('🧪 Testing contract read operation...');
        const proofCount = await anchorContract.methods.get_proof_count().simulate({
            from: wallet.getAddress()
        });
        logger.info(`📊 Initial proof count: ${proofCount}`);

    } catch (error) {
        logger.error(`❌ Contract verification failed: ${error}`);
    }

    logger.info('🏁 Deployment process completed successfully!');
    logger.info(`📋 Summary:`);
    logger.info(`   - Contract Address: ${anchorContract.address}`);
    logger.info(`   - Deployer Address: ${address}`);
    logger.info(`   - Sponsored FPC: ${sponsoredFPC.address}`);
    logger.info('');
    logger.info('📝 Next steps:');
    logger.info('   1. Anchor a proof: yarn anchor --manifest out/manifest.json');
    logger.info('   2. Query proofs: yarn query-anchor --count');
}

main().catch((error) => {
    const logger = createLogger('aztec:deploy-anchor');
    logger.error(`❌ Deployment failed: ${error.message}`);
    logger.error(`📋 Error details: ${error.stack}`);
    process.exit(1);
});
