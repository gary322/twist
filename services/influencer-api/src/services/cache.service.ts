import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { createHash } from 'crypto';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
  tags?: string[];
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  flushes: number;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly DEFAULT_TTL = 300; // 5 minutes
  private readonly MAX_TTL = 86400; // 24 hours
  private readonly TAG_PREFIX = 'tag:';
  private readonly STATS_KEY = 'cache:stats';

  constructor(@InjectRedis() private redis: Redis) {
    this.initializeStats();
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    const cacheKey = this.buildKey(key, options?.prefix);
    
    try {
      const value = await this.redis.get(cacheKey);
      
      if (value) {
        await this.incrementStat('hits');
        this.logger.debug(`Cache hit: ${cacheKey}`);
        return JSON.parse(value);
      }
      
      await this.incrementStat('misses');
      this.logger.debug(`Cache miss: ${cacheKey}`);
      return null;
    } catch (error) {
      this.logger.error(`Cache get error for ${cacheKey}:`, error);
      return null;
    }
  }

  /**
   * Set a value in cache
   */
  async set<T>(
    key: string,
    value: T,
    options?: CacheOptions
  ): Promise<boolean> {
    const cacheKey = this.buildKey(key, options?.prefix);
    const ttl = this.validateTTL(options?.ttl);
    
    try {
      const serialized = JSON.stringify(value);
      
      if (ttl) {
        await this.redis.setex(cacheKey, ttl, serialized);
      } else {
        await this.redis.set(cacheKey, serialized);
      }
      
      // Add to tags if provided
      if (options?.tags) {
        await this.addToTags(cacheKey, options.tags);
      }
      
      await this.incrementStat('sets');
      this.logger.debug(`Cache set: ${cacheKey} (TTL: ${ttl}s)`);
      return true;
    } catch (error) {
      this.logger.error(`Cache set error for ${cacheKey}:`, error);
      return false;
    }
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string, prefix?: string): Promise<boolean> {
    const cacheKey = this.buildKey(key, prefix);
    
    try {
      const result = await this.redis.del(cacheKey);
      
      if (result > 0) {
        await this.incrementStat('deletes');
        this.logger.debug(`Cache delete: ${cacheKey}`);
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error(`Cache delete error for ${cacheKey}:`, error);
      return false;
    }
  }

  /**
   * Delete all keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);
      
      if (keys.length === 0) {
        return 0;
      }
      
      const result = await this.redis.del(...keys);
      await this.incrementStat('deletes', result);
      this.logger.debug(`Cache delete pattern: ${pattern} (${result} keys)`);
      
      return result;
    } catch (error) {
      this.logger.error(`Cache delete pattern error for ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Delete all keys with a specific tag
   */
  async deleteByTag(tag: string): Promise<number> {
    const tagKey = `${this.TAG_PREFIX}${tag}`;
    
    try {
      const keys = await this.redis.smembers(tagKey);
      
      if (keys.length === 0) {
        return 0;
      }
      
      const result = await this.redis.del(...keys);
      await this.redis.del(tagKey);
      await this.incrementStat('deletes', result);
      this.logger.debug(`Cache delete by tag: ${tag} (${result} keys)`);
      
      return result;
    } catch (error) {
      this.logger.error(`Cache delete by tag error for ${tag}:`, error);
      return 0;
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string, prefix?: string): Promise<boolean> {
    const cacheKey = this.buildKey(key, prefix);
    
    try {
      const exists = await this.redis.exists(cacheKey);
      return exists === 1;
    } catch (error) {
      this.logger.error(`Cache exists error for ${cacheKey}:`, error);
      return false;
    }
  }

  /**
   * Get remaining TTL for a key
   */
  async ttl(key: string, prefix?: string): Promise<number> {
    const cacheKey = this.buildKey(key, prefix);
    
    try {
      const ttl = await this.redis.ttl(cacheKey);
      return ttl > 0 ? ttl : 0;
    } catch (error) {
      this.logger.error(`Cache TTL error for ${cacheKey}:`, error);
      return 0;
    }
  }

  /**
   * Extend TTL for a key
   */
  async touch(key: string, ttl: number, prefix?: string): Promise<boolean> {
    const cacheKey = this.buildKey(key, prefix);
    const validTTL = this.validateTTL(ttl);
    
    try {
      const result = await this.redis.expire(cacheKey, validTTL);
      return result === 1;
    } catch (error) {
      this.logger.error(`Cache touch error for ${cacheKey}:`, error);
      return false;
    }
  }

  /**
   * Get or set a value (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }
    
    // Generate value
    const value = await factory();
    
    // Store in cache
    await this.set(key, value, options);
    
    return value;
  }

  /**
   * Invalidate multiple cache patterns
   */
  async invalidatePatterns(patterns: string[]): Promise<number> {
    let totalDeleted = 0;
    
    for (const pattern of patterns) {
      const deleted = await this.deletePattern(pattern);
      totalDeleted += deleted;
    }
    
    return totalDeleted;
  }

  /**
   * Remember a value forever
   */
  async remember<T>(
    key: string,
    factory: () => Promise<T>,
    prefix?: string
  ): Promise<T> {
    const cached = await this.get<T>(key, { prefix });
    if (cached !== null) {
      return cached;
    }
    
    const value = await factory();
    await this.set(key, value, { prefix });
    
    return value;
  }

  /**
   * Cache warming - preload frequently accessed data
   */
  async warm(keys: Array<{ key: string; factory: () => Promise<any>; options?: CacheOptions }>) {
    const results = await Promise.allSettled(
      keys.map(async ({ key, factory, options }) => {
        const value = await factory();
        await this.set(key, value, options);
        return { key, success: true };
      })
    );
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    this.logger.log(`Cache warming completed: ${successful}/${keys.length} keys`);
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const stats = await this.redis.hgetall(this.STATS_KEY);
      
      return {
        hits: parseInt(stats.hits || '0', 10),
        misses: parseInt(stats.misses || '0', 10),
        sets: parseInt(stats.sets || '0', 10),
        deletes: parseInt(stats.deletes || '0', 10),
        flushes: parseInt(stats.flushes || '0', 10),
      };
    } catch (error) {
      this.logger.error('Error getting cache stats:', error);
      return {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        flushes: 0,
      };
    }
  }

  /**
   * Reset cache statistics
   */
  async resetStats(): Promise<void> {
    await this.redis.del(this.STATS_KEY);
    await this.initializeStats();
  }

  /**
   * Flush all cache keys
   */
  async flush(): Promise<void> {
    try {
      await this.redis.flushdb();
      await this.incrementStat('flushes');
      await this.initializeStats();
      this.logger.warn('Cache flushed');
    } catch (error) {
      this.logger.error('Cache flush error:', error);
    }
  }

  /**
   * Build cache key with optional prefix
   */
  private buildKey(key: string, prefix?: string): string {
    return prefix ? `${prefix}:${key}` : key;
  }

  /**
   * Validate and return TTL
   */
  private validateTTL(ttl?: number): number {
    if (!ttl) return this.DEFAULT_TTL;
    return Math.min(Math.max(ttl, 1), this.MAX_TTL);
  }

  /**
   * Add key to tags for grouped invalidation
   */
  private async addToTags(key: string, tags: string[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    for (const tag of tags) {
      const tagKey = `${this.TAG_PREFIX}${tag}`;
      pipeline.sadd(tagKey, key);
      pipeline.expire(tagKey, this.MAX_TTL);
    }
    
    await pipeline.exec();
  }

  /**
   * Increment a stat counter
   */
  private async incrementStat(stat: string, by: number = 1): Promise<void> {
    try {
      await this.redis.hincrby(this.STATS_KEY, stat, by);
    } catch (error) {
      // Silent fail for stats
    }
  }

  /**
   * Initialize stats if not exists
   */
  private async initializeStats(): Promise<void> {
    const exists = await this.redis.exists(this.STATS_KEY);
    
    if (!exists) {
      await this.redis.hmset(this.STATS_KEY, {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        flushes: 0,
      });
    }
  }

  /**
   * Create a cache key from multiple parts
   */
  createKey(...parts: (string | number)[]): string {
    return parts.join(':');
  }

  /**
   * Hash a complex object into a cache key
   */
  hashKey(obj: Record<string, any>): string {
    const sorted = JSON.stringify(obj, Object.keys(obj).sort());
    return createHash('md5').update(sorted).digest('hex');
  }
}

// Cache decorators
export function Cacheable(options?: CacheOptions) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const cacheService = this.cacheService;
      if (!cacheService) {
        return originalMethod.apply(this, args);
      }
      
      const cacheKey = `${target.constructor.name}:${propertyKey}:${JSON.stringify(args)}`;
      
      return cacheService.getOrSet(
        cacheKey,
        () => originalMethod.apply(this, args),
        options
      );
    };
    
    return descriptor;
  };
}

export function CacheEvict(patterns: string[] | ((args: any[]) => string[])) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);
      
      const cacheService = this.cacheService;
      if (cacheService) {
        const patternsToEvict = typeof patterns === 'function' ? patterns(args) : patterns;
        await cacheService.invalidatePatterns(patternsToEvict);
      }
      
      return result;
    };
    
    return descriptor;
  };
}