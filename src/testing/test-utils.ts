/**
 * TWIST Platform Test Utilities
 * 
 * Shared testing utilities, mock data generators, and test helpers
 * to ensure consistent testing across all teams.
 * 
 * Version: 1.0.0
 */

import { 
  UserIdentity,
  DeviceInfo,
  Campaign,
  Publisher,
  Influencer,
  VAU,
  TrackedAction,
  Platform,
  StandardAction,
  InfluencerTier,
  PublisherStatus,
  CampaignStatus,
  AchievementNFT,
  PublicKey
} from '../types/core';
import { faker } from '@faker-js/faker';
import { Keypair } from '@solana/web3.js';

// ============================================
// Mock Data Generators
// ============================================

export class MockDataGenerator {
  private static seed = 12345;
  
  static setSeed(seed: number) {
    this.seed = seed;
    faker.seed(seed);
  }

  static publicKey(): PublicKey {
    return Keypair.generate().publicKey;
  }

  static email(): string {
    return faker.internet.email().toLowerCase();
  }

  static emailHash(): string {
    return faker.string.hexadecimal({ length: 64, casing: 'lower', prefix: '' });
  }

  static apiKey(): string {
    return `twist_pk_${faker.string.alphanumeric(32)}`;
  }

  static productId(): string {
    return faker.helpers.slugify(faker.company.name()).toLowerCase();
  }

  static influencerId(): string {
    return faker.internet.userName().toLowerCase().replace(/[^a-z0-9_]/g, '');
  }

  static promoCode(influencer: string, product: string): string {
    const year = new Date().getFullYear();
    return `TWIST-${influencer.toUpperCase()}-${product.toUpperCase()}-${year}`;
  }

  static deviceInfo(overrides?: Partial<DeviceInfo>): DeviceInfo {
    return {
      deviceId: faker.string.alphanumeric(32),
      attestationFormat: faker.helpers.arrayElement(['packed', 'tpm', 'android-key', 'apple', 'none']),
      trustScore: faker.number.int({ min: 0, max: 100 }),
      publicKeyCredential: faker.string.alphanumeric(128),
      lastUsed: Date.now() - faker.number.int({ min: 0, max: 86400000 }),
      dailyVauCount: faker.number.int({ min: 0, max: 1000 }),
      platform: faker.helpers.enumValue(Platform),
      ...overrides
    };
  }

