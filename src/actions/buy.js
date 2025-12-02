#!/usr/bin/env node
/**
 * @fileoverview Buy action entry point
 * @description Executes a buy operation for the configured token
 * 
 * This script is designed to be run by GitHub Actions on a schedule.
 * It reads configuration from environment variables (GitHub Secrets).
 */

import { 
  generateCorrelationId, 
  createSessionLogger, 
  writeGitHubSummary,
  setGitHubOutput 
} from '../utils/logger.js';
import { validateEnvironment, validateTradeConfig, ValidationError } from '../utils/validation.js';
import { createProvider, createWallet, BlockchainError, getExplorerUrl } from '../services/blockchain.js';
import { executeBuy, generateRandomBuyAmount } from '../services/trading.js';
import { SLIPPAGE_TOLERANCE_PERCENT, MAX_GAS_PRICE_GWEI } from '../config/constants.js';

// =============================================================================
// MAIN EXECUTION
// =============================================================================

/**
 * Main buy action execution
 */
async function main() {
  const correlationId = generateCorrelationId();
  const logger = createSessionLogger(correlationId, 'BUY');
  const startTime = Date.now();

  logger.info('='.repeat(60));
  logger.info('TOKEN ACTIVITY BOT - BUY ACTION');
  logger.info(`Correlation ID: ${correlationId}`);
  logger.info(`Timestamp: ${new Date().toISOString()}`);
  logger.info('='.repeat(60));

  let result = null;

  try {
    // Step 1: Validate environment variables
    logger.info('Step 1/5: Validating environment configuration...');
    const env = validateEnvironment([
      'PRIVATE_KEY',
      'TOKEN_ADDRESS',
      'RPC_URL'
    ]);

    // Step 2: Validate configuration
    logger.info('Step 2/5: Validating trade configuration...');
    const config = validateTradeConfig({
      privateKey: env.PRIVATE_KEY,
      tokenAddress: env.TOKEN_ADDRESS,
      rpcUrl: env.RPC_URL,
      slippageTolerance: Number(process.env.SLIPPAGE_TOLERANCE) || SLIPPAGE_TOLERANCE_PERCENT,
      maxGasPrice: Number(process.env.MAX_GAS_PRICE) || MAX_GAS_PRICE_GWEI
    });

    // Step 3: Connect to blockchain
    logger.info('Step 3/5: Connecting to Base network...');
    const provider = await createProvider(config.rpcUrl, logger);
    const wallet = await createWallet(config.privateKey, provider, logger);

    // Step 4: Generate random buy amount
    logger.info('Step 4/5: Generating random buy amount...');
    const buyAmountUsd = generateRandomBuyAmount();
    logger.info(`Random buy amount: $${buyAmountUsd}`);

    // Step 5: Execute buy
    logger.info('Step 5/5: Executing buy operation...');
    result = await executeBuy({
      wallet,
      tokenAddress: config.tokenAddress,
      amountUsd: buyAmountUsd,
      slippageTolerance: config.slippageTolerance
    }, logger);

    // Set GitHub outputs
    setGitHubOutput('success', 'true');
    setGitHubOutput('tx_hash', result.txHash);
    setGitHubOutput('amount_usd', buyAmountUsd.toString());
    setGitHubOutput('tokens_received', result.output.newBalance);

    // Write GitHub summary
    await writeGitHubSummary(generateSuccessSummary(result, correlationId, startTime));

    logger.info('='.repeat(60));
    logger.info('BUY ACTION COMPLETED SUCCESSFULLY');
    logger.info(`Transaction: ${result.explorerUrl}`);
    logger.info(`Duration: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
    logger.info('='.repeat(60));

    process.exit(0);

  } catch (error) {
    // Comprehensive error handling
    logger.error('BUY ACTION FAILED', { error });

    // Set failure outputs
    setGitHubOutput('success', 'false');
    setGitHubOutput('error_message', error.message);
    setGitHubOutput('error_code', error.code?.toString() || 'UNKNOWN');

    // Write failure summary
    await writeGitHubSummary(generateFailureSummary(error, correlationId, startTime));

    // Log specific error types
    if (error instanceof ValidationError) {
      logger.error('Configuration validation failed', {
        code: error.code,
        details: error.details
      });
    } else if (error instanceof BlockchainError) {
      logger.error('Blockchain operation failed', {
        code: error.code,
        details: error.details
      });
    } else {
      logger.error('Unexpected error occurred', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }

    logger.info('='.repeat(60));
    logger.info('BUY ACTION FAILED');
    logger.info(`Duration: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
    logger.info('='.repeat(60));

    process.exit(1);
  }
}

// =============================================================================
// SUMMARY GENERATORS
// =============================================================================

/**
 * Generates a success summary for GitHub Actions
 * @param {Object} result - Trade result
 * @param {string} correlationId - Correlation ID
 * @param {number} startTime - Start timestamp
 * @returns {string} Markdown summary
 */
function generateSuccessSummary(result, correlationId, startTime) {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  return `
## ✅ Buy Action Successful

| Property | Value |
|----------|-------|
| **Correlation ID** | \`${correlationId}\` |
| **Token** | ${result.token.symbol} (${result.token.name}) |
| **Amount Spent** | ${result.input.ethAmount} ETH (~$${result.input.usdAmount}) |
| **Tokens Received** | ${result.output.newBalance} ${result.token.symbol} |
| **Pool Fee** | ${result.poolFee} |
| **Gas Used** | ${result.gasUsed} |
| **Block** | ${result.blockNumber} |
| **Duration** | ${duration}s |

### Transaction
🔗 [View on BaseScan](${result.explorerUrl})

\`\`\`
${result.txHash}
\`\`\`
`;
}

/**
 * Generates a failure summary for GitHub Actions
 * @param {Error} error - Error object
 * @param {string} correlationId - Correlation ID
 * @param {number} startTime - Start timestamp
 * @returns {string} Markdown summary
 */
function generateFailureSummary(error, correlationId, startTime) {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  return `
## ❌ Buy Action Failed

| Property | Value |
|----------|-------|
| **Correlation ID** | \`${correlationId}\` |
| **Error Type** | ${error.name || 'Error'} |
| **Error Code** | ${error.code || 'N/A'} |
| **Duration** | ${duration}s |

### Error Message
\`\`\`
${error.message}
\`\`\`

${error.details ? `### Details\n\`\`\`json\n${JSON.stringify(error.details, null, 2)}\n\`\`\`` : ''}
`;
}

// =============================================================================
// ENTRY POINT
// =============================================================================

main().catch((error) => {
  console.error('Fatal error in buy action:', error);
  process.exit(1);
});
