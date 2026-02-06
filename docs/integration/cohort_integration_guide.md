# Cohort Integration Guide

## Overview

The AHEE Cohort System enables privacy-preserving audience targeting without cookies or personal data collection. Users are assigned to interest-based cohorts locally on their devices, with only anonymized cohort IDs shared with advertisers.

## How Cohorts Work

### 1. Local Classification
- Pages are classified into IAB categories using WASM module
- Classification happens entirely on user's device
- No browsing data leaves the device

### 2. Daily Cohort Assignment
- Users assigned to cohorts based on browsing patterns
- Cohorts rotate daily for privacy
- Minimum k-anonymity of 100 users per cohort

### 3. Privacy-Preserving Targeting
- Advertisers target cohort IDs, not individuals
- Bloom filters enable O(1) membership checks
- No cross-site tracking possible

## Publisher Integration

### 1. Basic Setup

```javascript
// Enable cohort tracking in AHEE SDK
window.AHEE.init({
  siteId: 'your-site-id',
  wallet: 'your-wallet',
  cohortTracking: true,  // Enable cohort system
  categories: [          // Declare your content categories
    'IAB1',      // Arts & Entertainment
    'IAB12',     // News
    'IAB19-8'    // Computer Software
  ]
});
```

### 2. Dynamic Category Detection

```javascript
// Let the system auto-detect categories
window.AHEE.enableAutoCategories({
  // Analyze page content
  analyzeContent: true,
  
  // Use meta tags
  useMeta: true,
  
  // Custom signals
  signals: {
    keywords: ['technology', 'software', 'startup'],
    section: 'tech-news'
  }
});

// Or manually set for specific pages
window.AHEE.setPageCategories([
  'IAB19-8',  // Computer Software
  'IAB3-12'   // Business Software
]);
```

### 3. Cohort-Based Content

```javascript
// Adapt content based on visitor's cohort
window.AHEE.on('cohortReady', async (cohort) => {
  // Get cohort interests
  const interests = cohort.categories;
  
  // Personalize content
  if (interests.includes('sports-enthusiasts')) {
    showSportsContent();
  } else if (interests.includes('tech-professionals')) {
    showTechContent();
  }
  
  // Load relevant recommendations
  const recommendations = await fetchRecommendations(cohort.id);
  displayRecommendations(recommendations);
});
```

## Advertiser Integration

### 1. Campaign Setup

```javascript
// Create campaign targeting specific cohorts
const campaign = {
  name: 'Tech Product Launch',
  budget: 10000,  // USDC
  targeting: {
    cohorts: [
      'tech-early-adopters',
      'software-developers',
      'startup-founders'
    ],
    // Optional: combine with other signals
    geoTargeting: ['US', 'CA', 'UK'],
    deviceTypes: ['desktop', 'tablet']
  },
  creatives: [...]
};
```

### 2. Cohort Discovery

```javascript
// Use AHEE Dashboard API to discover cohorts
const client = new AHEEClient({ apiKey: 'your-api-key' });

// Search for relevant cohorts
const cohorts = await client.searchCohorts({
  categories: ['IAB19'],  // Technology & Computing
  minSize: 1000,          // Minimum cohort size
  maxSize: 100000         // Maximum cohort size
});

console.log('Available cohorts:', cohorts);
// [
//   { id: 'tech-professionals', size: 45000, affinity: 0.92 },
//   { id: 'crypto-traders', size: 12000, affinity: 0.88 },
//   { id: 'saas-buyers', size: 8000, affinity: 0.85 }
// ]
```

### 3. Real-Time Bidding

```javascript
// Implement cohort-based RTB
class CohortBidder {
  constructor(campaignConfig) {
    this.config = campaignConfig;
    this.bloomFilter = new BloomFilter(campaignConfig.cohortFilter);
  }
  
  async evaluateBidRequest(request) {
    // Check if user's cohort matches campaign
    const cohortId = request.user.cohortId;
    
    if (!this.bloomFilter.contains(cohortId)) {
      return null; // No bid
    }
    
    // Calculate bid based on cohort value
    const cohortValue = this.getCohortValue(cohortId);
    const bidAmount = this.calculateBid(cohortValue, request);
    
    return {
      bidAmount,
      creative: this.selectCreative(cohortId),
      cohortMatch: true
    };
  }
}
```

