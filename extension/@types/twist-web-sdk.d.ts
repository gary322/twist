// Type definitions for @twist/web-sdk
declare module '@twist/web-sdk' {
  export interface TwistWebSDKConfig {
    apiKey: string;
    environment: 'development' | 'production';
  }

  export interface UserIdentity {
    userId: string;
    email: string;
    deviceId: string;
    trustScore: number;
    createdAt: string;
  }

  export interface InfluencerSearchParams {
    query?: string;
    sortBy?: 'totalStaked' | 'stakerCount' | 'apy';
    limit?: number;
    offset?: number;
  }

  export interface InfluencerMetrics {
    totalStaked: string;
    stakerCount: number;
    apy: number;
    volume24h: string;
    avgStakeAmount: string;
  }

  export interface Influencer {
    id: string;
    username: string;
    displayName: string;
    avatar?: string;
    tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
    metrics: InfluencerMetrics;
  }

  export interface StakeInfo {
    amount: string;
    stakedAt: string;
    pendingRewards: string;
    apy: number;
  }

  export interface UserStake {
    influencer: Influencer;
    stake: StakeInfo;
  }

  export interface StakingParams {
    influencerId: string;
    amount: number;
    wallet: string;
  }

  export interface StakingResult {
    success: boolean;
    transactionId: string;
    stake: StakeInfo;
  }

  export interface ClaimResult {
    success: boolean;
    transactionId: string;
    claimedAmount: string;
  }

  export interface TokenMetrics {
    price: number;
    marketCap: string;
    volume24h: string;
    totalSupply: string;
  }

  export interface TrackingData {
    action: string;
    metadata: Record<string, any>;
  }

  export class TwistWebSDK {
    constructor(config: TwistWebSDKConfig);
    
    identify(email: string): Promise<UserIdentity>;
    searchInfluencers(params: InfluencerSearchParams): Promise<Influencer[]>;
    stakeOnInfluencer(params: StakingParams): Promise<StakingResult>;
    getUserStakes(): Promise<UserStake[]>;
    claimRewards(influencerId: string): Promise<ClaimResult>;
    getBalance(walletAddress: string): Promise<bigint>;
    linkWallet(userId: string, walletAddress: string): Promise<void>;
    getTokenMetrics(): Promise<TokenMetrics>;
    track(data: TrackingData): Promise<void>;
  }
}