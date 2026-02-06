/**
 * TWIST Platform Message Formats
 * 
 * Standardized message formats for all inter-service communication.
 * These ensure consistency across Kafka, RabbitMQ, or any message bus.
 * 
 * Version: 1.0.0
 */

import { 
  Platform, 
  StandardAction, 
  EventType,
  PublicKey,
  InfluencerTier,
  CampaignStatus
} from '../types/core';

// ============================================
// Base Message Format
// ============================================

export interface BaseMessage {
  messageId: string; // UUID
  correlationId?: string; // For request/response patterns
  timestamp: number;
  version: '1.0.0';
  source: string; // Service name
  retryCount?: number;
  metadata?: Record<string, any>;
}

// ============================================
// VAU Messages (Plan 2 -> Plan 1)
// ============================================

export interface VAUProcessedMessage extends BaseMessage {
  type: 'vau.processed';
  payload: {
    vauId: string;
    userId: string; // Email hash
    deviceId: string;
    siteId: string;
    earned: number;
    multiplier: number;
    wallet?: PublicKey;
    attestationValid: boolean;
    trustScore: number;
  };
}

export interface VAUBatchMessage extends BaseMessage {
  type: 'vau.batch';
  payload: {
    vaus: Array<{
      vauId: string;
      userId: string;
      earned: number;
    }>;
    totalEarned: number;
  };
}

// ============================================
// Token Messages (Plan 1 -> Others)
// ============================================

export interface TokenEarnedMessage extends BaseMessage {
  type: 'token.earned';
  payload: {
    wallet: PublicKey;
    amount: string; // BigInt as string
    action: StandardAction | string;
    source: 'vau' | 'campaign' | 'referral' | 'achievement';
    campaignId?: string;
    influencerId?: string;
    multiplier: number;
    transactionId?: string;
  };
}

export interface TokenStakedMessage extends BaseMessage {
  type: 'token.staked';
  payload: {
    wallet: PublicKey;
    amount: string;
    duration: number;
    apy: number;
    unlockTime: number;
    transactionId: string;
  };
}

export interface TokenDecayedMessage extends BaseMessage {
  type: 'token.decayed';
  payload: {
    totalDecayed: string;
    floorTreasuryAdded: string;
    explorerPotAdded: string;
    timestamp: number;
  };
}

// ============================================
// User Action Messages (Plan 4 -> Others)
// ============================================

export interface UserActionMessage extends BaseMessage {
  type: 'user.action';
  payload: {
    userId: string; // Email hash
    email?: string; // Only in internal messages
    action: StandardAction | string;
    platform: Platform;
    productId: string;
    metadata: Record<string, any>;
    sessionId: string;
    attribution?: {
      campaignId?: string;
      influencerId?: string;
      source: string;
      medium: string;
    };
  };
}

export interface UserIdentifiedMessage extends BaseMessage {
  type: 'user.identified';
  payload: {
    userId: string;
    email: string;
    wallet?: PublicKey;
    platform: Platform;
    productId: string;
    firstSeen: boolean;
  };
}

// ============================================
// Campaign Messages (Plan 7 -> Others)
// ============================================

export interface CampaignEventMessage extends BaseMessage {
  type: 'campaign.event';
  payload: {
    campaignId: string;
    eventType: 'impression' | 'click' | 'conversion';
    userId: string;
    value?: number;
    cost: number; // In USDC
    attribution: {
      touchpoints: Array<{
        timestamp: number;
        source: string;
      }>;
    };
  };
}

export interface CampaignBudgetMessage extends BaseMessage {
  type: 'campaign.budget';
  payload: {
    campaignId: string;
    event: 'depleted' | 'refilled' | 'low';
    remainingUsdc: number;
    threshold?: number;
  };
}

export interface CampaignStatusMessage extends BaseMessage {
  type: 'campaign.status';
  payload: {
    campaignId: string;
    oldStatus: CampaignStatus;
    newStatus: CampaignStatus;
    reason?: string;
  };
}

