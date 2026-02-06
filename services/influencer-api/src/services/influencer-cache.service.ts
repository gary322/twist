import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

/**
 * Influencer-specific cache patterns and utilities
 */
@Injectable()
export class InfluencerCacheService {
  private readonly logger = new Logger(InfluencerCacheService.name);

  // Cache key prefixes
  private readonly PREFIXES = {
    INFLUENCER: 'influencer',
    STAKING_POOL: 'staking:pool',
    STAKING_SEARCH: 'staking:search',
    USER_STAKES: 'user:stakes',
    LINK: 'link',
    CLICK: 'click',
    CONVERSION: 'conversion',
    PAYOUT: 'payout',
    ANALYTICS: 'analytics',
    LEADERBOARD: 'leaderboard',
  };

  // Cache TTLs (in seconds)
  private readonly TTL = {
    INFLUENCER_PROFILE: 3600, // 1 hour
    STAKING_POOL: 300, // 5 minutes
    SEARCH_RESULTS: 60, // 1 minute
    USER_STAKES: 180, // 3 minutes
    ANALYTICS: 900, // 15 minutes
    LEADERBOARD: 600, // 10 minutes
    CLICK_STATS: 120, // 2 minutes
    CONVERSION_STATS: 300, // 5 minutes
    PAYOUT_BALANCE: 300, // 5 minutes
  };

  constructor(private cacheService: CacheService) {}

  /**
   * Get the underlying cache service for advanced operations
   */
  getCacheService(): CacheService {
    return this.cacheService;
  }

  /**
   * Get influencer profile from cache
   */
  async getInfluencerProfile(influencerId: string) {
    return this.cacheService.get(
      influencerId,
      { prefix: this.PREFIXES.INFLUENCER, ttl: this.TTL.INFLUENCER_PROFILE }
    );
  }

  /**
   * Set influencer profile in cache
   */
  async setInfluencerProfile(influencerId: string, profile: any) {
    return this.cacheService.set(
      influencerId,
      profile,
      { 
        prefix: this.PREFIXES.INFLUENCER, 
        ttl: this.TTL.INFLUENCER_PROFILE,
        tags: ['influencer', `influencer:${influencerId}`]
      }
    );
  }

  /**
   * Invalidate influencer-related caches
   */
  async invalidateInfluencer(influencerId: string) {
    const patterns = [
      `${this.PREFIXES.INFLUENCER}:${influencerId}*`,
      `${this.PREFIXES.STAKING_POOL}:${influencerId}*`,
      `${this.PREFIXES.LINK}:${influencerId}*`,
      `${this.PREFIXES.PAYOUT}:balance:${influencerId}`,
    ];

    await this.cacheService.invalidatePatterns(patterns);
    await this.cacheService.deleteByTag(`influencer:${influencerId}`);
  }

  /**
   * Cache staking search results
   */
  async cacheStakingSearch(params: any, results: any) {
    const key = this.cacheService.hashKey(params);
    return this.cacheService.set(
      key,
      results,
      { 
        prefix: this.PREFIXES.STAKING_SEARCH, 
        ttl: this.TTL.SEARCH_RESULTS,
        tags: ['staking-search']
      }
    );
  }

  /**
   * Get cached staking search results
   */
  async getStakingSearch(params: any) {
    const key = this.cacheService.hashKey(params);
    return this.cacheService.get(
      key,
      { prefix: this.PREFIXES.STAKING_SEARCH }
    );
  }

  /**
   * Cache user stakes
   */
  async cacheUserStakes(userId: string, stakes: any[]) {
    return this.cacheService.set(
      userId,
      stakes,
      { 
        prefix: this.PREFIXES.USER_STAKES, 
        ttl: this.TTL.USER_STAKES,
        tags: [`user:${userId}`, 'user-stakes']
      }
    );
  }

  /**
   * Get cached user stakes
   */
  async getUserStakes(userId: string) {
    return this.cacheService.get(
      userId,
      { prefix: this.PREFIXES.USER_STAKES }
    );
  }

  /**
   * Invalidate user-related caches
   */
  async invalidateUser(userId: string) {
    await this.cacheService.deleteByTag(`user:${userId}`);
  }

  /**
   * Cache click statistics
   */
  async cacheClickStats(linkId: string, stats: any) {
    return this.cacheService.set(
      `stats:${linkId}`,
      stats,
      { 
        prefix: this.PREFIXES.CLICK, 
        ttl: this.TTL.CLICK_STATS,
        tags: [`link:${linkId}`, 'click-stats']
      }
    );
  }

  /**
   * Get cached click statistics
   */
  async getClickStats(linkId: string) {
    return this.cacheService.get(
      `stats:${linkId}`,
      { prefix: this.PREFIXES.CLICK }
    );
  }

