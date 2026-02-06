# AHEE SDK Integration Guide

## Overview

The AHEE SDK enables websites to integrate with the Attention-Heat-Exchange Economy, allowing site owners to earn rewards for genuine user attention while providing fraud-proof analytics and privacy-preserving targeting.

## Quick Start

### 1. Installation

```html
<!-- Add to your site's <head> tag -->
<script src="https://cdn.ahee.io/sdk/v1/ahee.min.js" async></script>
```

Or via npm:

```bash
npm install @ahee/sdk
```

### 2. Basic Integration

```javascript
// Initialize AHEE SDK
window.AHEE.init({
  siteId: 'your-site-id',        // From owner dashboard
  wallet: 'your-solana-wallet',   // Where to receive rewards
  environment: 'production'       // or 'testnet'
});

// SDK automatically tracks verified attention units (VAUs)
```

### 3. Verify Integration

```javascript
// Check if AHEE is ready
window.AHEE.ready(() => {
  console.log('AHEE initialized');
  console.log('Site ID:', window.AHEE.getSiteId());
  console.log('Wallet:', window.AHEE.getWallet());
});
```

## Core Features

### 1. Automatic VAU Tracking

The SDK automatically tracks Verified Attention Units without any additional code:

```javascript
// No code needed! SDK tracks:
// - Page views with hardware attestation
// - Time spent on page (in 10-second increments)
// - Interaction events (clicks, scrolls)
// - Video/audio engagement
```

### 2. Privacy-Preserving Analytics

Access real-time analytics without cookies:

```javascript
// Get current session stats
const stats = await window.AHEE.getSessionStats();
console.log(stats);
// {
//   vaus: 42,
//   duration: 420,
//   interactions: 15,
//   cohort: 'tech-news-readers',
//   quality_score: 0.95
// }

// Subscribe to real-time updates
window.AHEE.on('vau', (event) => {
  console.log('New VAU recorded:', event.vauId);
  console.log('Total VAUs this session:', event.totalVaus);
});
```

### 3. Cohort Integration

Enable privacy-preserving targeting:

```javascript
// Get user's current cohort (privacy-safe)
const cohort = await window.AHEE.getCohort();
console.log('User cohort:', cohort.id);
console.log('Categories:', cohort.categories);

// React to cohort changes
window.AHEE.on('cohortChange', (newCohort) => {
  // Adjust content or recommendations
  updateRecommendations(newCohort.categories);
});
```

### 4. Ad Integration

Wrap existing ad units for fraud-proof delivery:

```html
<!-- Wrap your existing ad unit -->
<div class="ahee-ad-wrapper" data-ahee-zone="header-banner">
  <!-- Your existing ad code (Google AdSense, etc.) -->
  <ins class="adsbygoogle" 
       style="display:block"
       data-ad-client="ca-pub-xxxxx"
       data-ad-slot="xxxxx"></ins>
</div>
```

```javascript
// Register ad zones programmatically
window.AHEE.registerAdZone({
  zoneId: 'sidebar-ad',
  element: document.getElementById('sidebar-ad'),
  minVaus: 5,  // Minimum VAUs before showing ad
  targeting: {
    cohorts: ['tech-enthusiasts', 'crypto-users'],
    keywords: ['blockchain', 'defi']
  }
});
```

## Advanced Features

### 1. Custom VAU Events

Track specific high-value interactions:

```javascript
// Track custom events
window.AHEE.trackEvent('purchase_intent', {
  product: 'Premium Subscription',
  value: 99.99,
  currency: 'USD'
});

// Track engagement milestones
window.AHEE.trackMilestone('article_complete', {
  articleId: '12345',
  readTime: 300,
  scrollDepth: 100
});
```

### 2. Referral Tracking

Implement referral rewards:

```javascript
// Initialize with referral code
window.AHEE.init({
  siteId: 'your-site-id',
  wallet: 'your-wallet',
  referralCode: 'FRIEND123'  // From URL parameter
});

// Generate referral links
const referralLink = window.AHEE.createReferralLink({
  page: window.location.href,
  campaign: 'social-share'
});
console.log('Share this link:', referralLink);
```

