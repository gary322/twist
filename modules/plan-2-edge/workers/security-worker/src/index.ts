// Security Worker with WAF Rules
import { Router, IRequest } from 'itty-router';
import { Env } from '@workers/vau-processor/src/types';
import { SecurityRule, SecurityCheckResult, RuleResult } from './types';
import { AuditLogger } from './audit-logger';
import { securityRules } from './rules';

export class SecurityWorker {
  private rules: SecurityRule[];
  private auditLogger: AuditLogger;

  constructor(private env: Env) {
    this.auditLogger = new AuditLogger(env);
    this.rules = securityRules;
  }

  private async checkRule(rule: SecurityRule, request: Request): Promise<boolean> {
    try {
      const result = rule.condition(request);
      // Handle both sync and async conditions
      return result instanceof Promise ? await result : result;
    } catch (error) {
      console.error(`Error checking rule ${rule.id}:`, error);
      return false;
    }
  }

  async processRequest(request: Request): Promise<SecurityCheckResult> {
    const results: RuleResult[] = [];

    for (const rule of this.rules) {
      const triggered = await this.checkRule(rule, request);
      if (triggered) {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          action: rule.action,
          severity: rule.severity,
          timestamp: Date.now()
        });

        // Log security event
        await this.auditLogger.logSecurityEvent({
          type: 'rule_triggered',
          ruleId: rule.id,
          severity: rule.severity,
          request: {
            method: request.method,
            url: request.url,
            headers: Object.fromEntries(Array.from(request.headers as any)),
            cf: request.cf
          }
        });

        // Take action based on severity
        if (rule.action === 'block') {
          return {
            allowed: false,
            action: 'block',
            reason: rule.name,
            rules: results
          };
        }
      }
    }

    // Additional checks
    const rateLimitCheck = await this.checkRateLimit(request);
    if (!rateLimitCheck.allowed) {
      return {
        allowed: false,
        action: 'rate_limit',
        reason: 'Rate limit exceeded',
        rules: results
      };
    }

    const geoCheck = await this.checkGeoRestrictions(request);
    if (!geoCheck.allowed) {
      return {
        allowed: false,
        action: 'geo_block',
        reason: 'Geographic restriction',
        rules: results
      };
    }

    return {
      allowed: true,
      action: 'allow',
      rules: results
    };
  }


  private async checkRateLimit(request: Request): Promise<{ allowed: boolean }> {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const endpoint = new URL(request.url).pathname;

    // Different limits for different endpoints
    const limits: Record<string, { requests: number; window: number }> = {
      '/api/v1/vau': { requests: 100, window: 60 },
      '/api/v1/vau/batch': { requests: 10, window: 60 },
      '/api/v1/auth': { requests: 5, window: 60 },
      'default': { requests: 1000, window: 60 }
    };

    const limit = limits[endpoint] || limits.default;
    const key = `rate:${ip}:${endpoint}`;

    // Use Durable Object for rate limiting
    const id = this.env.RATE_LIMITER.idFromName(key);
    const limiter = this.env.RATE_LIMITER.get(id);

    const response = await limiter.fetch(
      new Request('https://rate-limiter/check', {
        method: 'POST',
        body: JSON.stringify({
          key,
          limit: limit.requests,
          window: limit.window * 1000
        })
      })
    );

    const result = await response.json() as any;
    return { allowed: result.allowed };
  }

  private async checkGeoRestrictions(request: Request): Promise<{ allowed: boolean }> {
    const country = request.cf?.country as string;

    // Blocked countries (sanctions compliance)
    const blockedCountries = ['KP', 'IR', 'SY', 'CU'];

    if (blockedCountries.includes(country)) {
      await this.auditLogger.logSecurityEvent({
        type: 'geo_block',
        country,
        request: {
          url: request.url,
          cf: request.cf
        }
      });

      return { allowed: false };
    }

    return { allowed: true };
  }
}

// Router setup
const router = Router();

// Security check endpoint
router.post('/check', async (request: IRequest, env: Env) => {
  const securityWorker = new SecurityWorker(env);
  
  // Get the original request details from the body
  const { method, url, headers, body } = await request.json() as any;
  
  // Reconstruct the request
  const originalRequest = new Request(url, {
    method,
    headers: new Headers(headers),
    body: body ? JSON.stringify(body) : undefined
  });

  // Copy CF properties
  Object.defineProperty(originalRequest, 'cf', {
    value: request.cf,
    writable: false
  });

  const result = await securityWorker.processRequest(originalRequest);
  
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// Health check
router.get('/health', () => {
  return new Response(JSON.stringify({
    status: 'healthy',
    timestamp: new Date().toISOString()
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// Main worker handler
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return router.handle(request, env);
  }
};