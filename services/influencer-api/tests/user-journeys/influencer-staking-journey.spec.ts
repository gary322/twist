import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { StakingService } from '../../src/services/staking.service';
import { InfluencerService } from '../../src/services/influencer.service';
import { NotificationService } from '../../src/services/notification.service';
import { AppModule } from '../../src/app.module';

describe('Influencer Staking User Journey - Exhaustive Tests', () => {
  let app: INestApplication;
  let stakingService: StakingService;
  let influencerService: InfluencerService;
  let notificationService: NotificationService;

  // Test data
  const testInfluencer = {
    id: uuidv4(),
    username: 'testinfluencer',
    email: 'influencer@test.com',
    displayName: 'Test Influencer',
    bio: 'Professional content creator specializing in DeFi',
  };

  const testUsers = [
    {
      id: uuidv4(),
      email: 'user1@test.com',
      wallet: 'DemoWallet111111111111111111111111111111111',
    },
    {
      id: uuidv4(),
      email: 'user2@test.com',
      wallet: 'DemoWallet222222222222222222222222222222222',
    },
    {
      id: uuidv4(),
      email: 'user3@test.com',
      wallet: 'DemoWallet333333333333333333333333333333333',
    },
  ];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    stakingService = moduleFixture.get<StakingService>(StakingService);
    influencerService = moduleFixture.get<InfluencerService>(InfluencerService);
    notificationService = moduleFixture.get<NotificationService>(NotificationService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Journey 1: New User Discovers and Stakes on Influencer', () => {
    it('should complete full journey from discovery to staking', async () => {
      const user = testUsers[0];

      // Step 1: User searches for influencers
      const searchResponse = await request(app.getHttpServer())
        .get('/api/influencers/search')
        .query({
          query: 'DeFi',
          sortBy: 'totalStaked',
          limit: 10,
        })
        .expect(200);

      expect(searchResponse.body).toHaveProperty('length');
      expect(searchResponse.body.length).toBeGreaterThan(0);

      // Step 2: User views influencer details
      const influencerId = searchResponse.body[0].id;
      const detailsResponse = await request(app.getHttpServer())
        .get(`/api/influencers/${influencerId}/staking`)
        .expect(200);

      expect(detailsResponse.body).toHaveProperty('influencer');
      expect(detailsResponse.body).toHaveProperty('pool');
      expect(detailsResponse.body).toHaveProperty('metrics');
      expect(detailsResponse.body).toHaveProperty('topStakers');
      expect(detailsResponse.body).toHaveProperty('historicalApy');

      // Step 3: User stakes on influencer
      const stakeAmount = BigInt(1000 * 10 ** 9); // 1000 TWIST
      const stakeResponse = await request(app.getHttpServer())
        .post('/api/staking/stake')
        .send({
          userId: user.id,
          influencerId: influencerId,
          amount: stakeAmount.toString(),
          wallet: user.wallet,
        })
        .expect(201);

      expect(stakeResponse.body).toHaveProperty('success', true);
      expect(stakeResponse.body).toHaveProperty('transactionId');
      expect(stakeResponse.body).toHaveProperty('newTotalStaked');
      expect(stakeResponse.body).toHaveProperty('estimatedApy');

      // Verify tier progression
      const poolAfterStake = await stakingService.getInfluencerStakingDetails(influencerId);
      expect(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']).toContain(poolAfterStake.influencer.tier);
    });
  });

  describe('Journey 2: Multiple Users Stake and Claim Rewards', () => {
    it('should handle concurrent staking and reward distribution', async () => {
      // Step 1: Multiple users stake on same influencer
      const stakePromises = testUsers.map(user =>
        request(app.getHttpServer())
          .post('/api/staking/stake')
          .send({
            userId: user.id,
            influencerId: testInfluencer.id,
            amount: (BigInt(500 * 10 ** 9)).toString(), // 500 TWIST each
            wallet: user.wallet,
          })
      );

      const stakeResponses = await Promise.all(stakePromises);
      stakeResponses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });

      // Step 2: Simulate revenue generation and distribution
      const earnings = BigInt(100 * 10 ** 9); // 100 TWIST earned
      await stakingService.distributeRewards({
        poolAddress: 'DemoPool11111111111111111111111111111111111',
        amount: earnings,
      });

      // Step 3: Users check pending rewards
      const rewardCheckPromises = testUsers.map(user =>
        request(app.getHttpServer())
          .get(`/api/staking/user/${user.id}/stakes`)
          .expect(200)
      );

      const rewardResponses = await Promise.all(rewardCheckPromises);
      rewardResponses.forEach(response => {
        expect(response.body).toHaveLength(1);
        expect(response.body[0].stake.pendingRewards).toBeTruthy();
        expect(BigInt(response.body[0].stake.pendingRewards)).toBeGreaterThan(0n);
      });

      // Step 4: Users claim rewards
      const claimPromises = testUsers.map(user =>
        request(app.getHttpServer())
          .post('/api/staking/claim')
          .send({
            userId: user.id,
            influencerId: testInfluencer.id,
            wallet: user.wallet,
          })
      );

      const claimResponses = await Promise.all(claimPromises);
      claimResponses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.claimedAmount).toBeTruthy();
      });
    });
  });

  describe('Journey 3: Influencer Creates Content and Tracks Performance', () => {
    it('should complete content creation and analytics journey', async () => {
      // Step 1: Influencer generates custom link
      const linkResponse = await request(app.getHttpServer())
        .post('/api/links/generate')
        .send({
          influencerId: testInfluencer.id,
          productId: 'twist-token',
          promoCode: 'DEFI20',
        })
        .expect(201);

      expect(linkResponse.body).toHaveProperty('linkCode');
      expect(linkResponse.body).toHaveProperty('customUrl');
      expect(linkResponse.body).toHaveProperty('qrCodeUrl');

      const linkCode = linkResponse.body.linkCode;

      // Step 2: Simulate clicks on the link
      const clickPromises = Array(50).fill(null).map((_, index) =>
        request(app.getHttpServer())
          .post('/api/analytics/track/click')
          .send({
            linkCode: linkCode,
            ipAddress: `192.168.1.${index + 1}`,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            referrer: 'https://twitter.com',
            country: 'US',
            device: 'desktop',
          })
      );

      await Promise.all(clickPromises);

      // Step 3: Simulate conversions
      const conversionPromises = Array(10).fill(null).map((_, index) =>
        request(app.getHttpServer())
          .post('/api/analytics/track/conversion')
          .send({
            linkCode: linkCode,
            orderId: `order-${uuidv4()}`,
            amount: (BigInt(100 * 10 ** 9)).toString(),
            productId: 'twist-token',
            ipAddress: `192.168.1.${index + 1}`,
            userAgent: 'Mozilla/5.0',
          })
      );

      await Promise.all(conversionPromises);

      // Step 4: Check real-time analytics
      const analyticsResponse = await request(app.getHttpServer())
        .get(`/api/analytics/links/${linkCode}/realtime`)
        .expect(200);

      expect(analyticsResponse.body).toHaveProperty('clicks', 50);
      expect(analyticsResponse.body).toHaveProperty('conversions', 10);
      expect(analyticsResponse.body).toHaveProperty('conversionRate', '20.00%');
      expect(analyticsResponse.body).toHaveProperty('revenue');
      expect(analyticsResponse.body).toHaveProperty('uniqueVisitors');

      // Step 5: Generate content using templates
      const contentResponse = await request(app.getHttpServer())
        .post('/api/content/generate')
        .send({
          influencerId: testInfluencer.id,
          templateId: 'banner-template-1',
          customization: {
            text: {
              headline: 'Stake on me and earn 20% APY!',
              subheadline: 'Join my community of stakers',
            },
            colors: {
              primaryColor: '#FF6B6B',
              secondaryColor: '#4ECDC4',
            },
          },
        })
        .expect(201);

      expect(contentResponse.body).toHaveProperty('id');
      expect(contentResponse.body).toHaveProperty('urls');
      expect(contentResponse.body.urls).toHaveProperty('twitter');
      expect(contentResponse.body.urls).toHaveProperty('instagram');
      expect(contentResponse.body).toHaveProperty('downloadUrl');
    });
  });

  describe('Journey 4: Partial Unstaking and Tier Changes', () => {
    it('should handle unstaking and tier progression correctly', async () => {
      const user = testUsers[0];

      // Step 1: Check current stake
      const stakesResponse = await request(app.getHttpServer())
        .get(`/api/staking/user/${user.id}/stakes`)
        .expect(200);

      const currentStake = BigInt(stakesResponse.body[0].stake.amount);
      const currentTier = stakesResponse.body[0].influencer.tier;

      // Step 2: Partial unstake
      const unstakeAmount = currentStake / 2n;
      const unstakeResponse = await request(app.getHttpServer())
        .post('/api/staking/unstake')
        .send({
          userId: user.id,
          influencerId: testInfluencer.id,
          amount: unstakeAmount.toString(),
          wallet: user.wallet,
        })
        .expect(201);

      expect(unstakeResponse.body.success).toBe(true);
      expect(unstakeResponse.body.remainingStake).toBe((currentStake - unstakeAmount).toString());

      // Step 3: Verify tier change if applicable
      const poolAfterUnstake = await stakingService.getInfluencerStakingDetails(testInfluencer.id);
      const newTier = poolAfterUnstake.influencer.tier;

      // Tier should potentially change based on total staked
      if (currentTier === 'SILVER' && poolAfterUnstake.pool.totalStaked < BigInt(1000 * 10 ** 9)) {
        expect(newTier).toBe('BRONZE');
      }
    });
  });

  describe('Journey 5: Fraud Detection and Prevention', () => {
    it('should detect and prevent fraudulent staking patterns', async () => {
      const suspiciousUser = {
        id: uuidv4(),
        email: 'suspicious@test.com',
        wallet: 'SuspiciousWallet11111111111111111111111111',
      };

      // Rapid staking attempts (velocity check)
      const rapidStakePromises = Array(10).fill(null).map(() =>
        request(app.getHttpServer())
          .post('/api/staking/stake')
          .send({
            userId: suspiciousUser.id,
            influencerId: testInfluencer.id,
            amount: (BigInt(100 * 10 ** 9)).toString(),
            wallet: suspiciousUser.wallet,
          })
      );

      const rapidStakeResponses = await Promise.all(rapidStakePromises);
      
      // Some should fail due to velocity checks
      const failedStakes = rapidStakeResponses.filter(r => r.status !== 201);
      expect(failedStakes.length).toBeGreaterThan(0);

      // Check if fraud alert was created
      const fraudAlertsResponse = await request(app.getHttpServer())
        .get(`/api/admin/fraud-alerts`)
        .query({ userId: suspiciousUser.id })
        .expect(200);

      expect(fraudAlertsResponse.body.length).toBeGreaterThan(0);
      expect(fraudAlertsResponse.body[0]).toHaveProperty('type');
      expect(fraudAlertsResponse.body[0]).toHaveProperty('severity');
    });
  });

  describe('Journey 6: WebSocket Real-time Updates', () => {
    it('should receive real-time updates via WebSocket', async (done) => {
      const io = require('socket.io-client');
      const socket = io(`http://localhost:${app.getHttpServer().address().port}`, {
        auth: {
          token: 'test-jwt-token',
        },
      });

      socket.on('connect', () => {
        // Subscribe to influencer updates
        socket.emit('subscribe:influencer', { influencerId: testInfluencer.id });
      });

      socket.on('pool:update', (data) => {
        expect(data).toHaveProperty('poolAddress');
        expect(data).toHaveProperty('totalStaked');
        expect(data).toHaveProperty('stakerCount');
        expect(data).toHaveProperty('currentApy');
        socket.disconnect();
        done();
      });

      // Trigger an update by staking
      setTimeout(async () => {
        await request(app.getHttpServer())
          .post('/api/staking/stake')
          .send({
            userId: testUsers[1].id,
            influencerId: testInfluencer.id,
            amount: (BigInt(100 * 10 ** 9)).toString(),
            wallet: testUsers[1].wallet,
          });
      }, 100);
    });
  });

  describe('Journey 7: Mobile App Integration', () => {
    it('should handle mobile-specific API calls', async () => {
      // Mobile-optimized search
      const mobileSearchResponse = await request(app.getHttpServer())
        .get('/api/mobile/influencers/trending')
        .set('User-Agent', 'TwistMobile/1.0 (iOS 16.0)')
        .expect(200);

      expect(mobileSearchResponse.body).toHaveProperty('influencers');
      expect(mobileSearchResponse.body.influencers.length).toBeLessThanOrEqual(10);

      // Biometric authentication simulation
      const biometricAuthResponse = await request(app.getHttpServer())
        .post('/api/mobile/auth/biometric')
        .send({
          userId: testUsers[0].id,
          biometricToken: 'mock-face-id-token',
          deviceId: 'iPhone14Pro',
        })
        .expect(200);

      expect(biometricAuthResponse.body).toHaveProperty('accessToken');
      expect(biometricAuthResponse.body).toHaveProperty('refreshToken');
    });
  });

  describe('Journey 8: Browser Extension Quick Actions', () => {
    it('should handle browser extension API calls', async () => {
      // Quick stake from extension
      const extensionStakeResponse = await request(app.getHttpServer())
        .post('/api/extension/quick-stake')
        .set('X-Extension-Version', '1.0.0')
        .send({
          userId: testUsers[2].id,
          influencerId: testInfluencer.id,
          amount: (BigInt(50 * 10 ** 9)).toString(), // 50 TWIST quick stake
          wallet: testUsers[2].wallet,
        })
        .expect(201);

      expect(extensionStakeResponse.body).toHaveProperty('success', true);
      expect(extensionStakeResponse.body).toHaveProperty('notification');

      // Portfolio summary for extension
      const portfolioResponse = await request(app.getHttpServer())
        .get(`/api/extension/portfolio/${testUsers[2].id}/summary`)
        .expect(200);

      expect(portfolioResponse.body).toHaveProperty('totalStaked');
      expect(portfolioResponse.body).toHaveProperty('totalPendingRewards');
      expect(portfolioResponse.body).toHaveProperty('stakesCount');
      expect(portfolioResponse.body).toHaveProperty('averageApy');
    });
  });

  describe('Journey 9: Notification Preferences and Delivery', () => {
    it('should handle notification preferences and delivery', async () => {
      const user = testUsers[0];

      // Set notification preferences
      const preferencesResponse = await request(app.getHttpServer())
        .put(`/api/notifications/preferences/${user.id}`)
        .send({
          email: {
            stakingUpdates: true,
            rewardsClaimed: true,
            tierChanges: true,
            weeklyDigest: false,
          },
          push: {
            stakingUpdates: false,
            rewardsClaimed: true,
            tierChanges: true,
            weeklyDigest: false,
          },
        })
        .expect(200);

      expect(preferencesResponse.body).toHaveProperty('success', true);

      // Verify notifications are queued correctly
      const notifications = await notificationService.getQueuedNotifications(user.id);
      expect(notifications).toBeInstanceOf(Array);
    });
  });

  describe('Journey 10: End-to-End Payout Process', () => {
    it('should complete full payout cycle', async () => {
      // Simulate end of month payout process
      const payoutResponse = await request(app.getHttpServer())
        .post('/api/admin/payouts/process')
        .send({
          month: new Date().getMonth(),
          year: new Date().getFullYear(),
        })
        .expect(201);

      expect(payoutResponse.body).toHaveProperty('payoutId');
      expect(payoutResponse.body).toHaveProperty('totalAmount');
      expect(payoutResponse.body).toHaveProperty('influencerCount');
      expect(payoutResponse.body).toHaveProperty('stakerPayouts');

      // Check individual payout items
      const payoutId = payoutResponse.body.payoutId;
      const payoutDetailsResponse = await request(app.getHttpServer())
        .get(`/api/admin/payouts/${payoutId}/details`)
        .expect(200);

      expect(payoutDetailsResponse.body).toHaveProperty('status');
      expect(payoutDetailsResponse.body).toHaveProperty('items');
      expect(payoutDetailsResponse.body.items.length).toBeGreaterThan(0);
    });
  });
});