### 3. Explorer Pool Integration

Enable users to stake attention bonds:

```javascript
// Check if user can create bonds
const bondEligible = await window.AHEE.checkBondEligibility();
if (bondEligible) {
  // Show bond staking UI
  showBondStakingButton();
}

// Create attention bond for current page
async function stakeBond() {
  try {
    const bond = await window.AHEE.createBond({
      amount: 1000,        // AC-D tokens to stake
      duration: 30,        // Days
      pageUrl: window.location.href
    });
    console.log('Bond created:', bond.id);
    console.log('Daily yield:', bond.estimatedYield);
  } catch (error) {
    console.error('Bond creation failed:', error);
  }
}
```

### 4. Brand Token Integration

For product pages and branded content:

```javascript
// Initialize with brand token support
window.AHEE.init({
  siteId: 'your-site-id',
  wallet: 'your-wallet',
  brandToken: 'NIKE',  // Your brand token symbol
  brandRewards: {
    view: 0.1,         // Tokens per page view
    interaction: 0.5,  // Tokens per interaction
    purchase: 10       // Tokens per purchase
  }
});

// Track brand-specific events
window.AHEE.trackBrandEvent('product_view', {
  sku: 'SHOE-123',
  category: 'running',
  price: 149.99
});
```

## Configuration Options

### Full Configuration

```javascript
window.AHEE.init({
  // Required
  siteId: 'your-site-id',
  wallet: 'your-solana-wallet',
  
  // Optional
  environment: 'production',      // or 'testnet', 'devnet'
  debug: false,                   // Enable debug logging
  
  // Privacy settings
  cohortTracking: true,           // Enable cohort assignment
  detailedAnalytics: true,        // Enable detailed metrics
  
  // Performance
  batchSize: 100,                 // VAUs per batch
  batchInterval: 5000,            // Milliseconds between batches
  
  // Ad settings
  adWrapper: true,                // Auto-wrap ad units
  minVausForAds: 3,              // Minimum VAUs before ads
  
  // Callbacks
  onReady: () => {},              // Called when initialized
  onError: (error) => {},         // Error handler
  onVau: (vau) => {},            // VAU recorded
  onReward: (reward) => {}        // Reward earned
});
```

### Site Categories

Specify your site's content categories for better cohort matching:

```javascript
window.AHEE.init({
  siteId: 'your-site-id',
  wallet: 'your-wallet',
  categories: [
    'IAB1-1',    // Arts & Entertainment
    'IAB12',     // News
    'IAB19-8'    // Technology Computing
  ]
});
```

## API Reference

### Core Methods

```javascript
// Initialize SDK
AHEE.init(config: Config): Promise<void>

// Get current state
AHEE.ready(callback: Function): void
AHEE.getSiteId(): string
AHEE.getWallet(): string
AHEE.getSessionStats(): Promise<SessionStats>

// Event tracking
AHEE.trackEvent(name: string, data: object): Promise<string>
AHEE.trackMilestone(name: string, data: object): Promise<string>

// Cohort management
AHEE.getCohort(): Promise<Cohort>
AHEE.updateCategories(categories: string[]): Promise<void>

// Ad management
AHEE.registerAdZone(config: AdZoneConfig): AdZone
AHEE.pauseAds(): void
AHEE.resumeAds(): void

// Bond management
AHEE.checkBondEligibility(): Promise<boolean>
AHEE.createBond(params: BondParams): Promise<Bond>
AHEE.getBonds(): Promise<Bond[]>

// Event listeners
AHEE.on(event: string, handler: Function): void
AHEE.off(event: string, handler: Function): void
```

### Events

```javascript
// Core events
'ready'         // SDK initialized
'vau'           // VAU recorded
'reward'        // Reward earned
'error'         // Error occurred

// Cohort events
'cohortChange'  // User cohort updated
'categoryMatch' // Page matches user interests

// Ad events
'adRequest'     // Ad requested
'adImpression'  // Ad viewed
'adClick'       // Ad clicked

// Bond events
'bondCreated'   // Bond staked
'bondMatured'   // Bond completed
'yieldClaimed'  // Yield withdrawn
```

