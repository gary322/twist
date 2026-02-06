import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { io, Socket } from 'socket.io-client';
import axios, { AxiosInstance } from 'axios';
import * as anchor from '@project-serum/anchor';

// Test configuration
const TEST_CONFIG = {
  SOLANA_RPC: process.env.TEST_SOLANA_RPC || 'http://localhost:8899',
  API_URL: process.env.TEST_API_URL || 'http://localhost:3000',
  WS_URL: process.env.TEST_WS_URL || 'http://localhost:3000',
  SUPABASE_URL: process.env.TEST_SUPABASE_URL || 'http://localhost:54321',
  SUPABASE_KEY: process.env.TEST_SUPABASE_KEY || 'test-anon-key',
  REDIS_URL: process.env.TEST_REDIS_URL || 'redis://localhost:6379',
};

// Test utilities
class TestContext {
  connection: Connection;
  provider: anchor.AnchorProvider;
  supabase: any;
  redis: Redis;
  api: AxiosInstance;
  ws: Socket | null = null;
  
  // Test accounts
  influencer: Keypair;
  staker1: Keypair;
  staker2: Keypair;
  poolAddress?: PublicKey;
  
  // Test data
  influencerId?: string;
  stakerId1?: string;
  stakerId2?: string;
  authToken?: string;

  constructor() {
    this.connection = new Connection(TEST_CONFIG.SOLANA_RPC, 'confirmed');
    this.provider = new anchor.AnchorProvider(
      this.connection,
      new anchor.Wallet(Keypair.generate()),
      { commitment: 'confirmed' }
    );
    
    this.supabase = createClient(TEST_CONFIG.SUPABASE_URL, TEST_CONFIG.SUPABASE_KEY);
    this.redis = new Redis(TEST_CONFIG.REDIS_URL);
    this.api = axios.create({
      baseURL: TEST_CONFIG.API_URL,
      timeout: 30000,
    });

    // Initialize test accounts
    this.influencer = Keypair.generate();
    this.staker1 = Keypair.generate();
    this.staker2 = Keypair.generate();
  }

  async setup() {
    // Fund test accounts
    await Promise.all([
      this.connection.requestAirdrop(this.influencer.publicKey, 10 * LAMPORTS_PER_SOL),
      this.connection.requestAirdrop(this.staker1.publicKey, 10 * LAMPORTS_PER_SOL),
      this.connection.requestAirdrop(this.staker2.publicKey, 10 * LAMPORTS_PER_SOL),
    ]);

    // Wait for airdrops to confirm
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create test users in database
    await this.createTestUsers();
    
    // Authenticate
    await this.authenticate();
    
    // Setup WebSocket connection
    this.setupWebSocket();
  }

  async createTestUsers() {
    // Create influencer
    const { data: influencer } = await this.supabase.auth.signUp({
      email: `influencer-${Date.now()}@test.com`,
      password: 'test123456',
    });
    this.influencerId = influencer.user?.id;

    // Create stakers
    const { data: staker1 } = await this.supabase.auth.signUp({
      email: `staker1-${Date.now()}@test.com`,
      password: 'test123456',
    });
    this.stakerId1 = staker1.user?.id;

    const { data: staker2 } = await this.supabase.auth.signUp({
      email: `staker2-${Date.now()}@test.com`,
      password: 'test123456',
    });
    this.stakerId2 = staker2.user?.id;
  }

  async authenticate() {
    const { data } = await this.api.post('/api/auth/login', {
      email: `influencer-${this.influencerId}@test.com`,
      password: 'test123456',
    });
    
    this.authToken = data.token;
    this.api.defaults.headers.common['Authorization'] = `Bearer ${this.authToken}`;
  }

  setupWebSocket() {
    this.ws = io(TEST_CONFIG.WS_URL, {
      auth: { token: this.authToken },
      transports: ['websocket'],
    });
  }

  async cleanup() {
    await this.redis.flushdb();
    this.ws?.disconnect();
    await this.redis.quit();
  }
}

