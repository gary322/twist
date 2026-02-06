/**
 * TWIST Platform API Contracts
 * 
 * These interfaces define the contracts between all services.
 * All implementations MUST adhere to these contracts to ensure compatibility.
 * 
 * Version: 1.0.0
 */

import {
  UserIdentity,
  DeviceInfo,
  TrackedAction,
  Campaign,
  Publisher,
  Influencer,
  VAU,
  ApiResponse,
  PaginatedResponse,
  Platform,
  StandardAction,
  AttributionInfo,
  TwistEvent,
  AchievementNFT,
  PublicKey
} from '../types/core';

// ============================================
// Authentication Service Contract (Plan 3)
// ============================================

export interface IAuthenticationService {
  // User management
  createUser(email: string): Promise<ApiResponse<UserIdentity>>;
  getUser(emailHash: string): Promise<ApiResponse<UserIdentity>>;
  linkWallet(emailHash: string, wallet: PublicKey): Promise<ApiResponse<UserIdentity>>;
  
  // Device management
  registerDevice(userId: string, device: DeviceInfo): Promise<ApiResponse<DeviceInfo>>;
  verifyDevice(deviceId: string, attestation: any): Promise<ApiResponse<boolean>>;
  getTrustScore(deviceId: string): Promise<ApiResponse<number>>;
  
  // Session management
  createSession(userId: string, deviceId: string): Promise<ApiResponse<string>>;
  validateSession(sessionId: string): Promise<ApiResponse<boolean>>;
  revokeSession(sessionId: string): Promise<ApiResponse<void>>;
  
  // API keys
  generateApiKey(productId: string): Promise<ApiResponse<string>>;
  validateApiKey(apiKey: string): Promise<ApiResponse<boolean>>;
  revokeApiKey(apiKey: string): Promise<ApiResponse<void>>;
}

// ============================================
// VAU Processing Service Contract (Plan 2)
// ============================================

export interface IVAUService {
  // VAU submission
  submitVAU(vau: VAU): Promise<ApiResponse<number>>; // Returns TWIST earned
  batchSubmitVAUs(vaus: VAU[]): Promise<ApiResponse<number[]>>;
  
  // Rate limiting
  checkRateLimit(deviceId: string): Promise<ApiResponse<{
    remaining: number;
    resetAt: number;
  }>>;
  
  // Verification
  verifySignature(vau: VAU): Promise<boolean>;
  verifyAttestation(attestation: any): Promise<boolean>;
  
  // Analytics
  getVAUStats(timeRange: [number, number]): Promise<ApiResponse<{
    total: number;
    unique: number;
    byPlatform: Record<Platform, number>;
  }>>;
}

// ============================================
// Token Service Contract (Plan 1)
// ============================================

export interface ITokenService {
  // Balance management
  getBalance(wallet: PublicKey): Promise<ApiResponse<bigint>>;
  getDecayAdjustedBalance(wallet: PublicKey): Promise<ApiResponse<bigint>>;
  
  // Transfers
  transfer(from: PublicKey, to: PublicKey, amount: bigint): Promise<ApiResponse<string>>;
  batchTransfer(transfers: Array<{from: PublicKey, to: PublicKey, amount: bigint}>): Promise<ApiResponse<string[]>>;
  
  // Staking
  stake(wallet: PublicKey, amount: bigint, duration: number): Promise<ApiResponse<string>>;
  unstake(wallet: PublicKey): Promise<ApiResponse<string>>;
  getStakingInfo(wallet: PublicKey): Promise<ApiResponse<any>>;
  
  // Decay
  applyDecay(): Promise<ApiResponse<bigint>>; // Returns total decayed
  getDecayStats(): Promise<ApiResponse<{
    totalDecayed: bigint;
    floorTreasury: bigint;
    explorerPot: bigint;
  }>>;
  
  // Market operations
  executeBuyback(amount: bigint): Promise<ApiResponse<string>>;
  updateFloorPrice(price: number): Promise<ApiResponse<void>>;
}

// ============================================
// SDK Service Contract (Plan 4)
// ============================================

export interface ISDKService {
  // Event tracking
  track(action: TrackedAction): Promise<ApiResponse<void>>;
  batchTrack(actions: TrackedAction[]): Promise<ApiResponse<void>>;
  
  // User identification
  identify(email: string, metadata?: any): Promise<ApiResponse<void>>;
  alias(oldEmail: string, newEmail: string): Promise<ApiResponse<void>>;
  
  // Configuration
  getProductConfig(productId: string): Promise<ApiResponse<any>>;
  updateProductConfig(productId: string, config: any): Promise<ApiResponse<void>>;
  