## Best Practices

### 1. Performance Optimization

```javascript
// Lazy load for non-critical pages
if (shouldTrackAttention()) {
  const script = document.createElement('script');
  script.src = 'https://cdn.ahee.io/sdk/v1/ahee.min.js';
  script.async = true;
  document.head.appendChild(script);
}

// Batch custom events
const eventQueue = [];
setInterval(() => {
  if (eventQueue.length > 0) {
    AHEE.trackBatch(eventQueue);
    eventQueue.length = 0;
  }
}, 5000);
```

### 2. Error Handling

```javascript
// Global error handler
window.AHEE.init(config).catch(error => {
  console.error('AHEE init failed:', error);
  // Fallback to standard analytics
  loadFallbackAnalytics();
});

// Event-specific error handling
try {
  await window.AHEE.trackEvent('purchase', data);
} catch (error) {
  if (error.code === 'RATE_LIMITED') {
    // Handle rate limiting
    setTimeout(() => retryEvent(data), 1000);
  }
}
```

### 3. Privacy Compliance

```javascript
// Check user consent
if (hasUserConsent()) {
  window.AHEE.init({
    siteId: 'your-site-id',
    wallet: 'your-wallet',
    detailedAnalytics: true
  });
} else {
  // Initialize with minimal tracking
  window.AHEE.init({
    siteId: 'your-site-id',
    wallet: 'your-wallet',
    detailedAnalytics: false,
    cohortTracking: false
  });
}
```

## Testing

### 1. Testnet Integration

```javascript
// Use testnet for development
window.AHEE.init({
  siteId: 'test-site-id',
  wallet: 'test-wallet',
  environment: 'testnet',
  debug: true
});

// Monitor test VAUs
window.AHEE.on('vau', (vau) => {
  console.log('Test VAU:', vau);
});
```

### 2. Unit Testing

```javascript
// Mock AHEE for tests
const mockAHEE = {
  init: jest.fn().mockResolvedValue(true),
  trackEvent: jest.fn().mockResolvedValue('event-id'),
  getSessionStats: jest.fn().mockResolvedValue({
    vaus: 10,
    duration: 100
  })
};

// Test your integration
test('tracks page view', async () => {
  await trackPageView();
  expect(mockAHEE.trackEvent).toHaveBeenCalledWith('page_view', {
    url: window.location.href
  });
});
```

## Migration Guide

### From Google Analytics

```javascript
// Before: Google Analytics
gtag('event', 'purchase', {
  value: 99.99,
  currency: 'USD'
});

// After: AHEE SDK (keeps GA)
window.AHEE.trackEvent('purchase', {
  value: 99.99,
  currency: 'USD'
});
// GA tracking continues to work
```

### From Custom Analytics

```javascript
// Parallel tracking during migration
function trackEvent(name, data) {
  // Your existing analytics
  legacyAnalytics.track(name, data);
  
  // Add AHEE tracking
  if (window.AHEE && window.AHEE.ready) {
    window.AHEE.trackEvent(name, data).catch(console.error);
  }
}
```

## Troubleshooting

### Common Issues

1. **SDK Not Loading**
```javascript
// Check if blocked by ad blockers
if (!window.AHEE) {
  console.warn('AHEE SDK blocked or not loaded');
  // Implement fallback
}
```

2. **Hardware Token Not Available**
```javascript
// SDK handles gracefully, but you can check
window.AHEE.getCapabilities().then(caps => {
  if (!caps.hardwareAttestation) {
    console.log('Device does not support hardware attestation');
  }
});
```

3. **Rate Limiting**
```javascript
// Handle rate limit errors
window.AHEE.on('error', (error) => {
  if (error.type === 'RATE_LIMIT') {
    // Reduce tracking frequency
    adjustTrackingFrequency();
  }
});
```

## Support

- Documentation: https://docs.ahee.io
- Dashboard: https://dashboard.ahee.io
- Support: support@ahee.io
- Discord: https://discord.gg/ahee
- SDK Status: https://status.ahee.io 