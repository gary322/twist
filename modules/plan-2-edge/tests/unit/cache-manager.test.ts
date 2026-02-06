// Unit tests for Cache Manager
import { CacheManager } from '../../workers/vau-processor/src/middleware/cache';

// Mock Cloudflare Cache API
const mockCache = {
  match: jest.fn(),
  put: jest.fn(),
  delete: jest.fn()
};

(global as any).caches = {
  default: mockCache
};

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager();
    jest.clearAllMocks();
  });

  describe('Cache Key Generation', () => {
    test('should normalize cache keys by sorting query params', async () => {
      const request1 = new Request('https://api.twist.io/data?b=2&a=1');
      const request2 = new Request('https://api.twist.io/data?a=1&b=2');
      
      const key1 = cacheManager['getCacheKey'](request1);
      const key2 = cacheManager['getCacheKey'](request2);
      
      expect(key1.url).toBe(key2.url);
    });

    test('should remove cache-busting parameters', async () => {
      const request = new Request('https://api.twist.io/data?value=test&_=123456&cb=789');
      const key = cacheManager['getCacheKey'](request);
      
      expect(key.url).toBe('https://api.twist.io/data?value=test');
      expect(key.url).not.toContain('_=');
      expect(key.url).not.toContain('cb=');
    });

    test('should include vary headers in cache key', async () => {
      const request = new Request('https://api.twist.io/api/v1/data', {
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'en-US',
          'User-Agent': 'Test/1.0'
        }
      });
      
      const key = cacheManager['getCacheKey'](request);
      
      expect(key.headers.get('Accept')).toBe('application/json');
      expect(key.headers.get('Accept-Language')).toBe('en-US');
      expect(key.headers.has('User-Agent')).toBe(false); // Not in vary headers
    });
  });

  describe('Cache Rules', () => {
    test('should apply correct cache rules for different paths', () => {
      const testCases = [
        { path: '/static/image.jpg', expected: { browserTTL: 31536000, edgeTTL: 31536000 } },
        { path: '/api/v1/config', expected: { browserTTL: 300, edgeTTL: 60 } },
        { path: '/api/v1/vau', expected: { browserTTL: 0, edgeTTL: 0, bypassCache: true } },
        { path: '/health', expected: { browserTTL: 0, edgeTTL: 10 } },
        { path: '/unknown', expected: { browserTTL: 0, edgeTTL: 60 } } // Default
      ];

      for (const testCase of testCases) {
        const rule = cacheManager['getCacheRule'](testCase.path);
        expect(rule.browserTTL).toBe(testCase.expected.browserTTL);
        expect(rule.edgeTTL).toBe(testCase.expected.edgeTTL);
        if (testCase.expected.bypassCache !== undefined) {
          expect(rule.bypassCache).toBe(testCase.expected.bypassCache);
        }
      }
    });
  });

  describe('Cache Hit Scenarios', () => {
    test('should return cached response when fresh', async () => {
      const cachedResponse = new Response('Cached data', {
        headers: {
          'Date': new Date(Date.now() - 30000).toUTCString(), // 30 seconds ago
          'Cache-Control': 'public, max-age=300, s-maxage=60'
        }
      });
      
      mockCache.match.mockResolvedValueOnce(cachedResponse.clone());
      
      const request = new Request('https://api.twist.io/api/v1/config');
      const handler = jest.fn().mockResolvedValue(new Response('Fresh data'));
      
      const response = await cacheManager.handleRequest(request, handler);
      
      expect(handler).not.toHaveBeenCalled(); // Should not fetch fresh
      expect(response.headers.get('X-Cache')).toBe('HIT');
      expect(response.headers.get('X-Cache-Age')).toBeTruthy();
      expect(await response.text()).toBe('Cached data');
    });

    test('should return stale response with revalidation', async () => {
      const staleResponse = new Response('Stale data', {
        headers: {
          'Date': new Date(Date.now() - 120000).toUTCString(), // 2 minutes ago
          'Cache-Control': 'public, max-age=300, s-maxage=60'
        }
      });
      
      mockCache.match.mockResolvedValueOnce(staleResponse.clone());
      
      const request = new Request('https://api.twist.io/api/v1/config');
      const handler = jest.fn().mockResolvedValue(new Response('Fresh data'));
      
      const response = await cacheManager.handleRequest(request, handler);
      
      expect(response.headers.get('X-Cache')).toBe('STALE');
      expect(response.headers.get('Warning')).toContain('stale');
      expect(await response.text()).toBe('Stale data');
      
      // Handler should be called for revalidation
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Cache Miss Scenarios', () => {
    test('should fetch and cache on miss', async () => {
      mockCache.match.mockResolvedValueOnce(null);
      
      const freshResponse = new Response('Fresh data', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
      
      const request = new Request('https://api.twist.io/api/v1/config');
      const handler = jest.fn().mockResolvedValue(freshResponse.clone());
      
      const response = await cacheManager.handleRequest(request, handler);
      
      expect(handler).toHaveBeenCalled();
      expect(mockCache.put).toHaveBeenCalled();
      expect(response.headers.get('X-Cache')).toBe('MISS');
      expect(response.headers.get('Cache-Control')).toContain('max-age=300');
    });

    test('should not cache failed responses', async () => {
      mockCache.match.mockResolvedValueOnce(null);
      
      const errorResponse = new Response('Error', { status: 500 });
      
      const request = new Request('https://api.twist.io/api/v1/config');
      const handler = jest.fn().mockResolvedValue(errorResponse);
      
      const response = await cacheManager.handleRequest(request, handler);
      
      expect(handler).toHaveBeenCalled();
      expect(mockCache.put).not.toHaveBeenCalled();
      expect(response.status).toBe(500);
    });
  });

  describe('Cache Bypass', () => {
    test('should bypass cache for non-GET requests', async () => {
      const request = new Request('https://api.twist.io/api/v1/config', {
        method: 'POST'
      });
      const handler = jest.fn().mockResolvedValue(new Response('Posted'));
      
      const response = await cacheManager.handleRequest(request, handler);
      
      expect(mockCache.match).not.toHaveBeenCalled();
      expect(handler).toHaveBeenCalled();
      expect(response.headers.get('X-Cache')).toBe('BYPASS');
    });

    test('should bypass cache for configured paths', async () => {
      const request = new Request('https://api.twist.io/api/v1/vau');
      const handler = jest.fn().mockResolvedValue(new Response('VAU data'));
      
      const response = await cacheManager.handleRequest(request, handler);
      
      expect(mockCache.match).not.toHaveBeenCalled();
      expect(handler).toHaveBeenCalled();
      expect(response.headers.get('X-Cache')).toBe('BYPASS');
    });
  });

  describe('Cache Control Headers', () => {
    test('should respect no-cache directives', () => {
      const responseWithNoCache = new Response('Data', {
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      expect(cacheManager['shouldCache'](responseWithNoCache)).toBe(false);
    });

    test('should respect private directives', () => {
      const privateResponse = new Response('Data', {
        headers: { 'Cache-Control': 'private, max-age=300' }
      });
      
      expect(cacheManager['shouldCache'](privateResponse)).toBe(false);
    });

    test('should calculate correct age from Date header', () => {
      const response = new Response('Data', {
        headers: {
          'Date': new Date(Date.now() - 45000).toUTCString() // 45 seconds ago
        }
      });
      
      const age = cacheManager['getResponseAge'](response);
      expect(age).toBeGreaterThanOrEqual(44);
      expect(age).toBeLessThanOrEqual(46);
    });

    test('should extract max-age correctly', () => {
      const testCases = [
        { header: 'public, max-age=300, s-maxage=60', expected: 60 },
        { header: 'public, max-age=300', expected: 300 },
        { header: 'no-cache', expected: 0 }
      ];

      for (const testCase of testCases) {
        const response = new Response('Data', {
          headers: { 'Cache-Control': testCase.header }
        });
        
        expect(cacheManager['getMaxAge'](response)).toBe(testCase.expected);
      }
    });
  });

  describe('Cache Statistics', () => {
    test('should return cache statistics', async () => {
      const stats = await cacheManager.getCacheStats();
      
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('bandwidthSaved');
      expect(stats).toHaveProperty('requestsSaved');
    });
  });

  describe('Cache Purging', () => {
    test('should support cache purging', async () => {
      const purgedCount = await cacheManager.purgeCache('/api/v1/*');
      
      expect(purgedCount).toBeDefined();
      expect(typeof purgedCount).toBe('number');
    });
  });
});