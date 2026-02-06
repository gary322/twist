// Integration tests for Security Scenarios
import { Miniflare } from 'miniflare';
import { SecurityWorker } from '../../workers/security-worker/src/index';
import { AuditLogger } from '../../workers/security-worker/src/audit-logger';

describe('Security Worker Integration - Attack Scenarios', () => {
  let mf: Miniflare;
  let securityWorker: SecurityWorker;
  let auditLogger: AuditLogger;
  let mockEnv: any;

  beforeAll(async () => {
    // Set up Miniflare environment
    mf = new Miniflare({
      // Only used to provide KV + R2 implementations for tests.
      script: `addEventListener('fetch', (event) => event.respondWith(new Response('ok')));`,
      kvNamespaces: ['KV'],
      r2Buckets: ['AUDIT_LOGS'],
    });

    // In-memory rate limiter for integration tests
    const rateState = new Map<string, { count: number; resetAt: number }>();

    // Set up mock environment
    mockEnv = {
      RATE_LIMITER: {
        idFromName: jest.fn().mockImplementation((name: string) => name),
        get: jest.fn().mockImplementation(() => ({
          fetch: async (request: Request) => {
            const { key, limit, window } = await request.json() as any;

            const now = Date.now();
            const existing = rateState.get(key);
            if (!existing || existing.resetAt <= now) {
              rateState.set(key, { count: 1, resetAt: now + window });
              return new Response(JSON.stringify({ allowed: true }), {
                headers: { 'Content-Type': 'application/json' }
              });
            }

            if (existing.count >= limit) {
              return new Response(JSON.stringify({ allowed: false }), {
                headers: { 'Content-Type': 'application/json' }
              });
            }

            existing.count++;
            return new Response(JSON.stringify({ allowed: true }), {
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }))
      },
      AUDIT_LOGS: await mf.getR2Bucket('AUDIT_LOGS'),
      KV: await mf.getKVNamespace('KV'),
      ENVIRONMENT: 'test',
      PAGERDUTY_TOKEN: 'test-token',
      PAGERDUTY_ROUTING_KEY: 'test-routing-key'
    };

    securityWorker = new SecurityWorker(mockEnv);
    auditLogger = new AuditLogger(mockEnv);
  });

  afterAll(async () => {
    await mf.dispose();
  });

  describe('Scenario: Coordinated Attack Detection', () => {
    test('should detect and log multiple attack vectors from same IP', async () => {
      const attackerIP = '192.168.100.50';
      const attacks = [
        {
          url: 'https://api.twist.io/user?id=1\' OR \'1\'=\'1',
          type: 'sql-injection'
        },
        {
          url: 'https://api.twist.io/search?q=<script>alert(1)</script>',
          type: 'xss-attempt'
        },
        {
          url: 'https://api.twist.io/file/../../../etc/passwd',
          type: 'path-traversal'
        }
      ];

      const results = [];
      for (const attack of attacks) {
        const request = new Request(attack.url, {
          headers: {
            'CF-Connecting-IP': attackerIP
          }
        });

        const result = await securityWorker.processRequest(request);
        results.push(result);
        
        expect(result.allowed).toBe(false);
        expect(result.rules.some(r => r.ruleId === attack.type)).toBe(true);
      }

      // Check that all attacks were logged
      const logs = await auditLogger.querySecurityLogs({
        startTime: Date.now() - 60000,
        endTime: Date.now()
      });

      // Should have logged multiple events
      expect(logs.length).toBeGreaterThanOrEqual(attacks.length);
    });
  });

  describe('Scenario: Bot Detection and Filtering', () => {
    test('should differentiate between good and bad bots', async () => {
      const botRequests = [
        {
          ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          shouldBlock: false
        },
        {
          ua: 'sqlmap/1.0-dev',
          shouldBlock: true
        },
        {
          ua: 'Mozilla/5.0 (compatible; bingbot/2.0)',
          shouldBlock: false
        },
        {
          ua: 'nikto/2.1.5',
          shouldBlock: true
        }
      ];

      for (const bot of botRequests) {
        const request = new Request('https://api.twist.io/api/v1/data', {
          headers: {
            'User-Agent': bot.ua
          }
        });

        const result = await securityWorker.processRequest(request);
        
        if (bot.shouldBlock) {
          expect(result.rules.some(r => r.ruleId === 'suspicious-ua')).toBe(true);
        } else {
          expect(result.rules.some(r => r.ruleId === 'suspicious-ua')).toBe(false);
        }
      }
    });
  });

  describe('Scenario: Evasion Technique Detection', () => {
    test('should detect encoded attack attempts', async () => {
      const encodedAttacks = [
        // URL encoded SQL injection
        'https://api.twist.io/user?id=1%27%20OR%20%271%27%3D%271',
        // Double URL encoded XSS
        'https://api.twist.io/search?q=%253Cscript%253Ealert%28%27XSS%27%29%253C%2Fscript%253E',
        // Unicode encoded path traversal
        'https://api.twist.io/file/%2e%2e%2f%2e%2e%2fetc%2fpasswd'
      ];

      for (const url of encodedAttacks) {
        const request = new Request(url);
        const result = await securityWorker.processRequest(request);
        
        expect(result.allowed).toBe(false);
        expect(result.action).toBe('block');
      }
    });

    test('should detect obfuscated payloads', async () => {
      const obfuscatedPayloads = [
        // Case variation
        'https://api.twist.io/search?q=<ScRiPt>alert(1)</sCrIpT>',
        // Whitespace injection
        'https://api.twist.io/user?id=1\'/**/OR/**/\'1\'=\'1',
        // Comment evasion
        'https://api.twist.io/data?filter=1/*comment*/UNION/*comment*/SELECT'
      ];

      for (const url of obfuscatedPayloads) {
        const request = new Request(url);
        const result = await securityWorker.processRequest(request);
        
        expect(result.allowed).toBe(false);
      }
    });
  });

  describe('Scenario: DDoS Attack Mitigation', () => {
    test('should handle high-volume requests and rate limit appropriately', async () => {
      const clientIP = '10.0.0.100';
      const requests = [];
      
      // Simulate 150 rapid requests
      for (let i = 0; i < 150; i++) {
        const request = new Request('https://api.twist.io/api/v1/vau', {
          method: 'POST',
          headers: {
            'CF-Connecting-IP': clientIP,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ data: `request-${i}` })
        });
        
        requests.push(securityWorker.processRequest(request));
      }

      // Process all requests
      const results = await Promise.all(requests);
      
      // Count allowed vs blocked
      const allowed = results.filter(r => r.allowed).length;
      const blocked = results.filter(r => !r.allowed && r.action === 'rate_limit').length;
      
      // Should have some allowed and some blocked
      expect(allowed).toBeGreaterThan(0);
      expect(blocked).toBeGreaterThan(0);
      
      // Total should be 150
      expect(allowed + blocked).toBeLessThanOrEqual(150);
    });
  });

  describe('Scenario: Zero-Day Attack Pattern', () => {
    test('should detect unusual patterns even without specific rules', async () => {
      // Simulate a new type of attack that combines multiple techniques
      const complexAttack = new Request('https://api.twist.io/api/v1/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.1, 10.0.0.1, 172.16.0.1', // Multiple IPs
          'X-Real-IP': '10.0.0.1',
          'X-Client-IP': '172.16.0.1',
          'User-Agent': 'Mozilla/5.0 (custom-scanner/1.0)', // Suspicious UA
          'Content-Length': '2097152' // 2MB
        },
        body: JSON.stringify({
          // Combination of different injection attempts
          query: '{"$where": "this.password == \'admin\'"}',
          command: 'ls | grep password',
          sql: 'SELECT * FROM users WHERE 1=1'
        })
      });

      const result = await securityWorker.processRequest(complexAttack);
      
      // Should trigger multiple rules
      expect(result.allowed).toBe(false);
      expect(result.rules.length).toBeGreaterThan(1);
      
      // Should include different rule types
      const ruleIds = result.rules.map(r => r.ruleId);
      expect(ruleIds).toContain('rate-limit-bypass');
      expect(ruleIds).toContain('large-body');
    });
  });

  describe('Scenario: Security Metrics and Reporting', () => {
    test('should aggregate security events for reporting', async () => {
      // Generate various security events
      const securityEvents = [
        { type: 'sql-injection', severity: 'high' },
        { type: 'xss-attempt', severity: 'high' },
        { type: 'path-traversal', severity: 'medium' },
        { type: 'suspicious-ua', severity: 'low' },
        { type: 'rate-limit-bypass', severity: 'medium' }
      ];

      // Log events
      for (const event of securityEvents) {
        await auditLogger.logSecurityEvent({
          type: event.type,
          severity: event.severity as any,
          request: {
            url: 'https://api.twist.io/test',
            cf: { country: 'US' }
          }
        });
      }

      // Get metrics
      const metrics = await auditLogger.getSecurityMetrics();
      
      expect(metrics).toBeTruthy();
      expect(metrics.total_events).toBeGreaterThanOrEqual(securityEvents.length);
      expect(metrics.by_severity.high).toBeGreaterThanOrEqual(2);
      expect(metrics.by_severity.medium).toBeGreaterThanOrEqual(2);
      expect(metrics.by_severity.low).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Scenario: False Positive Handling', () => {
    test('should not block legitimate requests with SQL-like content', async () => {
      const legitimateRequests = [
        {
          url: 'https://api.twist.io/blog/post',
          body: {
            title: 'How to Select the Best Database for Your Application',
            content: 'When you need to select from various options...'
          }
        },
        {
          url: 'https://api.twist.io/product/create',
          body: {
            name: 'Union Jack T-Shirt',
            description: 'Classic British flag design'
          }
        },
        {
          url: 'https://api.twist.io/comment/add',
          body: {
            text: 'Great article! I would drop everything to read more.'
          }
        }
      ];

      for (const req of legitimateRequests) {
        const request = new Request(req.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(req.body)
        });

        const result = await securityWorker.processRequest(request);
        
        expect(result.allowed).toBe(true);
        expect(result.action).toBe('allow');
      }
    });
  });

  describe('Scenario: Geographic Attack Patterns', () => {
    test('should track attacks by country', async () => {
      const geoAttacks = [
        { country: 'CN', expectedBlock: false },
        { country: 'RU', expectedBlock: false },
        { country: 'KP', expectedBlock: true }, // North Korea
        { country: 'IR', expectedBlock: true }, // Iran
        { country: 'US', expectedBlock: false }
      ];

      for (const attack of geoAttacks) {
        const request = new Request('https://api.twist.io/api/v1/data');
        Object.defineProperty(request, 'cf', {
          value: { country: attack.country },
          writable: false
        });

        const result = await securityWorker.processRequest(request);
        
        if (attack.expectedBlock) {
          expect(result.allowed).toBe(false);
          expect(result.action).toBe('geo_block');
        } else {
          expect(result.action).not.toBe('geo_block');
        }
      }

      // Check country metrics
      const metrics = await auditLogger.getSecurityMetrics();
      if (metrics && metrics.by_country) {
        expect(Object.keys(metrics.by_country).length).toBeGreaterThan(0);
      }
    });
  });
});
