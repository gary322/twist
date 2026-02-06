import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InfluencerCacheService } from './influencer-cache.service';
import { CacheService } from './cache.service';

@Injectable()
export class CacheWarmupService implements OnModuleInit {
  private readonly logger = new Logger(CacheWarmupService.name);

  constructor(
    private cacheService: CacheService,
    private influencerCacheService: InfluencerCacheService,
  ) {}

  async onModuleInit() {
    // Initial cache warming on startup
    this.logger.log('Starting initial cache warming...');
    await this.warmCriticalCaches();
  }

  /**
   * Warm critical caches every 30 minutes
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async warmCriticalCaches() {
    try {
      this.logger.log('Warming critical caches...');

      // Warm frequently accessed data
      const warmingTasks = [
        // Top influencers by tier
        {
          key: 'top:platinum',
          factory: async () => this.mockGetTopInfluencers('PLATINUM'),
          options: { prefix: 'leaderboard', ttl: 1800 }
        },
        {
          key: 'top:gold',
          factory: async () => this.mockGetTopInfluencers('GOLD'),
          options: { prefix: 'leaderboard', ttl: 1800 }
        },
        // Popular search queries
        {
          key: 'search:popular',
          factory: async () => this.mockGetPopularSearches(),
          options: { prefix: 'analytics', ttl: 3600 }
        },
        // System stats
        {
          key: 'system:stats',
          factory: async () => this.mockGetSystemStats(),
          options: { prefix: 'dashboard', ttl: 600 }
        },
      ];

      await this.cacheService.warm(warmingTasks);
      this.logger.log('Cache warming completed');
    } catch (error) {
      this.logger.error('Cache warming failed:', error);
    }
  }

  /**
   * Clear stale caches daily
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async clearStaleCaches() {
    try {
      this.logger.log('Clearing stale caches...');

      // Clear search results older than 1 hour
      const searchPattern = 'staking:search:*';
      const deleted = await this.cacheService.deletePattern(searchPattern);

      this.logger.log(`Cleared ${deleted} stale cache entries`);
    } catch (error) {
      this.logger.error('Failed to clear stale caches:', error);
    }
  }

  /**
   * Log cache statistics every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async logCacheStats() {
    try {
      const stats = await this.cacheService.getStats();
      const metrics = await this.influencerCacheService.getCacheMetrics();

      this.logger.log('Cache Statistics:', {
        ...stats,
        hitRate: metrics.hitRate,
        totalRequests: metrics.totalRequests,
      });
    } catch (error) {
      this.logger.error('Failed to log cache stats:', error);
    }
  }

  /**
   * Preload trending data every 15 minutes
   */
  @Cron('*/15 * * * *')
  async preloadTrendingData() {
    try {
      this.logger.debug('Preloading trending data...');

      // Preload trending influencers
      await this.cacheService.set(
        'trending:influencers',
        await this.mockGetTrendingInfluencers(),
        { prefix: 'analytics', ttl: 900 }
      );

      // Preload hot staking pools
      await this.cacheService.set(
        'trending:pools',
        await this.mockGetHotPools(),
        { prefix: 'analytics', ttl: 900 }
      );

      this.logger.debug('Trending data preloaded');
    } catch (error) {
      this.logger.error('Failed to preload trending data:', error);
    }
  }

  // Mock methods for demonstration
  private async mockGetTopInfluencers(tier: string) {
    return [
      { id: '1', username: `${tier.toLowerCase()}_user1`, tier },
      { id: '2', username: `${tier.toLowerCase()}_user2`, tier },
    ];
  }

  private async mockGetPopularSearches() {
    return [
      { query: 'crypto', count: 150 },
      { query: 'nft', count: 120 },
      { query: 'gaming', count: 100 },
    ];
  }

  private async mockGetSystemStats() {
    return {
      totalInfluencers: 10000,
      totalStaked: '50000000',
      activeStakers: 5000,
      conversionRate: 0.15,
    };
  }

  private async mockGetTrendingInfluencers() {
    return [
      { id: '1', username: 'trending1', growth: 0.25 },
      { id: '2', username: 'trending2', growth: 0.20 },
    ];
  }

  private async mockGetHotPools() {
    return [
      { poolId: '1', recentStakers: 50, apy: 15.5 },
      { poolId: '2', recentStakers: 45, apy: 12.3 },
    ];
  }
}