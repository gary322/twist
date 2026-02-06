// Advanced Caching Strategy
import { IRequest } from 'itty-router';
import { Env } from '../types';
import { logger } from '../utils/logger';

export class CacheManager {
  private readonly CACHE_RULES: Record<string, CacheRule> = {
    // Static assets
    '/static/*': {
      browserTTL: 31536000, // 1 year
      edgeTTL: 31536000,
      bypassCache: false
    },
    // API responses
    '/api/v1/config': {
      browserTTL: 300, // 5 minutes
      edgeTTL: 60,
      bypassCache: false,
      revalidate: true
    },
    '/api/v1/prices': {
      browserTTL: 10,
      edgeTTL: 5,
      bypassCache: false,
      revalidate: true
    },
    // Dynamic content
    '/api/v1/vau': {
      browserTTL: 0,
      edgeTTL: 0,
      bypassCache: true
    },
    '/api/v1/vau/batch': {
      browserTTL: 0,
      edgeTTL: 0,
      bypassCache: true
    },
    // Health checks
    '/health': {
      browserTTL: 0,
      edgeTTL: 10,
      bypassCache: false
    },
    // Metrics
    '/metrics': {
      browserTTL: 0,
      edgeTTL: 5,
      bypassCache: false
    }
  };

  async handleRequest(request: Request, handler: () => Promise<Response>): Promise<Response> {
    const url = new URL(request.url);
    const cacheKey = this.getCacheKey(request);
    const cache = (caches as any).default;

    // Check if cacheable
    const rule = this.getCacheRule(url.pathname);
    if (rule.bypassCache || request.method !== 'GET') {
      const response = await handler();
      return this.addCacheHeaders(response, rule, false);
    }

    // Try cache first
    let response = await cache.match(cacheKey);

    if (response) {
      // Check if stale
      const age = this.getResponseAge(response);
      const maxAge = this.getMaxAge(response);

      if (age < maxAge) {
        // Cache hit
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: this.mergeCacheHeaders(response.headers, {
            'X-Cache': 'HIT',
            'X-Cache-Age': age.toString(),
            'Age': age.toString()
          })
        });
      } else if (rule.revalidate) {
        // Stale while revalidate
        const revalidatePromise = this.revalidate(cacheKey, handler, rule);
        
        // Return stale response immediately
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: this.mergeCacheHeaders(response.headers, {
            'X-Cache': 'STALE',
            'X-Cache-Age': age.toString(),
            'Age': age.toString(),
            'Warning': '110 - "Response is stale"'
          })
        });
      }
    }

    // Cache miss - fetch fresh
    response = await handler();

    // Clone response before using body to avoid consumption issues
    const responseClone = response.clone();

    // Cache successful responses
    if (this.shouldCache(response)) {
      const cacheHeaders = this.mergeCacheHeaders(response.headers, {
        'Cache-Control': `public, max-age=${rule.browserTTL}, s-maxage=${rule.edgeTTL}`,
        'X-Cache': 'MISS',
        'Date': new Date().toUTCString()
      });

      const cacheResponse = new Response(responseClone.body, {
        status: response.status,
        statusText: response.statusText,
        headers: cacheHeaders
      });

      await cache.put(cacheKey, cacheResponse);
    }

    return this.addCacheHeaders(response, rule, true);
  }

  private getCacheKey(request: Request): Request {
    const url = new URL(request.url);

    // Normalize cache key
    url.searchParams.sort();

    // Remove cache-busting params
    const cacheBustingParams = ['_', 'cachebuster', 'cb', 'ts', 'timestamp'];
    for (const param of cacheBustingParams) {
      url.searchParams.delete(param);
    }

    // Include important headers in cache key
    const headers = new Headers(request.headers);
    const varyHeaders = this.getVaryHeaders(request);

    const cacheHeaders = new Headers();
    for (const header of varyHeaders) {
      if (headers.has(header)) {
        cacheHeaders.set(header, headers.get(header)!);
      }
    }

    return new Request(url.toString(), {
      method: 'GET',
      headers: cacheHeaders
    });
  }

  private getCacheRule(pathname: string): CacheRule {
    // Find matching rule
    for (const [pattern, rule] of Object.entries(this.CACHE_RULES)) {
      if (this.matchPattern(pathname, pattern)) {
        return rule;
      }
    }

    // Default rule
    return {
      browserTTL: 0,
      edgeTTL: 60,
      bypassCache: false
    };
  }

  private matchPattern(pathname: string, pattern: string): boolean {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return pathname.startsWith(prefix);
    }
    return pathname === pattern;
  }

  private async revalidate(
    cacheKey: Request, 
    handler: () => Promise<Response>,
    rule: CacheRule
  ): Promise<void> {
    try {
      const response = await handler();
      if (this.shouldCache(response)) {
        const cacheResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: this.mergeCacheHeaders(response.headers, {
            'Cache-Control': `public, max-age=${rule.browserTTL}, s-maxage=${rule.edgeTTL}`,
            'Date': new Date().toUTCString()
          })
        });
        await (caches as any).default.put(cacheKey, cacheResponse);
      }
    } catch (error) {
      console.error('Revalidation error:', error);
    }
  }

  private getResponseAge(response: Response): number {
    const date = response.headers.get('Date');
    if (!date) return 0;

    return Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  }

  private getMaxAge(response: Response): number {
    const cacheControl = response.headers.get('Cache-Control');
    if (!cacheControl) return 0;

    const match = cacheControl.match(/s-maxage=(\d+)/);
    if (match) return parseInt(match[1]);

    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
    return maxAgeMatch ? parseInt(maxAgeMatch[1]) : 0;
  }

  private shouldCache(response: Response): boolean {
    // Only cache successful responses
    if (response.status !== 200 && response.status !== 304) {
      return false;
    }

    // Check cache control directives
    const cacheControl = response.headers.get('Cache-Control');
    if (cacheControl) {
      const directives = cacheControl.toLowerCase().split(',').map(s => s.trim());
      if (directives.includes('no-cache') || 
          directives.includes('no-store') || 
          directives.includes('private')) {
        return false;
      }
    }

    return true;
  }

  private getVaryHeaders(request: Request): string[] {
    const url = new URL(request.url);
    
    // Different vary headers for different endpoints
    if (url.pathname.startsWith('/api/')) {
      return ['Accept', 'Accept-Encoding', 'Accept-Language', 'Authorization'];
    }
    
    return ['Accept', 'Accept-Encoding'];
  }

  private mergeCacheHeaders(
    originalHeaders: Headers, 
    additionalHeaders: Record<string, string>
  ): Headers {
    const headers = new Headers(originalHeaders);
    
    for (const [key, value] of Object.entries(additionalHeaders)) {
      headers.set(key, value);
    }
    
    return headers;
  }

  private addCacheHeaders(
    response: Response, 
    rule: CacheRule, 
    isMiss: boolean
  ): Response {
    const headers = new Headers(response.headers);
    
    // Add cache control headers
    if (!headers.has('Cache-Control')) {
      headers.set('Cache-Control', `public, max-age=${rule.browserTTL}, s-maxage=${rule.edgeTTL}`);
    }
    
    // Add cache status
    headers.set('X-Cache', isMiss ? 'MISS' : 'BYPASS');
    
    // Add timing headers
    headers.set('X-Cache-TTL', rule.edgeTTL.toString());
    
    // Add vary header
    if (!headers.has('Vary')) {
      headers.set('Vary', 'Accept-Encoding');
    }
    
    // Clone the response to avoid body consumption issues
    const clonedResponse = response.clone();
    return new Response(clonedResponse.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  // Cache purge functionality
  async purgeCache(pattern?: string): Promise<number> {
    let purgedCount = 0;
    
    if (pattern) {
      // Pattern-based purge
      // Note: Cloudflare doesn't support listing cache keys, 
      // so we'd need to maintain a separate index
      logger.info(`Purging cache for pattern: ${pattern}`);
      // In production, this would call Cloudflare's purge API
    } else {
      // Purge everything
      // In production: await caches.default.delete('*');
      logger.info('Purging entire cache');
    }
    
    return purgedCount;
  }

  // Get cache statistics
  async getCacheStats(): Promise<CacheStats> {
    // In production, these would come from Cloudflare Analytics API
    return {
      hits: 0,
      misses: 0,
      hitRate: 0,
      bandwidthSaved: 0,
      requestsSaved: 0
    };
  }
}

interface CacheRule {
  browserTTL: number;
  edgeTTL: number;
  bypassCache: boolean;
  revalidate?: boolean;
}

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  bandwidthSaved: number;
  requestsSaved: number;
}

// Middleware function for easy integration with itty-router
export async function withCache(request: IRequest, env: Env): Promise<Response | void> {
  // Store cache manager instance on request for use in handler
  (request as any).cacheManager = new CacheManager();
  
  // Continue to next middleware
  return;
}