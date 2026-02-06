import { PublicKey } from '@solana/web3.js';

// ========== Program Constants ==========

export const TWIST_PROGRAM_ID = new PublicKey('TWSTgLBZfQf1vSKnHHNgkRJeZKxmBtyKBGpMfNaFpFH');
export const TWIST_MINT = new PublicKey('TWSTmintDyXriRUzQpE6TSLvmcCzLpQJw8FbKBLJjqq');

// ========== Token Constants ==========

export const DECIMALS = 9;
export const TOTAL_SUPPLY = 1_000_000_000; // 1 billion tokens
export const TOKEN_SYMBOL = 'TWIST';
export const TOKEN_NAME = 'TWIST Token';

// ========== Economic Constants ==========

export const DECAY_RATE_BPS = 50; // 0.5% daily
export const TREASURY_SPLIT_BPS = 9000; // 90% to floor treasury
export const BUYBACK_THRESHOLD_BPS = 9700; // 97% of floor price
export const MIN_STAKE_PERIOD = 30 * 86400; // 30 days in seconds
export const MAX_STAKE_PERIOD = 365 * 86400; // 365 days
export const DECAY_INTERVAL = 86400; // 24 hours

// ========== Staking APY Tiers ==========

export const STAKING_TIERS = [
  { days: 30, apy: 10 },
  { days: 90, apy: 20 },
  { days: 180, apy: 35 },
  { days: 365, apy: 67 },
];

// ========== Fee Constants ==========

export const TRADING_FEE_BPS = 30; // 0.3%
export const WITHDRAWAL_FEE_BPS = 100; // 1%
export const BRIDGE_FEE_BPS = 10; // 0.1%
export const LIQUIDITY_FEE_BPS = 5; // 0.05%

// ========== Oracle Constants ==========

export const ORACLE_CONFIDENCE_THRESHOLD = 10000; // $0.01 confidence
export const ORACLE_STALENESS_THRESHOLD = 60; // 60 seconds
export const ORACLE_MAX_DIVERGENCE_BPS = 500; // 5% max divergence

// ========== Circuit Breaker Constants ==========

export const PRICE_VOLATILITY_THRESHOLD_BPS = 5000; // 50%
export const VOLUME_SPIKE_MULTIPLIER = 10; // 10x normal volume
export const SUPPLY_CHANGE_THRESHOLD_BPS = 200; // 2% daily
export const LIQUIDITY_DRAIN_THRESHOLD_BPS = 2000; // 20%

// ========== Bridge Constants ==========

export const SUPPORTED_CHAINS = {
  ETHEREUM: 2,
  BSC: 4,
  POLYGON: 5,
  AVALANCHE: 6,
  ARBITRUM: 23,
  OPTIMISM: 24,
} as const;

export const CHAIN_NAMES = {
  2: 'Ethereum',
  4: 'BSC',
  5: 'Polygon',
  6: 'Avalanche',
  23: 'Arbitrum',
  24: 'Optimism',
} as const;

// ========== DEX Constants ==========

export const ORCA_PROGRAM_ID = new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc');
export const RAYDIUM_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
export const JUPITER_PROGRAM_ID = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');

// ========== PDA Seeds ==========

export const SEEDS = {
  PROGRAM_STATE: Buffer.from('program_state'),
  STAKE_STATE: Buffer.from('stake_state'),
  STAKE_VAULT: Buffer.from('stake_vault'),
  FLOOR_TREASURY: Buffer.from('floor_treasury'),
  OPS_TREASURY: Buffer.from('ops_treasury'),
  VESTING: Buffer.from('vesting'),
  VESTING_VAULT: Buffer.from('vesting_vault'),
  BRIDGE_ESCROW: Buffer.from('bridge_escrow'),
  MULTISIG: Buffer.from('multisig'),
  TRANSACTION: Buffer.from('transaction'),
  CIRCUIT_BREAKER: Buffer.from('circuit_breaker'),
  PID_CONTROLLER: Buffer.from('pid_controller'),
  FEE_COLLECTOR: Buffer.from('fee_collector'),
  FEE_VAULT: Buffer.from('fee_vault'),
} as const;

// ========== Time Constants ==========

export const SECONDS_PER_DAY = 86400;
export const SECONDS_PER_WEEK = 604800;
export const SECONDS_PER_MONTH = 2592000; // 30 days
export const SECONDS_PER_YEAR = 31536000; // 365 days

// ========== Limits ==========

export const MAX_DAILY_BUYBACK = 50_000; // $50k USDC
export const MIN_BUYBACK_AMOUNT = 100; // $100 USDC
export const MAX_TRANSACTION_SIZE = 1_000_000; // $1M
export const MAX_BRIDGE_AMOUNT = 10_000_000; // 10M TWIST
export const MIN_BRIDGE_AMOUNT = 100; // 100 TWIST

// ========== Error Messages ==========

export const ERROR_MESSAGES = {
  INSUFFICIENT_BALANCE: 'Insufficient balance for transaction',
  INVALID_AMOUNT: 'Invalid amount specified',
  STAKE_LOCKED: 'Stake is still locked',
  BUYBACK_DISABLED: 'Buyback is currently disabled',
  CIRCUIT_BREAKER_ACTIVE: 'Circuit breaker is active',
  ORACLE_STALE: 'Oracle price data is stale',
  DAILY_LIMIT_EXCEEDED: 'Daily limit exceeded',
  EMERGENCY_PAUSE: 'System is in emergency pause',
  UNAUTHORIZED: 'Unauthorized access',
  BRIDGE_UNSUPPORTED_CHAIN: 'Unsupported destination chain',
} as const;

// ========== RPC Endpoints ==========

export const RPC_ENDPOINTS = {
  MAINNET: 'https://api.mainnet-beta.solana.com',
  DEVNET: 'https://api.devnet.solana.com',
  TESTNET: 'https://api.testnet.solana.com',
} as const;

// ========== Explorer URLs ==========

export const EXPLORER_BASE_URL = 'https://explorer.solana.com';
export const SOLSCAN_BASE_URL = 'https://solscan.io';

// ========== Environment Detection ==========

export function getCurrentCluster(): 'mainnet-beta' | 'devnet' | 'testnet' {
  const programId = TWIST_PROGRAM_ID.toBase58();
  
  // Detect based on program ID prefix
  if (programId.startsWith('TWST')) {
    return 'mainnet-beta';
  } else if (programId.includes('dev')) {
    return 'devnet';
  } else {
    return 'testnet';
  }
}