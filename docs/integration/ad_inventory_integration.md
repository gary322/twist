# Ad Inventory Integration Guide

## Overview

AHEE's ad inventory integration allows Supply-Side Platforms (SSPs), Demand-Side Platforms (DSPs), and publishers to leverage fraud-proof attention verification while maintaining compatibility with existing programmatic infrastructure.

## Integration Approaches

### 1. Wrapper Creative (Recommended)
- Minimal changes to existing setup
- Works with any ad server
- Instant fraud protection
- ~28% cost savings

### 2. Direct API Integration
- Full control over ad delivery
- Real-time VAU verification
- Custom targeting options
- Maximum efficiency

### 3. Prebid Adapter
- OpenRTB 2.5 compatible
- Works with header bidding
- Automatic VAU enrichment
- Standard reporting

## Wrapper Creative Integration

### 1. Basic Setup

```html
<!-- Wrap existing ad tags with AHEE verification -->
<div class="ahee-ad-wrapper" 
     data-ahee-zone="top-banner"
     data-ahee-min-vaus="3"
     data-ahee-verify="true">
  
  <!-- Your existing ad tag (Google DFP example) -->
  <div id="div-gpt-ad-123456">
    <script>
      googletag.cmd.push(function() {
        googletag.display('div-gpt-ad-123456');
      });
    </script>
  </div>
</div>
```

### 2. JavaScript Configuration

```javascript
// Initialize AHEE ad wrapper
window.AHEE.ads.init({
  // Verification settings
  requireVAU: true,           // Only show ads to verified users
  minVAUs: 3,                 // Minimum VAUs before ad display
  fraudThreshold: 0.95,       // Confidence threshold
  
  // Revenue settings
  revenueShare: {
    publisher: 0.7,           // 70% to publisher
    ahee: 0.3                // 30% AHEE fee (includes fraud insurance)
  },
  
  // Callbacks
  onAdRequest: (zone) => {
    console.log('Ad requested for zone:', zone);
  },
  onAdVerified: (zone, vaus) => {
    console.log('Ad verified with VAUs:', vaus);
  },
  onFraudDetected: (zone, reason) => {
    console.warn('Fraud detected:', reason);
  }
});
```

### 3. Advanced Wrapper Features

```javascript
// Custom verification rules
window.AHEE.ads.addZone({
  zoneId: 'premium-video',
  element: document.getElementById('video-ad'),
  
  // Verification requirements
  requirements: {
    minVAUs: 10,              // Higher threshold for video
    recentVAUs: 5,            // VAUs in last 5 minutes
    interactionScore: 0.8,    // High engagement required
    hardwareOnly: true        // Require hardware attestation
  },
  
  // Custom targeting
  targeting: {
    cohorts: ['premium-users', 'video-watchers'],
    geoTargets: ['US', 'CA'],
    dayparting: {
      hours: [18, 19, 20, 21], // 6-10 PM
      days: ['mon', 'tue', 'wed', 'thu', 'fri']
    }
  },
  
  // Floor price based on VAU quality
  floorPrice: (vauScore) => {
    if (vauScore > 0.9) return 5.00;  // $5 CPM for high quality
    if (vauScore > 0.7) return 3.00;  // $3 CPM for medium
    return 1.00;                       // $1 CPM minimum
  }
});
```

## Direct API Integration

### 1. VAU Verification API

```javascript
// Verify user attention before ad request
const verifyUser = async (userId) => {
  const response = await fetch('https://api.ahee.io/v1/verify', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId,
      siteId: SITE_ID,
      timestamp: Date.now()
    })
  });
  
  const result = await response.json();
  return {
    verified: result.verified,
    vauCount: result.vauCount,
    qualityScore: result.qualityScore,
    cohortId: result.cohortId,
    fraudRisk: result.fraudRisk
  };
};
```

### 2. Real-Time Bidding Enhancement

