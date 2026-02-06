/**
 * TWIST Platform Core Type Definitions
 * 
 * CRITICAL: These types are the source of truth for ALL components.
 * Any changes must be approved by all team leads and versioned properly.
 * 
 * Version: 1.0.0
 * Last Updated: 2024-01-15
 */

// ============================================
// Blockchain & Token Types (Plan 1)
// ============================================

import { PublicKey } from '@solana/web3.js';

export interface TwistToken {
  mint: PublicKey;
  decimals: 9;
  symbol: 'TWIST';
}

export interface TokenAccount {
  owner: PublicKey;
  amount: bigint;
  lastDecayTimestamp: number;
  stakingInfo?: StakingInfo;
  achievementMultiplier: number; // From NFTs
}

export interface StakingInfo {
  amount: bigint;
  startTimestamp: number;
  lockPeriod: number;
  apy: number; // Post-decay APY
}

export interface DecayState {
  dailyRate: 0.005; // 0.5% constant
  lastGlobalDecay: number;
  totalDecayed: bigint;
  floorTreasury: bigint;
  explorerPot: bigint;
}

// ============================================
// Identity & Authentication Types (Plan 3)
// ============================================

export interface UserIdentity {
  email: string;
  emailHash: string; // SHA-256
  walletAddress?: PublicKey;
  devices: DeviceInfo[];
  createdAt: number;
  lastActive: number;
}

export interface DeviceInfo {
  deviceId: string;
  attestationFormat: 'packed' | 'tpm' | 'android-key' | 'apple' | 'none';
  trustScore: number; // 0-100
  publicKeyCredential: string;
  lastUsed: number;
  dailyVauCount: number;
  platform: Platform;
}

export enum Platform {
  WEB = 'web',
  IOS = 'ios',
  ANDROID = 'android',
  UNITY = 'unity',
  DISCORD = 'discord',
  TELEGRAM = 'telegram',
  SHOPIFY = 'shopify'
}

// ============================================
// VAU (Verified Attention Unit) Types (Plan 2)
// ============================================

export interface VAU {
  id: string; // UUID
  userId: string; // Email hash
  deviceId: string;
  siteId: string;
  timestamp: number;
  signature: string; // ECDSA
  attestation?: WebAuthnAttestation;
  earned: number; // TWIST amount
  multiplier: number; // From NFTs
}

export interface WebAuthnAttestation {
  fmt: string;
  attStmt: Record<string, any>;
  authData: ArrayBuffer;
  trustPath: string[];
}

// ============================================
// Universal SDK Types (Plan 4)
// ============================================

export interface SDKConfig {
  productId: string;
  apiKey: string; // Format: twist_pk_[a-zA-Z0-9]{32}
  apiEndpoint: string;
  debug: boolean;
  rewards: CustomRewards;
}

export interface TrackedAction {
  action: StandardAction | string;
  metadata: Record<string, any>;
  email?: string;
  timestamp: number;
  sessionId: string;
  platform: Platform;
  attributionData?: AttributionInfo;
}

export enum StandardAction {
  SIGNUP = 'signup',
  LOGIN = 'login',
  PURCHASE = 'purchase',
  SHARE = 'share',
  REFER = 'refer',
  REVIEW = 'review',
  ACHIEVEMENT = 'achievement'
}

export interface CustomRewards {
  [action: string]: number; // TWIST amount
}

// ============================================
// Campaign & Attribution Types (Plan 7 & 8)
// ============================================

export enum CampaignStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED'
}

export interface Campaign {
  id: string;
  advertiserId: string;
  name: string;
  objective?: string;
  type?: string;
  description?: string;
  budgetUsdc: number;
  budgetRemaining: number;
  targeting: TargetingParams;
  attribution: AttributionSettings;
  creatives: Creative[];
  status: CampaignStatus;
  metrics: CampaignMetrics;
  schedule?: CampaignSchedule;
  brandSafety?: BrandSafetyRules;
  advertiserDomain?: string;
  bidStrategy?: string;
}

export interface CampaignSchedule {
  startDate?: string;
  endDate?: string;
  dayparting?: Record<number, number[]>;
}

export interface BrandSafetyRules {
  blockLists?: {
    domains?: string[];
    keywords?: string[];
    categories?: string[];
  };
  contentVerification?: {
    preApproval?: boolean;
    thirdPartyVerification?: 'IAS' | 'DoubleVerify' | 'MOAT';
  };
}

export interface TargetingParams {
  bloomFilter: string; // Base64 encoded
  geoTargets?: string[]; // Country codes
  deviceTypes?: Platform[];
  customAudiences?: string[];
}

