import { PublicKey } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';

// ========== Token Types ==========

export interface TokenAmount {
  amount: BN;
  decimals: number;
  uiAmount: number;
  uiAmountString: string;
}

export interface TokenBalance {
  mint: PublicKey;
  owner: PublicKey;
  amount: TokenAmount;
  state: 'initialized' | 'frozen';
}

// ========== Transaction Types ==========

export interface TwistTransaction {
  signature: string;
  blockTime: number;
  slot: number;
  type: TransactionType;
  status: 'success' | 'failed';
  fee: number;
  accounts: PublicKey[];
  data?: any;
}

export enum TransactionType {
  Initialize = 'initialize',
  Stake = 'stake',
  Unstake = 'unstake',
  ClaimRewards = 'claim_rewards',
  ApplyDecay = 'apply_decay',
  ExecuteBuyback = 'execute_buyback',
  CreateVesting = 'create_vesting',
  ClaimVested = 'claim_vested',
  BridgeTokens = 'bridge_tokens',
  UpdateParameters = 'update_parameters',
  EmergencyPause = 'emergency_pause',
  TransferAuthority = 'transfer_authority',
}

// ========== Economic Types ==========

export interface DecayInfo {
  currentRate: number;
  nextDecayTime: Date;
  totalDecayed: BN;
  projectedDaily: number;
  projectedMonthly: number;
  projectedYearly: number;
}

export interface StakingInfo {
  totalStaked: BN;
  totalStakers: number;
  averageAPY: number;
  tierInfo: StakingTier[];
}

export interface StakingTier {
  lockPeriod: number;
  apy: number;
  totalStaked: BN;
  numberOfStakers: number;
}

export interface BuybackInfo {
  enabled: boolean;
  dailyLimit: number;
  dailyUsed: number;
  totalBoughtBack: BN;
  lastBuyback?: Date;
  nextReset: Date;
}

// ========== Price Types ==========

export interface PriceInfo {
  current: number;
  floor: number;
  ratio: number;
  change24h: number;
  change7d: number;
  high24h: number;
  low24h: number;
}

export interface OraclePrice {
  source: 'pyth' | 'switchboard' | 'chainlink' | 'aggregated';
  price: number;
  confidence: number;
  lastUpdate: Date;
  slot: number;
}

// ========== Liquidity Types ==========

export interface LiquidityInfo {
  pool: PublicKey;
  dex: 'orca' | 'raydium' | 'jupiter';
  tvl: number;
  volume24h: number;
  fees24h: number;
  apy: number;
  priceImpact1k: number;
  priceImpact10k: number;
  priceImpact100k: number;
}

export interface PoolPosition {
  owner: PublicKey;
  pool: PublicKey;
  liquidity: BN;
  tokenAmountA: BN;
  tokenAmountB: BN;
  uncollectedFees: BN;
  range?: {
    tickLower: number;
    tickUpper: number;
    inRange: boolean;
  };
}

// ========== Treasury Types ==========

export interface TreasuryInfo {
  floorTreasury: {
    address: PublicKey;
    balance: number;
    percentage: number;
  };
  opsTreasury: {
    address: PublicKey;
    balance: number;
    percentage: number;
  };
  total: number;
  floorRatio: number;
}

// ========== Bridge Types ==========

export interface BridgeTransfer {
  id: string;
  from: {
    chain: string;
    address: string;
    txHash: string;
  };
  to: {
    chain: string;
    address: string;
    txHash?: string;
  };
  amount: BN;
  status: 'pending' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
}

// ========== Error Types ==========

export class TwistError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'TwistError';
  }
}

export enum ErrorCode {
  // General
  InvalidAmount = 'INVALID_AMOUNT',
  InsufficientBalance = 'INSUFFICIENT_BALANCE',
  Unauthorized = 'UNAUTHORIZED',
  
  // Staking
  InvalidLockPeriod = 'INVALID_LOCK_PERIOD',
  StakeNotMatured = 'STAKE_NOT_MATURED',
  AlreadyUnstaked = 'ALREADY_UNSTAKED',
  NoRewardsToClaim = 'NO_REWARDS_TO_CLAIM',
  
  // Decay
  DecayTooSoon = 'DECAY_TOO_SOON',
  DecayFailed = 'DECAY_FAILED',
  
  // Buyback
  BuybackDisabled = 'BUYBACK_DISABLED',
  DailyLimitExceeded = 'DAILY_LIMIT_EXCEEDED',
  PriceAboveThreshold = 'PRICE_ABOVE_THRESHOLD',
  InsufficientLiquidity = 'INSUFFICIENT_LIQUIDITY',
  
  // Oracle
  OracleStale = 'ORACLE_STALE',
  OracleConfidenceLow = 'ORACLE_CONFIDENCE_LOW',
  OracleDivergence = 'ORACLE_DIVERGENCE',
  
  // Circuit Breaker
  CircuitBreakerActive = 'CIRCUIT_BREAKER_ACTIVE',
  EmergencyPause = 'EMERGENCY_PAUSE',
  
  // Bridge
  UnsupportedChain = 'UNSUPPORTED_CHAIN',
  BridgeAmountTooSmall = 'BRIDGE_AMOUNT_TOO_SMALL',
  BridgeAmountTooLarge = 'BRIDGE_AMOUNT_TOO_LARGE',
  
  // Network
  TransactionTimeout = 'TRANSACTION_TIMEOUT',
  SimulationFailed = 'SIMULATION_FAILED',
  NetworkCongestion = 'NETWORK_CONGESTION',
}

// ========== Event Types ==========

export interface TwistEvent {
  type: EventType;
  timestamp: Date;
  signature: string;
  data: any;
}

export enum EventType {
  // Token Events
  TokensMinted = 'tokens_minted',
  TokensBurned = 'tokens_burned',
  TokensDecayed = 'tokens_decayed',
  
  // Staking Events
  Staked = 'staked',
  Unstaked = 'unstaked',
  RewardsClaimed = 'rewards_claimed',
  
  // Economic Events
  BuybackExecuted = 'buyback_executed',
  FloorPriceUpdated = 'floor_price_updated',
  
  // System Events
  CircuitBreakerTripped = 'circuit_breaker_tripped',
  CircuitBreakerReset = 'circuit_breaker_reset',
  EmergencyPauseActivated = 'emergency_pause_activated',
  EmergencyPauseDeactivated = 'emergency_pause_deactivated',
  
  // Governance Events
  ParameterUpdated = 'parameter_updated',
  AuthorityTransferred = 'authority_transferred',
  MultisigTransactionProposed = 'multisig_transaction_proposed',
  MultisigTransactionExecuted = 'multisig_transaction_executed',
}

// ========== Utility Types ==========

export type Optional<T> = T | null | undefined;

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface Statistics {
  mean: number;
  median: number;
  standardDeviation: number;
  min: number;
  max: number;
  count: number;
}