/**
 * @fileoverview Blockchain interaction service
 * @description Handles all blockchain interactions with retry logic and error handling
 */

import { ethers } from 'ethers';
import {
  BASE_CHAIN_ID,
  BASE_RPC_URLS,
  ERC20_ABI,
  WETH_ADDRESS,
  MAX_RETRY_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
  RETRY_BACKOFF_MULTIPLIER,
  ERROR_CODES
} from '../config/constants.js';
import { validateChainId, validateGasPrice } from '../utils/validation.js';

// =============================================================================
// CUSTOM ERROR CLASS
// =============================================================================

/**
 * Custom error class for blockchain errors
 */
export class BlockchainError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'BlockchainError';
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// =============================================================================
// PROVIDER MANAGEMENT
// =============================================================================

/**
 * Creates a provider with fallback RPC URLs
 * @param {string} primaryRpcUrl - Primary RPC URL
 * @param {Object} logger - Logger instance
 * @returns {Promise<ethers.JsonRpcProvider>} Connected provider
 */
export async function createProvider(primaryRpcUrl, logger) {
  const rpcUrls = [primaryRpcUrl, ...BASE_RPC_URLS];
  let lastError;

  for (const rpcUrl of rpcUrls) {
    try {
      logger.debug(`Attempting connection to RPC: ${rpcUrl.substring(0, 30)}...`);
      
      const provider = new ethers.JsonRpcProvider(rpcUrl, BASE_CHAIN_ID, {
        staticNetwork: true,
        batchMaxCount: 1
      });

      // Test connection with timeout
      const network = await Promise.race([
        provider.getNetwork(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 10000)
        )
      ]);

      validateChainId(Number(network.chainId));
      
      logger.info(`Connected to Base network via ${rpcUrl.substring(0, 30)}...`);
      return provider;

    } catch (error) {
      logger.warn(`Failed to connect to ${rpcUrl.substring(0, 30)}...`, { 
        error: error.message 
      });
      lastError = error;
    }
  }

  throw new BlockchainError(
    'Failed to connect to any RPC endpoint',
    ERROR_CODES.RPC_CONNECTION_FAILED,
    { attemptedUrls: rpcUrls.length, lastError: lastError?.message }
  );
}

/**
 * Creates a wallet instance from private key
 * @param {string} privateKey - Private key
 * @param {ethers.Provider} provider - Provider instance
 * @param {Object} logger - Logger instance
 * @returns {Promise<ethers.Wallet>} Wallet instance
 */
export async function createWallet(privateKey, provider, logger) {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);
    const address = await wallet.getAddress();
    
    // Log only partial address for security
    const maskedAddress = `${address.substring(0, 6)}...${address.substring(38)}`;
    logger.info(`Wallet initialized: ${maskedAddress}`);
    
    return wallet;
  } catch (error) {
    throw new BlockchainError(
      'Failed to create wallet from private key',
      ERROR_CODES.INVALID_PRIVATE_KEY,
      { error: error.message }
    );
  }
}

// =============================================================================
// TOKEN OPERATIONS
// =============================================================================

/**
 * Gets token information
 * @param {string} tokenAddress - Token contract address
 * @param {ethers.Provider} provider - Provider instance
 * @param {Object} logger - Logger instance
 * @returns {Promise<Object>} Token info (name, symbol, decimals)
 */
export async function getTokenInfo(tokenAddress, provider, logger) {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    
    const [name, symbol, decimals] = await Promise.all([
      contract.name().catch(() => 'Unknown'),
      contract.symbol().catch(() => 'UNKNOWN'),
      contract.decimals().catch(() => 18)
    ]);

    logger.debug(`Token info retrieved: ${symbol} (${name}), decimals: ${decimals}`);
    
    return { name, symbol, decimals: Number(decimals), address: tokenAddress };
  } catch (error) {
    throw new BlockchainError(
      `Failed to get token info for ${tokenAddress}`,
      ERROR_CODES.TOKEN_NOT_FOUND,
      { tokenAddress, error: error.message }
    );
  }
}

/**
 * Gets token balance for an address
 * @param {string} tokenAddress - Token contract address
 * @param {string} walletAddress - Wallet address to check
 * @param {ethers.Provider} provider - Provider instance
 * @param {Object} logger - Logger instance
 * @returns {Promise<bigint>} Token balance in wei
 */
export async function getTokenBalance(tokenAddress, walletAddress, provider, logger) {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const balance = await contract.balanceOf(walletAddress);
    
    logger.debug(`Token balance: ${balance.toString()}`);
    return balance;
  } catch (error) {
    throw new BlockchainError(
      'Failed to get token balance',
      ERROR_CODES.TOKEN_NOT_FOUND,
      { tokenAddress, error: error.message }
    );
  }
}

/**
 * Gets ETH balance for an address
 * @param {string} walletAddress - Wallet address
 * @param {ethers.Provider} provider - Provider instance
 * @param {Object} logger - Logger instance
 * @returns {Promise<bigint>} ETH balance in wei
 */
export async function getEthBalance(walletAddress, provider, logger) {
  try {
    const balance = await provider.getBalance(walletAddress);
    logger.debug(`ETH balance: ${ethers.formatEther(balance)} ETH`);
    return balance;
  } catch (error) {
    throw new BlockchainError(
      'Failed to get ETH balance',
      ERROR_CODES.RPC_CONNECTION_FAILED,
      { error: error.message }
    );
  }
}

