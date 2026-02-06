# TWIST Browser Extension v2.0 - Implementation Guide

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Core Components](#core-components)
3. [API Integration](#api-integration)
4. [State Management](#state-management)
5. [Security Implementation](#security-implementation)
6. [Cross-Browser Compatibility](#cross-browser-compatibility)
7. [Build and Deployment](#build-and-deployment)
8. [Troubleshooting](#troubleshooting)

## Architecture Overview

The TWIST Browser Extension follows a modular architecture with clear separation of concerns:

```
extension/
├── background/             # Service worker (brain of the extension)
├── content/               # Scripts injected into web pages
├── popup/                 # React-based popup UI
├── options/               # Settings page
├── security/              # Security and privacy features
├── update/                # Auto-update system
├── types/                 # TypeScript type definitions
├── @types/                # Third-party type definitions
└── tests/                 # Comprehensive test suite
```

### Key Design Principles
- **Privacy First**: User data is sanitized and sensitive sites are excluded
- **Performance Optimized**: Efficient resource usage with throttling and caching
- **Security Hardened**: Multiple layers of XSS and injection protection
- **User Friendly**: Clear notifications and intuitive UI

## Core Components

### 1. Background Service Worker (`service-worker-v2.ts`)

The service worker is the central hub that:
- Manages extension state
- Handles all message routing
- Integrates with TWIST APIs
- Monitors tab activity
- Submits VAU data
- Manages staking operations

**Key Classes:**
```typescript
class BackgroundService {
  private sdk: TwistWebSDK;              // API integration
  private connection: Connection;         // Solana blockchain
  private userIdentity: UserIdentity;     // User session
  private activeTabs: Map<number, TabInfo>; // Tab tracking
  private publishers: Map<string, Publisher>; // Publisher cache
  private stakingAlerts: Map<string, Alert>; // APY monitoring
}
```

**Message Handling Flow:**
1. Content script/popup sends message
2. Service worker receives via `chrome.runtime.onMessage`
3. Routes to appropriate handler method
4. Performs async operations (API calls, storage)
5. Returns response to sender

### 2. Content Script (`inject-v2.ts`)

Injected into every webpage to:
- Track user activity (with privacy controls)
- Detect social media influencers
- Show influencer staking badges
- Display publisher widgets
- Monitor viewport engagement

**Activity Tracking:**
```typescript
// Throttled to 1 event/second
const events = ['click', 'scroll', 'keypress', 'mousemove'];
events.forEach(event => {
  document.addEventListener(event, throttle(handler, 1000));
});
```

**Platform Detection:**
```typescript
const platforms = {
  'twitter.com': { regex: /\/(\w+)$/, type: 'twitter' },
  'youtube.com': { regex: /@(\w+)/, type: 'youtube' },
  'instagram.com': { regex: /\/(\w+)/, type: 'instagram' },
  'tiktok.com': { regex: /@(\w+)/, type: 'tiktok' }
};
```

### 3. Popup UI (`popup/src/`)

React-based interface with:
- **HomePage**: Dashboard with balance, stakes, and earnings
- **SearchPage**: Influencer discovery with sorting/filtering
- **WalletPage**: Portfolio management and reward claiming
- **SettingsPage**: Privacy controls and preferences
- **StakingModal**: Token staking interface

**State Management:**
```typescript
// Local state with Chrome storage persistence
const [userIdentity, setUserIdentity] = useState(null);
const [balance, setBalance] = useState(BigInt(0));
const [stakes, setStakes] = useState([]);

// Sync with background service
useEffect(() => {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    // Update local state
  });
}, []);
```

### 4. Security Sandbox (`security/sandbox.ts`)

Implements defense-in-depth security:
- Content Security Policy enforcement
- XSS prevention and script validation
- Sensitive page detection
- Data sanitization
- Origin validation

**CSP Implementation:**
```typescript
const csp = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://api.twist.io;
  connect-src 'self' https://api.twist.io https://vau.twist.io;
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none';
`;
```

## API Integration

### TWIST Web SDK

The extension integrates with TWIST APIs via the official SDK:

```typescript
import { TwistWebSDK } from '@twist/web-sdk';

const sdk = new TwistWebSDK({
  apiKey: process.env.TWIST_API_KEY,
  environment: 'production'
});

// Authentication
const identity = await sdk.identify(email);

// Influencer operations
const influencers = await sdk.searchInfluencers({ query, sortBy });
const result = await sdk.stakeOnInfluencer({ influencerId, amount });
const stakes = await sdk.getUserStakes();
const rewards = await sdk.claimRewards(influencerId);

// Token operations
const balance = await sdk.getBalance(walletAddress);
const metrics = await sdk.getTokenMetrics();
```

### VAU Submission

Verified Active Usage tracking:

```typescript
// Collect activity data
const vauData = {
  userId: identity.userId,
  deviceId: identity.deviceId,
  siteId: publisher.id,
  platform: Platform.WEB,
  timeSpent: Date.now() - tabState.startTime,
  attestation: {
    source: 'browser_extension',
    version: chrome.runtime.getManifest().version,
    trustScore: identity.trustScore
  }
};

// Submit to API
const response = await fetch(`${API_ENDPOINT}/api/v1/vau/submit`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Extension-Version': version
  },
  body: JSON.stringify(vauData)
});
```

### Publisher Verification

```typescript
async function checkPublisher(domain: string): Promise<Publisher | null> {
  // Check cache first
  if (publisherCache.has(domain)) {
    return publisherCache.get(domain);
  }

  // Verify with API
  const response = await fetch(`${API_ENDPOINT}/api/v1/publishers/check`, {
    method: 'POST',
    body: JSON.stringify({ domain })
  });

  if (response.ok) {
    const publisher = await response.json();
    publisherCache.set(domain, publisher);
    return publisher;
  }

  return null;
}
```

## State Management

### Chrome Storage Architecture

```typescript
// User session data
chrome.storage.local.set({
  identity: {
    userId: string,
    email: string,
    deviceId: string,
    trustScore: number,
    createdAt: string
  },
  wallet: {
    publicKey: string,
    connected: boolean
  }
});

// User preferences
chrome.storage.sync.set({
  notifications: boolean,
  privacyMode: 'strict' | 'balanced' | 'permissive',
  theme: 'light' | 'dark'
});

// Cached data
chrome.storage.local.set({
  balance: string,        // BigInt as string
  stakes: UserStake[],
  tokenMetrics: TokenMetrics,
  publishers: Map<string, Publisher>,
  recentSearches: SearchQuery[]
});
```

### State Synchronization

```typescript
// Periodic sync every 5 minutes
chrome.alarms.create('syncData', { periodInMinutes: 5 });

async function syncData() {
  const [balance, stakes, metrics] = await Promise.all([
    sdk.getBalance(wallet.publicKey),
    sdk.getUserStakes(),
    sdk.getTokenMetrics()
  ]);

  await chrome.storage.local.set({
    balance: balance.toString(),
    stakes,
    tokenMetrics: metrics,
    lastSync: Date.now()
  });
}
```

## Security Implementation

### XSS Prevention

1. **Script Validation**
```typescript
function validateScript(script: HTMLScriptElement): boolean {
  const src = script.src || '';
  const content = script.textContent || '';
  
  // Check against whitelist
  if (src && !isWhitelistedSource(src)) {
    return false;
  }
  
  // Scan for dangerous patterns
  const dangerous = [
    /eval\s*\(/,
    /new\s+Function/,
    /document\.write/,
    /innerHTML\s*=/
  ];
  
  return !dangerous.some(pattern => pattern.test(content));
}
```

2. **DOM Monitoring**
```typescript
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeName === 'SCRIPT') {
          if (!validateScript(node)) {
            node.remove();
            reportSecurityAlert('suspicious_script');
          }
        }
      });
    }
  });
});
```

### Privacy Protection

1. **Sensitive Site Detection**
```typescript
const sensitivePatterns = [
  /banking|bank/i,
  /payment|checkout/i,
  /password/i,
  /credit.?card/i,
  /ssn|social.?security/i
];