  static userIdentity(overrides?: Partial<UserIdentity>): UserIdentity {
    const email = overrides?.email || this.email();
    return {
      email,
      emailHash: faker.string.hexadecimal({ length: 64, casing: 'lower', prefix: '' }),
      walletAddress: faker.datatype.boolean() ? this.publicKey() : undefined,
      devices: Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () => this.deviceInfo()),
      createdAt: Date.now() - faker.number.int({ min: 0, max: 31536000000 }),
      lastActive: Date.now() - faker.number.int({ min: 0, max: 86400000 }),
      ...overrides
    };
  }

  static vau(overrides?: Partial<VAU>): VAU {
    const earned = faker.number.int({ min: 1, max: 100 });
    return {
      id: faker.string.uuid(),
      userId: this.emailHash(),
      deviceId: faker.string.alphanumeric(32),
      siteId: this.productId(),
      timestamp: Date.now() - faker.number.int({ min: 0, max: 3600000 }),
      signature: faker.string.alphanumeric(128),
      earned,
      multiplier: faker.number.float({ min: 1, max: 3, precision: 0.1 }),
      ...overrides
    };
  }

  static trackedAction(overrides?: Partial<TrackedAction>): TrackedAction {
    return {
      action: faker.helpers.enumValue(StandardAction),
      metadata: {
        value: faker.number.int({ min: 10, max: 1000 }),
        item: faker.commerce.product()
      },
      email: faker.datatype.boolean() ? this.email() : undefined,
      timestamp: Date.now(),
      sessionId: faker.string.uuid(),
      platform: faker.helpers.enumValue(Platform),
      ...overrides
    };
  }

  static campaign(overrides?: Partial<Campaign>): Campaign {
    const budgetUsdc = faker.number.int({ min: 1000, max: 100000 });
    const spent = faker.number.int({ min: 0, max: budgetUsdc });
    
    return {
      id: faker.string.uuid(),
      advertiserId: faker.string.uuid(),
      name: faker.company.catchPhrase(),
      budgetUsdc,
      budgetRemaining: budgetUsdc - spent,
      targeting: {
        bloomFilter: faker.string.alphanumeric(256),
        geoTargets: ['US', 'CA', 'GB'],
        deviceTypes: [Platform.WEB, Platform.IOS]
      },
      attribution: {
        windowSeconds: 1800,
        model: 'last_click',
        influencerSplit: 0.2
      },
      creatives: Array.from({ length: 3 }, () => ({
        id: faker.string.uuid(),
        campaignId: '',
        type: 'image' as const,
        url: faker.image.url(),
        metadata: {}
      })),
      status: faker.helpers.enumValue(CampaignStatus),
      metrics: {
        impressions: faker.number.int({ min: 10000, max: 1000000 }),
        clicks: faker.number.int({ min: 100, max: 10000 }),
        conversions: faker.number.int({ min: 10, max: 1000 }),
        spend: spent,
        ctr: faker.number.float({ min: 0.001, max: 0.05 }),
        cvr: faker.number.float({ min: 0.001, max: 0.1 }),
        cpa: spent / (faker.number.int({ min: 1, max: 100 }) || 1),
        roi: faker.number.float({ min: -0.5, max: 5 })
      },
      ...overrides
    };
  }

  static publisher(overrides?: Partial<Publisher>): Publisher {
    return {
      siteId: faker.string.uuid(),
      domain: faker.internet.url(),
      email: this.email(),
      bondingAmount: BigInt(faker.number.int({ min: 0, max: 100000 })),
      earningMultiplier: faker.datatype.boolean() ? 10 : 1,
      status: faker.helpers.enumValue(PublisherStatus),
      metrics: {
        vauCount: faker.number.int({ min: 1000, max: 1000000 }),
        uniqueUsers: faker.number.int({ min: 100, max: 10000 }),
        earnings: BigInt(faker.number.int({ min: 1000, max: 100000 })),
        rpm: faker.number.float({ min: 0.1, max: 10 }),
        avgSessionTime: faker.number.int({ min: 30, max: 600 }),
        bounceRate: faker.number.float({ min: 0.2, max: 0.8 })
      },
      ...overrides
    };
  }

  static influencer(overrides?: Partial<Influencer>): Influencer {
    const tier = faker.helpers.enumValue(InfluencerTier);
    const tierMultipliers = {
      [InfluencerTier.BRONZE]: 1.0,
      [InfluencerTier.SILVER]: 1.2,
      [InfluencerTier.GOLD]: 1.5,
      [InfluencerTier.PLATINUM]: 2.0
    };

    return {
      id: this.influencerId(),
      email: this.email(),
      tier,
      stakedAmount: BigInt(faker.number.int({ min: 100, max: 100000 })),
      totalConversions: faker.number.int({ min: 0, max: 10000 }),
      totalEarned: BigInt(faker.number.int({ min: 1000, max: 1000000 })),
      multiplier: tierMultipliers[tier],
      links: Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => ({
        productId: this.productId(),
        linkUrl: `twist.to/p/${this.productId()}/ref/${this.influencerId()}`,
        promoCode: this.promoCode(this.influencerId(), this.productId()),
        clicks: faker.number.int({ min: 0, max: 10000 }),
        conversions: faker.number.int({ min: 0, max: 1000 }),
        earned: BigInt(faker.number.int({ min: 0, max: 100000 }))
      })),
      ...overrides
    };
  }

  static achievement(overrides?: Partial<AchievementNFT>): AchievementNFT {
    return {
      mintAddress: this.publicKey(),
      achievementId: faker.helpers.slugify(faker.company.buzzPhrase()),
      name: faker.company.buzzPhrase(),
      description: faker.lorem.sentence(),
      imageUrl: faker.image.url(),
      multiplier: faker.number.float({ min: 1.1, max: 3.0, precision: 0.1 }),
      requirements: [
        {
          type: 'action_count',
          action: StandardAction.PURCHASE,
          count: faker.number.int({ min: 5, max: 50 })
        }
      ],
      holders: faker.number.int({ min: 0, max: 10000 }),
      ...overrides
    };
  }

  static batchData<T>(generator: () => T, count: number): T[] {
    return Array.from({ length: count }, generator);
  }
}

// ============================================
// Test Helpers
// ============================================

