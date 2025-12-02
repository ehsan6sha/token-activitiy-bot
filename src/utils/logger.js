/**
 * @fileoverview Production-grade logging utility
 * @description Comprehensive logging with multiple transports, structured output,
 *              and GitHub Actions integration
 */

import winston from 'winston';
import { LOG_LEVELS, LOG_PATHS } from '../config/constants.js';
import fs from 'fs';
import path from 'path';

// =============================================================================
// CUSTOM FORMATS
// =============================================================================

/**
 * Sensitive data patterns to mask in logs
 */
const SENSITIVE_PATTERNS = [
  // Private keys (64 hex chars with optional 0x prefix)
  { pattern: /(0x)?[a-fA-F0-9]{64}/gi, replacement: '[PRIVATE_KEY_REDACTED]' },
  // API keys (common patterns)
  { pattern: /api[_-]?key["\s:=]+["']?[\w-]+["']?/gi, replacement: 'api_key=[REDACTED]' },
  // Bearer tokens
  { pattern: /bearer\s+[\w-]+/gi, replacement: 'Bearer [REDACTED]' }
];

/**
 * Recursively masks sensitive data in any value (string, object, array)
 * @param {any} value - Value to mask
 * @returns {any} Masked value
 */
function maskValue(value) {
  if (typeof value === 'string') {
    let masked = value;
    SENSITIVE_PATTERNS.forEach(({ pattern, replacement }) => {
      masked = masked.replace(pattern, replacement);
    });
    return masked;
  }
  
  if (Array.isArray(value)) {
    return value.map(maskValue);
  }
  
  if (value && typeof value === 'object') {
    // Skip Error objects - handle them specially
    if (value instanceof Error) {
      return {
        name: value.name,
        message: maskValue(value.message),
        code: value.code,
        // Mask stack trace too
        stack: value.stack ? maskValue(value.stack) : undefined
      };
    }
    
    const masked = {};
    for (const [key, val] of Object.entries(value)) {
      // Completely redact keys that might contain secrets
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('privatekey') || 
          lowerKey.includes('private_key') || 
          lowerKey.includes('secret') ||
          lowerKey.includes('password') ||
          lowerKey.includes('mnemonic') ||
          lowerKey.includes('seed')) {
        masked[key] = '[REDACTED]';
      } else {
        masked[key] = maskValue(val);
      }
    }
    return masked;
  }
  
  return value;
}

/**
 * Custom format for masking sensitive data in logs
 * Recursively masks ALL fields including metadata objects
 */
const maskSensitiveData = winston.format((info) => {
  // Mask the message
  info.message = maskValue(info.message);
  
  // Mask all other fields (metadata, error objects, etc.)
  for (const [key, value] of Object.entries(info)) {
    if (key !== 'level' && key !== 'message') {
      info[key] = maskValue(value);
    }
  }
  
  return info;
});

/**
 * Custom format for GitHub Actions annotation output
 */
const githubActionsFormat = winston.format((info) => {
  if (process.env.GITHUB_ACTIONS === 'true') {
    const level = info.level.toUpperCase();
    
    // Map to GitHub Actions annotation levels
    if (level === 'ERROR') {
      info.ghAnnotation = '::error::';
    } else if (level === 'WARN') {
      info.ghAnnotation = '::warning::';
    } else if (level === 'DEBUG') {
      info.ghAnnotation = '::debug::';
    } else {
      info.ghAnnotation = '';
    }
  }
  return info;
});

/**
 * Custom format for structured JSON output
 */
const structuredFormat = winston.format.printf(({ 
  level, 
  message, 
  timestamp, 
  correlationId,
  action,
  txHash,
  error,
  ghAnnotation = '',
  ...metadata 
}) => {
  const logEntry = {
    timestamp,
    level: level.toUpperCase(),
    correlationId: correlationId || 'N/A',
    action: action || 'GENERAL',
    message,
    ...(txHash && { txHash }),
    ...(error && { 
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    }),
    ...(Object.keys(metadata).length > 0 && { metadata })
  };

  // For GitHub Actions, prepend annotation prefix
  const jsonOutput = JSON.stringify(logEntry);
  return `${ghAnnotation}${jsonOutput}`;
});

/**
 * Human-readable format for console output
 */
