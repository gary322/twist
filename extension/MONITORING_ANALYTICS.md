# TWIST Extension - Monitoring & Analytics Setup

## Overview

This document outlines the monitoring and analytics infrastructure for the TWIST Browser Extension, covering error tracking, performance monitoring, user analytics, and operational metrics.

## 1. Error Monitoring (Sentry)

### Setup

```javascript
// background/monitoring.ts
import * as Sentry from '@sentry/browser';
import { Integrations } from '@sentry/tracing';

export function initializeSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: chrome.runtime.getManifest().version,
    integrations: [
      new Integrations.BrowserTracing({
        tracingOrigins: ['https://api.twist.io', 'https://vau.twist.io'],
      }),
    ],
    tracesSampleRate: 0.1, // 10% sampling in production
    beforeSend(event, hint) {
      // Sanitize sensitive data
      if (event.request?.cookies) {
        delete event.request.cookies;
      }
      if (event.user?.email) {
        event.user.email = '[REDACTED]';
      }
      return event;
    },
    ignoreErrors: [
      // Browser-specific errors to ignore
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
      /extension context invalidated/i,
    ],
  });
}

// Error boundary wrapper
export function withErrorBoundary<T extends (...args: any[]) => any>(
  fn: T,
  context: string
): T {
  return ((...args) => {
    try {
      const result = fn(...args);
      if (result instanceof Promise) {
        return result.catch((error) => {
          Sentry.captureException(error, {
            tags: { context },
            extra: { args },
          });
          throw error;
        });
      }
      return result;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { context },
        extra: { args },
      });
      throw error;
    }
  }) as T;
}
```

### Error Categories

1. **Critical Errors** (Immediate alerts)
   - Authentication failures
   - Wallet connection errors
   - API unavailability
   - Extension crash loops

2. **High Priority** (Within 1 hour)
   - Staking transaction failures
   - VAU submission errors
   - Data sync failures

3. **Medium Priority** (Daily digest)
   - UI rendering errors
   - Performance degradation
   - Browser compatibility issues

4. **Low Priority** (Weekly report)
   - Non-critical API errors
   - Minor UI glitches

### Alert Configuration

```yaml
# .sentryclirc
[defaults]
url = https://sentry.io/
org = twist
project = browser-extension

[alerts]
critical:
  - name: "Authentication Failure Spike"
    conditions:
      - error.type:AuthenticationError
      - event.count > 100 in 5m
    actions:
      - slack: "#alerts-critical"
      - pagerduty: "extension-oncall"

high:
  - name: "Transaction Failures"
    conditions:
      - error.type:TransactionError
      - event.count > 50 in 15m
    actions:
      - slack: "#alerts-high"
      - email: "dev-team@twist.io"
```

## 2. Performance Monitoring

### Core Metrics

```typescript
// performance/metrics.ts
export class PerformanceMonitor {
  private marks: Map<string, number> = new Map();

  startOperation(name: string): void {
    this.marks.set(name, performance.now());
  }

  endOperation(name: string, metadata?: Record<string, any>): void {
    const startTime = this.marks.get(name);
    if (!startTime) return;

    const duration = performance.now() - startTime;
    this.marks.delete(name);

    // Send to analytics
    this.reportMetric({
      name,
      duration,
      timestamp: Date.now(),
      ...metadata,
    });

    // Log slow operations
    if (duration > this.getThreshold(name)) {
      console.warn(`Slow operation detected: ${name} took ${duration}ms`);
      Sentry.captureMessage(`Slow operation: ${name}`, {
        level: 'warning',
        extra: { duration, metadata },
      });
    }
  }

  private getThreshold(operation: string): number {
    const thresholds: Record<string, number> = {
      'popup-render': 300,
      'api-call': 2000,
      'vau-submission': 1000,
      'influencer-search': 1500,
      'wallet-connect': 3000,
    };
    return thresholds[operation] || 1000;
  }

  private reportMetric(metric: any): void {
    // Send to analytics endpoint
    fetch('https://analytics.twist.io/v1/metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        extensionId: chrome.runtime.id,
        version: chrome.runtime.getManifest().version,
        metric,
      }),
    }).catch(console.error);
  }
}
```

### Key Performance Indicators (KPIs)

1. **Extension Performance**
   - Popup load time: < 300ms
   - Background script memory: < 50MB
   - CPU usage: < 1% idle
   - Network requests/min: < 10

2. **API Performance**
   - Response time p95: < 500ms
   - Error rate: < 0.1%
   - Timeout rate: < 0.01%

3. **User Experience**
   - Time to first interaction: < 500ms
   - Staking transaction time: < 3s
   - Search response time: < 1s

## 3. User Analytics

### Privacy-Respecting Analytics