export interface AttributionSettings {
  windowSeconds: number; // 1-7776000 (90 days)
  model: 'last_click' | 'multi_touch' | 'time_decay';
  influencerSplit: number; // 0-1
}

export interface AttributionInfo {
  campaignId?: string;
  influencerId?: string;
  source: string;
  medium: string;
  touchpoints: TouchPoint[];
}

export interface TouchPoint {
  timestamp: number;
  action: string;
  platform: Platform;
  value?: number;
}

// ============================================
// Publisher Types (Plan 6)
// ============================================

export interface Publisher {
  siteId: string;
  domain: string;
  email: string;
  bondingAmount: bigint;
  earningMultiplier: number; // 1x or 10x
  status: PublisherStatus;
  metrics: PublisherMetrics;
}

export enum PublisherStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  BANNED = 'banned'
}

// ============================================
// Influencer Types (Plan 8)
// ============================================

export interface Influencer {
  id: string; // Unique identifier
  email: string;
  tier: InfluencerTier;
  stakedAmount: bigint;
  totalConversions: number;
  totalEarned: bigint;
  multiplier: number;
  links: InfluencerLink[];
}

export enum InfluencerTier {
  BRONZE = 'bronze',
  SILVER = 'silver',
  GOLD = 'gold',
  PLATINUM = 'platinum'
}

export interface InfluencerLink {
  productId: string;
  linkUrl: string; // twist.to/p/{product}/ref/{influencer}
  promoCode: string; // TWIST-{INFLUENCER}-{PRODUCT}-{YEAR}
  clicks: number;
  conversions: number;
  earned: bigint;
}

// ============================================
// Achievement NFT Types (Plan 12)
// ============================================

export interface AchievementNFT {
  mintAddress: PublicKey;
  achievementId: string;
  name: string;
  description: string;
  imageUrl: string;
  multiplier: number; // 1.0 - 3.0
  requirements: AchievementRequirement[];
  holders: number;
}

export interface AchievementRequirement {
  type: 'action_count' | 'streak' | 'referral' | 'custom';
  action?: StandardAction;
  count?: number;
  days?: number;
  customLogic?: string;
}

// ============================================
// API Response Types (Shared)
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: number;
  requestId: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

// ============================================
// Event Types (Plan 2 & 10)
// ============================================

export interface TwistEvent {
  eventId: string;
  eventType: EventType;
  userId: string;
  timestamp: number;
  platform: Platform;
  data: Record<string, any>;
  processed: boolean;
}

export enum EventType {
  // User events
  USER_SIGNUP = 'user.signup',
  USER_LOGIN = 'user.login',
  USER_ACTION = 'user.action',
  
  // Token events
  TOKEN_EARNED = 'token.earned',
  TOKEN_STAKED = 'token.staked',
  TOKEN_WITHDRAWN = 'token.withdrawn',
  TOKEN_DECAYED = 'token.decayed',
  
  // Campaign events
  CAMPAIGN_CREATED = 'campaign.created',
  CAMPAIGN_IMPRESSION = 'campaign.impression',
  CAMPAIGN_CLICK = 'campaign.click',
  CAMPAIGN_CONVERSION = 'campaign.conversion',
  
  // NFT events
  NFT_MINTED = 'nft.minted',
  NFT_ACHIEVED = 'nft.achieved',
  
  // System events
  SYSTEM_ERROR = 'system.error',
  FRAUD_DETECTED = 'fraud.detected'
}

// ============================================
// Metrics Types (Plan 10)
// ============================================

export interface MetricSnapshot {
  timestamp: number;
  period: 'minute' | 'hour' | 'day' | 'week' | 'month';
  metrics: {
    activeUsers: number;
    vauCount: number;
    tokensEarned: bigint;
    tokensDecayed: bigint;
    campaignSpend: number;
    publisherEarnings: bigint;
    influencerEarnings: bigint;
    nftsMinted: number;
  };
}

export interface UserMetrics {
  userId: string;
  totalEarned: bigint;
  totalDecayed: bigint;
  currentBalance: bigint;
  actionsCount: Record<StandardAction, number>;
  lastActive: number;
  devices: number;
  referrals: number;
  achievements: string[];
}

export interface CampaignMetrics {
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  ctr: number; // Click-through rate
  cvr: number; // Conversion rate
  cpa: number; // Cost per acquisition
  roi: number; // Return on investment
}

export interface PublisherMetrics {
  vauCount: number;
  uniqueUsers: number;
  earnings: bigint;
  rpm: number; // Revenue per mille
  avgSessionTime: number;
  bounceRate: number;
}

// ============================================
// Configuration Types (Shared)
// ============================================

