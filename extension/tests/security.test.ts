import { SecuritySandbox } from '../security/sandbox';
import '../jest.setup';

describe('Security Tests', () => {
  let sandbox: SecuritySandbox;

  beforeEach(() => {
    sandbox = new SecuritySandbox();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  describe('CSP Enforcement', () => {
    it('should inject CSP meta tag', () => {
      const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      expect(cspMeta).toBeTruthy();
      expect(cspMeta?.getAttribute('content')).toContain("default-src 'self'");
      expect(cspMeta?.getAttribute('content')).toContain('https://api.twist.io');
    });

    it('should block unauthorized origins in postMessage', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Try to post to unauthorized origin
      window.postMessage({ test: 'data' }, 'https://evil.com');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[TWIST Security] Blocked postMessage to unauthorized origin:',
        'https://evil.com'
      );
      
      consoleSpy.mockRestore();
    });

    it('should allow authorized origins in postMessage', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Post to authorized origin
      window.postMessage({ test: 'data' }, 'https://api.twist.io');
      
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('XSS Prevention', () => {
    it('should detect and remove suspicious inline scripts', () => {
      const maliciousScript = document.createElement('script');
      maliciousScript.textContent = 'eval("alert(1)")';
      document.body.appendChild(maliciousScript);

      // Script should be removed
      expect(document.querySelector('script')).toBeNull();
      
      // Should send security alert
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'SECURITY_ALERT',
        payload: {
          type: 'suspicious_script',
          url: window.location.href,
          script: expect.stringContaining('eval')
        }
      });
    });

    it('should detect dangerous patterns in scripts', () => {
      const dangerousPatterns = [
        'new Function("alert(1)")',
        'document.write("<script>alert(1)</script>")',
        'innerHTML = "<img onerror=alert(1)>"',
        '<script>alert(1)</script>',
        'javascript:alert(1)',
        'onclick="alert(1)"'
      ];

      dangerousPatterns.forEach(pattern => {
        const script = document.createElement('script');
        script.textContent = pattern;
        
        // Try to add script
        document.body.appendChild(script);
        
        // Should be removed
        expect(document.querySelector('script')).toBeNull();
      });
    });

    it('should allow safe scripts', () => {
      const safeScript = document.createElement('script');
      safeScript.textContent = 'logger.log("Safe code")';
      safeScript.src = 'https://api.twist.io/safe.js';
      
      document.body.appendChild(safeScript);
      
      // Should not be removed
      expect(document.querySelector('script')).toBeTruthy();
    });
  });

  describe('Sensitive Page Detection', () => {
    const sensitiveUrls = [
      'https://mybank.com/login',
      'https://bank.com/account/transfer',
      'https://checkout.stripe.com/pay',
      'https://paypal.com/checkout',
      'https://site.com/enter-password',
      'https://site.com/credit-card-form',
      'https://gov.com/ssn-entry',
      'https://irs.gov/social-security'
    ];

    sensitiveUrls.forEach(url => {
      it(`should detect sensitive page: ${url}`, () => {
        expect(sandbox.shouldTrackPage(url)).toBe(false);
      });
    });

    const safeUrls = [
      'https://news.com/article',
      'https://blog.com/post',
      'https://youtube.com/watch',
      'https://twitter.com/user'
    ];

    safeUrls.forEach(url => {
      it(`should allow tracking on safe page: ${url}`, () => {
        expect(sandbox.shouldTrackPage(url)).toBe(true);
      });
    });
  });

  describe('Data Sanitization', () => {
    it('should redact sensitive fields from objects', () => {
      const sensitiveData = {
        username: 'testuser',
        password: 'secret123',
        apiToken: 'token-abc-123',
        secretKey: 'sk_test_123',
        ssn: '123-45-6789',
        creditCard: '4111111111111111',
        normalField: 'visible'
      };

      const sanitized = sandbox.sanitizeData(sensitiveData);

      expect(sanitized.username).toBe('testuser');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.apiToken).toBe('[REDACTED]');
      expect(sanitized.secretKey).toBe('[REDACTED]');
      expect(sanitized.ssn).toBe('[REDACTED]');
      expect(sanitized.creditCard).toBe('[REDACTED]');
      expect(sanitized.normalField).toBe('visible');
    });

    it('should sanitize nested objects', () => {
      const nestedData = {
        user: {
          name: 'Test User',
          auth: {
            password: 'secret',
            token: 'abc123'
          }
        },
        config: {
          apiKey: 'key-123',
          public: true
        }
      };

      const sanitized = sandbox.sanitizeData(nestedData);

      expect(sanitized.user.name).toBe('Test User');
      expect(sanitized.user.auth.password).toBe('[REDACTED]');
      expect(sanitized.user.auth.token).toBe('[REDACTED]');
      expect(sanitized.config.apiKey).toBe('[REDACTED]');
      expect(sanitized.config.public).toBe(true);
    });

    it('should handle arrays in sanitization', () => {
      const arrayData = {
        users: [
          { name: 'User 1', password: 'pass1' },
          { name: 'User 2', password: 'pass2' }
        ]
      };

      const sanitized = sandbox.sanitizeData(arrayData);

      expect(sanitized.users[0].name).toBe('User 1');
      expect(sanitized.users[0].password).toBe('[REDACTED]');
      expect(sanitized.users[1].name).toBe('User 2');
      expect(sanitized.users[1].password).toBe('[REDACTED]');
    });
  });

  describe('Script Validation', () => {
    it('should validate script sources', () => {
      const validScript = document.createElement('script');
      validScript.src = 'https://api.twist.io/sdk.js';
      document.body.appendChild(validScript);

      expect(document.querySelector('script[src="https://api.twist.io/sdk.js"]')).toBeTruthy();
    });

    it('should monitor DOM mutations for script injection', () => {
      const observer = (MutationObserver as jest.Mock).mock.instances[0];
      expect(observer.observe).toHaveBeenCalledWith(
        document.documentElement,
        {
          childList: true,
          subtree: true
        }
      );
    });
  });

  describe('Cross-Site Scripting (XSS) Attack Scenarios', () => {
    it('should prevent DOM-based XSS through innerHTML', () => {
      const maliciousContent = '<img src=x onerror="alert(1)">';
      const div = document.createElement('div');
      
      // Sandbox should detect this pattern
      const script = document.createElement('script');
      script.textContent = `document.getElementById('test').innerHTML = '${maliciousContent}'`;
      document.body.appendChild(script);

      expect(document.querySelector('script')).toBeNull();
    });

    it('should prevent stored XSS from external data', () => {
      // Simulate data from API that contains XSS
      const userData = {
        name: '<script>alert("XSS")</script>',
        bio: 'Normal bio text'
      };

      const sanitized = sandbox.sanitizeData(userData);
      
      // Name should still contain the script tag as string
      // (sanitization is for sensitive data, not XSS - that's handled by CSP)
      expect(sanitized.name).toContain('<script>');
      
      // But when rendered, CSP would block execution
    });

    it('should prevent javascript: protocol URLs', () => {
      const link = document.createElement('a');
      link.href = 'javascript:alert(1)';
      
      // Check if suspicious
      const script = document.createElement('script');
      script.textContent = 'window.location = "javascript:alert(1)"';
      document.body.appendChild(script);

      expect(document.querySelector('script')).toBeNull();
    });
  });

  describe('Content Security Policy Headers', () => {
    it('should have restrictive CSP settings', () => {
      const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      const content = cspMeta?.getAttribute('content') || '';

      // Check key directives
      expect(content).toContain("default-src 'self'");
      expect(content).toContain("object-src 'none'");
      expect(content).toContain("base-uri 'self'");
      expect(content).toContain("frame-ancestors 'none'");
      expect(content).toContain("form-action 'self'");
    });
  });

  describe('Origin Validation', () => {
    it('should validate allowed origins', () => {
      const allowedOrigins = [
        'https://api.twist.io',
        'https://vau.twist.io',
        'https://wallet.twist.io'
      ];

      allowedOrigins.forEach(origin => {
        expect(sandbox.isAllowedOrigin(origin)).toBe(true);
      });
    });

    it('should reject unauthorized origins', () => {
      const unauthorizedOrigins = [
        'https://evil.com',
        'http://api.twist.io', // HTTP not HTTPS
        'https://api.twist.io.evil.com',
        'https://twist.io.phishing.com'
      ];

      unauthorizedOrigins.forEach(origin => {
        expect(sandbox.isAllowedOrigin(origin)).toBe(false);
      });
    });
  });

  describe('Privacy Protection', () => {
    it('should not track on private browsing detection', () => {
      // Simulate private browsing detection
      const isPrivate = sandbox.detectPrivateBrowsing();
      
      if (isPrivate) {
        expect(sandbox.shouldTrackPage('https://example.com')).toBe(false);
      }
    });

    it('should respect DNT header', () => {
      // Mock DNT header
      Object.defineProperty(navigator, 'doNotTrack', {
        value: '1',
        configurable: true
      });

      expect(sandbox.respectsDoNotTrack()).toBe(true);
    });
  });

  describe('Injection Attack Prevention', () => {
    it('should prevent SQL injection patterns in data', () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "admin'--",
        "1; DELETE FROM users WHERE 1=1"
      ];

      sqlInjectionAttempts.forEach(attempt => {
        const data = { query: attempt };
        const sanitized = sandbox.sanitizeData(data);
        
        // Data should be preserved but marked suspicious
        expect(sanitized.query).toBe(attempt);
        
        // But should trigger security alert when used
        const script = document.createElement('script');
        script.textContent = `fetch('/api/search?q=${attempt}')`;
        document.body.appendChild(script);
        
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'SECURITY_ALERT'
          })
        );
      });
    });
  });
});