```javascript
// Enhance bid requests with VAU data
class AHEEBidEnhancer {
  constructor(apiKey) {
    this.client = new AHEEClient(apiKey);
  }
  
  async enhanceBidRequest(bidRequest) {
    // Get VAU data for user
    const vauData = await this.client.getUserVAUs(bidRequest.user.id);
    
    // Enhance bid request
    bidRequest.ext = bidRequest.ext || {};
    bidRequest.ext.ahee = {
      vaus: vauData.count,
      quality: vauData.qualityScore,
      verified: vauData.hardwareVerified,
      cohort: vauData.cohortId,
      recentActivity: vauData.last5Minutes
    };
    
    // Add fraud protection
    if (vauData.fraudRisk > 0.1) {
      bidRequest.ext.ahee.fraudWarning = true;
      bidRequest.ext.ahee.fraudRisk = vauData.fraudRisk;
    }
    
    return bidRequest;
  }
}
```

### 3. Settlement API

```javascript
// Instant settlement for verified impressions
class AHEESettlement {
  async settleImpression(impression) {
    const response = await fetch('https://api.ahee.io/v1/settle', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        impressionId: impression.id,
        publisherId: impression.publisher,
        advertiserId: impression.advertiser,
        amount: impression.price,
        vauProof: impression.vauProof,
        timestamp: impression.timestamp
      })
    });
    
    const result = await response.json();
    return {
      settled: result.success,
      transactionId: result.txId,
      publisherPayout: result.publisherAmount,
      settledAt: result.timestamp
    };
  }
}
```

## Prebid Adapter

### 1. Installation

```bash
npm install @ahee/prebid-adapter
```

### 2. Configuration

```javascript
// Add AHEE as a bidder in Prebid.js
pbjs.que.push(function() {
  pbjs.addAdUnits({
    code: 'banner-div',
    mediaTypes: {
      banner: {
        sizes: [[728, 90], [300, 250]]
      }
    },
    bids: [{
      bidder: 'ahee',
      params: {
        siteId: 'your-site-id',
        zoneId: 'top-banner',
        minVAUs: 3,
        floorPrice: 1.00,
        cohortTargeting: ['tech-users', 'premium-audience']
      }
    }]
  });
});
```

### 3. Custom Prebid Analytics

```javascript
// Track VAU-enhanced metrics
window.aheeAnalytics = pbjs.registerAnalyticsAdapter({
  code: 'ahee',
  adapter: {
    enableAnalytics: (config) => {
      // Track bid enrichment
      pbjs.onEvent('bidRequested', (bid) => {
        if (bid.ext && bid.ext.ahee) {
          trackVAUBid(bid);
        }
      });
      
      // Track verified wins
      pbjs.onEvent('bidWon', (bid) => {
        if (bid.ext && bid.ext.ahee && bid.ext.ahee.verified) {
          trackVerifiedWin(bid);
        }
      });
    }
  }
});

// Enable AHEE analytics
pbjs.enableAnalytics({
  provider: 'ahee',
  options: {
    publisherId: 'your-publisher-id',
    trackVAUs: true,
    trackFraud: true
  }
});
```

## SSP Integration

### 1. OpenRTB Extensions

```json
{
  "id": "bid-request-123",
  "imp": [{
    "id": "imp-1",
    "banner": {
      "w": 728,
      "h": 90
    },
    "ext": {
      "ahee": {
        "vauCount": 42,
        "vauQuality": 0.95,
        "hardwareVerified": true,
        "cohortId": "tech-professionals",
        "recentVAUs": 8,
        "fraudRisk": 0.02
      }
    }
  }],
  "user": {
    "ext": {
      "ahee": {
        "totalVAUs": 1250,
        "avgQuality": 0.92,
        "cohorts": ["tech-professionals", "early-adopters"],
        "verified": true
      }
    }
  }
}
```

### 2. Yield Optimization