describe('Influencer System E2E Tests', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = new TestContext();
    await ctx.setup();
  }, 30000);

  afterAll(async () => {
    await ctx.cleanup();
  });

  describe('1. Influencer Registration and Setup', () => {
    it('should register as an influencer', async () => {
      const response = await ctx.api.post('/api/influencers/register', {
        username: `testinfluencer${Date.now()}`,
        displayName: 'Test Influencer',
        bio: 'Test bio for integration testing',
        categories: ['tech', 'crypto'],
        socialLinks: {
          twitter: 'https://twitter.com/test',
          instagram: 'https://instagram.com/test',
        },
      });

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('id');
      expect(response.data.tier).toBe('BRONZE');
      expect(response.data.verified).toBe(false);
    });

    it('should create a staking pool for the influencer', async () => {
      const response = await ctx.api.post('/api/staking/pools/create', {
        influencerId: ctx.influencerId,
        revenueShareBps: 2000, // 20%
        minStake: '1000000000', // 1 TWIST
      });

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('poolAddress');
      ctx.poolAddress = new PublicKey(response.data.poolAddress);
    });

    it('should generate custom referral links', async () => {
      const response = await ctx.api.post('/api/links/generate', {
        productId: 'test-product-1',
        customUrl: 'summer-sale',
        promoCode: 'SUMMER20',
        expiresIn: '30d',
      });

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('linkCode');
      expect(response.data).toHaveProperty('qrCodeUrl');
      expect(response.data.isActive).toBe(true);
    });
  });

  describe('2. Staking Operations', () => {
    let wsEvents: any[] = [];

    beforeEach(() => {
      wsEvents = [];
      ctx.ws?.on('staking:new_stake', (data) => wsEvents.push({ type: 'new_stake', data }));
      ctx.ws?.on('staking:stats', (data) => wsEvents.push({ type: 'stats', data }));
    });

    it('should allow users to stake on influencer', async () => {
      // Subscribe to staking updates
      ctx.ws?.emit('subscribe:staking', { influencerId: ctx.influencerId });

      // Perform stake
      const stakeAmount = '10000000000'; // 10 TWIST
      const response = await ctx.api.post('/api/staking/stake', {
        influencerId: ctx.influencerId,
        amount: stakeAmount,
        wallet: ctx.staker1.publicKey.toBase58(),
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data).toHaveProperty('transactionId');

      // Wait for WebSocket events
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify WebSocket events were received
      expect(wsEvents.some(e => e.type === 'new_stake')).toBe(true);
      expect(wsEvents.some(e => e.type === 'stats')).toBe(true);
    });

    it('should update influencer tier based on total staked', async () => {
      // Stake large amount to trigger tier upgrade
      const largeStake = '1100000000000'; // 1100 TWIST (Silver tier threshold)
      
      await ctx.api.post('/api/staking/stake', {
        influencerId: ctx.influencerId,
        amount: largeStake,
        wallet: ctx.staker2.publicKey.toBase58(),
      });

      // Check influencer tier
      const { data: influencer } = await ctx.api.get(`/api/influencers/${ctx.influencerId}`);
      expect(influencer.tier).toBe('SILVER');
    });

    it('should calculate and distribute rewards', async () => {
      // Simulate earning from conversions
      const earnings = '5000000000'; // 5 TWIST earned
      
      const response = await ctx.api.post('/api/staking/distribute-rewards', {
        poolAddress: ctx.poolAddress?.toBase58(),
        amount: earnings,
      });

      expect(response.status).toBe(200);
      
      // Check pending rewards for stakers
      const { data: stakes } = await ctx.api.get('/api/staking/user/stakes');
      expect(stakes.length).toBeGreaterThan(0);
      expect(stakes[0].stake.pendingRewards).not.toBe('0');
    });

    it('should allow claiming rewards', async () => {
      const response = await ctx.api.post('/api/staking/claim', {
        influencerId: ctx.influencerId,
        wallet: ctx.staker1.publicKey.toBase58(),
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data).toHaveProperty('claimedAmount');
    });
  });

  describe('3. Content Management and Analytics', () => {
    let contentId: string;
    let campaignId: string;

    it('should create a marketing campaign', async () => {
      const response = await ctx.api.post('/api/campaigns', {
        name: 'Summer Sale Campaign',
        description: 'Test campaign for summer products',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        products: ['product1', 'product2'],
        goals: {
          views: 10000,
          conversions: 100,
          revenue: '1000000',
        },
      });

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('id');
      campaignId = response.data.id;
    });

    it('should create and publish content', async () => {
      const response = await ctx.api.post('/api/content', {
        type: 'image',
        title: 'Summer Sale Banner',
        description: 'Get 20% off all summer products',
        tags: ['summer', 'sale', 'discount'],
        platforms: ['instagram', 'twitter'],
        campaign: campaignId,
        status: 'published',
      });

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('id');
      contentId = response.data.id;
    });

    it('should track content views and conversions', async () => {
      // Subscribe to content updates
      ctx.ws?.emit('subscribe:content', { contentId });

      // Simulate view
      await ctx.api.post(`/api/content/${contentId}/view`, {
        viewerIp: '192.168.1.1',
        referrer: 'https://instagram.com',
      });

      // Simulate conversion
      await ctx.api.post(`/api/content/${contentId}/conversion`, {
        productId: 'product1',
        amount: '50000000', // 50 TWIST
        userId: ctx.stakerId1,
      });

      // Get content analytics
      const { data: analytics } = await ctx.api.get(`/api/analytics/content/${contentId}`);
      expect(analytics.views).toBeGreaterThan(0);
      expect(analytics.conversions).toBeGreaterThan(0);
      expect(analytics.revenue).not.toBe('0');
    });
  });

  describe('4. Push Notifications', () => {
    it('should subscribe to push notifications', async () => {
      const subscription = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
        keys: {
          p256dh: 'test-p256dh-key',
          auth: 'test-auth-key',
        },
        platform: 'web' as const,
      };

      const response = await ctx.api.post('/api/notifications/subscribe', subscription);
      expect(response.status).toBe(200);
    });

    it('should send test notification', async () => {
      const response = await ctx.api.post('/api/notifications/test', {
        type: 'staking',
      });

      expect(response.status).toBe(200);
      expect(response.data.sent).toBeGreaterThan(0);
    });

    it('should update notification preferences', async () => {
      const preferences = {
        pushEnabled: true,
        enabledTypes: {
          staking: true,
          rewards: true,
          content: false,
          system: true,
          marketing: false,
        },
        quietHours: {
          enabled: true,
          start: '22:00',
          end: '08:00',
        },
      };

      const response = await ctx.api.put('/api/notifications/preferences', preferences);
      expect(response.status).toBe(200);
    });
  });

  describe('5. Search and Discovery', () => {
    it('should search influencers by various criteria', async () => {
      // Search by name
      const nameSearch = await ctx.api.get('/api/staking/search', {
        params: { query: 'test', sortBy: 'totalStaked' },
      });
      expect(nameSearch.status).toBe(200);
      expect(Array.isArray(nameSearch.data)).toBe(true);

      // Filter by tier
      const tierFilter = await ctx.api.get('/api/staking/search', {
        params: { 'filters[tiers]': ['SILVER', 'GOLD'] },
      });
      expect(tierFilter.status).toBe(200);

      // Filter by minimum APY
      const apyFilter = await ctx.api.get('/api/staking/search', {
        params: { 'filters[minApy]': 10, sortBy: 'apy' },
      });
      expect(apyFilter.status).toBe(200);
    });

    it('should get trending influencers', async () => {
      const response = await ctx.api.get('/api/staking/trending');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });
  });

  describe('6. Browser Extension Integration', () => {
    it('should search influencers via extension API', async () => {
      const response = await ctx.api.get('/api/extension/search-influencers', {
        params: { query: 'crypto', limit: 5 },
      });

      expect(response.status).toBe(200);
      expect(response.data.length).toBeLessThanOrEqual(5);
    });

    it('should get user portfolio for extension', async () => {
      const response = await ctx.api.get('/api/extension/portfolio');
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('stakes');
      expect(response.data).toHaveProperty('totalValue');
      expect(response.data).toHaveProperty('pendingRewards');
    });
  });

  describe('7. Deep Linking', () => {
    it('should generate shareable deeplinks', async () => {
      const response = await ctx.api.post('/api/deeplinks/generate', {
        type: 'stake',
        id: ctx.influencerId,
        params: {
          utm_source: 'test',
          utm_campaign: 'e2e-test',
        },
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('url');
      expect(response.data).toHaveProperty('shortUrl');
    });

    it('should track deeplink clicks', async () => {
      const { data: deeplink } = await ctx.api.post('/api/deeplinks/generate', {
        type: 'referral',
        id: ctx.influencerId,
      });

      // Simulate click
      await ctx.api.post('/api/deeplinks/track', {
        shortUrl: deeplink.shortUrl,
        userAgent: 'test-agent',
        ip: '192.168.1.1',
      });

      // Get analytics
      const { data: analytics } = await ctx.api.get(`/api/deeplinks/${deeplink.id}/analytics`);
      expect(analytics.clicks).toBeGreaterThan(0);
    });
  });

  describe('8. Payout System', () => {
    it('should calculate influencer earnings', async () => {
      const response = await ctx.api.get('/api/payouts/balance');
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('available');
      expect(response.data).toHaveProperty('pending');
      expect(response.data).toHaveProperty('lifetime');
    });

    it('should request payout', async () => {
      const response = await ctx.api.post('/api/payouts/request', {
        amount: '100000000', // 100 TWIST
        method: 'wallet',
        walletAddress: ctx.influencer.publicKey.toBase58(),
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('payoutId');
      expect(response.data.status).toBe('pending');
    });

    it('should get payout history', async () => {
      const response = await ctx.api.get('/api/payouts/history');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });
  });

  describe('9. Performance and Caching', () => {
    it('should cache frequently accessed data', async () => {
      // First request - should hit database
      const start1 = Date.now();
      await ctx.api.get(`/api/influencers/${ctx.influencerId}`);
      const time1 = Date.now() - start1;

      // Second request - should hit cache
      const start2 = Date.now();
      await ctx.api.get(`/api/influencers/${ctx.influencerId}`);
      const time2 = Date.now() - start2;

      // Cache should be significantly faster
      expect(time2).toBeLessThan(time1 / 2);
    });

    it('should invalidate cache on updates', async () => {
      // Get initial data
      const { data: initial } = await ctx.api.get(`/api/influencers/${ctx.influencerId}`);

      // Update profile
      await ctx.api.patch(`/api/influencers/${ctx.influencerId}`, {
        bio: 'Updated bio for cache test',
      });

      // Get updated data
      const { data: updated } = await ctx.api.get(`/api/influencers/${ctx.influencerId}`);
      
      expect(updated.bio).not.toBe(initial.bio);
      expect(updated.bio).toBe('Updated bio for cache test');
    });
  });

  describe('10. Error Handling and Edge Cases', () => {
    it('should handle insufficient balance for staking', async () => {
      try {
        await ctx.api.post('/api/staking/stake', {
          influencerId: ctx.influencerId,
          amount: '999999999999999', // Very large amount
          wallet: ctx.staker1.publicKey.toBase58(),
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toContain('Insufficient balance');
      }
    });

    it('should handle invalid influencer ID', async () => {
      try {
        await ctx.api.get('/api/influencers/invalid-id');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
      }
    });

    it('should handle concurrent stake operations', async () => {
      const stakeAmount = '1000000000'; // 1 TWIST
      
      // Execute multiple stakes concurrently
      const promises = Array(5).fill(null).map(() =>
        ctx.api.post('/api/staking/stake', {
          influencerId: ctx.influencerId,
          amount: stakeAmount,
          wallet: ctx.staker1.publicKey.toBase58(),
        })
      );

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      expect(successful).toBeGreaterThan(0);
    });

    it('should handle rate limiting', async () => {
      // Make many requests quickly
      const promises = Array(20).fill(null).map(() =>
        ctx.api.get('/api/influencers/search')
      );

      try {
        await Promise.all(promises);
      } catch (error: any) {
        expect(error.response.status).toBe(429);
        expect(error.response.data.error).toContain('rate limit');
      }
    });
  });
});