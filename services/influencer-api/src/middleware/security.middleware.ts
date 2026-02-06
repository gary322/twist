import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
const { RateLimiterMemory, RateLimiterRes } = require('rate-limiter-flexible');
const helmet = require('helmet');
import * as crypto from 'crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

interface SecurityConfig {
  rateLimiting: {
    points: number;
    duration: number;
    blockDuration: number;
  };
  csrf: {
    enabled: boolean;
    cookieName: string;
  };
  cors: {
    origins: string[];
    credentials: boolean;
  };
  headers: {
    hsts: boolean;
    noSniff: boolean;
    xssFilter: boolean;
    referrerPolicy: string;
  };
}

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private rateLimiter: any;
  private readonly securityConfig: SecurityConfig = {
    rateLimiting: {
      points: 100, // Number of requests
      duration: 60, // Per minute
      blockDuration: 300, // Block for 5 minutes
    },
    csrf: {
      enabled: true,
      cookieName: 'csrf-token',
    },
    cors: {
      origins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://${process.env.API_HOST}'],
      credentials: true,
    },
    headers: {
      hsts: true,
      noSniff: true,
      xssFilter: true,
      referrerPolicy: 'strict-origin-when-cross-origin',
    },
  };

  constructor(@InjectRedis() private readonly redis: Redis) {
    // Initialize rate limiter
    this.rateLimiter = new RateLimiterMemory({
      points: this.securityConfig.rateLimiting.points,
      duration: this.securityConfig.rateLimiting.duration,
      blockDuration: this.securityConfig.rateLimiting.blockDuration,
    });
  }

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      // 1. Apply security headers
      this.applySecurityHeaders(req, res);

      // 2. Rate limiting
      await this.applyRateLimiting(req, res);

      // 3. CSRF protection
      if (this.securityConfig.csrf.enabled) {
        await this.applyCsrfProtection(req, res);
      }

      // 4. Input sanitization
      this.sanitizeInput(req);

      // 5. Request validation
      await this.validateRequest(req);

      // 6. Log security events
      await this.logSecurityEvent(req, 'request_allowed');

      next();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      await this.logSecurityEvent(req, 'request_blocked', error.message);
      throw new HttpException('Security check failed', HttpStatus.FORBIDDEN);
    }
  }

  private applySecurityHeaders(req: Request, res: Response) {
    // Apply helmet security headers
    if (this.securityConfig.headers.hsts) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    
    if (this.securityConfig.headers.noSniff) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
    
    if (this.securityConfig.headers.xssFilter) {
      res.setHeader('X-XSS-Protection', '1; mode=block');
    }
    
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', this.securityConfig.headers.referrerPolicy);
    
    // Content Security Policy
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' wss: https:;"
    );

    // CORS headers
    const origin = req.headers.origin;
    if (origin && this.securityConfig.cors.origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-CSRF-Token'
      );
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    }
  }

  private async applyRateLimiting(req: Request, res: Response) {
    const key = this.getRateLimitKey(req);
    
    try {
      await this.rateLimiter.consume(key);
    } catch (rejRes) {
      if (rejRes instanceof RateLimiterRes) {
        res.setHeader('Retry-After', String(Math.round(rejRes.msBeforeNext / 1000)) || '60');
        res.setHeader('X-RateLimit-Limit', String(this.securityConfig.rateLimiting.points));
        res.setHeader('X-RateLimit-Remaining', String(rejRes.remainingPoints || 0));
        res.setHeader('X-RateLimit-Reset', String(rejRes.msBeforeNext || 0));
        
        throw new HttpException(
          'Too many requests, please try again later',
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
      throw rejRes;
    }
  }

  private async applyCsrfProtection(req: Request, res: Response) {
    // Skip CSRF for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return;
    }

    const token = req.headers['x-csrf-token'] || req.body._csrf;
    const sessionToken = (req as any).session?.csrfToken;

    if (!token || !sessionToken || token !== sessionToken) {
      // Generate new token for the session
      if (!(req as any).session) {
        (req as any).session = {};
      }
      
      const newToken = crypto.randomBytes(32).toString('hex');
      (req as any).session.csrfToken = newToken;
      res.cookie(this.securityConfig.csrf.cookieName, newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });

      throw new HttpException('Invalid CSRF token', HttpStatus.FORBIDDEN);
    }
  }

  private sanitizeInput(req: Request) {
    // Sanitize common injection patterns
    const sanitizeString = (str: string): string => {
      if (typeof str !== 'string') return str;
      
      // Remove null bytes
      str = str.replace(/\0/g, '');
      
      // Escape HTML entities
      str = str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
      
      return str;
    };

    const sanitizeObject = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) {
        return typeof obj === 'string' ? sanitizeString(obj) : obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      }

      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          // Sanitize key
          const sanitizedKey = sanitizeString(key);
          sanitized[sanitizedKey] = sanitizeObject(obj[key]);
        }
      }
      return sanitized;
    };

    // Sanitize request data
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }
    if (req.params) {
      req.params = sanitizeObject(req.params);
    }
  }

  private async validateRequest(req: Request) {
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /(\.\.[\/\\])+/g, // Path traversal
      /<script[\s\S]*?>[\s\S]*?<\/script>/gi, // Script tags
      /javascript:/gi, // JavaScript protocol
      /on\w+\s*=/gi, // Event handlers
      /union.*select/gi, // SQL injection
      /exec\s*\(/gi, // Command injection
      /\${.*}/g, // Template injection
    ];

    const checkString = (str: string): boolean => {
      if (typeof str !== 'string') return false;
      return suspiciousPatterns.some(pattern => pattern.test(str));
    };

    const checkObject = (obj: any): boolean => {
      if (typeof obj !== 'object' || obj === null) {
        return typeof obj === 'string' && checkString(obj);
      }

      if (Array.isArray(obj)) {
        return obj.some(checkObject);
      }

      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          if (checkString(key) || checkObject(obj[key])) {
            return true;
          }
        }
      }
      return false;
    };

    // Check all request data
    const hasSupiciousContent = 
      checkObject(req.body) || 
      checkObject(req.query) || 
      checkObject(req.params) ||
      checkString(req.url);

    if (hasSupiciousContent) {
      throw new HttpException('Suspicious request detected', HttpStatus.BAD_REQUEST);
    }

    // Validate content type for POST/PUT requests
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const contentType = req.headers['content-type'];
      if (!contentType || !contentType.includes('application/json')) {
        throw new HttpException('Invalid content type', HttpStatus.BAD_REQUEST);
      }
    }

    // Check request size
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (req.headers['content-length'] && parseInt(req.headers['content-length']) > maxSize) {
      throw new HttpException('Request too large', HttpStatus.PAYLOAD_TOO_LARGE);
    }
  }

  private getRateLimitKey(req: Request): string {
    // Use combination of IP and user ID for rate limiting
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userId = (req as any).user?.id || 'anonymous';
    return `rate_limit:${ip}:${userId}`;
  }

  private async logSecurityEvent(
    req: Request, 
    event: string, 
    details?: string
  ) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      ip: req.ip || req.connection.remoteAddress,
      method: req.method,
      path: req.path,
      userAgent: req.headers['user-agent'],
      userId: (req as any).user?.id,
      details,
    };

    // Store in Redis for analysis
    const key = `security:events:${new Date().toISOString().split('T')[0]}`;
    await this.redis.lpush(key, JSON.stringify(logEntry));
    await this.redis.expire(key, 7 * 24 * 60 * 60); // Keep for 7 days

    // Log critical events
    if (['request_blocked', 'csrf_failure', 'rate_limit_exceeded'].includes(event)) {
      console.error('[SECURITY]', logEntry);
    }
  }
}