```javascript
// Optimize yield based on VAU quality
class VAUYieldOptimizer {
  calculateFloorPrice(impression) {
    const vauData = impression.ext.ahee;
    
    // Base floor price
    let floor = this.baseFloor;
    
    // Adjust for VAU quality
    if (vauData.vauQuality > 0.9) {
      floor *= 1.5;  // 50% premium for high quality
    } else if (vauData.vauQuality > 0.7) {
      floor *= 1.2;  // 20% premium for good quality
    }
    
    // Adjust for hardware verification
    if (vauData.hardwareVerified) {
      floor *= 1.1;  // 10% premium for hardware
    }
    
    // Adjust for engagement
    if (vauData.recentVAUs > 10) {
      floor *= 1.3;  // 30% premium for high engagement
    }
    
    return floor;
  }
}
```

### 3. Fraud Prevention

```javascript
// Real-time fraud detection
class FraudPrevention {
  async checkImpression(impression) {
    // Check VAU authenticity
    const vauCheck = await this.verifyVAUs(impression.vauProof);
    if (!vauCheck.valid) {
      return { block: true, reason: 'Invalid VAU proof' };
    }
    
    // Check device limits
    const deviceCheck = await this.checkDeviceLimits(impression.deviceId);
    if (deviceCheck.exceeded) {
      return { block: true, reason: 'Device limit exceeded' };
    }
    
    // Check click patterns
    const clickCheck = await this.analyzeClickPattern(impression);
    if (clickCheck.suspicious) {
      return { block: true, reason: 'Suspicious click pattern' };
    }
    
    return { block: false, fraudScore: 0.02 };
  }
}
```

## DSP Integration

### 1. Campaign Setup

```javascript
// Create VAU-optimized campaigns
const campaign = await aheeClient.createCampaign({
  name: 'Premium Tech Campaign',
  budget: 50000,  // $50k USDC
  
  targeting: {
    // VAU-based targeting
    minVAUs: 20,
    vauQuality: 0.8,
    hardwareOnly: true,
    
    // Cohort targeting
    cohorts: [
      'tech-professionals',
      'software-developers',
      'startup-founders'
    ],
    
    // Traditional targeting
    geos: ['US', 'CA', 'UK'],
    devices: ['desktop', 'tablet']
  },
  
  bidding: {
    strategy: 'vau-optimized',
    baseCPM: 3.00,
    maxCPM: 10.00,
    
    // VAU multipliers
    multipliers: {
      highQualityVAU: 1.5,    // >0.9 quality
      hardwareVerified: 1.2,   // Hardware tokens
      recentEngagement: 1.3    // >10 VAUs in 5min
    }
  },
  
  creatives: [
    // ... creative assets
  ]
});
```

### 2. Bid Optimization

```javascript
// Optimize bids based on VAU signals
class VAUBidOptimizer {
  calculateBid(request, campaign) {
    let bid = campaign.baseCPM;
    const vau = request.ext.ahee;
    
    // Quality multiplier
    const qualityMultiplier = this.getQualityMultiplier(vau.vauQuality);
    bid *= qualityMultiplier;
    
    // Engagement multiplier
    if (vau.recentVAUs > 10) {
      bid *= campaign.multipliers.recentEngagement;
    }
    
    // Hardware bonus
    if (vau.hardwareVerified) {
      bid *= campaign.multipliers.hardwareVerified;
    }
    
    // Cohort match bonus
    const cohortMatch = this.checkCohortMatch(
      vau.cohortId, 
      campaign.targeting.cohorts
    );
    if (cohortMatch) {
      bid *= 1.25;  // 25% bonus for cohort match
    }
    
    // Apply caps
    return Math.min(bid, campaign.maxCPM);
  }
}
```

### 3. Performance Tracking

