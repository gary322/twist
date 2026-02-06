/**
 * Rate Limiter for VAU processing
 */

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
}

export class RateLimiter {
  private defaultConfig: RateLimitConfig = {
    windowMs: 60000, // 1 minute
    maxRequests: 100,
    keyPrefix: 'ratelimit:'
  };
  
  constructor(private env: any) {}
  
  /**
   * Check if request is within rate limit
   */
  async checkLimit(
    key: string, 
    config?: Partial<RateLimitConfig>
  ): Promise<boolean> {
    const cfg = { ...this.defaultConfig, ...config };
    const windowKey = this.getWindowKey(key, cfg);
    
    // Get current count
    const currentCount = await this.env.RATE_LIMIT.get(windowKey) || 0;
    
    if (currentCount >= cfg.maxRequests) {
      return false;
    }
    
    // Increment count
    const newCount = currentCount + 1;
    const ttl = Math.ceil(cfg.windowMs / 1000);
    
    await this.env.RATE_LIMIT.put(windowKey, newCount, {
      expirationTtl: ttl
    });
    
    return true;
  }
  
  /**
   * Get remaining requests in current window
   */
  async getRemaining(
    key: string,
    config?: Partial<RateLimitConfig>
  ): Promise<number> {
    const cfg = { ...this.defaultConfig, ...config };
    const windowKey = this.getWindowKey(key, cfg);
    
    const currentCount = await this.env.RATE_LIMIT.get(windowKey) || 0;
    return Math.max(0, cfg.maxRequests - currentCount);
  }
  
  /**
   * Reset rate limit for a key
   */
  async reset(key: string, config?: Partial<RateLimitConfig>): Promise<void> {
    const cfg = { ...this.defaultConfig, ...config };
    const windowKey = this.getWindowKey(key, cfg);
    
    await this.env.RATE_LIMIT.delete(windowKey);
  }
  
  /**
   * Get window key for current time window
   */
  private getWindowKey(key: string, config: RateLimitConfig): string {
    const window = Math.floor(Date.now() / config.windowMs);
    return `${config.keyPrefix}${key}:${window}`;
  }
  
  /**
   * Create a distributed rate limiter using Durable Objects
   */
  async checkDistributedLimit(
    key: string,
    limits: Array<{ windowMs: number; maxRequests: number }>
  ): Promise<{ allowed: boolean; limits: any[] }> {
    const results = await Promise.all(
      limits.map(limit => this.checkLimit(key, limit))
    );
    
    const allowed = results.every(result => result);
    
    const limitStatuses = await Promise.all(
      limits.map(async (limit) => {
        const remaining = await this.getRemaining(key, limit);
        return {
          window: limit.windowMs,
          limit: limit.maxRequests,
          remaining,
          resetAt: this.getResetTime(limit.windowMs)
        };
      })
    );
    
    return { allowed, limits: limitStatuses };
  }
  
  /**
   * Get reset time for current window
   */
  private getResetTime(windowMs: number): number {
    const currentWindow = Math.floor(Date.now() / windowMs);
    return (currentWindow + 1) * windowMs;
  }
}