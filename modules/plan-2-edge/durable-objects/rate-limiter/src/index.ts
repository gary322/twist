// Rate Limiter Durable Object
import { Env } from '../../../shared/types/env';

export class RateLimiter implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private storage: DurableObjectStorage;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.storage = state.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (path) {
        case '/check':
          return await this.handleRateLimitCheck(request);
        case '/increment':
          return await this.handleIncrement(request);
        case '/reset':
          return await this.handleReset(request);
        case '/status':
          return await this.handleStatus(request);
        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('Rate limiter error:', error);
      return new Response(JSON.stringify({
        error: 'Internal error',
        message: (error as Error).message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleRateLimitCheck(request: Request): Promise<Response> {
    const { key, limit, window } = await request.json() as {
      key: string;
      limit: number;
      window: number;
    };

    // Get current window
    const windowStart = Math.floor(Date.now() / window) * window;
    const windowKey = `${key}:${windowStart}`;

    // Get current count
    const count = await this.storage.get<number>(windowKey) || 0;

    // Check if limit exceeded
    const allowed = count < limit;
    const remaining = Math.max(0, limit - count);
    const resetAt = windowStart + window;

    // Update count if allowed
    if (allowed) {
      // Note: Cloudflare Durable Objects don't support TTL on individual keys
      // TTL should be handled via alarm() API or periodic cleanup
      await this.storage.put(windowKey, count + 1);
    }

    return new Response(JSON.stringify({
      allowed,
      count: count + (allowed ? 1 : 0),
      remaining: allowed ? remaining - 1 : remaining,
      resetAt,
      retryAfter: allowed ? null : Math.ceil((resetAt - Date.now()) / 1000)
    }), {
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': (allowed ? remaining - 1 : remaining).toString(),
        'X-RateLimit-Reset': resetAt.toString()
      }
    });
  }

  private async handleIncrement(request: Request): Promise<Response> {
    const { key, amount = 1, window } = await request.json() as {
      key: string;
      amount?: number;
      window: number;
    };

    const windowStart = Math.floor(Date.now() / window) * window;
    const windowKey = `${key}:${windowStart}`;

    const count = await this.storage.get<number>(windowKey) || 0;
    const newCount = count + amount;

    await this.storage.put(windowKey, newCount);

    return new Response(JSON.stringify({ count: newCount }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleReset(request: Request): Promise<Response> {
    const { pattern } = await request.json() as { pattern: string };

    // Delete all keys matching pattern
    const keys = await this.storage.list({ prefix: pattern });
    const keysArray = Array.from(keys.keys());
    
    if (keysArray.length > 0) {
      await this.storage.delete(keysArray);
    }

    return new Response(JSON.stringify({ 
      deleted: keysArray.length,
      keys: keysArray 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleStatus(request: Request): Promise<Response> {
    const { prefix = '' } = await request.json() as { prefix?: string };

    // Get all keys with optional prefix
    const keys = await this.storage.list({ prefix, limit: 100 });
    const entries: Record<string, any> = {};

    for (const [key, value] of keys) {
      entries[key] = value;
    }

    return new Response(JSON.stringify({
      count: keys.size,
      entries,
      timestamp: Date.now()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Export for Cloudflare Workers
export default {
  RateLimiter
};