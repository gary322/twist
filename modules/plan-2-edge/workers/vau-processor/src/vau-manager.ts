/**
 * VAU Manager - Production-ready VAU processing implementation
 */

import { BloomFilter } from './bloom-filter';
import { PrivacyProcessor } from './privacy-processor';
import { VAUValidator } from './vau-validator';
import { RateLimiter } from './rate-limiter';

export interface VAUData {
  userId: string;
  siteId: string;
  actionId: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface VAUProcessingResult {
  success: boolean;
  isUnique: boolean;
  earned: number;
  multiplier: number;
  privacyProcessed: boolean;
  errors?: string[];
}

export interface VAUBatch {
  siteId: string;
  vaus: VAUData[];
  timestamp: number;
}

export interface VAUMetrics {
  totalProcessed: number;
  uniqueUsers: number;
  duplicatesFiltered: number;
  rewardsDistributed: number;
  processingTime: number;
}

export class VAUManager {
  private bloomFilter: BloomFilter;
  private privacyProcessor: PrivacyProcessor;
  private validator: VAUValidator;
  private rateLimiter: RateLimiter;
  
  // Configuration
  private readonly REWARD_BASE = 0.1; // Base TWIST reward
  private readonly MULTIPLIER_DECAY = 0.95; // Decay for repeated actions
  private readonly BATCH_SIZE = 1000;
  private readonly PROCESSING_TIMEOUT = 5000; // 5 seconds
  
  constructor(
    private env: any,
    private ctx: ExecutionContext
  ) {
    this.bloomFilter = new BloomFilter(10000000, 0.01); // 10M items, 1% false positive
    this.privacyProcessor = new PrivacyProcessor();
    this.validator = new VAUValidator();
    this.rateLimiter = new RateLimiter(env);
  }

  /**
   * Process a single VAU
   */
  async processVAU(vau: VAUData): Promise<VAUProcessingResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    
    try {
      // 1. Validate VAU data
      const validation = this.validator.validate(vau);
      if (!validation.valid) {
        return {
          success: false,
          isUnique: false,
          earned: 0,
          multiplier: 0,
          privacyProcessed: false,
          errors: validation.errors
        };
      }
      
      // 2. Check rate limits
      const rateLimitKey = `${vau.siteId}:${vau.userId}`;
      const allowed = await this.rateLimiter.checkLimit(rateLimitKey);
      if (!allowed) {
        errors.push('Rate limit exceeded');
        return {
          success: false,
          isUnique: false,
          earned: 0,
          multiplier: 0,
          privacyProcessed: false,
          errors
        };
      }
      
      // 3. Apply privacy protection
      const privacyData = await this.privacyProcessor.process(vau);
      
      // 4. Check uniqueness with Bloom filter
      const uniqueKey = this.generateUniqueKey(vau);
      const isUnique = !this.bloomFilter.has(uniqueKey);
      
      if (isUnique) {
        this.bloomFilter.add(uniqueKey);
      }
      
      // 5. Calculate rewards
      const { earned, multiplier } = this.calculateReward(vau, isUnique);
      
      // 6. Store VAU data
      await this.storeVAU({
        ...privacyData,
        earned,
        multiplier,
        isUnique,
        processingTime: Date.now() - startTime
      });
      
      // 7. Update metrics
      await this.updateMetrics(vau.siteId, {
        processed: 1,
        unique: isUnique ? 1 : 0,
        rewards: earned
      });
      
      return {
        success: true,
        isUnique,
        earned,
        multiplier,
        privacyProcessed: true
      };
      
    } catch (error: any) {
      errors.push(`Processing error: ${error.message}`);
      return {
        success: false,
        isUnique: false,
        earned: 0,
        multiplier: 0,
        privacyProcessed: false,
        errors
      };
    }
  }

  /**
   * Process a batch of VAUs
   */
  async processBatch(batch: VAUBatch): Promise<{
    processed: number;
    successful: number;
    failed: number;
    metrics: VAUMetrics;
  }> {
    const startTime = Date.now();
    const results = {
      processed: 0,
      successful: 0,
      failed: 0
    };
    
    // Process in chunks to avoid timeout
    const chunks = this.chunkArray(batch.vaus, this.BATCH_SIZE);
    
    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map(vau => this.processVAU(vau))
      );
      
      chunkResults.forEach(result => {
        results.processed++;
        if (result.status === 'fulfilled' && result.value.success) {
          results.successful++;
        } else {
          results.failed++;
        }
      });
      