// ============================================
// Publisher Messages (Plan 6 -> Others)
// ============================================

export interface PublisherEarningMessage extends BaseMessage {
  type: 'publisher.earning';
  payload: {
    publisherId: string;
    siteId: string;
    vauCount: number;
    earned: string;
    multiplier: number;
    period: {
      start: number;
      end: number;
    };
  };
}

export interface PublisherBondingMessage extends BaseMessage {
  type: 'publisher.bonding';
  payload: {
    publisherId: string;
    event: 'bonded' | 'unbonded';
    amount: string;
    newMultiplier: number;
    transactionId: string;
  };
}

// ============================================
// Influencer Messages (Plan 8 -> Others)
// ============================================

export interface InfluencerConversionMessage extends BaseMessage {
  type: 'influencer.conversion';
  payload: {
    influencerId: string;
    productId: string;
    linkId: string;
    userId: string;
    value?: number;
    earned: string;
    tier: InfluencerTier;
    multiplier: number;
  };
}

export interface InfluencerTierMessage extends BaseMessage {
  type: 'influencer.tier';
  payload: {
    influencerId: string;
    oldTier: InfluencerTier;
    newTier: InfluencerTier;
    stakedAmount: string;
    totalConversions: number;
  };
}

// ============================================
// Achievement Messages (Plan 12 -> Others)
// ============================================

export interface AchievementProgressMessage extends BaseMessage {
  type: 'achievement.progress';
  payload: {
    userId: string;
    achievementId: string;
    currentProgress: number;
    targetProgress: number;
    action: StandardAction | string;
    increment: number;
  };
}

export interface AchievementUnlockedMessage extends BaseMessage {
  type: 'achievement.unlocked';
  payload: {
    userId: string;
    achievementId: string;
    nftMintAddress?: PublicKey;
    multiplier: number;
    rewardBonus?: string;
  };
}

// ============================================
// Analytics Messages (Plan 10)
// ============================================

export interface AnalyticsEventMessage extends BaseMessage {
  type: 'analytics.event';
  payload: {
    eventType: EventType;
    userId: string;
    platform: Platform;
    productId?: string;
    data: Record<string, any>;
    sessionId?: string;
    deviceId?: string;
  };
}

export interface MetricsSnapshotMessage extends BaseMessage {
  type: 'metrics.snapshot';
  payload: {
    period: 'minute' | 'hour' | 'day';
    metrics: {
      activeUsers: number;
      vauCount: number;
      tokensEarned: string;
      tokensDecayed: string;
      campaignSpend: number;
      publisherEarnings: string;
      influencerEarnings: string;
      nftsMinted: number;
    };
    timestamp: number;
  };
}

// ============================================
// System Messages
// ============================================

export interface SystemAlertMessage extends BaseMessage {
  type: 'system.alert';
  payload: {
    severity: 'info' | 'warning' | 'error' | 'critical';
    component: string;
    message: string;
    details?: Record<string, any>;
    actionRequired?: boolean;
  };
}

export interface FraudDetectedMessage extends BaseMessage {
  type: 'fraud.detected';
  payload: {
    userId?: string;
    deviceId?: string;
    ipAddress?: string;
    pattern: string;
    confidence: number;
    action: 'blocked' | 'flagged' | 'monitored';
    details: Record<string, any>;
  };
}

export interface HealthCheckMessage extends BaseMessage {
  type: 'health.check';
  payload: {
    service: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    checks: Record<string, boolean>;
    metrics?: Record<string, number>;
  };
}

// ============================================
// Request/Response Messages
// ============================================

export interface RequestMessage<T = any> extends BaseMessage {
  type: 'request';
  replyTo: string; // Topic/queue for response
  timeout?: number;
  payload: T;
}

