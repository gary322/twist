import { PublicKey, Connection } from '@solana/web3.js';

// SDK Configuration
export interface PSABConfig {
  rpcEndpoint?: string;
  commitment?: 'processed' | 'confirmed' | 'finalized';
  websiteUrl: string;
  sector: 'Gaming' | 'DeFi' | 'NFT' | 'Social' | 'Other';
  widgetPosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  theme?: 'default' | 'dark' | 'minimal' | 'custom';
  customStyles?: CustomWidgetStyles;
  analytics?: boolean;
  debug?: boolean;
}

// Custom Widget Styles
export interface CustomWidgetStyles {
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  borderRadius?: string;
  fontFamily?: string;
  width?: string;
  height?: string;
}

// Bond Pool Information
export interface BondPoolInfo {
  address: PublicKey;
  siteUrl: string;
  sector: string;
  totalStaked: bigint;
  stakerCount: number;
  currentAPY: number;
  minStakeAmount: bigint;
  maxStakeAmount: bigint;
  lockDuration: number;
  active: boolean;
  createdAt: Date;
}

// Staker Position
export interface StakerPosition {
  owner: PublicKey;
  pool: PublicKey;
  amountStaked: bigint;
  shares: bigint;
  pendingRewards: bigint;
  unlocksAt: Date;
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  nftMint?: PublicKey;
}

// Website Analytics
export interface WebsiteAnalytics {
  totalBurns: number;
  totalTwistBurned: bigint;
  uniqueVisitors: number;
  avgBurnPerVisitor: bigint;
  dailyBurnVolume: bigint;
  topStakers: StakerInfo[];
  recentBurns: BurnEvent[];
}

// Staker Information
export interface StakerInfo {
  address: PublicKey;
  stakedAmount: bigint;
  sharePercentage: number;
  totalEarned: bigint;
  joinedAt: Date;
}

// Burn Event
export interface BurnEvent {
  visitor: PublicKey;
  amount: bigint;
  timestamp: Date;
  permanentlyBurned: bigint;
  distributedToStakers: bigint;
}

// Transaction Results
export interface StakeResult {
  success: boolean;
  signature?: string;
  bondNFT?: PublicKey;
  error?: string;
}

export interface BurnResult {
  success: boolean;
  signature?: string;
  burnedAmount: bigint;
  stakersReward: bigint;
  error?: string;
}

export interface ClaimResult {
  success: boolean;
  signature?: string;
  claimedAmount: bigint;
  error?: string;
}

// Widget Events
export interface WidgetEvent {
  type: string;
  data: any;
  timestamp: Date;
}

// Error Types
export enum PSABErrorCode {
  POOL_NOT_FOUND = 'POOL_NOT_FOUND',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  WALLET_NOT_CONNECTED = 'WALLET_NOT_CONNECTED',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

export class PSABError extends Error {
  constructor(
    public code: PSABErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'PSABError';
  }
}