function shouldTrackPage(url: string): boolean {
  return !sensitivePatterns.some(pattern => pattern.test(url));
}
```

2. **Data Sanitization**
```typescript
function sanitizeData(data: any): any {
  const sensitiveKeys = ['password', 'token', 'key', 'secret', 'ssn'];
  
  if (typeof data === 'object') {
    const sanitized = { ...data };
    Object.keys(sanitized).forEach(key => {
      if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
        sanitized[key] = '[REDACTED]';
      }
    });
    return sanitized;
  }
  
  return data;
}
```

## Cross-Browser Compatibility

### Manifest Differences

**Chrome/Edge (Manifest V3):**
```json
{
  "manifest_version": 3,
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html"
  }
}
```

**Firefox (Manifest V2):**
```json
{
  "manifest_version": 2,
  "background": {
    "scripts": ["background.js"],
    "persistent": false
  },
  "browser_action": {
    "default_popup": "popup.html"
  }
}
```

### API Compatibility Layer

```typescript
// browser-compat.ts
const browserAPI = {
  storage: chrome.storage || browser.storage,
  runtime: chrome.runtime || browser.runtime,
  tabs: chrome.tabs || browser.tabs,
  
  // Handle API differences
  setBadgeText: (text: string) => {
    if (chrome.action) {
      chrome.action.setBadgeText({ text });
    } else if (chrome.browserAction) {
      chrome.browserAction.setBadgeText({ text });
    }
  }
};
```

## Build and Deployment

### Development Setup

```bash
# Install dependencies
npm install

