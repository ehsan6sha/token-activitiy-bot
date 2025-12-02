#!/usr/bin/env node
/**
 * @fileoverview Configuration validation script
 * @description Validates environment configuration before deployment
 * 
 * Run with: npm run validate
 */

import { ethers } from 'ethers';
import { 
  validateAddress, 
  validatePrivateKey,
  ValidationError 
} from './validation.js';
import {
  BASE_CHAIN_ID,
  BASE_RPC_URLS,
  ERC20_ABI
} from '../config/constants.js';

// =============================================================================
// VALIDATION CHECKS
// =============================================================================

const checks = [];
let hasErrors = false;

function logCheck(name, status, message = '') {
  const icon = status === 'pass' ? '✅' : status === 'warn' ? '⚠️' : '❌';
  checks.push({ name, status, message });
  console.log(`${icon} ${name}${message ? ': ' + message : ''}`);
  if (status === 'fail') hasErrors = true;
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('TOKEN ACTIVITY BOT - CONFIGURATION VALIDATOR');
  console.log('='.repeat(60) + '\n');

  // Check 1: Private Key
  console.log('📋 Checking Private Key...');
  try {
    const pk = process.env.PRIVATE_KEY;
    if (!pk) {
      logCheck('Private Key', 'fail', 'PRIVATE_KEY environment variable not set');
    } else {
      const validatedPk = validatePrivateKey(pk);
      const wallet = new ethers.Wallet(validatedPk);
      const address = await wallet.getAddress();
      logCheck('Private Key', 'pass', `Valid (wallet: ${address.substring(0, 6)}...${address.substring(38)})`);
    }
  } catch (error) {
    logCheck('Private Key', 'fail', error.message);
  }

  // Check 2: Token Address
  console.log('\n📋 Checking Token Address...');
  try {
    const tokenAddress = process.env.TOKEN_ADDRESS;
    if (!tokenAddress) {
      logCheck('Token Address', 'fail', 'TOKEN_ADDRESS environment variable not set');
    } else {
      validateAddress(tokenAddress, 'TOKEN_ADDRESS');
      logCheck('Token Address', 'pass', tokenAddress);
    }
  } catch (error) {
    logCheck('Token Address', 'fail', error.message);
  }

  // Check 3: RPC URL
  console.log('\n📋 Checking RPC Connection...');
  const rpcUrl = process.env.RPC_URL || BASE_RPC_URLS[0];
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl, BASE_CHAIN_ID, {
      staticNetwork: true
    });
    
    const network = await Promise.race([
      provider.getNetwork(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
    ]);

    if (Number(network.chainId) !== BASE_CHAIN_ID) {
      logCheck('RPC Connection', 'fail', `Wrong network: expected ${BASE_CHAIN_ID}, got ${network.chainId}`);
    } else {
      const blockNumber = await provider.getBlockNumber();
      logCheck('RPC Connection', 'pass', `Connected to Base (block: ${blockNumber})`);
    }
  } catch (error) {
    logCheck('RPC Connection', 'fail', `Cannot connect: ${error.message}`);
  }

  // Check 4: Token Contract (if both RPC and token address are valid)
  if (process.env.TOKEN_ADDRESS && !hasErrors) {
    console.log('\n📋 Checking Token Contract...');
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl, BASE_CHAIN_ID, {
        staticNetwork: true
      });
      const contract = new ethers.Contract(process.env.TOKEN_ADDRESS, ERC20_ABI, provider);
      
      const [name, symbol, decimals] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals()
      ]);

      logCheck('Token Contract', 'pass', `${symbol} (${name}), ${decimals} decimals`);
    } catch (error) {
      logCheck('Token Contract', 'fail', `Invalid token contract: ${error.message}`);
    }
  }

  // Check 5: Wallet Balance (if private key is valid)
  if (process.env.PRIVATE_KEY && !hasErrors) {
    console.log('\n📋 Checking Wallet Balance...');
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl, BASE_CHAIN_ID, {
        staticNetwork: true
      });
      const wallet = new ethers.Wallet(validatePrivateKey(process.env.PRIVATE_KEY), provider);
      const balance = await provider.getBalance(wallet.address);
      const ethBalance = Number(ethers.formatEther(balance));

      if (ethBalance < 0.01) {
        logCheck('Wallet Balance', 'warn', `Low balance: ${ethBalance.toFixed(6)} ETH (recommend > 0.01 ETH)`);
      } else {
        logCheck('Wallet Balance', 'pass', `${ethBalance.toFixed(6)} ETH`);
      }
    } catch (error) {
      logCheck('Wallet Balance', 'fail', error.message);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(60));
  
  const passed = checks.filter(c => c.status === 'pass').length;
  const warned = checks.filter(c => c.status === 'warn').length;
  const failed = checks.filter(c => c.status === 'fail').length;

  console.log(`\n✅ Passed: ${passed}`);
  console.log(`⚠️  Warnings: ${warned}`);
  console.log(`❌ Failed: ${failed}`);

  if (hasErrors) {
    console.log('\n❌ Configuration validation FAILED. Please fix the errors above.\n');
    process.exit(1);
  } else if (warned > 0) {
    console.log('\n⚠️  Configuration valid with warnings. Review the warnings above.\n');
    process.exit(0);
  } else {
    console.log('\n✅ Configuration validation PASSED. Ready to deploy!\n');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('Validation script error:', error);
  process.exit(1);
});
