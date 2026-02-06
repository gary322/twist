// Security Rules Definition
import { SecurityRule } from './types';

function expandDecodings(value: string, maxDepth: number = 2): string[] {
  const variants: string[] = [value];
  let current = value;
  for (let i = 0; i < maxDepth; i++) {
    if (!current.includes('%')) break;
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      variants.push(decoded);
      current = decoded;
    } catch {
      break;
    }
  }
  return variants;
}

export const securityRules: SecurityRule[] = [
  // SQL Injection patterns
  {
    id: 'sql-injection',
    name: 'SQL Injection Attempt',
    condition: (req) => {
      const url = new URL(req.url);
      const values = Array.from(url.searchParams.values()).join(' ');
      const patterns = [
        // Boolean-based injection patterns
        /(?:'|\b)\s*(?:or|and)\s*(?:'?\w+'?\s*=\s*'?\w+'?|\d+\s*=\s*\d+)/i,
        // UNION-based injection
        /\bunion\b\s+(?:all\s+)?\bselect\b/i,
        // Stacked queries / comment markers
        /;\s*(?:select|insert|update|delete|drop|alter)\b/i,
        /--|#|\/\*/i,
        // Common DDL/DML sequences
        /\bselect\b[\s\S]*\bfrom\b[\s\S]*\bwhere\b/i,
        /\binsert\b[\s\S]*\binto\b[\s\S]*\bvalues\b/i,
        /\bdelete\b[\s\S]*\bfrom\b[\s\S]*\bwhere\b/i,
        /\bdrop\b[\s\S]*\btable\b/i,
        /\bupdate\b[\s\S]*\bset\b[\s\S]*\bwhere\b/i,
        // Dangerous stored procedure exec (SQL Server)
        /\bexec\b[\s+]*(?:s|x)p\w+/i
      ];
      return patterns.some(p => p.test(values));
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
      const values = Array.from(url.searchParams.values()).flatMap(v => expandDecodings(v)).join(' ');
      const patterns = [
        /<script[^>]*>.*?<\/script>/gi,
        /<iframe[^>]*>.*?<\/iframe>/gi,
        /javascript:/gi,
        /<\w+[^>]*\son\w+\s*=/gi,
        /<img[^>]*onerror\s*=/gi,
        /<svg[^>]*onload\s*=/gi,
        /eval\s*\(/gi,
        /expression\s*\(/gi,
        /<embed[^>]*>/gi,
        /<object[^>]*>/gi
      ];
      return patterns.some(p => p.test(values));
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
      // Inspect both values and keys. Attack strings that include `&`/`&&` may be
      // parsed by URLSearchParams as additional keys (not values).
      const fragments: string[] = [];
      for (const [key, value] of url.searchParams.entries()) {
        fragments.push(key, value);
      }
      const haystack = fragments.join(' ');
      const patterns = [
        /;|\|\||\||&&|`|\$\(/,
        /\${.*}/,
        />\s*\/dev\/null/,
        /\bcurl\b/i,
        /\bwget\b/i,
        /\bchmod\b/i,
        /\bnc\b/i,
        /\bbash\b/i,
        /\bsh\b/i,
        /cmd\.exe/i
      ];
      return patterns.some(p => p.test(haystack));
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
        /nmap/i,
        /scripting engine/i,
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
      const values = Array.from(url.searchParams.values()).join(' ');
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
      const matches = patterns.filter(p => p.test(values)).length;
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
      const values = Array.from(url.searchParams.values()).join(' ');
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
      return patterns.some(p => p.test(values));
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
      const values = Array.from(url.searchParams.values()).join(' ');
      const patterns = [
        /\$ne|\$eq|\$gt|\$gte|\$lt|\$lte|\$in|\$nin/g,
        /\$or|\$and|\$not|\$nor/g,
        /\$exists|\$type|\$mod|\$regex/g,
        /\$where|\$text|\$search/g,
        /{.*:.*{.*:.*}}/g
      ];
      return patterns.some(p => p.test(values));
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
