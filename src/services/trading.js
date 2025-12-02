/**
 * @fileoverview Trading service for Uniswap V3 swaps
 * @description Handles buy and sell operations with comprehensive error handling
 */

import { ethers } from 'ethers';
import {
  UNISWAP_V3_ROUTER,
  UNISWAP_V3_QUOTER,
  UNISWAP_V3_ROUTER_ABI,
  UNISWAP_V3_QUOTER_ABI,
  WETH_ADDRESS,
  POOL_FEE_TIERS,
  SLIPPAGE_TOLERANCE_PERCENT,
  TX_DEADLINE_MINUTES,
  GAS_LIMIT_MULTIPLIER,
  MIN_BUY_AMOUNT_USD,
  MAX_BUY_AMOUNT_USD,
  ERROR_CODES,
  ERC20_ABI
} from '../config/constants.js';
import {
  getTokenInfo,
  getTokenBalance,
  getEthBalance,
  approveToken,
  executeWithRetry,
  waitForTransaction,
  getExplorerUrl,
  BlockchainError
} from './blockchain.js';
import { validateSufficientBalance } from '../utils/validation.js';

// =============================================================================
// PRICE DISCOVERY
// =============================================================================

/**
 * Gets ETH price in USD from on-chain oracle or fallback
 * @param {ethers.Provider} provider - Provider instance
 * @param {Object} logger - Logger instance
 * @returns {Promise<number>} ETH price in USD
 */
async function getEthPriceUsd(provider, logger) {
  // Using Chainlink ETH/USD price feed on Base
  const CHAINLINK_ETH_USD = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70';
  const CHAINLINK_ABI = [
    'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)'
  ];

  try {
    const priceFeed = new ethers.Contract(CHAINLINK_ETH_USD, CHAINLINK_ABI, provider);
    const [, price] = await priceFeed.latestRoundData();
    const ethPrice = Number(price) / 1e8; // Chainlink uses 8 decimals
    
    logger.debug(`ETH price from Chainlink: $${ethPrice.toFixed(2)}`);
    return ethPrice;
  } catch (error) {
    // Fallback: estimate from WETH/USDC pool
    logger.warn('Chainlink price feed failed, using fallback estimation');
    return 3000; // Conservative fallback
  }
}

/**
 * Finds the best pool fee tier for a token pair
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {bigint} amountIn - Amount of input token
 * @param {ethers.Provider} provider - Provider instance
 * @param {Object} logger - Logger instance
 * @returns {Promise<{fee: number, amountOut: bigint}>} Best fee tier and expected output
 */
async function findBestPoolFee(tokenIn, tokenOut, amountIn, provider, logger) {
  const quoter = new ethers.Contract(UNISWAP_V3_QUOTER, UNISWAP_V3_QUOTER_ABI, provider);
  
  let bestQuote = { fee: 0, amountOut: 0n };

  for (const fee of POOL_FEE_TIERS) {
    try {
      logger.debug(`Trying pool fee tier: ${fee / 10000}%`);
      
      const quoteParams = {
        tokenIn,
        tokenOut,
        amountIn,
        fee,
        sqrtPriceLimitX96: 0n
      };

      // Use staticCall to simulate the quote
      const result = await quoter.quoteExactInputSingle.staticCall(quoteParams);
      const amountOut = result[0]; // First return value is amountOut

      logger.debug(`Fee ${fee}: amountOut = ${amountOut.toString()}`);

      if (amountOut > bestQuote.amountOut) {
        bestQuote = { fee, amountOut };
      }
    } catch (error) {
      logger.debug(`Pool fee ${fee} not available or no liquidity`);
    }
  }

  if (bestQuote.amountOut === 0n) {
    throw new BlockchainError(
      'No liquidity found for token pair',
      ERROR_CODES.NO_LIQUIDITY,
      { tokenIn, tokenOut }
    );
  }

  logger.info(`Best pool fee: ${bestQuote.fee / 10000}%, expected output: ${bestQuote.amountOut.toString()}`);
  return bestQuote;
}