const consoleFormat = winston.format.printf(({ 
  level, 
  message, 
  timestamp, 
  correlationId,
  action,
  ghAnnotation = ''
}) => {
  const levelColors = {
    error: '\x1b[31m', // Red
    warn: '\x1b[33m',  // Yellow
    info: '\x1b[32m',  // Green
    debug: '\x1b[36m'  // Cyan
  };
  const reset = '\x1b[0m';
  const color = levelColors[level] || reset;
  
  const prefix = correlationId ? `[${correlationId}]` : '';
  const actionTag = action ? `[${action}]` : '';
  
  // GitHub Actions format
  if (process.env.GITHUB_ACTIONS === 'true') {
    return `${ghAnnotation}${timestamp} ${level.toUpperCase()} ${prefix}${actionTag} ${message}`;
  }
  
  return `${timestamp} ${color}${level.toUpperCase()}${reset} ${prefix}${actionTag} ${message}`;
});

// =============================================================================
// LOGGER FACTORY
// =============================================================================

/**
 * Creates and configures the Winston logger instance
 * @returns {winston.Logger} Configured logger instance
 */
function createLogger() {
  // Ensure log directory exists
  const logDir = path.dirname(LOG_PATHS.COMBINED);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

  const transports = [
    // Console transport (always enabled)
    new winston.transports.Console({
      level: isProduction ? 'info' : 'debug',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        maskSensitiveData(),
        githubActionsFormat(),
        consoleFormat
      )
    })
  ];

  // File transports (only when not in GitHub Actions - use artifacts instead)
  if (!isGitHubActions) {
    transports.push(
      // Combined log file
      new winston.transports.File({
        filename: LOG_PATHS.COMBINED,
        level: 'debug',
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
          maskSensitiveData(),
          structuredFormat
        ),
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }),
      // Error log file
      new winston.transports.File({
        filename: LOG_PATHS.ERROR,
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
          maskSensitiveData(),
          structuredFormat
        ),
        maxsize: 5242880,
        maxFiles: 5
      }),
      // Trades log file (info level for trade records)
      new winston.transports.File({
        filename: LOG_PATHS.TRADES,
        level: 'info',
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
          maskSensitiveData(),
          structuredFormat
        ),
        maxsize: 10485760, // 10MB
        maxFiles: 10
      })
    );
  }

  return winston.createLogger({
    level: isProduction ? 'info' : 'debug',
    defaultMeta: { 
      service: 'token-activity-bot',
      environment: process.env.NODE_ENV || 'development'
    },
    transports,
    exitOnError: false
  });
}

// =============================================================================
// LOGGER INSTANCE & HELPERS
// =============================================================================

const logger = createLogger();

/**
 * Generates a unique correlation ID for tracking related log entries
 * @returns {string} Unique correlation ID
 */
export function generateCorrelationId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`.toUpperCase();
}

/**
 * Creates a child logger with preset correlation ID
 * @param {string} correlationId - Correlation ID for the session
 * @param {string} action - Action type (BUY/SELL)
 * @returns {Object} Logger wrapper with correlation context
 */
export function createSessionLogger(correlationId, action) {
  return {
    debug: (message, meta = {}) => logger.debug(message, { correlationId, action, ...meta }),
    info: (message, meta = {}) => logger.info(message, { correlationId, action, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { correlationId, action, ...meta }),
    error: (message, meta = {}) => logger.error(message, { correlationId, action, ...meta }),
    
    /**
     * Log a trade execution
     * @param {Object} tradeDetails - Trade details
     */
    logTrade: (tradeDetails) => {
      logger.info('TRADE_EXECUTED', {
        correlationId,
        action,
        ...tradeDetails
      });
    },

    /**
     * Log transaction details
     * @param {string} txHash - Transaction hash
     * @param {Object} details - Additional transaction details
     */
    logTransaction: (txHash, details = {}) => {
      logger.info('TRANSACTION', {
        correlationId,
        action,
        txHash,
        ...details
      });
    }
  };
}

/**
 * Writes a summary to GitHub Actions step summary
 * @param {string} summary - Markdown formatted summary
 */
export async function writeGitHubSummary(summary) {
  if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
    } catch (error) {
      logger.warn('Failed to write GitHub summary', { error });
    }
  }
}

/**
 * Sets a GitHub Actions output variable
 * @param {string} name - Output variable name
 * @param {string} value - Output variable value
 */
export function setGitHubOutput(name, value) {
  if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_OUTPUT) {
    try {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
    } catch (error) {
      logger.warn('Failed to set GitHub output', { error, name });
    }
  }
}

export default logger;