// IP Whitelist/Blacklist Middleware
@Injectable()
export class IpFilterMiddleware implements NestMiddleware {
  private whitelist: Set<string> = new Set();
  private blacklist: Set<string> = new Set();

  constructor(@InjectRedis() private readonly redis: Redis) {
    this.loadIpLists();
  }

  private async loadIpLists() {
    // Load from Redis
    const [whitelist, blacklist] = await Promise.all([
      this.redis.smembers('security:ip:whitelist'),
      this.redis.smembers('security:ip:blacklist'),
    ]);

    this.whitelist = new Set(whitelist);
    this.blacklist = new Set(blacklist);

    // Reload periodically
    setInterval(() => this.loadIpLists(), 60000); // Every minute
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip || req.connection.remoteAddress || '';

    // Check blacklist first
    if (this.blacklist.has(ip)) {
      throw new HttpException('Access denied', HttpStatus.FORBIDDEN);
    }

    // If whitelist is not empty, check if IP is whitelisted
    if (this.whitelist.size > 0 && !this.whitelist.has(ip)) {
      throw new HttpException('Access denied', HttpStatus.FORBIDDEN);
    }

    next();
  }
}

// API Key Authentication Middleware
@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Skip for public endpoints
    const publicPaths = ['/health', '/api/docs', '/api/public'];
    if (publicPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) {
      throw new HttpException('API key required', HttpStatus.UNAUTHORIZED);
    }

    // Validate API key
    const keyData = await this.redis.hget('api:keys', apiKey);
    if (!keyData) {
      throw new HttpException('Invalid API key', HttpStatus.UNAUTHORIZED);
    }

    const keyInfo = JSON.parse(keyData);
    
    // Check if key is active
    if (!keyInfo.active) {
      throw new HttpException('API key inactive', HttpStatus.UNAUTHORIZED);
    }

    // Check rate limits for this key
    const rateLimitKey = `api:rate:${apiKey}`;
    const current = await this.redis.incr(rateLimitKey);
    
    if (current === 1) {
      await this.redis.expire(rateLimitKey, 3600); // 1 hour window
    }

    if (current > keyInfo.rateLimit) {
      throw new HttpException('API rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Attach key info to request
    (req as any).apiKey = keyInfo;

    next();
  }
}