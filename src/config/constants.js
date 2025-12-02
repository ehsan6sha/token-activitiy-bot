/**
 * @fileoverview Application constants and configuration
 * @description Centralized configuration for the trading bot
 * 
 * SECURITY NOTE: Never commit actual private keys or sensitive data.
 * All sensitive values must come from environment variables (GitHub Secrets).
 */

// =============================================================================
// NETWORK CONFIGURATION
// =============================================================================

/**
 * Base Network Chain ID
 * @constant {number}
 */
export const BASE_CHAIN_ID = 8453;

/**
 * Base Network Name
 * @constant {string}
 */
export const BASE_NETWORK_NAME = 'Base Mainnet';

/**
 * Default RPC URLs for Base Network (fallback chain)
 * Primary RPC should be set via RPC_URL environment variable
 * @constant {string[]}
 */
export const BASE_RPC_URLS = [
  'https://mainnet.base.org',
  'https://base.llamarpc.com',
  'https://base.publicnode.com',
  'https://1rpc.io/base'
];

// =============================================================================
// DEX CONFIGURATION (Uniswap V3 on Base)
// =============================================================================

/**
 * Uniswap V3 SwapRouter02 address on Base
 * @constant {string}
 */
export const UNISWAP_V3_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';

/**
 * Uniswap V3 Quoter V2 address on Base
 * @constant {string}
 */
export const UNISWAP_V3_QUOTER = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a';

/**
 * WETH address on Base (Wrapped ETH)
 * @constant {string}
 */
export const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

/**
 * USDC address on Base
 * @constant {string}
 */
export const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

/**
 * Default pool fee tiers to try (in basis points)
 * 500 = 0.05%, 3000 = 0.3%, 10000 = 1%
 * @constant {number[]}
 */
export const POOL_FEE_TIERS = [3000, 10000, 500];

// =============================================================================
// TRADING CONFIGURATION
// =============================================================================

/**
 * Minimum buy amount in USD
 * @constant {number}
 */
export const MIN_BUY_AMOUNT_USD = 1;

/**
 * Maximum buy amount in USD
 * @constant {number}
 */
export const MAX_BUY_AMOUNT_USD = 10;

/**
 * Slippage tolerance in percentage (e.g., 5 = 5%)
 * Higher slippage for volatile tokens
 * @constant {number}
 */
export const SLIPPAGE_TOLERANCE_PERCENT = 5;

/**
 * Transaction deadline in minutes
 * @constant {number}
 */
export const TX_DEADLINE_MINUTES = 20;

/**
 * Maximum gas price in Gwei (safety limit)
 * @constant {number}
 */
export const MAX_GAS_PRICE_GWEI = 50;

/**
 * Gas limit multiplier for safety margin
 * @constant {number}
 */
export const GAS_LIMIT_MULTIPLIER = 1.3;

// =============================================================================
// RETRY CONFIGURATION
// =============================================================================

/**
 * Maximum number of retry attempts for failed transactions
 * @constant {number}
 */
export const MAX_RETRY_ATTEMPTS = 3;

/**
 * Base delay between retries in milliseconds
 * @constant {number}
 */
export const RETRY_BASE_DELAY_MS = 2000;

/**
 * Exponential backoff multiplier
 * @constant {number}
 */
export const RETRY_BACKOFF_MULTIPLIER = 2;

// =============================================================================
// LOGGING CONFIGURATION
// =============================================================================

/**
 * Log levels
 * @constant {Object}
 */
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

/**
 * Log file paths (relative to project root)
 * @constant {Object}
 */
export const LOG_PATHS = {
  COMBINED: 'logs/combined.log',
  ERROR: 'logs/error.log',
  TRADES: 'logs/trades.log'
};

// =============================================================================
// ABI DEFINITIONS
// =============================================================================

/**
 * ERC20 Token ABI (minimal required functions)
 * @constant {Array}
 */
export const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)'
];

/**
 * Uniswap V3 SwapRouter ABI (minimal required functions)
 * @constant {Array}
 */
export const UNISWAP_V3_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountIn)',
  'function multicall(uint256 deadline, bytes[] calldata data) external payable returns (bytes[] memory results)',
  'function unwrapWETH9(uint256 amountMinimum, address recipient) external payable',
  'function refundETH() external payable'
];

/**
 * Uniswap V3 Quoter V2 ABI
 * @constant {Array}
 */
export const UNISWAP_V3_QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
  'function quoteExactOutputSingle((address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
];

// =============================================================================
// VALIDATION PATTERNS
// =============================================================================

/**
 * Ethereum address regex pattern
 * @constant {RegExp}
 */
export const ETH_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

/**
 * Private key regex pattern (with or without 0x prefix)
 * @constant {RegExp}
 */
export const PRIVATE_KEY_PATTERN = /^(0x)?[a-fA-F0-9]{64}$/;

// =============================================================================
// ERROR CODES
// =============================================================================

/**
 * Custom error codes for the application
 * @constant {Object}
 */
export const ERROR_CODES = {
  // Configuration errors (1xxx)
  INVALID_CONFIG: 1001,
  MISSING_ENV_VAR: 1002,
  INVALID_ADDRESS: 1003,
  INVALID_PRIVATE_KEY: 1004,

  // Network errors (2xxx)
  RPC_CONNECTION_FAILED: 2001,
  NETWORK_MISMATCH: 2002,
  RPC_TIMEOUT: 2003,

  // Transaction errors (3xxx)
  INSUFFICIENT_BALANCE: 3001,
  INSUFFICIENT_ALLOWANCE: 3002,
  TX_FAILED: 3003,
  TX_REVERTED: 3004,
  GAS_TOO_HIGH: 3005,
  SLIPPAGE_EXCEEDED: 3006,

  // Token errors (4xxx)
  TOKEN_NOT_FOUND: 4001,
  INVALID_TOKEN: 4002,
  NO_LIQUIDITY: 4003,

  // General errors (9xxx)
  UNKNOWN_ERROR: 9999
};