/**
 * Calculates minimum output with slippage
 * @param {bigint} expectedOutput - Expected output amount
 * @param {number} slippagePercent - Slippage tolerance percentage
 * @returns {bigint} Minimum acceptable output
 */
function calculateMinOutput(expectedOutput, slippagePercent) {
  const slippageBps = BigInt(Math.floor(slippagePercent * 100));
  return expectedOutput - (expectedOutput * slippageBps / 10000n);
}

/**
 * Generates a random buy amount in USD
 * @returns {number} Random amount between MIN and MAX
 */
export function generateRandomBuyAmount() {
  const range = MAX_BUY_AMOUNT_USD - MIN_BUY_AMOUNT_USD;
  const random = Math.random() * range + MIN_BUY_AMOUNT_USD;
  // Round to 2 decimal places
  return Math.round(random * 100) / 100;
}

// =============================================================================
// BUY OPERATION
// =============================================================================

/**
 * Executes a buy operation (WETH -> Token)
 * Uses WETH directly from wallet instead of native ETH
 * @param {Object} params - Buy parameters
 * @param {ethers.Wallet} params.wallet - Wallet instance
 * @param {string} params.tokenAddress - Token to buy
 * @param {number} params.amountUsd - Amount in USD to spend
 * @param {number} params.slippageTolerance - Slippage tolerance percentage
 * @param {Object} logger - Logger instance
 * @returns {Promise<Object>} Trade result
 */
