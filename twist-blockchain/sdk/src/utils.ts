import { PublicKey, Transaction, TransactionInstruction, Connection } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { DECIMALS } from './constants';

// ========== Conversion Utilities ==========

/**
 * Convert token amount to decimal representation
 */
export function toDecimalAmount(amount: BN, decimals: number = DECIMALS): number {
  return amount.toNumber() / Math.pow(10, decimals);
}

/**
 * Convert decimal amount to BN with proper decimals
 */
export function toBNAmount(amount: number, decimals: number = DECIMALS): BN {
  return new BN(Math.floor(amount * Math.pow(10, decimals)));
}

/**
 * Format token amount for display
 */
export function formatTokenAmount(
  amount: BN | number,
  decimals: number = DECIMALS,
  displayDecimals: number = 4
): string {
  const value = BN.isBN(amount) ? toDecimalAmount(amount, decimals) : amount;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: displayDecimals,
  });
}

/**
 * Format USD amount for display
 */
export function formatUsdAmount(amount: number, includeSign: boolean = true): string {
  const formatted = Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return includeSign ? `$${formatted}` : formatted;
}

/**
 * Format percentage for display
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  return `${value.toFixed(decimals)}%`;
}

// ========== Time Utilities ==========

/**
 * Convert seconds to human readable duration
 */
export function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  
  return parts.join(' ') || '0m';
}

/**
 * Get time until a future timestamp
 */
export function getTimeUntil(timestamp: Date | number): string {
  const now = Date.now();
  const target = timestamp instanceof Date ? timestamp.getTime() : timestamp;
  const diff = target - now;
  
  if (diff <= 0) return 'now';
  
  return formatDuration(Math.floor(diff / 1000));
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: Date | number): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toLocaleString();
}

// ========== Address Utilities ==========

/**
 * Shorten a public key for display
 */
export function shortenAddress(address: PublicKey | string, chars: number = 4): string {
  const str = typeof address === 'string' ? address : address.toBase58();
  return `${str.slice(0, chars)}...${str.slice(-chars)}`;
}

/**
 * Validate if string is a valid public key
 */
export function isValidPublicKey(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

// ========== Transaction Utilities ==========

/**
 * Build a transaction with proper compute budget
 */
export function buildTransaction(
  instructions: TransactionInstruction[],
  computeUnits: number = 400000,
  priorityFee: number = 50000
): Transaction {
  const tx = new Transaction();
  
  // Add compute budget instructions
  const ComputeBudgetProgram = require('@solana/web3.js').ComputeBudgetProgram;
  
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits,
    }),
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: priorityFee,
    })
  );
  
  // Add actual instructions
  instructions.forEach(ix => tx.add(ix));
  
  return tx;
}

/**
 * Retry a transaction with exponential backoff
 */
export async function retryTransaction<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        await sleep(delay);
      }
    }
  }
  
  throw lastError!;
}

/**
 * Wait for transaction confirmation with timeout
 */
export async function confirmTransaction(
  connection: Connection,
  signature: string,
  timeout: number = 30000
): Promise<boolean> {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    const status = await connection.getSignatureStatus(signature);
    
    if (status.value?.confirmationStatus === 'confirmed' || 
        status.value?.confirmationStatus === 'finalized') {
      return true;
    }
    
    if (status.value?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
    }
    
    await sleep(1000);
  }
  
  throw new Error('Transaction confirmation timeout');
}

// ========== Math Utilities ==========

/**
 * Calculate percentage change
 */
export function calculatePercentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return 0;
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * Calculate compound interest with decay
 */
export function calculateCompoundInterest(
  principal: number,
  apy: number,
  days: number,
  dailyDecay: number = 0.005
): number {
  const rate = apy / 365;
  const periods = days;
  
  let amount = principal;
  for (let i = 0; i < periods; i++) {
    // Apply interest
    amount *= (1 + rate);
    // Apply decay
    amount *= (1 - dailyDecay);
  }
  
  return amount - principal;
}

/**
 * Calculate price impact for a trade
 */
export function calculatePriceImpact(
  inputAmount: number,
  poolLiquidity: number,
  fee: number = 0.003
): number {
  const inputWithFee = inputAmount * (1 - fee);
  const outputAmount = (poolLiquidity * inputWithFee) / (poolLiquidity + inputWithFee);
  const spotPrice = poolLiquidity / poolLiquidity; // 1:1 for simplicity
  const executionPrice = inputAmount / outputAmount;
  
  return ((executionPrice - spotPrice) / spotPrice) * 100;
}

// ========== Validation Utilities ==========

/**
 * Validate token amount
 */
export function validateAmount(
  amount: number,
  min: number = 0,
  max?: number
): { valid: boolean; error?: string } {
  if (isNaN(amount) || !isFinite(amount)) {
    return { valid: false, error: 'Invalid amount' };
  }
  
  if (amount <= min) {
    return { valid: false, error: `Amount must be greater than ${min}` };
  }
  
  if (max && amount > max) {
    return { valid: false, error: `Amount must be less than ${max}` };
  }
  
  return { valid: true };
}

/**
 * Validate lock period for staking
 */
export function validateLockPeriod(days: number): { valid: boolean; error?: string } {
  const MIN_DAYS = 30;
  const MAX_DAYS = 365;
  
  if (!Number.isInteger(days)) {
    return { valid: false, error: 'Lock period must be a whole number of days' };
  }
  
  if (days < MIN_DAYS) {
    return { valid: false, error: `Minimum lock period is ${MIN_DAYS} days` };
  }
  
  if (days > MAX_DAYS) {
    return { valid: false, error: `Maximum lock period is ${MAX_DAYS} days` };
  }
  
  return { valid: true };
}

// ========== Helper Utilities ==========

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Chunk an array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Get explorer URL for a transaction
 */
export function getExplorerUrl(
  signature: string,
  cluster: 'mainnet-beta' | 'devnet' | 'testnet' = 'mainnet-beta'
): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

/**
 * Get explorer URL for an address
 */
export function getAddressExplorerUrl(
  address: PublicKey | string,
  cluster: 'mainnet-beta' | 'devnet' | 'testnet' = 'mainnet-beta'
): string {
  const addressStr = typeof address === 'string' ? address : address.toBase58();
  return `https://explorer.solana.com/address/${addressStr}?cluster=${cluster}`;
}