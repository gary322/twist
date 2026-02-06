import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, map } from 'rxjs/operators';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
const compression = require('compression');

interface PerformanceMetrics {
  endpoint: string;
  method: string;
  statusCode: number;
  duration: number;
  timestamp: Date;
  memoryUsage: NodeJS.MemoryUsage;
  userId?: string;
  requestSize: number;
  responseSize: number;
}

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PerformanceInterceptor.name);
  private readonly slowRequestThreshold = 1000; // 1 second
  private readonly performanceWindow = 300; // 5 minutes

  constructor(@InjectRedis() private readonly redis: Redis) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    
    const startTime = Date.now();
    const startMemory = process.memoryUsage();
    const requestSize = parseInt(request.headers['content-length'] || '0');

    // Apply compression for responses
    this.applyCompression(request, response);

    // Add cache headers for static content
    this.setCacheHeaders(request, response);

    return next.handle().pipe(
      tap(async (data) => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        const endMemory = process.memoryUsage();

        // Calculate response size
        const responseSize = this.calculateResponseSize(data);

        const metrics: PerformanceMetrics = {
          endpoint: request.route?.path || request.url,
          method: request.method,
          statusCode: response.statusCode,
          duration,
          timestamp: new Date(),
          memoryUsage: {
            rss: endMemory.rss - startMemory.rss,
            heapTotal: endMemory.heapTotal - startMemory.heapTotal,
            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
            external: endMemory.external - startMemory.external,
            arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers,
          },
          userId: request.user?.id,
          requestSize,
          responseSize,
        };

        // Log and track performance
        await this.trackPerformance(metrics);

        // Add performance headers
        response.setHeader('X-Response-Time', `${duration}ms`);
        response.setHeader('X-Request-Id', request.id || 'unknown');
      }),
      map((data) => {
        // Optimize response data
        return this.optimizeResponse(data);
      }),
    );
  }

  private applyCompression(request: any, response: any) {
    // Skip compression for small responses or already compressed content
    const acceptEncoding = request.headers['accept-encoding'] || '';
    
    if (acceptEncoding.includes('gzip')) {
      compression({
        filter: (req, res) => {
          // Don't compress if already compressed
          if (res.getHeader('Content-Encoding')) {
            return false;
          }
          // Compress text-based responses
          return compression.filter(req, res);
        },
        threshold: 1024, // Only compress if size > 1KB
        level: 6, // Balanced compression level
      })(request, response, () => {});
    }
  }

  private setCacheHeaders(request: any, response: any) {
    const url = request.url;
    
    // Cache static assets
    if (url.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
      response.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
      response.setHeader('Vary', 'Accept-Encoding');
    }
    // Cache API responses based on endpoint
    else if (request.method === 'GET') {
      if (url.includes('/api/influencers/search')) {
        response.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300'); // 1 min client, 5 min CDN
      } else if (url.includes('/api/analytics')) {
        response.setHeader('Cache-Control', 'private, max-age=300'); // 5 minutes
      } else if (url.includes('/api/staking/pools')) {
        response.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60'); // 30s client, 1 min CDN
      }
    }
    
    // Never cache sensitive endpoints
    if (url.includes('/api/auth') || url.includes('/api/payouts')) {
      response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      response.setHeader('Pragma', 'no-cache');
      response.setHeader('Expires', '0');
    }
  }

  private calculateResponseSize(data: any): number {
    if (!data) return 0;
    
    try {
      return Buffer.byteLength(JSON.stringify(data));
    } catch {
      return 0;
    }
  }

  private async trackPerformance(metrics: PerformanceMetrics) {
    const key = `performance:${metrics.endpoint}:${metrics.method}`;
    
    // Track in Redis for real-time monitoring
    await this.redis.zadd(
      key,
      Date.now(),
      JSON.stringify({
        duration: metrics.duration,
        timestamp: metrics.timestamp,
        statusCode: metrics.statusCode,
      }),
    );

    // Keep only recent data
    await this.redis.zremrangebyscore(
      key,
      '-inf',
      Date.now() - this.performanceWindow * 1000,
    );

    // Track slow requests
    if (metrics.duration > this.slowRequestThreshold) {
      await this.logSlowRequest(metrics);
    }

    // Update aggregated metrics
    await this.updateAggregatedMetrics(metrics);

    // Check for performance degradation
    await this.checkPerformanceDegradation(metrics);
  }

  private async logSlowRequest(metrics: PerformanceMetrics) {
    this.logger.warn(`Slow request detected: ${metrics.endpoint}`, {
      duration: metrics.duration,
      method: metrics.method,
      userId: metrics.userId,
      memoryDelta: metrics.memoryUsage.heapUsed,
    });

    // Store slow request for analysis
    await this.redis.lpush(
      'performance:slow_requests',
      JSON.stringify(metrics),
    );
    await this.redis.ltrim('performance:slow_requests', 0, 999); // Keep last 1000
  }

  private async updateAggregatedMetrics(metrics: PerformanceMetrics) {
    const hourKey = `performance:hourly:${new Date().toISOString().slice(0, 13)}`;
    const endpoint = `${metrics.method}:${metrics.endpoint}`;

    // Increment request count
    await this.redis.hincrby(hourKey, `${endpoint}:count`, 1);
    
    // Update total duration
    await this.redis.hincrbyfloat(hourKey, `${endpoint}:duration`, metrics.duration);
    
    // Update max duration
    const currentMax = await this.redis.hget(hourKey, `${endpoint}:max`);
    if (!currentMax || metrics.duration > parseFloat(currentMax)) {
      await this.redis.hset(hourKey, `${endpoint}:max`, metrics.duration);
    }

    // Update status code counts
    await this.redis.hincrby(hourKey, `${endpoint}:${metrics.statusCode}`, 1);

    // Set expiration
    await this.redis.expire(hourKey, 86400); // 24 hours
  }

  private async checkPerformanceDegradation(metrics: PerformanceMetrics) {
    const key = `performance:${metrics.endpoint}:${metrics.method}`;
    
    // Get recent performance data
    const recentData = await this.redis.zrange(key, -100, -1);
    if (recentData.length < 50) return; // Not enough data

    const durations = recentData.map(d => JSON.parse(d).duration);
    const avgDuration = durations.reduce((a, b) => a + b) / durations.length;
    
    // Check if current request is significantly slower
    if (metrics.duration > avgDuration * 2) {
      this.logger.warn(`Performance degradation detected for ${metrics.endpoint}`, {
        currentDuration: metrics.duration,
        averageDuration: avgDuration,
        degradationFactor: metrics.duration / avgDuration,
      });

      // You might want to trigger alerts here
    }
  }

  private optimizeResponse(data: any): any {
    if (!data || typeof data !== 'object') return data;

    // Remove null/undefined values to reduce payload size
    if (Array.isArray(data)) {
      return data.map(item => this.optimizeResponse(item));
    }

    const optimized = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined) {
        if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
          optimized[key] = this.optimizeResponse(value);
        } else {
          optimized[key] = value;
        }
      }
    }

    return optimized;
  }
}