export interface SystemConfig {
  // Economic parameters
  decayRate: 0.005;
  explorerPotRatio: 0.3;
  floorTreasuryRatio: 0.9;
  
  // Rate limits
  maxVauPerDay: 8640;
  maxEarningsPerDevice: number; // κ cap
  
  // Attribution
  defaultAttributionWindow: 1800; // 30 minutes
  maxAttributionWindow: 7776000; // 90 days
  
  // Rewards (defaults)
  defaultRewards: Record<StandardAction, number>;
  
  // Security
  attestationRequired: boolean;
  minTrustScore: 20;
  
  // API
  apiVersion: string;
  maxBatchSize: 100;
  rateLimits: Record<string, number>;
}

// ============================================
// Edge Worker Message Types (Plan 2)
// ============================================

export interface EdgeWorkerMessage {
  type: 'vau' | 'event' | 'attribution' | 'reward';
  payload: any;
  signature: string;
  timestamp: number;
}

export interface RewardMessage {
  userId: string;
  amount: number;
  action: StandardAction | string;
  campaignId?: string;
  influencerId?: string;
  deviceId: string;
  multiplier: number;
}

// ============================================
// Database Schema Types (Shared)
// ============================================

export interface DatabaseSchema {
  // User tables
  users: UserIdentity;
  devices: DeviceInfo;
  sessions: SessionInfo;
  
  // Token tables
  wallets: TokenAccount;
  stakes: StakingInfo;
  transactions: TokenTransaction;
  
  // Campaign tables
  campaigns: Campaign;
  creatives: Creative;
  attributions: Attribution;
  
  // Publisher tables
  publishers: Publisher;
  sites: Site;
  
  // Influencer tables
  influencers: Influencer;
  links: InfluencerLink;
  
  // Metrics tables
  events: TwistEvent;
  metrics_hourly: MetricSnapshot;
  metrics_daily: MetricSnapshot;
  
  // NFT tables
  achievements: AchievementNFT;
  user_achievements: UserAchievement;
}

export interface SessionInfo {
  sessionId: string;
  userId: string;
  deviceId: string;
  startTime: number;
  lastActivity: number;
  platform: Platform;
}

export interface Creative {
  id: string;
  campaignId: string;
  type: 'image' | 'video' | 'text';
  url: string;
  metadata: Record<string, any>;
}

export interface Attribution {
  id: string;
  userId: string;
  campaignId: string;
  influencerId?: string;
  timestamp: number;
  touchpoints: TouchPoint[];
  converted: boolean;
  value?: number;
}

export interface Site {
  siteId: string;
  publisherId: string;
  domain: string;
  verified: boolean;
  category: string;
  monthlyVisits: number;
}

export interface TokenTransaction {
  txId: string;
  type: 'earn' | 'stake' | 'withdraw' | 'decay' | 'burn';
  from: PublicKey;
  to: PublicKey;
  amount: bigint;
  timestamp: number;
  metadata: Record<string, any>;
}

export interface UserAchievement {
  userId: string;
  achievementId: string;
  mintAddress: PublicKey;
  earnedAt: number;
  progress: number;
}

// ============================================
// Type Guards (Runtime Validation)
// ============================================

export const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const isValidApiKey = (key: string): boolean => {
  return /^twist_pk_[a-zA-Z0-9]{32}$/.test(key);
};

export const isValidProductId = (id: string): boolean => {
  return /^[a-z0-9-]{3,50}$/.test(id);
};

export const isValidInfluencerId = (id: string): boolean => {
  return /^[a-z0-9_]{3,30}$/.test(id);
};

export const isValidPromoCode = (code: string): boolean => {
  return /^TWIST-[A-Z0-9]+-[A-Z0-9]+-\d{4}$/.test(code);
};

// ============================================
// Constants (Shared)
// ============================================

export const CONSTANTS = {
  // Token
  TOKEN_DECIMALS: 9,
  DAILY_DECAY_RATE: 0.005,
  
  // Limits
  MAX_VAU_PER_DAY: 8640,
  MAX_DEVICES_PER_USER: 10,
  MAX_BATCH_SIZE: 100,
  
  // Timeouts
  SESSION_TIMEOUT: 86400000, // 24 hours
  ATTRIBUTION_DEFAULT: 1800000, // 30 minutes
  
  // Multipliers
  PUBLISHER_BONDED_MULTIPLIER: 10,
  NFT_MAX_MULTIPLIER: 3,
  
  // API
  API_VERSION: 'v1',
  
  // Signatures
  SIGNATURE_ALGORITHM: 'ES256',
  HMAC_ALGORITHM: 'SHA-256'
} as const;

// Export all types
export type * from './core';