  // Analytics
  getProductAnalytics(productId: string, timeRange: [number, number]): Promise<ApiResponse<{
    users: number;
    actions: Record<StandardAction | string, number>;
    earned: bigint;
  }>>;
}

// ============================================
// Campaign Service Contract (Plan 7)
// ============================================

export interface ICampaignService {
  // Campaign management
  createCampaign(campaign: Omit<Campaign, 'id' | 'metrics'>): Promise<ApiResponse<Campaign>>;
  updateCampaign(campaignId: string, updates: Partial<Campaign>): Promise<ApiResponse<Campaign>>;
  pauseCampaign(campaignId: string): Promise<ApiResponse<void>>;
  getCampaign(campaignId: string): Promise<ApiResponse<Campaign>>;
  listCampaigns(advertiserId: string): Promise<PaginatedResponse<Campaign>>;
  
  // Budget management
  addBudget(campaignId: string, amountUsdc: number): Promise<ApiResponse<void>>;
  withdrawBudget(campaignId: string, amountUsdc: number): Promise<ApiResponse<void>>;
  
  // Targeting
  updateTargeting(campaignId: string, targeting: any): Promise<ApiResponse<void>>;
  estimateReach(targeting: any): Promise<ApiResponse<number>>;
  
  // Attribution
  recordImpression(campaignId: string, userId: string): Promise<ApiResponse<void>>;
  recordClick(campaignId: string, userId: string): Promise<ApiResponse<void>>;
  recordConversion(campaignId: string, userId: string, value?: number): Promise<ApiResponse<void>>;
  
  // Reporting
  getCampaignMetrics(campaignId: string): Promise<ApiResponse<any>>;
  generateReport(campaignId: string, format: 'json' | 'csv'): Promise<ApiResponse<string>>;
}

// ============================================
// Publisher Service Contract (Plan 6)
// ============================================

export interface IPublisherService {
  // Publisher management
  registerPublisher(domain: string, email: string): Promise<ApiResponse<Publisher>>;
  verifyDomain(publisherId: string): Promise<ApiResponse<boolean>>;
  updatePublisher(publisherId: string, updates: Partial<Publisher>): Promise<ApiResponse<Publisher>>;
  
  // Bonding
  bondTokens(publisherId: string, amount: bigint): Promise<ApiResponse<void>>;
  unbondTokens(publisherId: string): Promise<ApiResponse<void>>;
  
  // Earnings
  getEarnings(publisherId: string, timeRange: [number, number]): Promise<ApiResponse<bigint>>;
  withdrawEarnings(publisherId: string, amount: bigint): Promise<ApiResponse<string>>;
  
  // Analytics
  getPublisherStats(publisherId: string): Promise<ApiResponse<any>>;
  getSitePerformance(siteId: string): Promise<ApiResponse<any>>;
}

// ============================================
// Influencer Service Contract (Plan 8)
// ============================================

export interface IInfluencerService {
  // Influencer management
  registerInfluencer(email: string): Promise<ApiResponse<Influencer>>;
  updateInfluencer(influencerId: string, updates: Partial<Influencer>): Promise<ApiResponse<Influencer>>;
  
  // Link management
  generateLink(influencerId: string, productId: string): Promise<ApiResponse<{
    url: string;
    code: string;
    qrCode: string;
  }>>;
  getLinks(influencerId: string): Promise<ApiResponse<any[]>>;
  
  // Tier management
  stakeTier(influencerId: string, amount: bigint): Promise<ApiResponse<void>>;
  checkTierRequirements(influencerId: string): Promise<ApiResponse<{
    currentTier: string;
    nextTier?: string;
    requirements?: any;
  }>>;
  
  // Attribution
  recordClick(linkId: string, metadata?: any): Promise<ApiResponse<void>>;
  recordConversion(linkId: string, value?: number): Promise<ApiResponse<void>>;
  
  // Earnings
  getEarnings(influencerId: string): Promise<ApiResponse<{
    total: bigint;
    byProduct: Record<string, bigint>;
    pending: bigint;
  }>>;
  withdrawEarnings(influencerId: string, amount: bigint): Promise<ApiResponse<string>>;
}

// ============================================
// NFT Service Contract (Plan 12)
// ============================================

export interface INFTService {
  // Achievement management
  createAchievement(achievement: Omit<AchievementNFT, 'mintAddress' | 'holders'>): Promise<ApiResponse<AchievementNFT>>;
  getAchievements(): Promise<ApiResponse<AchievementNFT[]>>;
  
