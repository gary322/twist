// Queue Processing & Batch Optimization
import { Env, VAUMessage, RewardBatch, Reward } from '../types';
import { Message, MessageBatch } from '@shared/types';

export class QueueProcessor {
  private readonly BATCH_SIZE = 100;
  private readonly BATCH_TIMEOUT = 5000; // 5 seconds

  constructor(private env: Env) {}

  async processVAUQueue(batch: MessageBatch<VAUMessage>): Promise<void> {
    const messages = batch.messages;
    const vauBatches = this.groupIntoBatches(messages);

    // Process batches in parallel
    await Promise.all(
      vauBatches.map(batch => this.processBatch(batch))
    );
  }

  private groupIntoBatches(messages: Message<VAUMessage>[]): Message<VAUMessage>[][] {
    const batches: Message<VAUMessage>[][] = [];
    const userBatches = new Map<string, Message<VAUMessage>[]>();

    // Group by user for better caching
    for (const message of messages) {
      const userId = message.body.userId;
      if (!userBatches.has(userId)) {
        userBatches.set(userId, []);
      }
      userBatches.get(userId)!.push(message);
    }

    // Create batches respecting size limits
    let currentBatch: Message<VAUMessage>[] = [];
    for (const [userId, userMessages] of userBatches) {
      for (const message of userMessages) {
        currentBatch.push(message);

        if (currentBatch.length >= this.BATCH_SIZE) {
          batches.push(currentBatch);
          currentBatch = [];
        }
      }
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  private async processBatch(messages: Message<VAUMessage>[]): Promise<void> {
    try {
      // Validate all messages first
      const validations = await Promise.all(
        messages.map(msg => this.validateMessage(msg.body))
      );

      const validMessages = messages.filter((_, i) => validations[i].valid);
      const invalidMessages = messages.filter((_, i) => !validations[i].valid);

      // Reject invalid messages
      for (const msg of invalidMessages) {
        msg.ack(); // Don't retry invalid messages
      }

      if (validMessages.length === 0) return;

      // Process valid messages
      const rewards = await this.calculateRewards(
        validMessages.map(m => m.body)
      );

      // Queue rewards for blockchain processing
      await this.env.REWARD_QUEUE.send({
        type: 'batch_rewards',
        rewards: rewards,
        timestamp: Date.now()
      });

      // Store analytics data
      await this.storeAnalytics(validMessages.map(m => m.body));

      // Acknowledge processed messages
      for (const msg of validMessages) {
        msg.ack();
      }

      // Update metrics
      await this.updateMetrics({
        processed: validMessages.length,
        rejected: invalidMessages.length,
        batchSize: messages.length
      });

    } catch (error) {
      console.error('Batch processing error:', error);

      // Retry all messages
      for (const msg of messages) {
        msg.retry();
      }
    }
  }

  private async validateMessage(vau: VAUMessage): Promise<{ valid: boolean; reason?: string }> {
    // Basic validation
    if (!vau.userId || !vau.deviceId || !vau.siteId) {
      return { valid: false, reason: 'Missing required fields' };
    }

    // Check timestamp age (max 5 minutes)
    const age = Date.now() - vau.timestamp;
    if (age > 5 * 60 * 1000) {
      return { valid: false, reason: 'Message too old' };
    }

    // Verify device exists
    const deviceData = await this.env.DEVICE_REGISTRY.get(`device:${vau.deviceId}`);
    if (!deviceData) {
      return { valid: false, reason: 'Unknown device' };
    }

    const device = JSON.parse(deviceData);
    
    // Check device trust score
    if (device.trustScore < 20) {
      return { valid: false, reason: 'Device trust too low' };
    }

    // Check for duplicate VAU (idempotency)
    const vauKey = `vau:${vau.id}`;
    const existing = await this.env.KV.get(vauKey);
    if (existing) {
      return { valid: false, reason: 'Duplicate VAU' };
    }

    // Store VAU ID to prevent duplicates
    await this.env.KV.put(vauKey, '1', {
      expirationTtl: 24 * 3600 // 24 hours
    });

    return { valid: true };
  }

  private async calculateRewards(vaus: VAUMessage[]): Promise<RewardBatch> {
    const rewards: Reward[] = [];

    // Get current economic parameters
    const [tokenPrice, dailyCap, multipliers] = await Promise.all([
      this.getTokenPrice(),
      this.getDailyCap(),
      this.getMultipliers(vaus.map(v => v.userId))
    ]);

    for (const vau of vaus) {
      const baseReward = this.calculateBaseReward(vau, tokenPrice);
      const multiplier = multipliers.get(vau.userId) || 1.0;
      const finalReward = Math.floor(baseReward * multiplier);

      rewards.push({
        userId: vau.userId,
        amount: finalReward,
        vauId: vau.id,
        multiplier,
        timestamp: vau.timestamp
      });
    }

    return {
      rewards,
      totalAmount: rewards.reduce((sum, r) => sum + r.amount, 0),
      tokenPrice,
      timestamp: Date.now()
    };
  }

  private calculateBaseReward(vau: VAUMessage, tokenPrice: number): number {
    // Base reward calculation
    let reward = 100; // Base 100 tokens

    // Quality multipliers
    if (vau.payload) {
      try {
        const payload = JSON.parse(vau.payload);
        
        // Engagement quality
        if (payload.duration && payload.duration > 30000) { // 30+ seconds
          reward *= 1.5;
        }
        
        // Scroll depth
        if (payload.scrollDepth && payload.scrollDepth > 0.8) {
          reward *= 1.2;
        }
        
        // Interaction quality
        if (payload.interactions && payload.interactions > 5) {
          reward *= 1.3;
        }
      } catch (e) {
        // Invalid payload, use base reward
      }
    }

    // Trust score multiplier
    if (vau.trustScore) {
      reward *= (vau.trustScore / 100);
    }

    // Site quality multiplier
    const siteMultiplier = this.getSiteMultiplier(vau.siteId);
    reward *= siteMultiplier;

    // Adjust for token price (maintain dollar value)
    const targetDollarValue = 0.01; // $0.01 per quality VAU
    reward = Math.floor((targetDollarValue / tokenPrice) * reward);

    return Math.max(1, reward); // Minimum 1 token
  }

  private getSiteMultiplier(siteId: string): number {
    // Premium sites get higher rewards
    const premiumSites = ['site-gaming-001', 'site-finance-001', 'site-tech-001'];
    if (premiumSites.includes(siteId)) {
      return 2.0;
    }

    // Regular verified sites
    if (siteId.startsWith('site-')) {
      return 1.0;
    }

    // Unverified sites
    return 0.5;
  }

  private async getTokenPrice(): Promise<number> {
    // Get from price oracle or cache
    const cached = await this.env.KV.get('token:price');
    if (cached) {
      const data = JSON.parse(cached);
      if (Date.now() - data.timestamp < 60000) { // 1 minute cache
        return data.price;
      }
    }

    // In production, fetch from price oracle
    const price = 0.0001; // $0.0001 default

    // Cache price
    await this.env.KV.put('token:price', JSON.stringify({
      price,
      timestamp: Date.now()
    }), {
      expirationTtl: 300 // 5 minutes
    });

    return price;
  }

  private async getDailyCap(): Promise<number> {
    // Get current daily emissions cap
    const date = new Date().toISOString().split('T')[0];
    const emittedKey = `emissions:${date}`;
    
    const emitted = await this.env.KV.get(emittedKey);
    const emittedAmount = emitted ? parseInt(emitted) : 0;

    const dailyCap = 10000000; // 10M tokens daily cap
    return Math.max(0, dailyCap - emittedAmount);
  }

  private async getMultipliers(userIds: string[]): Promise<Map<string, number>> {
    const multipliers = new Map<string, number>();

    // Batch fetch user data
    const userDataPromises = userIds.map(async userId => {
      const data = await this.env.KV.get(`user:${userId}`);
      return { userId, data };
    });

    const results = await Promise.all(userDataPromises);

    for (const { userId, data } of results) {
      if (data) {
        const userData = JSON.parse(data);
        
        // Calculate multiplier based on user attributes
        let multiplier = 1.0;

        // Stake multiplier
        if (userData.stakedAmount > 0) {
          multiplier += Math.min(0.5, userData.stakedAmount / 100000);
        }

        // Reputation multiplier
        if (userData.reputation > 80) {
          multiplier += 0.3;
        }

        // Streak multiplier
        if (userData.dailyStreak > 7) {
          multiplier += 0.2;
        }

        multipliers.set(userId, Math.min(2.0, multiplier)); // Cap at 2x
      } else {
        multipliers.set(userId, 1.0); // Default multiplier
      }
    }

    return multipliers;
  }

  private async storeAnalytics(vaus: VAUMessage[]): Promise<void> {
    const hourlyKey = this.getHourlyKey();
    const data = {
      vaus: vaus.map(v => ({
        userId: v.userId,
        deviceId: v.deviceId,
        siteId: v.siteId,
        timestamp: v.timestamp,
        trustScore: v.trustScore
      })),
      aggregates: {
        total: vaus.length,
        uniqueUsers: new Set(vaus.map(v => v.userId)).size,
        uniqueDevices: new Set(vaus.map(v => v.deviceId)).size,
        uniqueSites: new Set(vaus.map(v => v.siteId)).size,
        avgTrustScore: vaus.reduce((sum, v) => sum + (v.trustScore || 0), 0) / vaus.length
      }
    };

    // Store in R2 for long-term analytics
    await this.env.ANALYTICS_DATA.put(
      `vau-data/${hourlyKey}/${Date.now()}.json`,
      JSON.stringify(data),
      {
        customMetadata: {
          count: data.vaus.length.toString(),
          hour: hourlyKey
        }
      }
    );

    // Update real-time aggregates in KV
    await this.updateAggregates(data.aggregates);
  }

  private async updateAggregates(aggregates: any): Promise<void> {
    const date = new Date().toISOString().split('T')[0];
    const key = `aggregates:${date}`;

    const existing = await this.env.KV.get(key);
    const current = existing ? JSON.parse(existing) : {
      total: 0,
      uniqueUsers: new Set(),
      uniqueDevices: new Set(),
      uniqueSites: new Set(),
      totalTrustScore: 0
    };

    // Update aggregates
    current.total += aggregates.total;
    
    // Convert Sets to arrays for storage
    const users = Array.from(current.uniqueUsers);
    const devices = Array.from(current.uniqueDevices);
    const sites = Array.from(current.uniqueSites);

    await this.env.KV.put(key, JSON.stringify({
      total: current.total,
      uniqueUsers: users.length,
      uniqueDevices: devices.length,
      uniqueSites: sites.length,
      avgTrustScore: (current.totalTrustScore + aggregates.avgTrustScore * aggregates.total) / current.total
    }), {
      expirationTtl: 30 * 24 * 3600 // 30 days
    });
  }

  private async updateMetrics(metrics: {
    processed: number;
    rejected: number;
    batchSize: number;
  }): Promise<void> {
    // Update processing metrics
    const key = `metrics:queue:${new Date().toISOString().slice(0, 10)}`;
    
    const existing = await this.env.KV.get(key);
    const current = existing ? JSON.parse(existing) : {
      totalProcessed: 0,
      totalRejected: 0,
      batches: 0,
      avgBatchSize: 0
    };

    current.totalProcessed += metrics.processed;
    current.totalRejected += metrics.rejected;
    current.batches += 1;
    current.avgBatchSize = ((current.avgBatchSize * (current.batches - 1)) + metrics.batchSize) / current.batches;

    await this.env.KV.put(key, JSON.stringify(current), {
      expirationTtl: 7 * 24 * 3600 // 7 days
    });
  }

  private getHourlyKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${String(now.getUTCDate()).padStart(2, '0')}/${String(now.getUTCHours()).padStart(2, '0')}`;
  }
}

// Use the shared types instead of redefining