export class TestHelpers {
  /**
   * Wait for a condition to be true
   */
  static async waitFor(
    condition: () => boolean | Promise<boolean>,
    timeout = 5000,
    interval = 100
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Timeout waiting for condition after ${timeout}ms`);
  }

  /**
   * Retry a function until it succeeds
   */
  static async retry<T>(
    fn: () => Promise<T>,
    maxAttempts = 3,
    delay = 1000
  ): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Create a test timeout
   */
  static timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Test timeout after ${ms}ms`)), ms);
    });
  }

  /**
   * Mock time functions
   */
  static mockTime() {
    let currentTime = Date.now();
    
    const originalDateNow = Date.now;
    const originalSetTimeout = global.setTimeout;
    const originalSetInterval = global.setInterval;
    
    const timers: Array<{
      callback: Function;
      time: number;
      interval?: number;
    }> = [];

    Date.now = () => currentTime;
    
    (global as any).setTimeout = (callback: Function, delay: number) => {
      timers.push({ callback, time: currentTime + delay });
      return timers.length - 1;
    };
    
    (global as any).setInterval = (callback: Function, interval: number) => {
      timers.push({ callback, time: currentTime + interval, interval });
      return timers.length - 1;
    };

    return {
      advance(ms: number) {
        currentTime += ms;
        
        const toExecute = timers.filter(t => t.time <= currentTime);
        toExecute.forEach(timer => {
          timer.callback();
          if (timer.interval) {
            timer.time = currentTime + timer.interval;
          } else {
            const index = timers.indexOf(timer);
            if (index > -1) timers.splice(index, 1);
          }
        });
      },
      
      restore() {
        Date.now = originalDateNow;
        global.setTimeout = originalSetTimeout;
        global.setInterval = originalSetInterval;
      }
    };
  }

  /**
   * Create a test message bus
   */
  static createMockMessageBus() {
    const handlers = new Map<string, Set<Function>>();
    const messages: Array<{ topic: string; message: any }> = [];

    return {
      async publish(topic: string, message: any) {
        messages.push({ topic, message });
        
        const topicHandlers = handlers.get(topic);
        if (topicHandlers) {
          for (const handler of topicHandlers) {
            await handler(message);
          }
        }
      },

      subscribe(topic: string, handler: Function) {
        if (!handlers.has(topic)) {
          handlers.set(topic, new Set());
        }
        handlers.get(topic)!.add(handler);
      },

      unsubscribe(topic: string, handler: Function) {
        handlers.get(topic)?.delete(handler);
      },

      getMessages(topic?: string) {
        return topic 
          ? messages.filter(m => m.topic === topic)
          : messages;
      },

      clear() {
        messages.length = 0;
      }
    };
  }

  /**
   * Create rate limit test helper
   */
  static createRateLimitTester(limit: number, window: number) {
    const attempts: number[] = [];

    return {
      attempt(): boolean {
        const now = Date.now();
        const windowStart = now - window;
        
        // Remove old attempts
        while (attempts.length > 0 && attempts[0] < windowStart) {
          attempts.shift();
        }

        if (attempts.length >= limit) {
          return false;
        }

        attempts.push(now);
        return true;
      },

      reset() {
        attempts.length = 0;
      },

      getRemaining() {
        const now = Date.now();
        const windowStart = now - window;
        const validAttempts = attempts.filter(t => t >= windowStart);
        return Math.max(0, limit - validAttempts.length);
      }
    };
  }
}

// ============================================
// Test Fixtures
// ============================================

export class TestFixtures {
  static readonly VALID_EMAILS = [
    'user@example.com',
    'test.user+tag@domain.co.uk',
    'admin@twist.io'
  ];

  static readonly INVALID_EMAILS = [
    'notanemail',
    '@example.com',
    'user@',
    'user @example.com',
    'user@example .com'
  ];

  static readonly VALID_API_KEYS = [
    'twist_pk_abcdef1234567890abcdef1234567890',
    'twist_pk_00000000000000000000000000000000',
    'twist_pk_ffffffffffffffffffffffffffffffff'
  ];

  static readonly INVALID_API_KEYS = [
    'invalid_key',
    'twist_sk_abcdef1234567890abcdef1234567890',
    'twist_pk_short',
    'twist_pk_toolongabcdef1234567890abcdef1234567890'
  ];

  static readonly PLATFORMS = Object.values(Platform);
  static readonly ACTIONS = Object.values(StandardAction);
  static readonly TIERS = Object.values(InfluencerTier);

  static readonly TEST_WALLETS = [
    'So11111111111111111111111111111111111111112',
    '2kYU5BdJnVRRXRfxKaWcMBbSPCJLuLZGKoFvUMooG6vZ',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  ];
}

// ============================================
// Integration Test Helpers
// ============================================

export class IntegrationTestHelpers {
  /**
   * Setup test database
   */
  static async setupTestDatabase() {
    // Implementation depends on database choice
    return {
      async cleanup() {
        // Cleanup logic
      }
    };
  }

  /**
   * Create test Solana connection
   */
  static async createTestSolanaConnection() {
    // Use Solana test validator
    return {
      connection: null, // Actual connection
      async cleanup() {
        // Stop validator
      }
    };
  }

  /**
   * Create test edge worker environment
   */
  static createTestEdgeEnvironment() {
    return {
      KV: new Map(),
      DURABLE_OBJECTS: new Map(),
      env: {
        API_KEY: 'test_key',
        SOLANA_RPC: 'http://localhost:8899'
      }
    };
  }
}

// Export everything
export * from './test-utils';