```typescript
// analytics/tracker.ts
export class AnalyticsTracker {
  private userId: string;
  private sessionId: string;
  private isEnabled: boolean;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.loadUserConsent();
  }

  async trackEvent(
    event: string,
    properties?: Record<string, any>
  ): Promise<void> {
    if (!this.isEnabled) return;

    const payload = {
      event,
      properties: this.sanitizeProperties(properties),
      timestamp: Date.now(),
      session: this.sessionId,
      user: this.hashUserId(this.userId),
      context: {
        version: chrome.runtime.getManifest().version,
        browser: this.getBrowserInfo(),
        locale: chrome.i18n.getUILanguage(),
      },
    };

    // Queue for batch sending
    await this.queueEvent(payload);
  }

  private sanitizeProperties(props?: Record<string, any>): Record<string, any> {
    if (!props) return {};

    const sanitized: Record<string, any> = {};
    const allowedKeys = [
      'feature',
      'action',
      'value',
      'duration',
      'success',
      'error_type',
    ];

    for (const [key, value] of Object.entries(props)) {
      if (allowedKeys.includes(key)) {
        // Remove any PII
        sanitized[key] = this.removePII(value);
      }
    }

    return sanitized;
  }

  private removePII(value: any): any {
    if (typeof value === 'string') {
      // Remove emails
      value = value.replace(/[^\s]+@[^\s]+/g, '[EMAIL]');
      // Remove wallet addresses
      value = value.replace(/[A-HJ-NP-Z0-9]{32,}/g, '[WALLET]');
    }
    return value;
  }

  private hashUserId(userId: string): string {
    // One-way hash for privacy
    return crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(userId))
      .then(buffer => 
        Array.from(new Uint8Array(buffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')
      );
  }
}
```

### Events to Track

1. **User Journey**
   - Extension installed
   - Account created
   - Wallet connected
   - First earning
   - First stake

2. **Feature Usage**
   - Popup opened
   - Search performed
   - Influencer viewed
   - Stake initiated
   - Rewards claimed

3. **Engagement Metrics**
   - Daily active users
   - Session duration
   - Features used per session
   - Retention rate

### Analytics Dashboard

```yaml
# Metrics to display
dashboards:
  overview:
    - total_users
    - daily_active_users
    - total_earnings
    - total_staked
    - average_session_duration

  performance:
    - api_response_time
    - error_rate
    - crash_rate
    - memory_usage
    - network_usage

  engagement:
    - feature_adoption_rate
    - staking_conversion_rate
    - average_stakes_per_user
    - reward_claim_rate

  growth:
    - new_users_daily
    - retention_rate_7d
    - retention_rate_30d
    - churn_rate
```

## 4. Infrastructure Monitoring

### Health Checks

```typescript
// monitoring/health.ts
export class HealthMonitor {
  private checks: Map<string, () => Promise<boolean>> = new Map();

  constructor() {
    this.registerChecks();
    this.startMonitoring();
  }

  private registerChecks(): void {
    // API availability
    this.checks.set('api', async () => {
      try {
        const response = await fetch('https://api.twist.io/health');
        return response.ok;
      } catch {
        return false;
      }
    });

    // Storage health
    this.checks.set('storage', async () => {
      try {
        const { bytesInUse, QUOTA_BYTES } = await chrome.storage.local.getBytesInUse();
        return bytesInUse < QUOTA_BYTES * 0.9; // Alert at 90% usage
      } catch {
        return false;
      }
    });

    // Memory usage
    this.checks.set('memory', async () => {
      if (performance.memory) {
        const usage = performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit;
        return usage < 0.8; // Alert at 80% usage
      }
      return true;
    });
  }

  private async startMonitoring(): Promise<void> {
    // Run health checks every 5 minutes
    setInterval(async () => {
      const results = await this.runAllChecks();
      
      if (results.some(r => !r.healthy)) {
        this.reportUnhealthy(results);
      }
    }, 5 * 60 * 1000);
  }

  private async runAllChecks(): Promise<Array<{ name: string; healthy: boolean }>> {
    const results = [];
    
    for (const [name, check] of this.checks) {
      try {
        const healthy = await check();
        results.push({ name, healthy });
      } catch (error) {
        results.push({ name, healthy: false });
        console.error(`Health check failed: ${name}`, error);
      }
    }
    
    return results;
  }

  private reportUnhealthy(results: Array<{ name: string; healthy: boolean }>): void {
    const unhealthy = results.filter(r => !r.healthy);
    
    // Log to Sentry
    Sentry.captureMessage('Health check failures', {
      level: 'warning',
      extra: { unhealthy },
    });

    // Send to monitoring endpoint
    fetch('https://monitoring.twist.io/v1/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        extensionId: chrome.runtime.id,
        failures: unhealthy,
        timestamp: Date.now(),
      }),
    }).catch(console.error);
  }
}
```

## 5. Custom Metrics

### Business Metrics

