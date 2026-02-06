// Rate limiting middleware
import { IRequest } from 'itty-router';
import { Env } from '../types';
import { RateLimitError } from '../utils/errors';
import { RATE_LIMIT_THRESHOLDS, RATE_LIMIT_WINDOWS } from '@shared/constants';

export async function withRateLimit(request: IRequest, env: Env): Promise<Response | void> {
  // Get client identifier (IP or API key)
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const endpoint = new URL(request.url).pathname;

  // Determine rate limit based on endpoint
  const limits: Record<string, { requests: number; window: number }> = {
    '/api/v1/vau': { 
      requests: RATE_LIMIT_THRESHOLDS.VAU, 
      window: RATE_LIMIT_WINDOWS.VAU 
    },
    '/api/v1/vau/batch': { 
      requests: RATE_LIMIT_THRESHOLDS.VAU_BATCH, 
      window: RATE_LIMIT_WINDOWS.VAU 
    },
    '/api/v1/auth': { 
      requests: RATE_LIMIT_THRESHOLDS.AUTH, 
      window: RATE_LIMIT_WINDOWS.AUTH 
    },
    'default': { 
      requests: RATE_LIMIT_THRESHOLDS.DEFAULT, 
      window: RATE_LIMIT_WINDOWS.DEFAULT 
    }
  };

  const limit = limits[endpoint] || limits.default;
  const key = `rate:${ip}:${endpoint}`;

  // Use Durable Object for rate limiting
  const id = env.RATE_LIMITER.idFromName(key);
  const limiter = env.RATE_LIMITER.get(id);

  const response = await limiter.fetch(
    new Request('https://rate-limiter/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        key,
        limit: limit.requests,
        window: limit.window
      })
    })
  );

  const result = await response.json() as {
    allowed: boolean;
    count: number;
    remaining: number;
    resetAt: number;
    retryAfter?: number;
  };

  // Add rate limit headers to request for later use
  (request as any).rateLimitInfo = {
    limit: limit.requests,
    remaining: result.remaining,
    reset: result.resetAt
  };

  if (!result.allowed) {
    throw new RateLimitError(
      'Rate limit exceeded',
      result.retryAfter || Math.ceil((result.resetAt - Date.now()) / 1000)
    );
  }
}