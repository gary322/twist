import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

// ========== Program State ==========

export interface ProgramState {
  authority: PublicKey;
  bump: number;
  mint: PublicKey;
  decimals: number;
  
  // Economic parameters
  decayRateBps: number;
  treasurySplitBps: number;
  lastDecayTimestamp: Date;
  totalDecayed: BN;
  totalBurned: BN;
  totalStaked: BN;
  totalStakes: number;
  totalBoughtBack: BN;
  
  // Treasury
  floorTreasury: PublicKey;
  opsTreasury: PublicKey;
  floorPrice: number;
  floorLiquidity: number;
  
  // Oracles
  pythPriceFeed: PublicKey;
  switchboardFeed: PublicKey;
  chainlinkFeed?: PublicKey;
  lastOracleUpdate: Date;
  lastOraclePrice: number;
  
  // Circuit breaker
  circuitBreakerActive: boolean;
  emergencyPause: boolean;
  buybackEnabled: boolean;
  maxDailyBuyback: number;
  dailyBuybackUsed: number;
  lastBuybackReset: Date;
  
  // Stats
  totalUsers: number;
  totalTransactions: BN;
  volume24h: number;
  volume7d: number;
  volume30d: number;
}

export function parseProgramState(raw: any): ProgramState {
  return {
    authority: raw.authority,
    bump: raw.bump,
    mint: raw.mint,
    decimals: raw.decimals,
    
    decayRateBps: raw.decayRateBps.toNumber(),
    treasurySplitBps: raw.treasurySplitBps.toNumber(),
    lastDecayTimestamp: new Date(raw.lastDecayTimestamp.toNumber() * 1000),
    totalDecayed: raw.totalDecayed,
    totalBurned: raw.totalBurned,
    totalStaked: raw.totalStaked,
    totalStakes: raw.totalStakes.toNumber(),
    totalBoughtBack: raw.totalBoughtBack,
    
    floorTreasury: raw.floorTreasury,
    opsTreasury: raw.opsTreasury,
    floorPrice: raw.floorPrice.toNumber() / 1e6,
    floorLiquidity: raw.floorLiquidity.toNumber() / 1e6,
    
    pythPriceFeed: raw.pythPriceFeed,
    switchboardFeed: raw.switchboardFeed,
    chainlinkFeed: raw.chainlinkFeed,
    lastOracleUpdate: new Date(raw.lastOracleUpdate.toNumber() * 1000),
    lastOraclePrice: raw.lastOraclePrice.toNumber() / 1e6,
    
    circuitBreakerActive: raw.circuitBreakerActive,
    emergencyPause: raw.emergencyPause,
    buybackEnabled: raw.buybackEnabled,
    maxDailyBuyback: raw.maxDailyBuyback.toNumber() / 1e6,
    dailyBuybackUsed: raw.dailyBuybackUsed.toNumber() / 1e6,
    lastBuybackReset: new Date(raw.lastBuybackReset.toNumber() * 1000),
    
    totalUsers: raw.totalUsers.toNumber(),
    totalTransactions: raw.totalTransactions,
    volume24h: raw.volume24h.toNumber() / 1e6,
    volume7d: raw.volume7d.toNumber() / 1e6,
    volume30d: raw.volume30d.toNumber() / 1e6,
  };
}

// ========== Stake State ==========

export interface StakeEntry {
  amount: BN;
  startTimestamp: Date;
  lockPeriod: number; // seconds
  apyBps: number;
  lastClaimTimestamp: Date;
  totalEarned: BN;
  withdrawn: boolean;
}

export interface StakeState {
  owner: PublicKey;
  bump: number;
  stakeIndex: number;
  totalStaked: BN;
  totalEarned: BN;
  stakes: StakeEntry[];
}

export function parseStakeState(raw: any): StakeState {
  return {
    owner: raw.owner,
    bump: raw.bump,
    stakeIndex: raw.stakeIndex.toNumber(),
    totalStaked: raw.totalStaked,
    totalEarned: raw.totalEarned,
    stakes: raw.stakes.map(parseStakeEntry),
  };
}

function parseStakeEntry(raw: any): StakeEntry {
  return {
    amount: raw.amount,
    startTimestamp: new Date(raw.startTimestamp.toNumber() * 1000),
    lockPeriod: raw.lockPeriod.toNumber(),
    apyBps: raw.apyBps.toNumber(),
    lastClaimTimestamp: new Date(raw.lastClaimTimestamp.toNumber() * 1000),
    totalEarned: raw.totalEarned,
    withdrawn: raw.withdrawn,
  };
}