```javascript
// Track VAU-enhanced metrics
class CampaignAnalytics {
  async getPerformance(campaignId, dateRange) {
    const metrics = await aheeClient.getCampaignMetrics({
      campaignId,
      startDate: dateRange.start,
      endDate: dateRange.end,
      
      metrics: [
        'impressions',
        'verifiedImpressions',
        'vauCount',
        'avgVauQuality',
        'fraudBlocked',
        'spend',
        'conversions'
      ],
      
      groupBy: ['day', 'cohort', 'vauQuality']
    });
    
    // Calculate VAU-specific metrics
    return {
      ...metrics,
      costPerVAU: metrics.spend / metrics.vauCount,
      verifiedRate: metrics.verifiedImpressions / metrics.impressions,
      vauROAS: metrics.revenue / metrics.spend,
      fraudSavings: metrics.fraudBlocked * metrics.avgCPM
    };
  }
}
```

## Budget Mirror Integration

### 1. Sync with Google Ads

```javascript
// Mirror Google Ads campaigns
const googleMirror = new BudgetMirror({
  platform: 'google_ads',
  credentials: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN
  }
});

// Sync campaigns
await googleMirror.syncCampaigns({
  accountId: 'your-google-ads-account',
  campaigns: ['campaign-1', 'campaign-2'],
  
  // Mapping rules
  mapping: {
    budgetMultiplier: 0.7,    // Use 70% of Google budget
    targetingMode: 'enhanced', // Add VAU requirements
    fraudProtection: true
  }
});
```

### 2. Cross-Platform Optimization

```javascript
// Optimize across platforms
class CrossPlatformOptimizer {
  async optimizeBudgets() {
    // Get performance from all platforms
    const googlePerf = await this.getGoogleAdsPerformance();
    const metaPerf = await this.getMetaPerformance();
    const aheePerf = await this.getAHEEPerformance();
    
    // Compare efficiency
    const efficiency = {
      google: googlePerf.conversions / googlePerf.spend,
      meta: metaPerf.conversions / metaPerf.spend,
      ahee: aheePerf.conversions / aheePerf.spend
    };
    
    // Shift budget to most efficient
    if (efficiency.ahee > efficiency.google * 1.2) {
      // AHEE 20% more efficient, shift budget
      await this.shiftBudget('google', 'ahee', 0.2);
    }
  }
}
```

## Testing & Validation

### 1. Integration Testing

```javascript
// Test wrapper integration
describe('AHEE Ad Wrapper', () => {
  test('blocks ads without VAUs', async () => {
    const wrapper = createWrapper({ minVAUs: 3 });
    const user = createUser({ vaus: 0 });
    
    const result = await wrapper.shouldShowAd(user);
    expect(result).toBe(false);
  });
  
  test('shows ads with sufficient VAUs', async () => {
    const wrapper = createWrapper({ minVAUs: 3 });
    const user = createUser({ vaus: 5, verified: true });
    
    const result = await wrapper.shouldShowAd(user);
    expect(result).toBe(true);
  });
});
```

### 2. Load Testing

```javascript
// Test high-volume scenarios
async function loadTest() {
  const requests = [];
  
  // Generate 10k concurrent requests
  for (let i = 0; i < 10000; i++) {
    requests.push(
      aheeClient.verifyImpression({
        impressionId: `test-${i}`,
        vauProof: generateTestProof(),
        timestamp: Date.now()
      })
    );
  }
  
  console.time('10k verifications');
  const results = await Promise.all(requests);
  console.timeEnd('10k verifications');
  
  const successRate = results.filter(r => r.success).length / results.length;
  console.log('Success rate:', successRate);
}
```

## Best Practices

### 1. Gradual Migration
- Start with wrapper on subset of inventory
- Compare performance vs traditional
- Gradually increase AHEE inventory
- Maintain parallel tracking

### 2. Fraud Monitoring
- Set up real-time alerts
- Track fraud prevention savings
- Monitor false positive rates
- Adjust thresholds based on data

### 3. Yield Management
- A/B test VAU requirements
- Optimize floor prices by quality
- Track incremental revenue
- Monitor fill rates

## Support Resources

- Technical Documentation: https://docs.ahee.io/integration
- Integration Support: integration@ahee.io
- Developer Discord: https://discord.gg/ahee-dev
- Status Page: https://status.ahee.io 