export async function executeBuy({ wallet, tokenAddress, amountUsd, slippageTolerance }, logger) {
  const provider = wallet.provider;
  const walletAddress = await wallet.getAddress();
  
  logger.info(`Starting BUY operation: $${amountUsd} worth of tokens (using WETH)`);

  // Step 1: Get token info
  const tokenInfo = await getTokenInfo(tokenAddress, provider, logger);
  logger.info(`Buying token: ${tokenInfo.symbol} (${tokenInfo.name})`);

  // Step 2: Get ETH price and calculate WETH amount
  const ethPriceUsd = await getEthPriceUsd(provider, logger);
  const wethAmount = amountUsd / ethPriceUsd;
  const wethAmountWei = ethers.parseEther(wethAmount.toFixed(18));
  
  logger.info(`WETH amount to spend: ${wethAmount.toFixed(6)} WETH ($${amountUsd})`);

  // Step 3: Check WETH and ETH balances
  const wethBalance = await getTokenBalance(WETH_ADDRESS, walletAddress, provider, logger);
  const ethBalance = await getEthBalance(walletAddress, provider, logger);
  
  // Log balances BEFORE validation so user can see what they have
  logger.info(`Current WETH balance: ${ethers.formatEther(wethBalance)} WETH`);
  logger.info(`Current ETH balance: ${ethers.formatEther(ethBalance)} ETH (for gas)`);
  logger.info(`Required WETH: ${wethAmount.toFixed(6)} WETH`);
  
  // Validate balances
  const gasBuffer = ethers.parseEther('0.001');
  validateSufficientBalance(ethBalance, gasBuffer, 'ETH (for gas)');
  validateSufficientBalance(wethBalance, wethAmountWei, 'WETH');

  // Step 4: Find best pool and get quote
  const { fee, amountOut } = await findBestPoolFee(
    WETH_ADDRESS,
    tokenAddress,
    wethAmountWei,
    provider,
    logger
  );

  const minAmountOut = calculateMinOutput(amountOut, slippageTolerance);
  logger.info(`Expected tokens: ${ethers.formatUnits(amountOut, tokenInfo.decimals)} ${tokenInfo.symbol}`);
  logger.info(`Minimum tokens (with ${slippageTolerance}% slippage): ${ethers.formatUnits(minAmountOut, tokenInfo.decimals)}`);

  // Step 5: Approve WETH spending (if needed)
  await approveToken(
    WETH_ADDRESS,
    UNISWAP_V3_ROUTER,
    wethAmountWei,
    wallet,
    logger
  );

  // Step 6: Execute swap (no ETH value - using WETH token)
  const router = new ethers.Contract(UNISWAP_V3_ROUTER, UNISWAP_V3_ROUTER_ABI, wallet);

  const swapParams = {
    tokenIn: WETH_ADDRESS,
    tokenOut: tokenAddress,
    fee,
    recipient: walletAddress,
    amountIn: wethAmountWei,
    amountOutMinimum: minAmountOut,
    sqrtPriceLimitX96: 0n
  };

  logger.info('Executing swap transaction (WETH -> Token)...');

  const tx = await executeWithRetry(
    async () => {
      // Estimate gas (no value since we're using WETH token)
      const gasEstimate = await router.exactInputSingle.estimateGas(swapParams);
      
      const gasLimit = (gasEstimate * BigInt(Math.floor(GAS_LIMIT_MULTIPLIER * 100))) / 100n;
      
      logger.debug(`Gas estimate: ${gasEstimate.toString()}, using limit: ${gasLimit.toString()}`);

      return router.exactInputSingle(swapParams, { gasLimit });
    },
    logger,
    'Buy swap'
  );

  logger.logTransaction(tx.hash, { 
    type: 'BUY',
    tokenSymbol: tokenInfo.symbol,
    wethAmount: wethAmount.toFixed(6),
    usdAmount: amountUsd
  });

  // Step 7: Wait for confirmation
  const receipt = await waitForTransaction(tx, logger);

  // Step 8: Get actual tokens received and new WETH balance
  const newTokenBalance = await getTokenBalance(tokenAddress, walletAddress, provider, logger);
  const newWethBalance = await getTokenBalance(WETH_ADDRESS, walletAddress, provider, logger);
  
  const result = {
    success: true,
    type: 'BUY',
    txHash: tx.hash,
    explorerUrl: getExplorerUrl(tx.hash),
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    token: {
      address: tokenAddress,
      symbol: tokenInfo.symbol,
      name: tokenInfo.name,
      decimals: tokenInfo.decimals
    },
    input: {
      wethAmount: wethAmount.toFixed(6),
      usdAmount: amountUsd,
      wethAmountWei: wethAmountWei.toString()
    },
    output: {
      expectedTokens: ethers.formatUnits(amountOut, tokenInfo.decimals),
      minTokens: ethers.formatUnits(minAmountOut, tokenInfo.decimals),
      newTokenBalance: ethers.formatUnits(newTokenBalance, tokenInfo.decimals),
      newWethBalance: ethers.formatEther(newWethBalance)
    },
    poolFee: `${fee / 10000}%`,
    timestamp: new Date().toISOString()
  };

  logger.info('BUY operation completed successfully', result);
  return result;
}

// =============================================================================
// SELL OPERATION
// =============================================================================

/**
 * Executes a sell operation (Token -> ETH)
 * @param {Object} params - Sell parameters
 * @param {ethers.Wallet} params.wallet - Wallet instance
 * @param {string} params.tokenAddress - Token to sell
 * @param {number} params.slippageTolerance - Slippage tolerance percentage
 * @param {Object} logger - Logger instance
 * @returns {Promise<Object>} Trade result
 */