  /**
   * Cache conversion analytics
   */
  async cacheConversionAnalytics(key: string, data: any) {
    return this.cacheService.set(
      key,
      data,
      { 
        prefix: this.PREFIXES.CONVERSION, 
        ttl: this.TTL.CONVERSION_STATS,
        tags: ['conversion-analytics']
      }
    );
  }

  /**
   * Get cached conversion analytics
   */
  async getConversionAnalytics(key: string) {
    return this.cacheService.get(
      key,
      { prefix: this.PREFIXES.CONVERSION }
    );
  }

  /**
   * Cache payout balance
   */
  async cachePayoutBalance(influencerId: string, balance: bigint) {
    return this.cacheService.set(
      `balance:${influencerId}`,
      balance.toString(),
      { 
        prefix: this.PREFIXES.PAYOUT, 
        ttl: this.TTL.PAYOUT_BALANCE,
        tags: [`influencer:${influencerId}`, 'payout-balance']
      }
    );
  }

  /**
   * Get cached payout balance
   */
  async getPayoutBalance(influencerId: string): Promise<bigint | null> {
    const cached = await this.cacheService.get<string>(
      `balance:${influencerId}`,
      { prefix: this.PREFIXES.PAYOUT }
    );
    
    return cached ? BigInt(cached) : null;
  }

  /**
   * Invalidate payout-related caches
   */
  async invalidatePayout(influencerId: string) {
    await this.cacheService.delete(
      `balance:${influencerId}`,
      this.PREFIXES.PAYOUT
    );
  }

  /**
   * Cache analytics data
   */
  async cacheAnalytics(type: string, period: string, data: any) {
    const key = `${type}:${period}`;
    return this.cacheService.set(
      key,
      data,
      { 
        prefix: this.PREFIXES.ANALYTICS, 
        ttl: this.TTL.ANALYTICS,
        tags: ['analytics', `analytics:${type}`]
      }
    );
  }

  /**
   * Get cached analytics data
   */
  async getAnalytics(type: string, period: string) {
    const key = `${type}:${period}`;
    return this.cacheService.get(
      key,
      { prefix: this.PREFIXES.ANALYTICS }
    );
  }

  /**
   * Cache leaderboard
   */
  async cacheLeaderboard(type: string, data: any[]) {
    return this.cacheService.set(
      type,
      data,
      { 
        prefix: this.PREFIXES.LEADERBOARD, 
        ttl: this.TTL.LEADERBOARD,
        tags: ['leaderboard']
      }
    );
  }

  /**
   * Get cached leaderboard
   */
  async getLeaderboard(type: string) {
    return this.cacheService.get(
      type,
      { prefix: this.PREFIXES.LEADERBOARD }
    );
  }

  /**
   * Warm critical caches
   */
  async warmCaches(services: {
    influencerService?: any;
    stakingService?: any;
    analyticsService?: any;
  }) {
    const warmingTasks = [];

    // Warm top influencers
    if (services.influencerService) {
      warmingTasks.push({
        key: 'top-influencers',
        factory: () => services.influencerService.getTopInfluencers({ limit: 100 }),
        options: { prefix: this.PREFIXES.INFLUENCER, ttl: this.TTL.INFLUENCER_PROFILE }
      });
    }

    // Warm popular staking pools
    if (services.stakingService) {
      warmingTasks.push({
        key: 'popular-pools',
        factory: () => services.stakingService.searchInfluencers({ 
          sortBy: 'totalStaked', 
          limit: 50 
        }),
        options: { prefix: this.PREFIXES.STAKING_POOL, ttl: this.TTL.STAKING_POOL }
      });
    }

    // Warm analytics dashboards
    if (services.analyticsService) {
      warmingTasks.push({
        key: 'dashboard-stats',
        factory: () => services.analyticsService.getDashboardStats(),
        options: { prefix: this.PREFIXES.ANALYTICS, ttl: this.TTL.ANALYTICS }
      });
    }

    await this.cacheService.warm(warmingTasks);
  }

  /**
   * Get cache statistics for monitoring
   */
  async getCacheMetrics() {
    const stats = await this.cacheService.getStats();
    const hitRate = stats.hits / (stats.hits + stats.misses) || 0;

    return {
      ...stats,
      hitRate: (hitRate * 100).toFixed(2) + '%',
      totalRequests: stats.hits + stats.misses,
    };
  }

  /**
   * Clear all influencer-related caches
   */
  async clearAllCaches() {
    const patterns = Object.values(this.PREFIXES).map(prefix => `${prefix}:*`);
    const deleted = await this.cacheService.invalidatePatterns(patterns);
    
    this.logger.warn(`Cleared ${deleted} cache entries`);
    return deleted;
  }
}