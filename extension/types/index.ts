// Platform types
export enum Platform {
  WEB = 'WEB',
  MOBILE = 'MOBILE',
  DESKTOP = 'DESKTOP'
}

// User session types
export interface UserSession {
  email?: string;
  walletAddress?: string;
  isAuthenticated: boolean;
  deviceId: string;
  trustScore: number;
}

// Tab state management
export interface TabState {
  url: string;
  domain: string;
  startTime: number;
  isActive: boolean;
  vauSubmitted: boolean;
  earnings: number;
  lastActivity?: number;
}

// Extension state
export interface ExtensionState {
  session: UserSession;
  tabs: Map<number, TabState>;
  totalEarnings: number;
  dailyEarnings: number;
  lastResetDate: string;
}

// VAU (Verified Active Usage) types
export interface VAUData {
  userId: string;
  deviceId: string;
  siteId: string;
  platform: Platform;
  timeSpent: number;
  attestation: {
    source: string;
    version: string;
    trustScore: number;
  };
}

export interface VAUResponse {
  id: string;
  earned: number;
  timestamp: number;
}

// Authentication types
export interface AuthPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  email?: string;
  walletAddress?: string;
  trustScore?: number;
  token?: string;
  error?: string;
}

// Wallet types
export interface WalletPayload {
  address: string;
  signature: string;
}

// Message types for extension communication
export interface ExtensionMessage {
  type: MessageType;
  payload?: any;
}

export enum MessageType {
  // Authentication
  AUTHENTICATE = 'AUTHENTICATE',
  LOGOUT = 'LOGOUT',
  
  // State
  GET_STATE = 'GET_STATE',
  
  // VAU
  SUBMIT_VAU = 'SUBMIT_VAU',
  USER_ACTIVITY = 'USER_ACTIVITY',
  CONTENT_ENGAGED = 'CONTENT_ENGAGED',
  
  // Wallet
  CONNECT_WALLET = 'CONNECT_WALLET',
  
  // Page info
  CHECK_ACTIVITY = 'CHECK_ACTIVITY',
  GET_PAGE_INFO = 'GET_PAGE_INFO',
  INJECT_WALLET = 'INJECT_WALLET',
  
  // User actions
  USER_ACTION = 'USER_ACTION',
  
  // Security
  SECURITY_ALERT = 'SECURITY_ALERT',
  
  // Sites
  GET_RECENT_SITES = 'GET_RECENT_SITES',
  
  // v2.0 - Influencer features
  SEARCH_INFLUENCERS = 'SEARCH_INFLUENCERS',
  STAKE = 'STAKE',
  GET_USER_STAKES = 'GET_USER_STAKES',
  CLAIM_REWARDS = 'CLAIM_REWARDS',
  CHECK_PUBLISHER = 'CHECK_PUBLISHER',
  GET_BALANCE = 'GET_BALANCE',
  GET_INFLUENCER_ON_PAGE = 'GET_INFLUENCER_ON_PAGE',
  INFLUENCER_DETECTED = 'INFLUENCER_DETECTED',
  OPEN_STAKING_MODAL = 'OPEN_STAKING_MODAL'
}

// Activity tracking
export interface UserActivity {
  type: string;
  timestamp: number;
  url: string;
}

export interface ActivityPayload {
  activities: UserActivity[];
  pageTime: number;
  isVisible: boolean;
}

// Page information
export interface PageInfo {
  title: string;
  description?: string;
  canonical?: string;
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  wordCount: number;
  hasVideo: boolean;
  hasPaywall: boolean;
}

// Recent sites
export interface RecentSite {
  domain: string;
  earned: number;
  lastVisit: number;
}

// Config types
export interface ExtensionConfig {
  API_ENDPOINT: string;
  VAU_ENDPOINT: string;
  UPDATE_INTERVAL: number;
  MIN_TIME_ON_PAGE: number;
  VAU_SUBMISSION_INTERVAL: number;
}

// v2.0 Types - Influencer Features
export interface Influencer {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  metrics: InfluencerMetrics;
}

export interface InfluencerMetrics {
  totalStaked: string; // BigInt as string
  stakerCount: number;
  apy: number;
  avgStakeAmount: string; // BigInt as string
  volume24h: string; // BigInt as string
}

export interface UserIdentity {
  userId: string;
  email: string;
  deviceId: string;
  trustScore: number;
  createdAt: string;
}

export interface UserStake {
  influencer: Influencer;
  stake: StakeInfo;
}

export interface StakeInfo {
  amount: string; // BigInt as string
  stakedAt: number;
  pendingRewards: string; // BigInt as string
  apy: number;
}

export interface StakingParams {
  influencerId: string;
  amount: number;
}

export interface InfluencerSearchParams {
  query?: string;
  sortBy?: 'totalStaked' | 'stakerCount' | 'apy';
  limit?: number;
  offset?: number;
}

export interface Publisher {
  id: string;
  domain: string;
  name: string;
  verified: boolean;
}

export interface StakingAlert {
  influencerId: string;
  lastCheck: number;
  lastApy: number;
}

export interface TabInfo {
  url: string;
  startTime: number;
  publisher: Publisher | null;
}