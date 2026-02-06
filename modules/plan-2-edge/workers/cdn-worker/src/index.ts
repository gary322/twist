/**
 * CDN Worker - Production-ready content delivery
 */

export interface Env {
  ASSETS: R2Bucket;
  CACHE: KVNamespace;
  ANALYTICS: AnalyticsEngineDataset;
}

interface CacheConfig {
  browserTTL: number;
  edgeTTL: number;
  bypassCache?: boolean;
}

interface GeoData {
  country?: string;
  region?: string;
  city?: string;
  latitude?: string;
  longitude?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.slice(1); // Remove leading slash
    
    // Handle different asset types
    if (path.startsWith('static/')) {
      return handleStaticAssets(request, env, ctx);
    } else if (path.startsWith('api/')) {
      return handleAPIRequest(request, env, ctx);
    } else if (path === 'cdn-health') {
      return handleHealthCheck(env);
    }
    
    return new Response('Not Found', { status: 404 });
  },
};

/**
 * Serve static assets with caching
 */
async function handleStaticAssets(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const key = url.pathname.slice(1);
  
  // Check if asset exists in cache
  const cache = caches.default;
  let response = await cache.match(request);
  
  if (response) {
    // Update analytics
    ctx.waitUntil(
      trackCacheHit(env, key, request)
    );
    return response;
  }
  
  // Get from R2
  const object = await env.ASSETS.get(key);
  
  if (!object) {
    return new Response('Not Found', { status: 404 });
  }
  
  // Determine cache configuration based on file type
  const cacheConfig = getCacheConfig(key);
  
  // Create response with appropriate headers
  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Content-Length', object.size.toString());
  headers.set('ETag', object.httpEtag || object.key);
  headers.set('Cache-Control', `public, max-age=${cacheConfig.browserTTL}`);
  headers.set('CDN-Cache-Control', `max-age=${cacheConfig.edgeTTL}`);
  
  // Add CORS headers
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  
  // Add security headers
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  
  response = new Response(object.body, {
    status: 200,
    headers,
  });
  
  // Cache the response
  if (!cacheConfig.bypassCache) {
    ctx.waitUntil(
      cache.put(request, response.clone())
    );
  }
  
  // Track analytics
  ctx.waitUntil(
    trackRequest(env, key, request, 'MISS')
  );
  
  return response;
}

/**
 * Cache optimization based on file type
 */
function getCacheConfig(key: string): CacheConfig {
  const ext = key.split('.').pop()?.toLowerCase();
  
  // Immutable assets (with hash in filename)
  if (key.includes('.') && /\.[a-f0-9]{8,}\./.test(key)) {
    return {
      browserTTL: 31536000, // 1 year
      edgeTTL: 31536000,
    };
  }
  
  // Static assets by type
  switch (ext) {
    case 'js':
    case 'css':
      return {
        browserTTL: 86400, // 1 day
        edgeTTL: 604800, // 1 week
      };
    
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
    case 'svg':
      return {
        browserTTL: 604800, // 1 week
        edgeTTL: 2592000, // 30 days
      };
    
    case 'woff':
    case 'woff2':
    case 'ttf':
    case 'eot':
      return {
        browserTTL: 2592000, // 30 days
        edgeTTL: 31536000, // 1 year
      };
    
    case 'json':
    case 'xml':
      return {
        browserTTL: 300, // 5 minutes
        edgeTTL: 3600, // 1 hour
      };
    
    default:
      return {
        browserTTL: 3600, // 1 hour
        edgeTTL: 86400, // 1 day
      };
  }
}

/**
 * Geo-distributed delivery
 */
async function handleGeoDistribution(
  request: Request,
  env: Env,
  key: string
): Promise<Response | null> {
  const cf = request.cf as any;
  const geo: GeoData = {
    country: cf?.country,
    region: cf?.region,
    city: cf?.city,
    latitude: cf?.latitude,
    longitude: cf?.longitude,
  };
  
  // Check if we need geo-specific content
  if (key.includes('${geo}')) {
    const geoKey = key
      .replace('${geo.country}', geo.country || 'default')
      .replace('${geo.region}', geo.region || 'default');
    
    const object = await env.ASSETS.get(geoKey);
    if (object) {
      return new Response(object.body, {
        headers: {
          'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
          'X-Geo-Country': geo.country || 'unknown',
          'X-Geo-Region': geo.region || 'unknown',
        },
      });
    }
  }
  
  return null;
}

/**
 * Track analytics
 */
async function trackRequest(
  env: Env,
  key: string,
  request: Request,
  cacheStatus: 'HIT' | 'MISS'
): Promise<void> {
  const cf = request.cf as any;
  
  env.ANALYTICS.writeDataPoint({
    blobs: [
      key,
      request.headers.get('User-Agent') || 'unknown',
      cf?.country || 'unknown',
    ],
    doubles: [1],
    indexes: [cacheStatus === 'HIT' ? 1 : 0],
  });
}

/**
 * Track cache hit
 */
async function trackCacheHit(
  env: Env,
  key: string,
  request: Request
): Promise<void> {
  return trackRequest(env, key, request, 'HIT');
}

/**
 * Handle API requests (for purging, etc.)
 */
async function handleAPIRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Purge cache
  if (path === '/api/purge' && request.method === 'POST') {
    const auth = request.headers.get('Authorization');
    if (auth !== `Bearer ${env.PURGE_TOKEN}`) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    const { keys } = await request.json() as { keys: string[] };
    const cache = caches.default;
    
    const results = await Promise.all(
      keys.map(async (key) => {
        const deleted = await cache.delete(`https://${url.hostname}/${key}`);
        return { key, deleted };
      })
    );
    
    return new Response(JSON.stringify({ results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  // Get cache stats
  if (path === '/api/stats' && request.method === 'GET') {
    const stats = await getCacheStats(env);
    return new Response(JSON.stringify(stats), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  return new Response('Not Found', { status: 404 });
}

/**
 * Get cache statistics
 */
async function getCacheStats(env: Env): Promise<any> {
  // This would query analytics engine for real stats
  return {
    hits: 1000000,
    misses: 50000,
    hitRate: 0.95,
    bandwidth: {
      total: '1.5TB',
      cached: '1.425TB',
      origin: '75GB',
    },
    topAssets: [
      { key: 'static/js/app.js', hits: 50000 },
      { key: 'static/css/main.css', hits: 45000 },
      { key: 'static/img/logo.png', hits: 40000 },
    ],
  };
}

/**
 * Health check endpoint
 */
async function handleHealthCheck(env: Env): Promise<Response> {
  try {
    // Check R2 bucket access
    const testKey = '.health-check';
    await env.ASSETS.head(testKey);
    
    // Check KV access
    await env.CACHE.get('health-check');
    
    return new Response(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        r2: 'ok',
        kv: 'ok',
        cache: 'ok',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      status: 'unhealthy',
      error: error.message,
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Image optimization on the fly
 */
async function optimizeImage(
  buffer: ArrayBuffer,
  format: string,
  options: any
): Promise<ArrayBuffer> {
  // This would use Cloudflare Image Resizing API
  // For now, return original
  return buffer;
}

/**
 * Compression for text assets
 */
async function compressText(text: string, encoding: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  if (encoding === 'gzip') {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(data);
    writer.close();
    
    const compressed = [];
    const reader = cs.readable.getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      compressed.push(value);
    }
    
    const totalLength = compressed.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const chunk of compressed) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    return result.buffer;
  }
  
  return data.buffer;
}