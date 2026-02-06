/**
 * Type definitions for the simulation
 */

// User types
export interface UserProfile {
  id: string;
  email: string;
  walletAddress?: string;
  hasExtension?: boolean;
  has2FA?: boolean;
  interests: string[];
  demographics: {
    age?: number;
    country?: string;
    language?: string;
  };
}

export interface StakingPosition {
  influencerId: string;
  amount: number;
  stakedAt: number;
  apy: number;
  rewards: number;
}

export interface VAUData {
  userId: string;
  siteId: string;
  timeSpent: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

// Influencer types
export interface InfluencerProfile {
  id: string;
  username: string;
  platform: 'twitter' | 'instagram' | 'youtube' | 'tiktok';
  followers: number;
  verified: boolean;
  category: string;
  walletAddress: string;
}

export interface StakingPool {
  address: string;
  influencerId: string;
  totalStaked: number;
  stakerCount: number;
  apy: number;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  commissionRate: number;
  rewardsDistributed: number;
  createdAt: number;
}

// Publisher types
export interface PublisherProfile {
  id: string;
  domain: string;
  category: string;
  monthlyVisits: number;
  walletAddress: string;
}

export interface Widget {
  id: string;
  publisherId: string;
  type: 'reward_banner' | 'staking_widget' | 'leaderboard';
  config: {
    position: string;
    theme: string;
    showEarnings: boolean;
    autoHide: boolean;
  };
  script: string;
  createdAt: number;
}

export interface AdSlot {
  id: string;
  publisherId: string;
  size: string;
  position: string;
  minBid: number;
  allowedFormats: string[];
  createdAt: number;
}

// Advertiser types
export interface AdvertiserProfile {
  id: string;
  company: string;
  industry: string;
  website: string;
  walletAddress: string;
}

export interface Campaign {
  id: string;
  advertiserId: string;
  name: string;
  type: 'awareness' | 'performance' | 'retargeting';
  budget: number;
  dailyBudget: number;
  spent: number;
  status: 'active' | 'paused' | 'completed';
  targetingCriteria: {
    interests: string[];
    demographics: any;
    geoTargeting: string[];
    minFollowers: number;
  };
  creatives: any[];
  conversionValue: number;
  attributionWindow: number;
  metrics: CampaignMetrics;
  createdAt: number;
}

export interface CampaignMetrics {
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  ctr: number;
  cvr: number;
  cpa: number;
  roi: number;
}

export interface Attribution {
  campaignId: string;
  userId: string;
  influencerId?: string;
  event: 'impression' | 'click' | 'conversion';
  timestamp: number;
  value: number;
}

// Platform types
export interface TokenMetrics {
  totalSupply: number;
  circulatingSupply: number;
  stakedSupply: number;
  burnedSupply: number;
  dailyActiveUsers: number;
  dailyTransactions: number;
  dailyVolume: number;
}

export interface TreasuryConfig {
  floorPercentage: number;
  operationalPercentage: number;
}

export interface SystemConfig {
  decayRate: number;
  transferFee: number;
  stakingRewardRate: number;
  minStake: number;
  maxStake: number;
  treasurySplit: {
    floor: number;
    operations: number;
  };
}

// Event types
export interface VAUEvent {
  userId: string;
  siteId: string;
  earned: number;
  type: 'regular' | 'publisher';
}

export interface StakingEvent {
  userId: string;
  influencerId: string;
  amount: number;
  apy: number;
}

export interface RewardEvent {
  userId: string;
  influencerId: string;
  amount: number;
  type: 'staking' | 'referral' | 'bonus';
}