/**
 * @fileoverview Input validation utilities
 * @description Comprehensive validation for all inputs with detailed error messages
 */

import { 
  ETH_ADDRESS_PATTERN, 
  PRIVATE_KEY_PATTERN,
  ERROR_CODES,
  BASE_CHAIN_ID
} from '../config/constants.js';

// =============================================================================
// CUSTOM ERROR CLASS
// =============================================================================

/**
 * Custom error class for validation errors
 */
export class ValidationError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} code - Error code from ERROR_CODES
   * @param {Object} details - Additional error details
   */
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details
    };
  }
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validates an Ethereum address
 * @param {string} address - Address to validate
 * @param {string} fieldName - Name of the field for error messages
 * @returns {string} Checksummed address
 * @throws {ValidationError} If address is invalid
 */
export function validateAddress(address, fieldName = 'address') {
  if (!address) {
    throw new ValidationError(
      `${fieldName} is required`,
      ERROR_CODES.INVALID_ADDRESS,
      { field: fieldName }
    );
  }

  if (typeof address !== 'string') {
    throw new ValidationError(
      `${fieldName} must be a string`,
      ERROR_CODES.INVALID_ADDRESS,
      { field: fieldName, received: typeof address }
    );
  }

  const trimmed = address.trim();

  if (!ETH_ADDRESS_PATTERN.test(trimmed)) {
    throw new ValidationError(
      `${fieldName} is not a valid Ethereum address`,
      ERROR_CODES.INVALID_ADDRESS,
      { field: fieldName, value: trimmed.substring(0, 10) + '...' }
    );
  }

  return trimmed;
}

/**
 * Validates a private key
 * @param {string} privateKey - Private key to validate
 * @returns {string} Normalized private key (with 0x prefix)
 * @throws {ValidationError} If private key is invalid
 */
export function validatePrivateKey(privateKey) {
  if (!privateKey) {
    throw new ValidationError(
      'Private key is required',
      ERROR_CODES.INVALID_PRIVATE_KEY,
      { field: 'privateKey' }
    );
  }

  if (typeof privateKey !== 'string') {
    throw new ValidationError(
      'Private key must be a string',
      ERROR_CODES.INVALID_PRIVATE_KEY,
      { field: 'privateKey' }
    );
  }

  const trimmed = privateKey.trim();

  if (!PRIVATE_KEY_PATTERN.test(trimmed)) {
    throw new ValidationError(
      'Invalid private key format',
      ERROR_CODES.INVALID_PRIVATE_KEY,
      { field: 'privateKey' }
    );
  }

  // Normalize to include 0x prefix
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
}

/**
 * Validates required environment variables
 * @param {string[]} requiredVars - List of required environment variable names
 * @returns {Object} Object containing validated environment variables
 * @throws {ValidationError} If any required variable is missing
 */
export function validateEnvironment(requiredVars) {
  const missing = [];
  const values = {};

  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value || value.trim() === '') {
      missing.push(varName);
    } else {
      values[varName] = value.trim();
    }
  }

  if (missing.length > 0) {
    throw new ValidationError(
      `Missing required environment variables: ${missing.join(', ')}`,
      ERROR_CODES.MISSING_ENV_VAR,
      { missing }
    );
  }

  return values;
}

/**
 * Validates a numeric value within a range
 * @param {number} value - Value to validate
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @param {string} fieldName - Name of the field for error messages
 * @returns {number} Validated number
 * @throws {ValidationError} If value is out of range
 */
export function validateNumericRange(value, min, max, fieldName) {
  const num = Number(value);

  if (isNaN(num)) {
    throw new ValidationError(
      `${fieldName} must be a valid number`,
      ERROR_CODES.INVALID_CONFIG,
      { field: fieldName, received: value }
    );
  }

  if (num < min || num > max) {
    throw new ValidationError(
      `${fieldName} must be between ${min} and ${max}`,
      ERROR_CODES.INVALID_CONFIG,
      { field: fieldName, value: num, min, max }
    );
  }

  return num;
}

/**
 * Validates the network chain ID
 * @param {number} chainId - Chain ID to validate
 * @throws {ValidationError} If chain ID doesn't match Base network
 */
export function validateChainId(chainId) {
  if (chainId !== BASE_CHAIN_ID) {
    throw new ValidationError(
      `Invalid network. Expected Base (${BASE_CHAIN_ID}), got ${chainId}`,
      ERROR_CODES.NETWORK_MISMATCH,
      { expected: BASE_CHAIN_ID, received: chainId }
    );
  }
}

/**
 * Validates token balance is sufficient
 * @param {bigint} balance - Current balance
 * @param {bigint} required - Required amount
 * @param {string} tokenSymbol - Token symbol for error message
 * @throws {ValidationError} If balance is insufficient
 */
export function validateSufficientBalance(balance, required, tokenSymbol = 'tokens') {
  if (balance < required) {
    throw new ValidationError(
      `Insufficient ${tokenSymbol} balance`,
      ERROR_CODES.INSUFFICIENT_BALANCE,
      { 
        balance: balance.toString(), 
        required: required.toString(),
        token: tokenSymbol
      }
    );
  }
}

/**
 * Validates gas price is within acceptable limits
 * @param {bigint} gasPrice - Current gas price in wei
 * @param {number} maxGwei - Maximum acceptable gas price in Gwei
 * @throws {ValidationError} If gas price is too high
 */
export function validateGasPrice(gasPrice, maxGwei) {
  const gasPriceGwei = Number(gasPrice) / 1e9;
  
  if (gasPriceGwei > maxGwei) {
    throw new ValidationError(
      `Gas price too high: ${gasPriceGwei.toFixed(2)} Gwei (max: ${maxGwei} Gwei)`,
      ERROR_CODES.GAS_TOO_HIGH,
      { current: gasPriceGwei, max: maxGwei }
    );
  }
}

/**
 * Sanitizes a string for safe logging (removes potential injection)
 * @param {string} input - Input string to sanitize
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Sanitized string
 */
export function sanitizeForLogging(input, maxLength = 100) {
  if (typeof input !== 'string') {
    return String(input).substring(0, maxLength);
  }
  
  // Remove control characters and limit length
  return input
    .replace(/[\x00-\x1F\x7F]/g, '')
    .substring(0, maxLength);
}

/**
 * Validates the complete configuration for a trade
 * @param {Object} config - Configuration object
 * @returns {Object} Validated configuration
 * @throws {ValidationError} If configuration is invalid
 */
export function validateTradeConfig(config) {
  const validated = {};

  // Validate private key
  validated.privateKey = validatePrivateKey(config.privateKey);

  // Validate token address
  validated.tokenAddress = validateAddress(config.tokenAddress, 'TOKEN_ADDRESS');

  // Validate RPC URL
  if (!config.rpcUrl || typeof config.rpcUrl !== 'string') {
    throw new ValidationError(
      'RPC URL is required',
      ERROR_CODES.INVALID_CONFIG,
      { field: 'rpcUrl' }
    );
  }
  validated.rpcUrl = config.rpcUrl.trim();

  // Validate optional parameters with defaults
  validated.slippageTolerance = config.slippageTolerance ?? 5;
  validated.maxGasPrice = config.maxGasPrice ?? 50;

  return validated;
}
