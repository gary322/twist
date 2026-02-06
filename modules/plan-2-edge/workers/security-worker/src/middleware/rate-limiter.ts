import { RATE_LIMIT_WINDOWS, RATE_LIMIT_THRESHOLDS } from '@shared/constants';

export interface RateLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (request: Request) => string;
}

export class RateLimiter {
  private windows: Map<string, { count: number; resetTime: number }> = new Map();
  private options: Required<RateLimiterOptions>;

  constructor(options: RateLimiterOptions = {}) {
    this.options = {
      windowMs: options.windowMs || RATE_LIMIT_WINDOWS.DEFAULT,
      maxRequests: options.maxRequests || RATE_LIMIT_THRESHOLDS.DEFAULT,
      keyGenerator: options.keyGenerator || this.defaultKeyGenerator,
    };
  }

  async isAllowed(request: Request): Promise<boolean> {
    const key = this.options.keyGenerator(request);
    const now = Date.now();

    let window = this.windows.get(key);
    
    if (!window || now > window.resetTime) {
      window = {
        count: 0,
        resetTime: now + this.options.windowMs,
      };
      this.windows.set(key, window);
    }

    window.count++;

    if (window.count > this.options.maxRequests) {
      return false;
    }

    return true;
  }

  private defaultKeyGenerator(request: Request): string {
    const ip = request.headers.get('CF-Connecting-IP') || 
               request.headers.get('X-Forwarded-For') || 
               'unknown';
    return ip;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, window] of this.windows.entries()) {
      if (now > window.resetTime) {
        this.windows.delete(key);
      }
    }
  }
}

export async function createRateLimiter(type: 'VAU' | 'AUTH' | 'DEFAULT' = 'DEFAULT'): Promise<RateLimiter> {
  return new RateLimiter({
    windowMs: RATE_LIMIT_WINDOWS[type],
    maxRequests: RATE_LIMIT_THRESHOLDS[type],
  });
}