# Development build with watch
npm run dev

# Run tests
npm test

# Type checking
npm run type-check
```

### Production Build

```bash
# Build for all browsers
npm run build:all

# Individual browser builds
npm run build:chrome
npm run build:firefox
npm run build:safari

# Create release packages
./scripts/build-extension.sh
```

### Webpack Configuration

```javascript
module.exports = {
  entry: {
    'background/service-worker': './background/service-worker.ts',
    'content/inject': './content/inject.ts',
    'popup/popup': './popup/src/index.tsx',
    'options/options': './options/src/index.tsx'
  },
  output: {
    path: path.resolve(__dirname, `build/${browser}`),
    filename: '[name].js'
  },
  module: {
    rules: [
      { test: /\.tsx?$/, use: 'ts-loader' },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] }
    ]
  }
};
```

### Store Deployment

1. **Chrome Web Store**
   - Package: `dist/twist-chrome-2.0.0.zip`
   - Developer Dashboard: https://chrome.google.com/webstore/devconsole
   - Review time: 1-3 days

2. **Firefox Add-ons**
   - Package: `dist/twist-firefox-2.0.0.zip`
   - Developer Hub: https://addons.mozilla.org/developers/
   - Review time: 2-5 days

3. **Microsoft Edge**
   - Use Chrome package
   - Partner Center: https://partner.microsoft.com/dashboard
   - Review time: 1-2 days

## Troubleshooting

### Common Issues

1. **Extension not loading**
   - Check manifest.json syntax
   - Verify all file paths are correct
   - Check browser console for errors

2. **API connection failures**
   - Verify API key is set
   - Check network permissions in manifest
   - Ensure CORS headers are correct

3. **State not persisting**
   - Check storage permissions
   - Verify chrome.storage quota not exceeded
   - Clear extension storage and retry

### Debug Mode

Enable verbose logging:
```typescript
// In background service worker
const DEBUG = process.env.NODE_ENV === 'development';

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[TWIST]', ...args);
  }
}
```

### Performance Profiling

```typescript
// Measure operation time
performance.mark('operation-start');
// ... operation code ...
performance.mark('operation-end');
performance.measure('operation', 'operation-start', 'operation-end');

const measure = performance.getEntriesByName('operation')[0];
console.log(`Operation took ${measure.duration}ms`);
```

---

This guide covers the essential implementation details. For specific API documentation, see [API_INTEGRATION.md](./API_INTEGRATION.md). For user documentation, see [USER_GUIDE.md](./USER_GUIDE.md).