/**
 * Approves token spending
 * @param {string} tokenAddress - Token contract address
 * @param {string} spenderAddress - Spender address (router)
 * @param {bigint} amount - Amount to approve
 * @param {ethers.Wallet} wallet - Wallet instance
 * @param {Object} logger - Logger instance
 * @returns {Promise<ethers.TransactionReceipt>} Transaction receipt
 */
export async function approveToken(tokenAddress, spenderAddress, amount, wallet, logger) {
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  
  // Check current allowance
  const currentAllowance = await contract.allowance(
    await wallet.getAddress(), 
    spenderAddress
  );

  if (currentAllowance >= amount) {
    logger.debug('Sufficient allowance already exists');
    return null;
  }

  logger.info(`Approving token spend: ${amount.toString()}`);
  
  const tx = await executeWithRetry(
    async () => {
      const gasEstimate = await contract.approve.estimateGas(spenderAddress, amount);
      return contract.approve(spenderAddress, amount, {
        gasLimit: (gasEstimate * 130n) / 100n // 30% buffer
      });
    },
    logger,
    'Token approval'
  );

  logger.logTransaction(tx.hash, { type: 'APPROVAL', tokenAddress, amount: amount.toString() });
  
  const receipt = await tx.wait();
  
  if (receipt.status !== 1) {
    throw new BlockchainError(
      'Token approval transaction failed',
      ERROR_CODES.TX_REVERTED,
      { txHash: tx.hash }
    );
  }

  logger.info(`Approval confirmed in block ${receipt.blockNumber}`);
  return receipt;
}

// =============================================================================
// GAS ESTIMATION
// =============================================================================

/**
 * Gets current gas price with safety checks
 * @param {ethers.Provider} provider - Provider instance
 * @param {number} maxGasGwei - Maximum acceptable gas price in Gwei
 * @param {Object} logger - Logger instance
 * @returns {Promise<bigint>} Gas price in wei
 */
export async function getGasPrice(provider, maxGasGwei, logger) {
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;

  if (!gasPrice) {
    throw new BlockchainError(
      'Unable to fetch gas price',
      ERROR_CODES.RPC_CONNECTION_FAILED
    );
  }

  validateGasPrice(gasPrice, maxGasGwei);
  
  const gasPriceGwei = Number(gasPrice) / 1e9;
  logger.debug(`Current gas price: ${gasPriceGwei.toFixed(4)} Gwei`);
  
  return gasPrice;
}

// =============================================================================
// RETRY LOGIC
// =============================================================================

/**
 * Executes a function with exponential backoff retry
 * @param {Function} fn - Async function to execute
 * @param {Object} logger - Logger instance
 * @param {string} operationName - Name of the operation for logging
 * @returns {Promise<any>} Result of the function
 */
export async function executeWithRetry(fn, logger, operationName) {
  let lastError;
  
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      logger.debug(`${operationName}: Attempt ${attempt}/${MAX_RETRY_ATTEMPTS}`);
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on certain errors
      if (isNonRetryableError(error)) {
        logger.error(`${operationName}: Non-retryable error`, { error });
        throw error;
      }

      if (attempt < MAX_RETRY_ATTEMPTS) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt - 1);
        logger.warn(`${operationName}: Attempt ${attempt} failed, retrying in ${delay}ms`, {
          error: error.message
        });
        await sleep(delay);
      }
    }
  }

  throw new BlockchainError(
    `${operationName} failed after ${MAX_RETRY_ATTEMPTS} attempts`,
    ERROR_CODES.TX_FAILED,
    { lastError: lastError?.message }
  );
}

/**
 * Checks if an error should not be retried
 * @param {Error} error - Error to check
 * @returns {boolean} True if error should not be retried
 */
function isNonRetryableError(error) {
  const nonRetryableMessages = [
    'insufficient funds',
    'nonce too low',
    'replacement fee too low',
    'already known',
    'invalid private key',
    'execution reverted'
  ];

  const errorMessage = error.message?.toLowerCase() || '';
  return nonRetryableMessages.some(msg => errorMessage.includes(msg));
}

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// TRANSACTION HELPERS
// =============================================================================

/**
 * Waits for transaction confirmation with timeout
 * @param {ethers.TransactionResponse} tx - Transaction response
 * @param {Object} logger - Logger instance
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<ethers.TransactionReceipt>} Transaction receipt
 */
export async function waitForTransaction(tx, logger, timeoutMs = 120000) {
  logger.info(`Waiting for transaction confirmation: ${tx.hash}`);
  
  const receipt = await Promise.race([
    tx.wait(),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Transaction confirmation timeout')), timeoutMs)
    )
  ]);

  if (receipt.status !== 1) {
    throw new BlockchainError(
      'Transaction reverted',
      ERROR_CODES.TX_REVERTED,
      { txHash: tx.hash, status: receipt.status }
    );
  }

  logger.info(`Transaction confirmed in block ${receipt.blockNumber}`, {
    txHash: tx.hash,
    gasUsed: receipt.gasUsed.toString()
  });

  return receipt;
}

/**
 * Gets the explorer URL for a transaction
 * @param {string} txHash - Transaction hash
 * @returns {string} Explorer URL
 */
export function getExplorerUrl(txHash) {
  return `https://basescan.org/tx/${txHash}`;
}
