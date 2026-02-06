// Production-ready rate limiter for edge workers
export class RateLimiter {
  private limits: Map<string, RateLimit> = new Map();

  async checkLimit(key: string, maxRequests: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    let limit = this.limits.get(key);

    if (!limit || now - limit.windowStart > windowMs) {
      limit = {
        count: 0,
        windowStart: now
      };
    }

    if (limit.count >= maxRequests) {
      return false;
    }

    limit.count++;
    this.limits.set(key, limit);
    
    // Clean old entries periodically
    if (Math.random() < 0.01) {
      this.cleanup(now - windowMs * 2);
    }

    return true;
  }

  private cleanup(cutoff: number): void {
    for (const [key, limit] of this.limits.entries()) {
      if (limit.windowStart < cutoff) {
        this.limits.delete(key);
      }
    }
  }
}

interface RateLimit {
  count: number;
  windowStart: number;
}

// Export configured instances
export const apiRateLimiter = new RateLimiter();
export const userRateLimiter = new RateLimiter();