// ========== Vesting Schedule ==========

export interface VestingSchedule {
  beneficiary: PublicKey;
  mint: PublicKey;
  totalAmount: BN;
  releasedAmount: BN;
  startTimestamp: Date;
  cliffTimestamp: Date;
  endTimestamp: Date;
  revocable: boolean;
  revoked: boolean;
  bump: number;
}

export function parseVestingSchedule(raw: any): VestingSchedule {
  return {
    beneficiary: raw.beneficiary,
    mint: raw.mint,
    totalAmount: raw.totalAmount,
    releasedAmount: raw.releasedAmount,
    startTimestamp: new Date(raw.startTimestamp.toNumber() * 1000),
    cliffTimestamp: new Date(raw.cliffTimestamp.toNumber() * 1000),
    endTimestamp: new Date(raw.endTimestamp.toNumber() * 1000),
    revocable: raw.revocable,
    revoked: raw.revoked,
    bump: raw.bump,
  };
}

// ========== Multisig ==========

export interface MultisigConfig {
  multisigAddress: PublicKey;
  threshold: number;
  members: PublicKey[];
  transactionCount: number;
  initialized: boolean;
  bump: number;
  pendingTransactions: number;
  parameterUpdateDelay: number;
  treasuryWithdrawalDelay: number;
  authorityTransferDelay: number;
}

export interface MultisigTransaction {
  id: BN;
  proposer: PublicKey;
  instructionData: Buffer;
  instructionProgramId: PublicKey;
  instructionAccounts: TransactionAccount[];
  title: string;
  description: string;
  createdAt: Date;
  executionTime: Date;
  executed: boolean;
  cancelled: boolean;
  approvals: PublicKey[];
  bump: number;
}

export interface TransactionAccount {
  pubkey: PublicKey;
  isSigner: boolean;
  isWritable: boolean;
}

export function parseMultisigConfig(raw: any): MultisigConfig {
  return {
    multisigAddress: raw.multisigAddress,
    threshold: raw.threshold.toNumber(),
    members: raw.members,
    transactionCount: raw.transactionCount.toNumber(),
    initialized: raw.initialized,
    bump: raw.bump,
    pendingTransactions: raw.pendingTransactions.toNumber(),
    parameterUpdateDelay: raw.parameterUpdateDelay.toNumber(),
    treasuryWithdrawalDelay: raw.treasuryWithdrawalDelay.toNumber(),
    authorityTransferDelay: raw.authorityTransferDelay.toNumber(),
  };
}

export function parseMultisigTransaction(raw: any): MultisigTransaction {
  return {
    id: raw.id,
    proposer: raw.proposer,
    instructionData: raw.instructionData,
    instructionProgramId: raw.instructionProgramId,
    instructionAccounts: raw.instructionAccounts.map((acc: any) => ({
      pubkey: acc.pubkey,
      isSigner: acc.isSigner,
      isWritable: acc.isWritable,
    })),
    title: raw.title,
    description: raw.description,
    createdAt: new Date(raw.createdAt.toNumber() * 1000),
    executionTime: new Date(raw.executionTime.toNumber() * 1000),
    executed: raw.executed,
    cancelled: raw.cancelled,
    approvals: raw.approvals,
    bump: raw.bump,
  };
}

// ========== Circuit Breaker ==========

export interface CircuitBreakerState {
  active: boolean;
  lastTrippedAt?: Date;
  tripReason?: string;
  autoResetEnabled: boolean;
  autoResetDuration: number;
  
  // Thresholds
  priceVolatilityThresholdBps: number;
  volumeSpikeMultiplier: number;
  supplyChangeThresholdBps: number;
  oracleDivergenceThresholdBps: number;
  liquidityDrainThresholdBps: number;
  
  // Cooldowns
  lowSeverityCooldown: number;
  mediumSeverityCooldown: number;
  highSeverityCooldown: number;
  criticalSeverityCooldown: number;
  
  // Stats
  totalTrips: number;
  falsePositives: number;
}