```typescript
// metrics/business.ts
export class BusinessMetrics {
  async reportEarnings(amount: number, source: string): Promise<void> {
    await this.sendMetric('earnings', {
      amount,
      source,
      currency: 'TWIST',
      timestamp: Date.now(),
    });
  }

  async reportStaking(
    influencerId: string,
    amount: number,
    apy: number
  ): Promise<void> {
    await this.sendMetric('staking', {
      influencerId: this.hashId(influencerId),
      amount,
      apy,
      timestamp: Date.now(),
    });
  }

  async reportConversion(
    funnel: string,
    step: string,
    success: boolean
  ): Promise<void> {
    await this.sendMetric('conversion', {
      funnel,
      step,
      success,
      timestamp: Date.now(),
    });
  }

  private async sendMetric(
    type: string,
    data: Record<string, any>
  ): Promise<void> {
    // Implementation
  }
}
```

## 6. Monitoring Implementation

### Setup Script

```bash
#!/bin/bash
# setup-monitoring.sh

# Install monitoring dependencies
npm install --save \
  @sentry/browser \
  @sentry/tracing \
  web-vitals

# Set up environment variables
cat > .env.monitoring << EOF
SENTRY_DSN=your_sentry_dsn_here
SENTRY_ORG=twist
SENTRY_PROJECT=browser-extension
ANALYTICS_ENDPOINT=https://analytics.twist.io
MONITORING_ENDPOINT=https://monitoring.twist.io
EOF

# Configure Sentry CLI
npx @sentry/wizard -i sourcemaps

# Set up source maps upload
echo "Upload source maps on build"
```

### Integration Points

1. **Background Service Worker**
   ```typescript
   import { initializeSentry, withErrorBoundary } from './monitoring';
   
   // Initialize on startup
   initializeSentry();
   
   // Wrap critical functions
   const handleMessage = withErrorBoundary(
     async (message, sender) => {
       // Handle message
     },
     'message-handler'
   );
   ```

2. **Popup UI**
   ```typescript
   import { AnalyticsTracker } from './analytics';
   
   const analytics = new AnalyticsTracker();
   
   // Track user interactions
   analytics.trackEvent('popup_opened');
   analytics.trackEvent('search_performed', { query_length: query.length });
   ```

3. **Content Script**
   ```typescript
   // Track page interactions
   analytics.trackEvent('influencer_detected', {
     platform: 'twitter',
     has_badge: true,
   });
   ```

## 7. Alerts and Notifications

### Alert Rules

```yaml
alerts:
  - name: "High Error Rate"
    condition: error_rate > 5%
    window: 5m
    severity: critical
    notify:
      - slack: "#alerts-critical"
      - pagerduty: oncall
      - email: tech-leads@twist.io

  - name: "API Latency"
    condition: p95_latency > 2000ms
    window: 15m
    severity: high
    notify:
      - slack: "#alerts-performance"
      - email: backend-team@twist.io

  - name: "Low DAU"
    condition: daily_active_users < 1000
    window: 1d
    severity: medium
    notify:
      - slack: "#product-metrics"
      - email: product@twist.io
```

### Incident Response

1. **Automated Response**
   - Circuit breaker for failing APIs
   - Auto-scaling for high load
   - Graceful degradation of features

2. **Manual Response**
   - Runbook for common issues
   - Escalation procedures
   - Post-mortem process

## 8. Privacy Compliance

### Data Retention

- User analytics: 90 days
- Performance metrics: 30 days
- Error logs: 14 days
- Aggregated data: Indefinite

### User Controls

```typescript
// privacy/controls.ts
export class PrivacyControls {
  async optOut(): Promise<void> {
    await chrome.storage.local.set({ analytics_enabled: false });
    // Stop all tracking
  }

  async exportData(): Promise<Blob> {
    // Collect all user data
    // Return as downloadable file
  }

  async deleteData(): Promise<void> {
    // Remove all stored analytics
    // Keep only essential data
  }
}
```

## 9. Monitoring Dashboard

### Real-time Dashboard Components

1. **System Health**
   - API status indicators
   - Error rate graphs
   - Performance metrics

2. **User Metrics**
   - Active users counter
   - Feature usage heatmap
   - Conversion funnels

3. **Business Metrics**
   - Total earnings
   - Staking volume
   - Top influencers

### Historical Reports

- Daily summary emails
- Weekly performance reports
- Monthly business reviews
- Quarterly trend analysis

## 10. Testing Monitoring

```typescript
// tests/monitoring.test.ts
describe('Monitoring Integration', () => {
  it('should capture errors correctly', async () => {
    const mockError = new Error('Test error');
    
    // Trigger error
    await expect(throwError()).rejects.toThrow();
    
    // Verify Sentry captured it
    expect(Sentry.captureException).toHaveBeenCalledWith(
      mockError,
      expect.any(Object)
    );
  });

  it('should track performance metrics', async () => {
    const monitor = new PerformanceMonitor();
    
    monitor.startOperation('test-op');
    await delay(100);
    monitor.endOperation('test-op');
    
    // Verify metric was sent
    expect(fetch).toHaveBeenCalledWith(
      'https://analytics.twist.io/v1/metrics',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('test-op'),
      })
    );
  });
});
```

---

This monitoring and analytics setup provides comprehensive visibility into the extension's performance, user behavior, and business metrics while respecting user privacy.