## Privacy Implementation

### 1. K-Anonymity Enforcement

```javascript
// Ensure cohort meets k-anonymity threshold
class CohortValidator {
  static MIN_COHORT_SIZE = 100;
  
  static async validateCohort(cohortId) {
    const size = await getCohortSize(cohortId);
    
    if (size < this.MIN_COHORT_SIZE) {
      // Merge with similar cohort or assign to general cohort
      return this.findAlternativeCohort(cohortId);
    }
    
    return cohortId;
  }
}
```

### 2. Differential Privacy

```javascript
// Add noise to cohort statistics
class PrivacyPreserver {
  static addNoise(value, epsilon = 1.0) {
    // Laplace mechanism
    const sensitivity = 1.0;
    const scale = sensitivity / epsilon;
    const noise = this.laplaceSample(scale);
    
    return Math.max(0, value + noise);
  }
  
  static laplaceSample(scale) {
    const u = Math.random() - 0.5;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }
}

// Apply to cohort metrics
const reportedSize = PrivacyPreserver.addNoise(actualSize);
const reportedCTR = PrivacyPreserver.addNoise(actualCTR);
```

### 3. Cohort Rotation

```javascript
// Daily cohort rotation for privacy
class CohortRotation {
  static async rotateCohorts() {
    const today = new Date().toISOString().split('T')[0];
    const salt = await this.getDailySalt(today);
    
    // Recompute all cohort assignments
    for (const user of users) {
      const interests = await getUserInterests(user);
      const newCohort = await computeCohort(interests, salt);
      
      // Ensure k-anonymity
      const validatedCohort = await CohortValidator.validateCohort(newCohort);
      await assignUserCohort(user, validatedCohort);
    }
  }
}
```

## Advanced Features

### 1. Multi-Level Cohorts

```javascript
// Hierarchical cohort structure
const cohortHierarchy = {
  'tech-users': {
    children: [
      'software-developers',
      'data-scientists',
      'devops-engineers'
    ],
    targeting: {
      broad: 'tech-users',        // 500K users
      focused: 'data-scientists',  // 50K users
      narrow: 'ml-engineers'       // 5K users
    }
  }
};

// Target at appropriate level
function selectCohortLevel(campaign) {
  if (campaign.budget > 100000) {
    return 'broad';   // Large budget, broad reach
  } else if (campaign.budget > 10000) {
    return 'focused'; // Medium budget, targeted
  } else {
    return 'narrow';  // Small budget, highly targeted
  }
}
```

### 2. Cohort Insights API

```javascript
// Get aggregated insights for cohorts
const insights = await client.getCohortInsights({
  cohortIds: ['tech-professionals', 'startup-founders'],
  metrics: ['size', 'engagement', 'conversion_rate'],
  timeRange: 'last_30_days'
});

// Response
{
  'tech-professionals': {
    size: 45000,
    avgEngagement: 0.15,      // 15% CTR
    conversionRate: 0.023,    // 2.3% conversion
    topCategories: ['IAB19', 'IAB3'],
    peakHours: [9, 12, 17]    // 9am, 12pm, 5pm
  }
}
```

### 3. Lookalike Cohorts

```javascript
// Find similar cohorts to expand reach
const lookalikeConfig = {
  seedCohort: 'premium-subscribers',
  similarity: 0.8,    // 80% similarity threshold
  minSize: 5000,
  maxSize: 50000
};

const lookalikes = await client.findLookalikeCohorts(lookalikeConfig);
// Returns cohorts with similar browsing patterns
```

## Testing Cohorts

### 1. Test Environment

```javascript
// Use test cohorts in development
window.AHEE.init({
  environment: 'testnet',
  testCohorts: [
    'test-tech-users',
    'test-sports-fans',
    'test-general-audience'
  ]
});

// Force specific cohort for testing
window.AHEE.setTestCohort('test-tech-users');
```

