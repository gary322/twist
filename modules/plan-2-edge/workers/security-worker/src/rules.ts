// Security Rules Definition
import { SecurityRule } from './types';

export const securityRules: SecurityRule[] = [
  // SQL Injection patterns
  {
    id: 'sql-injection',
    name: 'SQL Injection Attempt',
    condition: (req) => {
      const url = new URL(req.url);
      const params = url.searchParams.toString();
      const patterns = [
        /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
        /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
        /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
        /((\%27)|(\'))union/i,
        /exec(\s|\+)+(s|x)p\w+/i,
        /select.*from.*where/i,
        /insert.*into.*values/i,
        /delete.*from.*where/i,
        /drop.*table/i,
        /update.*set.*where/i
      ];
      return patterns.some(p => p.test(params));
    },
    action: 'block',
    severity: 'high'
  },

  // XSS patterns
  {
    id: 'xss-attempt',
    name: 'XSS Attempt',
    condition: (req) => {
      const url = new URL(req.url);
      const params = url.searchParams.toString();
      const patterns = [
        /<script[^>]*>.*?<\/script>/gi,
        /<iframe[^>]*>.*?<\/iframe>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
        /<img[^>]*onerror\s*=/gi,
        /<svg[^>]*onload\s*=/gi,
        /eval\s*\(/gi,
        /expression\s*\(/gi,
        /<embed[^>]*>/gi,
        /<object[^>]*>/gi
      ];
      return patterns.some(p => p.test(params));
    },
    action: 'block',
    severity: 'high'
  },

  // Path traversal
  {
    id: 'path-traversal',
    name: 'Path Traversal Attempt',
    condition: (req) => {
      const path = new URL(req.url).pathname;
      const patterns = [
        /\.\./g,
        /\/\//g,
        /\\\\/g,
        /%2e%2e/gi,
        /%252e%252e/gi,
        /\.\//g,
        /\/etc\//g,
        /\/windows\//gi,
        /\/system32\//gi
      ];
      return patterns.some(p => p.test(path));
    },
    action: 'block',
    severity: 'medium'
  },

  // Command injection
  {
    id: 'command-injection',
    name: 'Command Injection Attempt',
    condition: (req) => {
      const url = new URL(req.url);
      const params = url.searchParams.toString();
      const decodedParams = decodeURIComponent(params);
      const patterns = [
        /;|\||&|`|\$\(/,
        /\${.*}/,
        />\s*\/dev\/null/,
        /curl\s+/i,
        /wget\s+/i,
        /chmod\s+/i,
        /nc\s+/i,
        /bash\s+/i,
        /sh\s+/i,
        /cmd\.exe/i
      ];
      return patterns.some(p => p.test(params) || p.test(decodedParams));
    },
    action: 'block',
    severity: 'critical'
  },

  // Rate limit bypass attempts
  {
    id: 'rate-limit-bypass',
    name: 'Rate Limit Bypass Attempt',
    condition: (req) => {
      const headers = req.headers;
      const suspiciousHeaders = [
        'x-forwarded-for',
        'x-real-ip',
        'x-originating-ip',
        'x-remote-ip',
        'x-client-ip',
        'x-forwarded-host',
        'x-forwarded-server',
        'x-host',
        'x-remote-addr'
      ];

      const count = suspiciousHeaders.filter(h => headers.get(h)).length;
      return count > 2; // Multiple IP headers
    },
    action: 'challenge',
    severity: 'medium'
  },

  // Suspicious user agents
  {
    id: 'suspicious-ua',
    name: 'Suspicious User Agent',
    condition: (req) => {
      const ua = req.headers.get('user-agent') || '';
      const suspicious = [
        /sqlmap/i,
        /nikto/i,
        /scanner/i,
        /havij/i,
        /wget/i,
        /curl/i,
        /python/i,
        /scrapy/i,
        /bot/i,
        /crawler/i,
        /spider/i,
        /scraper/i
      ];
      
      // Allow known good bots
      const allowedBots = [
        /googlebot/i,
        /bingbot/i,
        /slurp/i, // Yahoo
        /duckduckbot/i,
        /facebookexternalhit/i,
        /twitterbot/i,
        /linkedinbot/i,
        /whatsapp/i
      ];
      
      const isSuspicious = suspicious.some(p => p.test(ua));
      const isAllowed = allowedBots.some(p => p.test(ua));
      
      return isSuspicious && !isAllowed;
    },
    action: 'challenge',
    severity: 'low'
  },

  // Large request bodies
  {
    id: 'large-body',
    name: 'Oversized Request Body',
    condition: (req) => {
      const contentLength = req.headers.get('content-length');
      return contentLength !== null && parseInt(contentLength) > 1048576; // 1MB
    },
    action: 'block',
    severity: 'low'
  },

  // Malformed JSON
  {
    id: 'malformed-json',
    name: 'Malformed JSON Body',
    condition: async (req) => {
      if (req.headers.get('content-type')?.includes('application/json')) {
        try {
          await req.clone().json();
          return false;
        } catch {
          return true;
        }
      }
      return false;
    },
    action: 'block',
    severity: 'low'
  },

  // LDAP injection
  {
    id: 'ldap-injection',
    name: 'LDAP Injection Attempt',
    condition: (req) => {
      const url = new URL(req.url);
      const params = url.searchParams.toString();
      const patterns = [
        /\(|\)/g,
        /\*/g,
        /\|/g,
        /&/g,
        /=/g,
        /!/g,
        /~/g,
        />=|<=/g,
        /objectclass/i
      ];
      
      // Check if multiple LDAP chars are present
      const matches = patterns.filter(p => p.test(params)).length;
      return matches >= 3;
    },
    action: 'block',
    severity: 'medium'
  },

  // XML injection / XXE
  {
    id: 'xml-injection',
    name: 'XML Injection Attempt',
    condition: (req) => {
      const url = new URL(req.url);
      const params = url.searchParams.toString();
      const patterns = [
        /<!DOCTYPE/i,
        /<!ENTITY/i,
        /<!\[CDATA\[/i,
        /SYSTEM/i,
        /file:\/\//i,
        /php:\/\//i,
        /expect:\/\//i,
        /data:\/\//i
      ];
      return patterns.some(p => p.test(params));
    },
    action: 'block',
    severity: 'high'
  },

  // NoSQL injection
  {
    id: 'nosql-injection',
    name: 'NoSQL Injection Attempt',
    condition: (req) => {
      const url = new URL(req.url);
      const params = url.searchParams.toString();
      const decodedParams = decodeURIComponent(params);
      const patterns = [
        /\$ne|\$eq|\$gt|\$gte|\$lt|\$lte|\$in|\$nin/g,
        /\$or|\$and|\$not|\$nor/g,
        /\$exists|\$type|\$mod|\$regex/g,
        /\$where|\$text|\$search/g,
        /{.*:.*{.*:.*}}/g
      ];
      return patterns.some(p => p.test(params) || p.test(decodedParams));
    },
    action: 'block',
    severity: 'high'
  },

  // Protocol smuggling
  {
    id: 'protocol-smuggling',
    name: 'Protocol Smuggling Attempt',
    condition: (req) => {
      const headers = req.headers;
      
      // Check for conflicting headers
      const contentLength = headers.get('content-length');
      const transferEncoding = headers.get('transfer-encoding');
      
      if (contentLength && transferEncoding) {
        return true;
      }
      
      // Check for malformed transfer encoding
      if (transferEncoding && transferEncoding !== 'chunked') {
        return true;
      }
      
      return false;
    },
    action: 'block',
    severity: 'high'
  },

  // Header injection
  {
    id: 'header-injection',
    name: 'Header Injection Attempt',
    condition: (req) => {
      // Check common header names and values
      const headerNames = [
        'content-type', 'content-length', 'host', 'user-agent',
        'accept', 'accept-encoding', 'accept-language',
        'referer', 'origin', 'cookie', 'authorization'
      ];
      
      for (const name of headerNames) {
        const value = req.headers.get(name);
        if (value) {
          // Check for newline characters in headers
          if (/[\r\n]/.test(value)) {
            return true;
          }
          
          // Check for null bytes
          if (value.includes('\0')) {
            return true;
          }
        }
      }
      
      return false;
    },
    action: 'block',
    severity: 'medium'
  },

  // Suspicious file upload
  {
    id: 'suspicious-upload',
    name: 'Suspicious File Upload',
    condition: (req) => {
      const contentType = req.headers.get('content-type') || '';
      
      if (contentType.includes('multipart/form-data')) {
        // In a real implementation, we would parse the multipart data
        // For now, check for suspicious extensions in the URL
        const url = new URL(req.url);
        const suspiciousExtensions = [
          /\.exe$/i,
          /\.dll$/i,
          /\.bat$/i,
          /\.cmd$/i,
          /\.com$/i,
          /\.scr$/i,
          /\.vbs$/i,
          /\.vbe$/i,
          /\.js$/i,
          /\.jse$/i,
          /\.ws$/i,
          /\.wsf$/i,
          /\.wsc$/i,
          /\.wsh$/i,
          /\.ps1$/i,
          /\.ps1xml$/i,
          /\.ps2$/i,
          /\.ps2xml$/i,
          /\.psc1$/i,
          /\.psc2$/i,
          /\.msh$/i,
          /\.msh1$/i,
          /\.msh2$/i,
          /\.mshxml$/i,
          /\.msh1xml$/i,
          /\.msh2xml$/i
        ];
        
        return suspiciousExtensions.some(p => p.test(url.pathname));
      }
      
      return false;
    },
    action: 'block',
    severity: 'high'
  }
];