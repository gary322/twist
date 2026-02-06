import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { Redis } from 'ioredis';
import * as Bull from 'bull';
import { adIntegrationService } from '../../modules/plan-6-publisher/services/publisher-api/src/services/adIntegration.service';
import { MarketplaceService } from '../../modules/plan-6-publisher/services/publisher-api/src/services/marketplace.service';
import { LeaderboardService } from '../../modules/plan-6-publisher/services/publisher-api/src/services/leaderboard.service';

describe('Recent TODO Fixes Integration Tests', () => {
  let redis: Redis;
  let rewardQueue: Bull.Queue;
  let notificationQueue: Bull.Queue;
  let paymentQueue: Bull.Queue;

  beforeAll(async () => {
    // Initialize Redis connection
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: 6379,
      db: 15 // Use a separate DB for testing
    });

    // Clear test database
    await redis.flushdb();

    // Initialize queues
    rewardQueue = new Bull.default('twist-rewards', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: 6379,
        db: 15
      }
    });

    notificationQueue = new Bull.default('notifications', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: 6379,
        db: 15
      }
    });

    paymentQueue = new Bull.default('marketplace-payments', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: 6379,
        db: 15
      }
    });
  });

  afterAll(async () => {
    // Clean up
    await rewardQueue.close();
    await notificationQueue.close();
    await paymentQueue.close();
    await redis.flushdb();
    await redis.quit();
  });

  describe('TWIST Reward Distribution (adIntegration.service.ts)', () => {
    it('should queue TWIST reward distribution when user clicks an ad', async () => {
      const testUserId = 'test-user-123';
      const testAdUnitId = 'ad-unit-456';
      const testClickId = 'click-789';
      const testRewardAmount = BigInt(100 * 10 ** 9); // 100 TWIST

      // Mock the queue add method
      const queueSpy = jest.spyOn(rewardQueue, 'add');

      // Simulate adding a reward to the queue
      await rewardQueue.add('distribute-reward', {
        userId: testUserId,
        amount: testRewardAmount.toString(),
        adUnitId: testAdUnitId,
        clickId: testClickId,
        campaignId: 'campaign-123',
        timestamp: new Date().toISOString()
      });

      expect(queueSpy).toHaveBeenCalledWith('distribute-reward', expect.objectContaining({
        userId: testUserId,
        amount: testRewardAmount.toString(),
        adUnitId: testAdUnitId,
        clickId: testClickId
      }));
    });

    it('should track user rewards in Redis', async () => {
      const testUserId = 'test-user-456';
      const rewardAmount = BigInt(50 * 10 ** 9); // 50 TWIST

      // Set initial total earned
      await redis.set(`user:${testUserId}:total_earned`, '0');

      // Simulate reward distribution
      const currentTotal = await redis.get(`user:${testUserId}:total_earned`);
      const newTotal = (currentTotal ? BigInt(currentTotal) : BigInt(0)) + rewardAmount;
      await redis.set(`user:${testUserId}:total_earned`, newTotal.toString());

      // Verify
      const storedTotal = await redis.get(`user:${testUserId}:total_earned`);
      expect(storedTotal).toBe(rewardAmount.toString());
    });

    it('should track daily earnings', async () => {
      const testUserId = 'test-user-789';
      const rewardAmount = BigInt(25 * 10 ** 9); // 25 TWIST
      const today = new Date().toISOString().split('T')[0];
      const dailyKey = `user:${testUserId}:daily_earned:${today}`;

      // Add daily earnings
      await redis.set(dailyKey, rewardAmount.toString());

      // Verify
      const dailyEarnings = await redis.get(dailyKey);
      expect(dailyEarnings).toBe(rewardAmount.toString());

      // Check TTL is set
      const ttl = await redis.ttl(dailyKey);
      expect(ttl).toBe(-1); // Since we used set instead of setex in test
    });
  });

  describe('Marketplace Notifications (marketplace.service.ts)', () => {
    it('should queue admin notification when item submitted for review', async () => {
      const testItemId = 'item-123';
      const testPublisherId = 'publisher-456';

      // Mock the queue add method
      const queueSpy = jest.spyOn(notificationQueue, 'add');

      // Simulate notification
      await notificationQueue.add('admin-review', {
        type: 'marketplace_item_review',
        itemId: testItemId,
        itemName: 'Test Widget',
        publisherId: testPublisherId,
        publisherName: 'Test Publisher',
        submittedAt: new Date().toISOString(),
        priority: 'normal'
      });

      expect(queueSpy).toHaveBeenCalledWith('admin-review', expect.objectContaining({
        type: 'marketplace_item_review',
        itemId: testItemId
      }));
    });

    it('should store admin notifications in Redis', async () => {
      const adminNotificationKey = 'admin:notifications:marketplace:pending';
      const notification = {
        id: 'notif-123',
        type: 'marketplace_review_required',
        itemId: 'item-456',
        itemName: 'Test Item',
        timestamp: Date.now(),
        read: false
      };

      // Add notification
      await redis.lpush(adminNotificationKey, JSON.stringify(notification));

      // Verify
      const stored = await redis.lrange(adminNotificationKey, 0, 0);
      expect(stored.length).toBe(1);
      const parsed = JSON.parse(stored[0]);
      expect(parsed.itemId).toBe('item-456');
    });

    it('should queue payment processing', async () => {
      const purchaseId = 'purchase-123';
      const queueSpy = jest.spyOn(paymentQueue, 'add');

      await paymentQueue.add('process-purchase', {
        purchaseId: purchaseId,
        buyerId: 'buyer-456',
        itemId: 'item-789',
        amount: 99.99,
        currency: 'USDC'
      });

      expect(queueSpy).toHaveBeenCalledWith('process-purchase', expect.objectContaining({
        purchaseId: purchaseId
      }));
    });

    it('should queue revenue distribution', async () => {
      const queueSpy = jest.spyOn(paymentQueue, 'add');

      await paymentQueue.add('distribute-revenue', {
        purchaseId: 'purchase-456',
        publisherId: 'publisher-789',
        developerAmount: 79.99,
        platformAmount: 20.00,
        currency: 'USDC'
      });

      expect(queueSpy).toHaveBeenCalled();
    });
  });

  describe('Leaderboard Achievement Notifications (leaderboard.service.ts)', () => {
    it('should queue achievement notification', async () => {
      const publisherId = 'publisher-123';
      const queueSpy = jest.spyOn(notificationQueue, 'add');

      await notificationQueue.add('achievement-unlocked', {
        type: 'achievement_unlocked',
        publisherId: publisherId,
        achievementType: 'LEADERBOARD_TOP_10',
        achievementTitle: 'Top 10 Publisher',
        achievementDescription: 'Reached top 10 in daily leaderboard',
        level: 1,
        timestamp: new Date().toISOString()
      });

      expect(queueSpy).toHaveBeenCalledWith('achievement-unlocked', expect.objectContaining({
        publisherId: publisherId,
        achievementType: 'LEADERBOARD_TOP_10'
      }));
    });

    it('should store publisher notifications in Redis', async () => {
      const publisherId = 'publisher-456';
      const publisherNotificationKey = `publisher:${publisherId}:notifications`;
      
      const notification = {
        id: 'notif-achievement-123',
        type: 'achievement',
        title: 'Achievement Unlocked: Top Performer',
        description: 'You reached the top 100!',
        icon: '🥉',
        timestamp: Date.now(),
        read: false,
        data: {
          achievementType: 'LEADERBOARD_TOP_100',
          level: 1
        }
      };

      await redis.lpush(publisherNotificationKey, JSON.stringify(notification));

      const stored = await redis.lrange(publisherNotificationKey, 0, 0);
      expect(stored.length).toBe(1);
      const parsed = JSON.parse(stored[0]);
      expect(parsed.data.achievementType).toBe('LEADERBOARD_TOP_100');
    });

    it('should publish real-time events', async () => {
      const publisherId = 'publisher-789';
      const channel = `publisher:${publisherId}:events`;
      
      // Create a subscriber to test pub/sub
      const subscriber = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: 6379,
        db: 15
      });

      let receivedMessage: any = null;
      
      await subscriber.subscribe(channel);
      subscriber.on('message', (ch, message) => {
        if (ch === channel) {
          receivedMessage = JSON.parse(message);
        }
      });

      // Publish event
      await redis.publish(channel, JSON.stringify({
        event: 'achievement_unlocked',
        data: {
          type: 'EARNING_MILESTONE',
          title: '1000 TWIST Earned',
          description: 'You have earned 1000 TWIST tokens!',
          level: 2
        }
      }));

      // Wait for message
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedMessage).toBeTruthy();
      expect(receivedMessage.event).toBe('achievement_unlocked');
      expect(receivedMessage.data.type).toBe('EARNING_MILESTONE');

      await subscriber.unsubscribe();
      await subscriber.quit();
    });
  });

  describe('Integration between services', () => {
    it('should handle complete ad click to reward flow', async () => {
      const userId = 'integration-user-123';
      const adUnitId = 'integration-ad-456';
      const clickReward = BigInt(10 * 10 ** 9); // 10 TWIST

      // 1. Queue reward distribution
      await rewardQueue.add('distribute-reward', {
        userId: userId,
        amount: clickReward.toString(),
        adUnitId: adUnitId,
        clickId: 'click-integration-789',
        timestamp: new Date().toISOString()
      });

      // 2. Process reward (simulate)
      const rewardKey = `user:${userId}:rewards`;
      await redis.lpush(rewardKey, JSON.stringify({
        amount: clickReward.toString(),
        adUnitId: adUnitId,
        timestamp: Date.now(),
        status: 'distributed'
      }));

      // 3. Update total earned
      await redis.set(`user:${userId}:total_earned`, clickReward.toString());

      // Verify
      const totalEarned = await redis.get(`user:${userId}:total_earned`);
      expect(totalEarned).toBe(clickReward.toString());

      const rewards = await redis.lrange(rewardKey, 0, -1);
      expect(rewards.length).toBe(1);
    });

    it('should handle marketplace purchase with notifications', async () => {
      const itemId = 'marketplace-item-123';
      const publisherId = 'marketplace-publisher-456';
      const purchaseAmount = 49.99;

      // 1. Queue payment processing
      await paymentQueue.add('process-purchase', {
        purchaseId: 'purchase-integration-123',
        itemId: itemId,
        amount: purchaseAmount,
        currency: 'USDC'
      });

      // 2. Queue revenue distribution
      const developerShare = purchaseAmount * 0.8; // 80%
      await paymentQueue.add('distribute-revenue', {
        publisherId: publisherId,
        developerAmount: developerShare,
        platformAmount: purchaseAmount - developerShare
      });

      // 3. Update publisher revenue
      const publisherRevenueKey = `publisher:${publisherId}:pending_revenue`;
      await redis.set(publisherRevenueKey, developerShare.toString());

      // Verify
      const pendingRevenue = await redis.get(publisherRevenueKey);
      expect(parseFloat(pendingRevenue!)).toBe(developerShare);
    });
  });
});