  // Progress tracking
  updateProgress(userId: string, achievementId: string, progress: number): Promise<ApiResponse<void>>;
  checkAchievement(userId: string, achievementId: string): Promise<ApiResponse<boolean>>;
  
  // Minting
  mintAchievement(userId: string, achievementId: string): Promise<ApiResponse<{
    mintAddress: PublicKey;
    transactionId: string;
  }>>;
  
  // User achievements
  getUserAchievements(userId: string): Promise<ApiResponse<any[]>>;
  getAchievementHolders(achievementId: string): Promise<PaginatedResponse<string>>;
}

// ============================================
// Analytics Service Contract (Plan 10)
// ============================================

export interface IAnalyticsService {
  // Event ingestion
  ingestEvent(event: TwistEvent): Promise<ApiResponse<void>>;
  batchIngestEvents(events: TwistEvent[]): Promise<ApiResponse<void>>;
  
  // Real-time queries
  getRealtimeMetrics(): Promise<ApiResponse<any>>;
  getActiveUsers(timeWindow: number): Promise<ApiResponse<number>>;
  
  // Historical queries
  getMetrics(timeRange: [number, number], granularity: 'hour' | 'day' | 'week'): Promise<ApiResponse<any[]>>;
  getCohortAnalysis(cohort: string, metric: string): Promise<ApiResponse<any>>;
  getFunnelAnalysis(steps: string[]): Promise<ApiResponse<any>>;
  
  // Custom queries
  executeQuery(query: string, params?: any): Promise<ApiResponse<any>>;
  
  // Exports
  exportData(query: string, format: 'json' | 'csv' | 'parquet'): Promise<ApiResponse<string>>;
}

// ============================================
// Edge Worker Message Bus Contract (Plan 2)
// ============================================

export interface IMessageBus {
  // Publishing
  publish(topic: string, message: any): Promise<void>;
  publishBatch(messages: Array<{topic: string, message: any}>): Promise<void>;
  
  // Subscribing
  subscribe(topic: string, handler: (message: any) => Promise<void>): void;
  unsubscribe(topic: string, handler: Function): void;
  
  // Request/Response
  request(topic: string, message: any, timeout?: number): Promise<any>;
  
  // Topics
  readonly topics: {
    VAU_SUBMITTED: 'vau.submitted';
    TOKEN_EARNED: 'token.earned';
    CAMPAIGN_EVENT: 'campaign.event';
    USER_ACTION: 'user.action';
    ACHIEVEMENT_PROGRESS: 'achievement.progress';
    FRAUD_DETECTED: 'fraud.detected';
  };
}

// ============================================
// Shared Service Interfaces
// ============================================

export interface IHealthCheck {
  checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    version: string;
    uptime: number;
    checks: Record<string, boolean>;
  }>;
}

export interface IMetricsExporter {
  exportMetrics(): Promise<{
    [metric: string]: number | string;
  }>;
}

export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  flush(pattern?: string): Promise<void>;
}

export interface IQueueService {
  enqueue(queue: string, message: any, options?: {
    delay?: number;
    priority?: number;
  }): Promise<string>;
  
  dequeue(queue: string, count?: number): Promise<any[]>;
  
  acknowledge(queue: string, messageId: string): Promise<void>;
  
  getQueueStats(queue: string): Promise<{
    size: number;
    processing: number;
    failed: number;
  }>;
}

// ============================================
// Service Registry (For Dependency Injection)
// ============================================

export interface IServiceRegistry {
  // Service registration
  register<T>(name: string, service: T): void;
  registerSingleton<T>(name: string, factory: () => T): void;
  
  // Service resolution
  resolve<T>(name: string): T;
  resolveAll<T>(tag: string): T[];
  
  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}

// ============================================
// Error Types
// ============================================

export class TwistError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'TwistError';
  }
}

export class ValidationError extends TwistError {
  constructor(message: string, details?: any) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class AuthenticationError extends TwistError {
  constructor(message: string = 'Authentication required') {
    super('AUTHENTICATION_ERROR', message, 401);
  }
}

export class AuthorizationError extends TwistError {
  constructor(message: string = 'Insufficient permissions') {
    super('AUTHORIZATION_ERROR', message, 403);
  }
}

export class NotFoundError extends TwistError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found`, 404);
  }
}

export class RateLimitError extends TwistError {
  constructor(resetAt: number) {
    super('RATE_LIMIT_EXCEEDED', 'Rate limit exceeded', 429, { resetAt });
  }
}

export class ConflictError extends TwistError {
  constructor(message: string, details?: any) {
    super('CONFLICT', message, 409, details);
  }
}

// Export all contracts
export type * from './api-contracts';