export async function executeSell({ wallet, tokenAddress, slippageTolerance }, logger) {
  const provider = wallet.provider;
  const walletAddress = await wallet.getAddress();
  
  logger.info('Starting SELL operation: Selling all tokens');

  // Step 1: Get token info
  const tokenInfo = await getTokenInfo(tokenAddress, provider, logger);
  logger.info(`Selling token: ${tokenInfo.symbol} (${tokenInfo.name})`);

  // Step 2: Get token balance
  const tokenBalance = await getTokenBalance(tokenAddress, walletAddress, provider, logger);
  
  if (tokenBalance === 0n) {
    logger.warn('No tokens to sell, balance is zero');
    return {
      success: true,
      type: 'SELL',
      skipped: true,
      reason: 'No tokens to sell',
      token: {
        address: tokenAddress,
        symbol: tokenInfo.symbol
      },
      timestamp: new Date().toISOString()
    };
  }

  logger.info(`Token balance to sell: ${ethers.formatUnits(tokenBalance, tokenInfo.decimals)} ${tokenInfo.symbol}`);

  // Step 3: Find best pool and get quote
  const { fee, amountOut } = await findBestPoolFee(
    tokenAddress,
    WETH_ADDRESS,
    tokenBalance,
    provider,
    logger
  );

  const minAmountOut = calculateMinOutput(amountOut, slippageTolerance);
  logger.info(`Expected ETH: ${ethers.formatEther(amountOut)} ETH`);
  logger.info(`Minimum ETH (with ${slippageTolerance}% slippage): ${ethers.formatEther(minAmountOut)}`);

  // Step 4: Approve router to spend tokens
  await approveToken(
    tokenAddress,
    UNISWAP_V3_ROUTER,
    tokenBalance,
    wallet,
    logger
  );

  // Step 5: Execute swap
  const router = new ethers.Contract(UNISWAP_V3_ROUTER, UNISWAP_V3_ROUTER_ABI, wallet);
  const deadline = Math.floor(Date.now() / 1000) + TX_DEADLINE_MINUTES * 60;

  const swapParams = {
    tokenIn: tokenAddress,
    tokenOut: WETH_ADDRESS,
    fee,
    recipient: walletAddress,
    amountIn: tokenBalance,
    amountOutMinimum: minAmountOut,
    sqrtPriceLimitX96: 0n
  };

  logger.info('Executing swap transaction...');

  const tx = await executeWithRetry(
    async () => {
      // For selling tokens to ETH, we need to use multicall to unwrap WETH
      const gasEstimate = await router.exactInputSingle.estimateGas(swapParams);
      const gasLimit = (gasEstimate * BigInt(Math.floor(GAS_LIMIT_MULTIPLIER * 100))) / 100n;
      
      logger.debug(`Gas estimate: ${gasEstimate.toString()}, using limit: ${gasLimit.toString()}`);

      return router.exactInputSingle(swapParams, { gasLimit });
    },
    logger,
    'Sell swap'
  );

  logger.logTransaction(tx.hash, {
    type: 'SELL',
    tokenSymbol: tokenInfo.symbol,
    tokenAmount: ethers.formatUnits(tokenBalance, tokenInfo.decimals)
  });

  // Step 6: Wait for confirmation
  const receipt = await waitForTransaction(tx, logger);

  // Step 7: Get new balances
  const newTokenBalance = await getTokenBalance(tokenAddress, walletAddress, provider, logger);
  const newEthBalance = await getEthBalance(walletAddress, provider, logger);

  // Get ETH price for USD value
  const ethPriceUsd = await getEthPriceUsd(provider, logger);
  const ethReceived = Number(ethers.formatEther(amountOut));
  const usdValue = ethReceived * ethPriceUsd;

  const result = {
    success: true,
    type: 'SELL',
    txHash: tx.hash,
    explorerUrl: getExplorerUrl(tx.hash),
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    token: {
      address: tokenAddress,
      symbol: tokenInfo.symbol,
      name: tokenInfo.name,
      decimals: tokenInfo.decimals
    },
    input: {
      tokenAmount: ethers.formatUnits(tokenBalance, tokenInfo.decimals),
      tokenAmountWei: tokenBalance.toString()
    },
    output: {
      expectedEth: ethers.formatEther(amountOut),
      minEth: ethers.formatEther(minAmountOut),
      estimatedUsdValue: usdValue.toFixed(2),
      newTokenBalance: ethers.formatUnits(newTokenBalance, tokenInfo.decimals),
      newEthBalance: ethers.formatEther(newEthBalance)
    },
    poolFee: `${fee / 10000}%`,
    timestamp: new Date().toISOString()
  };

  logger.info('SELL operation completed successfully', result);
  return result;
}