export function parseCircuitBreakerState(raw: any): CircuitBreakerState {
  return {
    active: raw.active,
    lastTrippedAt: raw.lastTrippedAt ? new Date(raw.lastTrippedAt.toNumber() * 1000) : undefined,
    tripReason: raw.tripReason || undefined,
    autoResetEnabled: raw.autoResetEnabled,
    autoResetDuration: raw.autoResetDuration.toNumber(),
    
    priceVolatilityThresholdBps: raw.priceVolatilityThresholdBps.toNumber(),
    volumeSpikeMultiplier: raw.volumeSpikeMultiplier.toNumber(),
    supplyChangeThresholdBps: raw.supplyChangeThresholdBps.toNumber(),
    oracleDivergenceThresholdBps: raw.oracleDivergenceThresholdBps.toNumber(),
    liquidityDrainThresholdBps: raw.liquidityDrainThresholdBps.toNumber(),
    
    lowSeverityCooldown: raw.lowSeverityCooldown.toNumber(),
    mediumSeverityCooldown: raw.mediumSeverityCooldown.toNumber(),
    highSeverityCooldown: raw.highSeverityCooldown.toNumber(),
    criticalSeverityCooldown: raw.criticalSeverityCooldown.toNumber(),
    
    totalTrips: raw.totalTrips.toNumber(),
    falsePositives: raw.falsePositives.toNumber(),
  };
}

// ========== PID Controller ==========

export interface PIDControllerState {
  kp: number; // Proportional gain
  ki: number; // Integral gain
  kd: number; // Derivative gain
  targetPrice: number;
  maxSupplyChangeBps: number;
  minAdjustmentInterval: number;
  
  // State
  integral: number;
  previousError: number;
  lastAdjustmentTime: Date;
  lastAdjustmentAmount: BN;
  
  // Limits
  integralMin: number;
  integralMax: number;
  
  // Stats
  totalAdjustments: number;
  totalMinted: BN;
  totalBurned: BN;
}

export function parsePIDControllerState(raw: any): PIDControllerState {
  return {
    kp: raw.kp.toNumber() / 10000,
    ki: raw.ki.toNumber() / 10000,
    kd: raw.kd.toNumber() / 10000,
    targetPrice: raw.targetPrice.toNumber() / 1e6,
    maxSupplyChangeBps: raw.maxSupplyChangeBps.toNumber(),
    minAdjustmentInterval: raw.minAdjustmentInterval.toNumber(),
    
    integral: raw.integral.toNumber() / 10000,
    previousError: raw.previousError.toNumber() / 10000,
    lastAdjustmentTime: new Date(raw.lastAdjustmentTime.toNumber() * 1000),
    lastAdjustmentAmount: raw.lastAdjustmentAmount,
    
    integralMin: raw.integralMin.toNumber() / 10000,
    integralMax: raw.integralMax.toNumber() / 10000,
    
    totalAdjustments: raw.totalAdjustments.toNumber(),
    totalMinted: raw.totalMinted,
    totalBurned: raw.totalBurned,
  };
}

// ========== Fee Collector ==========

export interface FeeCollectorState {
  // Fee rates
  tradingFeeBps: number;
  withdrawalFeeBps: number;
  bridgeFeeBps: number;
  liquidityFeeBps: number;
  
  // Distribution
  floorTreasuryShareBps: number;
  opsTreasuryShareBps: number;
  stakingRewardsShareBps: number;
  burnShareBps: number;
  
  // State
  collectedFees: BN;
  distributedFees: BN;
  lastDistribution: Date;
  minDistributionAmount: BN;
  
  // Stats
  totalCollected: BN;
  totalDistributed: BN;
  totalBurned: BN;
}

export function parseFeeCollectorState(raw: any): FeeCollectorState {
  return {
    tradingFeeBps: raw.tradingFeeBps.toNumber(),
    withdrawalFeeBps: raw.withdrawalFeeBps.toNumber(),
    bridgeFeeBps: raw.bridgeFeeBps.toNumber(),
    liquidityFeeBps: raw.liquidityFeeBps.toNumber(),
    
    floorTreasuryShareBps: raw.floorTreasuryShareBps.toNumber(),
    opsTreasuryShareBps: raw.opsTreasuryShareBps.toNumber(),
    stakingRewardsShareBps: raw.stakingRewardsShareBps.toNumber(),
    burnShareBps: raw.burnShareBps.toNumber(),
    
    collectedFees: raw.collectedFees,
    distributedFees: raw.distributedFees,
    lastDistribution: new Date(raw.lastDistribution.toNumber() * 1000),
    minDistributionAmount: raw.minDistributionAmount,
    
    totalCollected: raw.totalCollected,
    totalDistributed: raw.totalDistributed,
    totalBurned: raw.totalBurned,
  };
}