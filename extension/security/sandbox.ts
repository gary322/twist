// Content Security Policy enforcement and security features
export class SecuritySandbox {
  private readonly allowedOrigins = [
    'https://api.twist.io',
    'https://vau.twist.io',
    'https://wallet.twist.io'
  ];

  private readonly sensitivePatterns = [
    /\/banking\//i,
    /\/account\//i,
    /\/checkout\//i,
    /\/payment\//i,
    /password/i,
    /credit.?card/i,
    /ssn/i,
    /social.?security/i,
    /\/login\//i,
    /\/signin\//i,
    /\/auth\//i,
    /paypal\.com/i,
    /stripe\.com/i,
    /bank/i,
    /\.gov$/i
  ];

  private readonly suspiciousPatterns = [
    /eval\s*\(/,
    /new\s+Function\s*\(/,
    /document\.write/,
    /innerHTML\s*=/,
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /data:text\/html/i,
    /vbscript:/i,
    /file:\/\//i
  ];

  private xssAttempts: number = 0;
  private lastXSSAlert: number = 0;

  constructor() {
    this.enforceCSP();
    this.monitorXSS();
    this.setupMessageValidation();
  }

  private enforceCSP() {
    // Inject CSP meta tag
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = `
      default-src 'self';
      script-src 'self' 'unsafe-inline' https://api.twist.io;
      connect-src 'self' ${this.allowedOrigins.join(' ')};
      img-src 'self' data: https:;
      style-src 'self' 'unsafe-inline';
      font-src 'self' data:;
      object-src 'none';
      base-uri 'self';
      form-action 'self';
      frame-ancestors 'none';
      block-all-mixed-content;
      upgrade-insecure-requests;
    `.replace(/\s+/g, ' ').trim();
    
    // Only add if not already present
    if (!document.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
      document.head.appendChild(meta);
    }
  }

  private monitorXSS() {
    // Monitor for potential XSS attempts
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeName === 'SCRIPT') {
              this.validateScript(node as HTMLScriptElement);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              this.validateElement(node as Element);
            }
          });
        } else if (mutation.type === 'attributes') {
          this.validateAttributes(mutation.target as Element);
        }
      });
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'src', 'action', 'formaction', 'onclick', 'onload', 'onerror']
    });
  }

  private validateScript(script: HTMLScriptElement) {
    const src = script.src || '';
    const content = script.textContent || '';

    // Check for suspicious patterns
    if (this.isSuspicious(src + content)) {
      script.remove();
      this.reportSecurityViolation('suspicious_script', {
        src: src || content.substring(0, 100),
        url: window.location.href
      });
    }

    // Validate external scripts
    if (src && !this.isAllowedOrigin(src)) {
      script.remove();
      this.reportSecurityViolation('unauthorized_script', {
        src,
        url: window.location.href
      });
    }
  }

  private validateElement(element: Element) {
    // Check for inline event handlers
    const attributes = element.attributes;
    for (let i = 0; i < attributes.length; i++) {
      const attr = attributes[i];
      if (attr.name.startsWith('on') && attr.value) {
        element.removeAttribute(attr.name);
        this.reportSecurityViolation('inline_event_handler', {
          element: element.tagName,
          attribute: attr.name,
          url: window.location.href
        });
      }
    }

    // Check for dangerous href values
    if (element instanceof HTMLAnchorElement) {
      const href = element.href;
      if (href && this.isSuspicious(href)) {
        element.removeAttribute('href');
        this.reportSecurityViolation('suspicious_link', {
          href,
          url: window.location.href
        });
      }
    }
  }

  private validateAttributes(element: Element) {
    // Validate changed attributes
    const dangerousAttrs = ['href', 'src', 'action', 'formaction'];
    dangerousAttrs.forEach(attr => {
      const value = element.getAttribute(attr);
      if (value && this.isSuspicious(value)) {
        element.removeAttribute(attr);
        this.reportSecurityViolation('suspicious_attribute', {
          element: element.tagName,
          attribute: attr,
          value: value.substring(0, 100),
          url: window.location.href
        });
      }
    });
  }

  private setupMessageValidation() {
    // Intercept and validate postMessage
    const originalPostMessage = window.postMessage.bind(window);
    
    // Store reference to this for the closure
    const self = this;
    
    // Override postMessage with proper typing
    (window as any).postMessage = function(message: any, targetOrigin: string, transfer?: Transferable[]): void {
      // Validate target origin
      if (targetOrigin !== '*' && !self.isAllowedOrigin(targetOrigin)) {
        console.warn('[TWIST Security] Blocked postMessage to unauthorized origin:', targetOrigin);
        return;
      }

      // Validate message content
      if (typeof message === 'string' && self.isSuspicious(message)) {
        console.warn('[TWIST Security] Blocked suspicious message content');
        return;
      }

      // Use the bound original function
      if (transfer) {
        originalPostMessage(message, targetOrigin, transfer);
      } else {
        originalPostMessage(message, targetOrigin);
      }
    };

    // Validate incoming messages
    window.addEventListener('message', (event) => {
      if (!this.isAllowedOrigin(event.origin)) {
        console.warn('[TWIST Security] Ignored message from unauthorized origin:', event.origin);
        event.stopImmediatePropagation();
      }
    }, true);
  }

  private isSuspicious(content: string): boolean {
    return this.suspiciousPatterns.some(pattern => pattern.test(content));
  }

  private isAllowedOrigin(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return this.allowedOrigins.some(origin => url.startsWith(origin));
    } catch {
      return false;
    }
  }

  private reportSecurityViolation(type: string, details: any) {
    this.xssAttempts++;

    // Rate limit alerts (max 1 per minute)
    const now = Date.now();
    if (now - this.lastXSSAlert > 60000) {
      this.lastXSSAlert = now;
      
      // Report to extension
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'SECURITY_ALERT',
          payload: {
            type,
            details,
            attempts: this.xssAttempts,
            timestamp: now
          }
        });
      }
    }

    console.warn(`[TWIST Security] ${type}:`, details);
  }

  public shouldTrackPage(url: string): boolean {
    // Don't track sensitive pages
    return !this.sensitivePatterns.some(pattern => pattern.test(url));
  }

  public sanitizeData(data: any): any {
    // Remove sensitive information before sending
    const sensitiveKeys = [
      'password', 'passwd', 'pwd',
      'token', 'api_key', 'apikey',
      'secret', 'private_key', 'privatekey',
      'ssn', 'social_security_number',
      'credit_card', 'creditcard', 'cc_number',
      'cvv', 'cvc', 'security_code',
      'pin', 'account_number', 'routing_number',
      'auth', 'authorization', 'bearer'
    ];

    if (typeof data === 'object' && data !== null) {
      if (Array.isArray(data)) {
        // Handle arrays
        return data.map(item => this.sanitizeData(item));
      } else {
        // Handle objects
        const sanitized: any = {};
        
        for (const key in data) {
          if (data.hasOwnProperty(key)) {
            const lowerKey = key.toLowerCase();
            
            // Check if key contains sensitive information
            if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
              sanitized[key] = '[REDACTED]';
            } else if (typeof data[key] === 'string') {
              // Check for patterns in string values
              if (this.containsSensitiveData(data[key])) {
                sanitized[key] = '[REDACTED]';
              } else {
                sanitized[key] = data[key];
              }
            } else if (typeof data[key] === 'object') {
              // Recursively sanitize nested objects
              sanitized[key] = this.sanitizeData(data[key]);
            } else {
              sanitized[key] = data[key];
            }
          }
        }

        return sanitized;
      }
    }

    return data;
  }

  private containsSensitiveData(value: string): boolean {
    // Check for common sensitive data patterns
    const patterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email (in certain contexts)
      /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/, // Bearer token
      /\b(?:password|passwd|pwd)\s*[:=]\s*\S+/i // Password patterns
    ];

    return patterns.some(pattern => pattern.test(value));
  }

  public validateURL(url: string): boolean {
    try {
      const urlObj = new URL(url);
      
      // Only allow http(s) protocols
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return false;
      }

      // Check against suspicious patterns
      if (this.isSuspicious(url)) {
        return false;
      }

      // Don't allow localhost in production
      if (urlObj.hostname === 'localhost' || urlObj.hostname === '${process.env.API_HOST}') {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  public encodeHTML(str: string): string {
    // HTML encode to prevent injection
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  public generateNonce(): string {
    // Generate a cryptographically secure nonce
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  // Get security status
  public getSecurityStatus(): {
    isSecure: boolean;
    xssAttempts: number;
    sensitivePageDetected: boolean;
    cspEnabled: boolean;
  } {
    return {
      isSecure: this.xssAttempts === 0,
      xssAttempts: this.xssAttempts,
      sensitivePageDetected: !this.shouldTrackPage(window.location.href),
      cspEnabled: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]')
    };
  }
}