// Cache interceptor for GET requests
@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInterceptor.name);
  
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Only cache GET requests
    if (request.method !== 'GET') {
      return next.handle();
    }

    // Skip caching for authenticated endpoints that return user-specific data
    const skipCache = ['/api/auth', '/api/user', '/api/payouts', '/api/settings'];
    if (skipCache.some(path => request.url.startsWith(path))) {
      return next.handle();
    }

    const cacheKey = this.generateCacheKey(request);
    
    // Try to get from cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      response.setHeader('X-Cache', 'HIT');
      response.setHeader('X-Cache-Key', cacheKey);
      return new Observable(observer => {
        observer.next(JSON.parse(cached));
        observer.complete();
      });
    }

    // Cache miss - execute handler and cache result
    response.setHeader('X-Cache', 'MISS');
    
    return next.handle().pipe(
      tap(async (data) => {
        // Cache successful responses only
        if (response.statusCode === 200) {
          const ttl = this.getCacheTTL(request.url);
          if (ttl > 0) {
            await this.redis.setex(
              cacheKey,
              ttl,
              JSON.stringify(data),
            );
          }
        }
      }),
    );
  }

  private generateCacheKey(request: any): string {
    const userId = request.user?.id || 'anonymous';
    const query = JSON.stringify(request.query);
    return `cache:${request.method}:${request.url}:${userId}:${query}`;
  }

  private getCacheTTL(url: string): number {
    // Different TTL for different endpoints
    if (url.includes('/api/influencers/search')) return 60; // 1 minute
    if (url.includes('/api/staking/pools')) return 30; // 30 seconds
    if (url.includes('/api/analytics')) return 300; // 5 minutes
    if (url.includes('/api/content')) return 600; // 10 minutes
    
    return 0; // Don't cache by default
  }
}

// Request ID interceptor for tracing
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    
    // Generate or extract request ID
    const requestId = request.headers['x-request-id'] || 
                     request.headers['x-correlation-id'] || 
                     this.generateRequestId();
    
    // Attach to request for logging
    request.id = requestId;
    
    // Add to response headers
    response.setHeader('X-Request-ID', requestId);
    
    return next.handle();
  }

  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}