### 2. A/B Testing

```javascript
// Test different strategies per cohort
class CohortABTest {
  constructor(testConfig) {
    this.variants = testConfig.variants;
    this.cohortAssignments = new Map();
  }
  
  getVariant(cohortId) {
    if (!this.cohortAssignments.has(cohortId)) {
      // Deterministic assignment based on cohort ID
      const hash = this.hashCohort(cohortId);
      const variant = this.variants[hash % this.variants.length];
      this.cohortAssignments.set(cohortId, variant);
    }
    
    return this.cohortAssignments.get(cohortId);
  }
}
```

### 3. Performance Testing

```javascript
// Benchmark cohort operations
async function benchmarkCohortSystem() {
  const iterations = 10000;
  
  // Test classification speed
  console.time('classification');
  for (let i = 0; i < iterations; i++) {
    await classifyPage(testPages[i % testPages.length]);
  }
  console.timeEnd('classification');
  
  // Test bloom filter performance
  console.time('bloom-filter');
  for (let i = 0; i < iterations; i++) {
    bloomFilter.contains(`cohort-${i}`);
  }
  console.timeEnd('bloom-filter');
}
```

## Monitoring & Analytics

### 1. Cohort Metrics

```javascript
// Track cohort performance
const metrics = {
  cohortSize: async (cohortId) => {
    return await redis.get(`cohort:${cohortId}:size`);
  },
  
  cohortEngagement: async (cohortId) => {
    const clicks = await redis.get(`cohort:${cohortId}:clicks`);
    const impressions = await redis.get(`cohort:${cohortId}:impressions`);
    return clicks / impressions;
  },
  
  cohortRevenue: async (cohortId) => {
    return await redis.get(`cohort:${cohortId}:revenue:daily`);
  }
};
```

### 2. Privacy Compliance Dashboard

```javascript
// Monitor privacy metrics
const privacyDashboard = {
  kAnonymity: async () => {
    const cohorts = await getAllCohorts();
    const violations = cohorts.filter(c => c.size < 100);
    return {
      compliant: violations.length === 0,
      violations: violations
    };
  },
  
  differentialPrivacy: async () => {
    const epsilon = await getPrivacyBudget();
    return {
      currentEpsilon: epsilon,
      recommended: 1.0,
      compliant: epsilon <= 1.0
    };
  }
};
```

## Best Practices

### 1. Category Selection
- Use specific IAB categories for better targeting
- Combine multiple categories for nuanced cohorts
- Update categories as content evolves

### 2. Privacy First
- Never try to reverse-engineer individual users
- Respect cohort size minimums
- Implement proper differential privacy

### 3. Performance Optimization
- Cache cohort assignments locally
- Use bloom filters for large cohort sets
- Batch cohort operations

## Troubleshooting

### Common Issues

1. **Low Cohort Match Rates**
   - Broaden targeting criteria
   - Include parent categories
   - Check cohort size thresholds

2. **Cohort Instability**
   - Implement cohort smoothing
   - Use longer observation windows
   - Apply hysteresis to assignments

3. **Privacy Violations**
   - Increase k-anonymity threshold
   - Add more noise to statistics
   - Merge small cohorts

## API Reference

### Cohort Methods

```javascript
// Get current cohort
AHEE.getCohort(): Promise<Cohort>

// Set page categories
AHEE.setPageCategories(categories: string[]): void

// Listen for cohort changes
AHEE.on('cohortChange', handler: (cohort: Cohort) => void): void

// Get cohort insights
AHEE.getCohortInsights(cohortId: string): Promise<Insights>
```

### Cohort Object

```typescript
interface Cohort {
  id: string;              // Unique cohort identifier
  categories: string[];    // Interest categories
  size: number;           // Approximate size (with noise)
  confidence: number;     // Assignment confidence (0-1)
  expiresAt: number;      // Unix timestamp
}
```

## Resources

- Cohort Explorer: https://cohorts.ahee.io
- Privacy Whitepaper: https://ahee.io/privacy
- IAB Category Reference: https://iabtechlab.com/standards/content-taxonomy/
- Support: cohorts@ahee.io 