      // Check timeout
      if (Date.now() - startTime > this.PROCESSING_TIMEOUT) {
        break;
      }
    }
    
    // Get final metrics
    const metrics = await this.getMetrics(batch.siteId);
    
    return {
      ...results,
      metrics: {
        ...metrics,
        processingTime: Date.now() - startTime
      }
    };
  }

  /**
   * Track unique users across sites
   */
  async trackUniqueUsers(siteId: string, timeWindow: number = 86400): Promise<number> {
    const key = `unique_users:${siteId}:${Math.floor(Date.now() / (timeWindow * 1000))}`;
    const users = await this.env.VAU_UNIQUE.get(key, { type: 'json' }) || new Set();
    
    return users.size;
  }

  /**
   * Calculate VAU rewards
   */
  async calculateVAURewards(
    userId: string,
    siteId: string,
    actionType: string
  ): Promise<{
    base: number;
    multiplier: number;
    total: number;
  }> {
    // Get user's action history
    const historyKey = `history:${userId}:${siteId}:${actionType}`;
    const history = await this.env.VAU_HISTORY.get(historyKey, { type: 'json' }) || [];
    
    // Calculate multiplier based on history
    let multiplier = 1.0;
    const recentActions = history.filter((timestamp: number) => 
      Date.now() - timestamp < 86400000 // 24 hours
    ).length;
    
    if (recentActions > 0) {
      multiplier = Math.pow(this.MULTIPLIER_DECAY, recentActions);
    }
    
    // Apply site-specific multipliers
    const siteConfig = await this.getSiteConfig(siteId);
    if (siteConfig?.rewardMultiplier) {
      multiplier *= siteConfig.rewardMultiplier;
    }
    
    const base = this.REWARD_BASE;
    const total = base * multiplier;
    
    // Update history
    history.push(Date.now());
    await this.env.VAU_HISTORY.put(
      historyKey, 
      JSON.stringify(history.slice(-100)), // Keep last 100 actions
      { expirationTtl: 86400 * 7 } // 7 days
    );
    
    return { base, multiplier, total };
  }

  /**
   * Apply privacy protection to VAU data
   */
  private async applyPrivacyProtection(vau: VAUData): Promise<VAUData> {
    // Remove PII
    const sanitized = { ...vau };
    delete sanitized.metadata?.email;
    delete sanitized.metadata?.phone;
    delete sanitized.metadata?.name;
    
    // Hash user ID
    const hashedUserId = await this.hashUserId(vau.userId);
    sanitized.userId = hashedUserId;
    
    // Generalize location data
    if (sanitized.metadata?.location) {
      sanitized.metadata.location = this.generalizeLocation(sanitized.metadata.location);
    }
    
    // Add differential privacy noise
    if (sanitized.metadata?.age) {
      sanitized.metadata.age = this.addNoise(sanitized.metadata.age, 5);
    }
    
    return sanitized;
  }

  // Private helper methods
  private generateUniqueKey(vau: VAUData): string {
    return `${vau.siteId}:${vau.userId}:${vau.actionId}:${Math.floor(vau.timestamp / 86400000)}`;
  }

  private calculateReward(vau: VAUData, isUnique: boolean): { earned: number; multiplier: number } {
    if (!isUnique) {
      return { earned: 0, multiplier: 0 };
    }
    
    const base = this.REWARD_BASE;
    let multiplier = 1.0;
    
    // Apply action-specific multipliers
    if (vau.metadata?.actionType === 'purchase') {
      multiplier *= 2.0;
    } else if (vau.metadata?.actionType === 'share') {
      multiplier *= 1.5;
    }
    
    return {
      earned: base * multiplier,
      multiplier
    };
  }

  private async storeVAU(data: any): Promise<void> {
    const key = `vau:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    await this.env.VAU_STORAGE.put(key, JSON.stringify(data), {
      expirationTtl: 86400 * 30 // 30 days
    });
  }

  private async updateMetrics(
    siteId: string, 
    updates: { processed: number; unique: number; rewards: number }
  ): Promise<void> {
    const metricsKey = `metrics:${siteId}:${new Date().toISOString().split('T')[0]}`;
    const metrics = await this.env.VAU_METRICS.get(metricsKey, { type: 'json' }) || {
      totalProcessed: 0,
      uniqueUsers: 0,
      duplicatesFiltered: 0,
      rewardsDistributed: 0
    };
    
    metrics.totalProcessed += updates.processed;
    metrics.uniqueUsers += updates.unique;
    metrics.duplicatesFiltered += updates.processed - updates.unique;
    metrics.rewardsDistributed += updates.rewards;
    
    await this.env.VAU_METRICS.put(metricsKey, JSON.stringify(metrics), {
      expirationTtl: 86400 * 90 // 90 days
    });
  }

  private async getMetrics(siteId: string): Promise<VAUMetrics> {
    const metricsKey = `metrics:${siteId}:${new Date().toISOString().split('T')[0]}`;
    const metrics = await this.env.VAU_METRICS.get(metricsKey, { type: 'json' }) || {
      totalProcessed: 0,
      uniqueUsers: 0,
      duplicatesFiltered: 0,
      rewardsDistributed: 0,
      processingTime: 0
    };
    
    return metrics;
  }

  private async getSiteConfig(siteId: string): Promise<any> {
    const configKey = `site:config:${siteId}`;
    return await this.env.SITE_CONFIG.get(configKey, { type: 'json' });
  }

  private async hashUserId(userId: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(userId);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private generalizeLocation(location: any): any {
    // Keep only country and state/region
    return {
      country: location.country,
      region: location.region || location.state
    };
  }

  private addNoise(value: number, range: number): number {
    const noise = (Math.random() - 0.5) * 2 * range;
    return Math.round(value + noise);
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}