export interface ResponseMessage<T = any> extends BaseMessage {
  type: 'response';
  success: boolean;
  payload?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// ============================================
// Message Type Guards
// ============================================

export function isVAUMessage(msg: BaseMessage): msg is VAUProcessedMessage | VAUBatchMessage {
  return msg.type === 'vau.processed' || msg.type === 'vau.batch';
}

export function isTokenMessage(msg: BaseMessage): msg is TokenEarnedMessage | TokenStakedMessage | TokenDecayedMessage {
  return msg.type.startsWith('token.');
}

export function isUserMessage(msg: BaseMessage): msg is UserActionMessage | UserIdentifiedMessage {
  return msg.type.startsWith('user.');
}

export function isCampaignMessage(msg: BaseMessage): msg is CampaignEventMessage | CampaignBudgetMessage | CampaignStatusMessage {
  return msg.type.startsWith('campaign.');
}

export function isRequestMessage(msg: BaseMessage): msg is RequestMessage {
  return msg.type === 'request';
}

export function isResponseMessage(msg: BaseMessage): msg is ResponseMessage {
  return msg.type === 'response';
}

// ============================================
// Message Factory
// ============================================

export class MessageFactory {
  private static generateId(): string {
    return crypto.randomUUID();
  }

  static createMessage<T extends BaseMessage>(
    type: T['type'],
    source: string,
    payload: T['payload'],
    options?: {
      correlationId?: string;
      metadata?: Record<string, any>;
    }
  ): T {
    return {
      messageId: this.generateId(),
      correlationId: options?.correlationId,
      timestamp: Date.now(),
      version: '1.0.0',
      source,
      type,
      payload,
      metadata: options?.metadata,
      retryCount: 0
    } as T;
  }

  static createRequest<T, R>(
    source: string,
    replyTo: string,
    payload: T,
    timeout = 30000
  ): RequestMessage<T> {
    return {
      messageId: this.generateId(),
      timestamp: Date.now(),
      version: '1.0.0',
      source,
      type: 'request',
      replyTo,
      timeout,
      payload
    };
  }

  static createResponse<T>(
    request: RequestMessage,
    source: string,
    payload?: T,
    error?: ResponseMessage['error']
  ): ResponseMessage<T> {
    return {
      messageId: this.generateId(),
      correlationId: request.messageId,
      timestamp: Date.now(),
      version: '1.0.0',
      source,
      type: 'response',
      success: !error,
      payload,
      error
    };
  }
}

// ============================================
// Message Topics/Queues
// ============================================

export const MESSAGE_TOPICS = {
  // VAU processing
  VAU_SUBMIT: 'vau.submit',
  VAU_PROCESS: 'vau.process',
  VAU_RESULT: 'vau.result',
  
  // Token operations
  TOKEN_EARN: 'token.earn',
  TOKEN_STAKE: 'token.stake',
  TOKEN_DECAY: 'token.decay',
  TOKEN_TRANSFER: 'token.transfer',
  
  // User events
  USER_ACTION: 'user.action',
  USER_IDENTIFY: 'user.identify',
  USER_PROGRESS: 'user.progress',
  
  // Campaign events
  CAMPAIGN_EVENT: 'campaign.event',
  CAMPAIGN_BUDGET: 'campaign.budget',
  CAMPAIGN_STATUS: 'campaign.status',
  
  // Publisher events
  PUBLISHER_EARN: 'publisher.earn',
  PUBLISHER_BOND: 'publisher.bond',
  
  // Influencer events
  INFLUENCER_CLICK: 'influencer.click',
  INFLUENCER_CONVERT: 'influencer.convert',
  INFLUENCER_TIER: 'influencer.tier',
  
  // Achievement events
  ACHIEVEMENT_PROGRESS: 'achievement.progress',
  ACHIEVEMENT_UNLOCK: 'achievement.unlock',
  
  // Analytics
  ANALYTICS_EVENT: 'analytics.event',
  METRICS_SNAPSHOT: 'metrics.snapshot',
  
  // System
  SYSTEM_ALERT: 'system.alert',
  FRAUD_DETECT: 'fraud.detect',
  HEALTH_CHECK: 'health.check'
} as const;

// Export all message types
export type * from './message-formats';