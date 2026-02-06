/**
 * Fraud Detection Tests
 * Tests anti-fraud mechanisms for the ad network
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// Mock Fraud Detector
class MockFraudDetector {
  private clickHistory: Map<string, any[]> = new Map();
  private ipHistory: Map<string, number[]> = new Map();
  private deviceFingerprints: Map<string, Set<string>> = new Map();
  private suspiciousPatterns: any[] = [];

  async analyzeClick(data: {
    userId: string;
    ip: string;
    userAgent: string;
    fingerprint: string;
    timestamp?: number;
  }): Promise<{
    isValid: boolean;
    score: number;
    reasons: string[];
  }> {
    const reasons: string[] = [];
    let score = 0;

    // Check click velocity
    const clickVelocity = this.checkClickVelocity(data.userId);
    if (clickVelocity.suspicious) {
      score += 30;
      reasons.push(clickVelocity.reason);
    }

    // Check IP patterns
    const ipPattern = this.checkIPPattern(data.ip);
    if (ipPattern.suspicious) {
      score += 25;
      reasons.push(ipPattern.reason);
    }

    // Check device fingerprint anomalies
    const fingerprintCheck = this.checkFingerprint(data.userId, data.fingerprint);
    if (fingerprintCheck.suspicious) {
      score += 20;
      reasons.push(fingerprintCheck.reason);
    }

    // Check user agent
    const uaCheck = this.checkUserAgent(data.userAgent);
    if (uaCheck.suspicious) {
      score += 15;
      reasons.push(uaCheck.reason);
    }

    // Check timing patterns
    const timingCheck = this.checkTimingPatterns(data.userId, data.timestamp || Date.now());
    if (timingCheck.suspicious) {
      score += 10;
      reasons.push(timingCheck.reason);
    }

    const isValid = score < 50; // Threshold for blocking

    if (!isValid) {
      this.suspiciousPatterns.push({
        ...data,
        score,
        reasons,
        blockedAt: Date.now(),
      });
    }

    return { isValid, score, reasons };
  }

  private checkClickVelocity(userId: string): { suspicious: boolean; reason: string } {
    const now = Date.now();
    const userClicks = this.clickHistory.get(userId) || [];
    
    // Add current click
    userClicks.push({ timestamp: now });
    this.clickHistory.set(userId, userClicks);

    // Check last minute
    const lastMinute = userClicks.filter(c => now - c.timestamp < 60000);
    if (lastMinute.length > 20) {
      return {
        suspicious: true,
        reason: `Excessive clicks: ${lastMinute.length} in last minute`,
      };
    }

    // Check last hour
    const lastHour = userClicks.filter(c => now - c.timestamp < 3600000);
    if (lastHour.length > 100) {
      return {
        suspicious: true,
        reason: `Excessive clicks: ${lastHour.length} in last hour`,
      };
    }

    return { suspicious: false, reason: '' };
  }

  private checkIPPattern(ip: string): { suspicious: boolean; reason: string } {
    const now = Date.now();
    const ipClicks = this.ipHistory.get(ip) || [];
    
    ipClicks.push(now);
    this.ipHistory.set(ip, ipClicks);

    // Check for datacenter IPs (simplified)
    if (ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return {
        suspicious: true,
        reason: 'Datacenter IP detected',
      };
    }

    // Check click rate from IP
    const recentClicks = ipClicks.filter(t => now - t < 300000); // 5 minutes
    if (recentClicks.length > 50) {
      return {
        suspicious: true,
        reason: `High activity from IP: ${recentClicks.length} clicks in 5 minutes`,
      };
    }

    return { suspicious: false, reason: '' };
  }

  private checkFingerprint(userId: string, fingerprint: string): { suspicious: boolean; reason: string } {
    const userFingerprints = this.deviceFingerprints.get(userId) || new Set();
    
    userFingerprints.add(fingerprint);
    this.deviceFingerprints.set(userId, userFingerprints);

    // Multiple devices in short time
    if (userFingerprints.size > 5) {
      return {
        suspicious: true,
        reason: `Multiple devices detected: ${userFingerprints.size}`,
      };
    }

    return { suspicious: false, reason: '' };
  }

  private checkUserAgent(userAgent: string): { suspicious: boolean; reason: string } {
    // Check for bot patterns
    const botPatterns = /bot|crawler|spider|scraper|curl|wget|python|java/i;
    if (botPatterns.test(userAgent)) {
      return {
        suspicious: true,
        reason: 'Bot user agent detected',
      };
    }

    // Check for headless browsers
    if (userAgent.includes('HeadlessChrome')) {
      return {
        suspicious: true,
        reason: 'Headless browser detected',
      };
    }

    return { suspicious: false, reason: '' };
  }

  private checkTimingPatterns(userId: string, timestamp: number): { suspicious: boolean; reason: string } {
    const userClicks = this.clickHistory.get(userId) || [];
    
    if (userClicks.length < 2) {
      return { suspicious: false, reason: '' };
    }

    // Check for consistent intervals (bot-like behavior)
    const intervals = [];
    for (let i = 1; i < userClicks.length; i++) {
      intervals.push(userClicks[i].timestamp - userClicks[i-1].timestamp);
    }

    if (intervals.length > 5) {
      const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
      const variance = intervals.reduce((sum, interval) => 
        sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
      
      // Low variance indicates bot-like regular clicking
      if (variance < 1000 && avgInterval < 5000) {
        return {
          suspicious: true,
          reason: 'Regular interval clicking detected',
        };
      }
    }

    return { suspicious: false, reason: '' };
  }

  getSuspiciousPatterns() {
    return this.suspiciousPatterns;
  }

  clearHistory() {
    this.clickHistory.clear();
    this.ipHistory.clear();
    this.deviceFingerprints.clear();
    this.suspiciousPatterns = [];
  }
}

describe('Fraud Detection Tests', () => {
  let fraudDetector: MockFraudDetector;

  beforeEach(() => {
    fraudDetector = new MockFraudDetector();
  });

  describe('Click Velocity Detection', () => {
    it('should detect rapid clicking', async () => {
      const userId = 'suspicious_user';
      
      // Simulate 30 clicks in 30 seconds
      for (let i = 0; i < 30; i++) {
        const result = await fraudDetector.analyzeClick({
          userId,
          ip: '1.2.3.4',
          userAgent: 'Mozilla/5.0',
          fingerprint: 'fp_123',
        });

        if (i < 20) {
          expect(result.isValid).toBe(true);
        } else {
          // Should start blocking after 20 clicks/minute
          expect(result.isValid).toBe(false);
          expect(result.reasons).toContain('Excessive clicks: 21 in last minute');
        }

        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between clicks
      }
    });
  });

  describe('IP Pattern Detection', () => {
    it('should detect datacenter IPs', async () => {
      const result = await fraudDetector.analyzeClick({
        userId: 'user_123',
        ip: '192.168.1.100', // Private IP
        userAgent: 'Mozilla/5.0',
        fingerprint: 'fp_123',
      });

      expect(result.isValid).toBe(false);
      expect(result.reasons).toContain('Datacenter IP detected');
    });

    it('should detect high activity from single IP', async () => {
      const ip = '5.6.7.8';
      
      // Simulate 60 users from same IP
      for (let i = 0; i < 60; i++) {
        const result = await fraudDetector.analyzeClick({
          userId: `user_${i}`,
          ip,
          userAgent: 'Mozilla/5.0',
          fingerprint: `fp_${i}`,
        });

        if (i > 50) {
          expect(result.reasons.some(r => r.includes('High activity from IP'))).toBe(true);
        }
      }
    });
  });

  describe('Bot Detection', () => {
    it('should detect bot user agents', async () => {
      const botAgents = [
        'Googlebot/2.1',
        'Mozilla/5.0 (compatible; bingbot/2.0)',
        'curl/7.64.1',
        'Python-urllib/3.7',
      ];

      for (const userAgent of botAgents) {
        const result = await fraudDetector.analyzeClick({
          userId: 'bot_user',
          ip: '1.2.3.4',
          userAgent,
          fingerprint: 'fp_bot',
        });

        expect(result.isValid).toBe(false);
        expect(result.reasons).toContain('Bot user agent detected');
      }
    });

    it('should detect headless browsers', async () => {
      const result = await fraudDetector.analyzeClick({
        userId: 'headless_user',
        ip: '1.2.3.4',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/91.0',
        fingerprint: 'fp_headless',
      });

      expect(result.isValid).toBe(false);
      expect(result.reasons).toContain('Headless browser detected');
    });
  });

  describe('Device Fingerprint Analysis', () => {
    it('should detect multiple devices per user', async () => {
      const userId = 'device_hopper';
      
      // Simulate using 6 different devices
      for (let i = 0; i < 6; i++) {
        const result = await fraudDetector.analyzeClick({
          userId,
          ip: '1.2.3.4',
          userAgent: 'Mozilla/5.0',
          fingerprint: `fp_device_${i}`,
        });

        if (i >= 5) {
          expect(result.reasons).toContain('Multiple devices detected: 6');
        }
      }
    });
  });

  describe('Click Pattern Analysis', () => {
    it('should detect bot-like regular intervals', async () => {
      const userId = 'bot_clicker';
      
      // Simulate perfectly timed clicks every 2 seconds
      for (let i = 0; i < 10; i++) {
        await fraudDetector.analyzeClick({
          userId,
          ip: '1.2.3.4',
          userAgent: 'Mozilla/5.0',
          fingerprint: 'fp_bot',
          timestamp: Date.now() + (i * 2000), // Exactly 2 seconds apart
        });
      }

      const result = await fraudDetector.analyzeClick({
        userId,
        ip: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
        fingerprint: 'fp_bot',
      });

      expect(result.reasons).toContain('Regular interval clicking detected');
    });
  });

  describe('Fraud Score Calculation', () => {
    it('should calculate cumulative fraud score', async () => {
      const result = await fraudDetector.analyzeClick({
        userId: 'fraudster',
        ip: '192.168.1.1', // Datacenter IP: +25
        userAgent: 'curl/7.0', // Bot UA: +15
        fingerprint: 'fp_fraud',
      });

      expect(result.score).toBeGreaterThanOrEqual(40);
      expect(result.isValid).toBe(false);
    });
  });
});