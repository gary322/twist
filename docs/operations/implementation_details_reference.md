# TWIST Implementation Details - Complete Reference

> Consolidated reference of all specific implementation details from Q&A sessions

## 1. Hardware Attestation Implementation

### Root Certificate Management
```javascript
// All attestation validation in Edge-Worker KV table
const ALLOWED_ROOTS = {
  // Hot-swappable - no on-chain changes needed
  "yubikey": "308204...",
  "solokey": "308203...", 
  "apple": "308204...",    // Apple WebAuthn Root CA G2
  "microsoft": "308203...", // Microsoft Root CA 2019
  
  // If Apple/MS swap root CAs, we hot-swap PEMs here
};

// Feature detection for format changes
if (attestation.fmt === 'apple-packed-v2') {
  // New format? Fall back to soft-cap (κ/5)
  return { trustLevel: 'untrusted', cap: kappa / 5 };
}
```

### Monitoring & Alerts
```javascript
// Prometheus metric for unknown formats
vau_attestation_unknown_total.inc({
  format: attestation.fmt,
  timestamp: Date.now()
});

// P0 Alert when non-zero
if (vau_attestation_unknown_total > 0) {
  alerting.fireP0("Unknown attestation format detected");
}
```

### Failure Handling (5-10% real-world failures)
```javascript
// Automatic retry with graceful degradation
try {
  const attestation = await getHardwareAttestation();
  return { trustLevel: 'trusted', multiplier: 1.0 };
} catch (e) {
  // Retry with attestation:'none'
  const fallback = await getBasicCredential();
  return { 
    trustLevel: 'untrusted', 
    multiplier: 0.2,  // 20% earning cap
    error: null       // Zero user-visible error
  };
}
```

## 2. Token Decay Implementation

### Core Messaging
```
"TWIST is an attention hour, not a stablecoin. 
30 day half-life prevents hoarding and keeps floor price rising."
```

### UX Implementation
```javascript
// Wallet display shows both balances
const walletDisplay = {
  nominal: "1,000 TWIST",
  tomorrow: "995 TWIST",  // After 0.5% decay
  dailyDecay: "5 TWIST",
  message: "Use it or stake it!"
};

// Extension badge animation
function animateDecay() {
  const current = balance;
  const decayPerSecond = balance * 0.005 / 86400;
  
  setInterval(() => {
    balance -= decayPerSecond;
    badge.updateDisplay(balance.toFixed(2));
  }, 1000);
}

// All yields quoted AFTER decay
const stakingAPY = {
  gross: 45,
  decay: 182.5,  // 0.5% × 365
  net: -137.5,   // Shown to users
  message: "Beat decay with staking!"
};
```

## 3. Cold Site Economics

### Explorer Pot Formula
```javascript
// Daily Explorer budget calculation
const explorerBudget = σ * δ * S * P;
// Where:
// σ = 0.30 (30% of decay)
// δ = 0.005 (daily decay rate)
// S = current supply
// P = current price

// Sites do NOT pre-buy TWIST
// Paid from global Explorer pot while cold
```

### Budget Management
```javascript
// Per-slice budget control
const sliceBudget = dailyExplorerBudget / 288; // 5-min slices

// Slice-level forecast
if (coldSecondDemand > sliceBudget) {
  // Throttle rewards
  rewardRate = sliceBudget / totalColdSeconds;
}

// When pot empty
if (currentSliceBudget === 0) {
  showBadge("Explorer budget exhausted");
  // No on-chain reverts - just no rewards until UTC reset
}

// Cold site budget cap
const coldSiteBudget = explorerPot / 288 / κ_site_avg;
if (sliceForecast > budget) {
  sdk.showMessage("Cold pot empty - bond to resume earning");
  // Back-pressure motivates bonding
}
```

## 4. Campaign Attribution Rules

### Collision Resolution
```javascript
// Last-click within window
const ATTRIBUTION_WINDOW = 30 * 60; // 30 min default

// Multiple clicks in ≤5 sec
if (clickTimeDiff <= 5) {
  // Highest tier wins
  winner = clicks.sort((a,b) => b.tier - a.tier)[0];
  // Tiers: purchase(3) > signup(2) > visit(1)
}

// PDA prevents double-credit
const attributionPDA = deriveAddress([
  "attribution",
  campaignId,
  userId,
  actionType
]);

// Cross-campaign independence
// User can be "owned" by Nike AND Adidas simultaneously
campaigns.forEach(campaign => {
  campaign.attributionPDA = independent;
});

// Multi-click fair share option
if (campaign.multiClickFairShare) {
  payout = totalPayout / influencers.length;
}
```

### Flexible Windows
```javascript
// B2B can set up to 90 days
campaign.attribution_ttl_seconds = 90 * 24 * 60 * 60;

// Check: clock.ts - attribution.first_vau_time < ttl
const isValid = (now - firstTouch) < campaign.attribution_ttl_seconds;
```

## 5. USDC Campaign Mechanics

### Denomination & Swaps
```javascript
// Campaigns lock USDC, not TWIST
async function fundCampaign(amount_usdc) {
  await transferUSDC(advertiser, campaign_pot_pda, amount_usdc);
}

// Swap at payout time via Orca Whirlpool CPI
async function processPayout(recipient, usdc_amount) {
  // Single swap per batch
  const twist = await orcaPool.swap({
    from: USDC,
    to: TWIST,
    amount: usdc_amount,
    slippage: 0  // Use oracle price
  });
  
  await transfer(twist, recipient);
}
```

### Batch Processing Optimization
```javascript
// Batch specifications
const BATCH_CONFIG = {
  vausPerBatch: 700,        // Aggregate per Solana block
  blockTime: 400,           // ms
  throughput: 14,           // tx/sec at 10k payouts/s
  gasCost: 90_000,          // CU per batch
  blockLimit: 1_400_000,    // CU max
  maxBatchesPerBlock: 15,   // Headroom
  dailyFeeCost: "<1 SOL"    // Paid by campaign pot
};
```

### Price Spike Protection
```javascript
// Dashboard shows remaining budget
const campaignStatus = {
  budgetUSDC: 10_000,
  spentUSDC: 3_500,
  remainingUSDC: 6_500,
  twistAtCurrentPrice: 6_500 / currentPrice,
  warning: currentPrice > startPrice * 2 ? 
    "TWIST price doubled - same USDC buys fewer tokens" : null
};

// No insolvency - campaign ends when USDC depleted
if (pot.usdcBalance === 0) {
  campaign.status = 'budget_exhausted';
}
```

## 6. Anti-Bot Defense Layers

### Economic Caps
```javascript
// κ(t) calculation
const kappa = 3 * hardwareCost / twistPrice;

// 50-phone farm analysis
const farmDailyMax = 50 * kappa;         // Still ROI ≤ 0
const farmExplorerShare = 50 * 8640 * rate; // <0.5% of pot
```

### Device Rate Limiting
```javascript
// Cloudflare KV pattern
const rateLimitKey = `rl:${deviceId}:${YYYY-MM-DD}`;

// Global replication with atomic ops
await env.KV.put(rateLimitKey, count + 1, {
  metadata: { etag: previousEtag }
});

// Limits
const VAU_PER_DAY = 8640;  // One per 10s
const RPS_PER_KEY = 1000;  // CF quota - no bottleneck
```

### Behavioral ML
```javascript
// Pattern detection
if (isBurstyPattern(siteHashes) || 
    isIdenticalTiming(vauTimestamps)) {
  trustLevel = kappa / 20;  // Severe downgrade
}

// Random challenges
const challenges = [
  { type: 'scroll', target: 0.7 },
  { type: 'click', element: '.btn-primary' },
  { type: 'hover', duration: 2000 }
];
```

## 7. Privacy Implementation

### Bloom Filter Specifications
```javascript
const BLOOM_FILTER_CONFIG = {
  size: 256,              // bytes
  bits: 2048,             // 256 * 8
  hashFunctions: 3,       // k = 3
  falsePositive: 0.01,    // 1%
  maxCohorts: 95,         // IDs
  
  // Example: "tech-pros + early-adopters + gamers"
};

// Weekly rotation
const salt = `${weekIndex}_${randomSeed}`;
bloomFilter.setSalt(salt);

// High-prevalence only (k-anonymity ≥ 1000)
const minPrevalence = 0.002; // 0.2% of users
```

### Cohort Verification
```javascript
// Edge verifies without learning interests
function verifyCohort(userCohortHash, campaignFilter) {
  // User can't invent arbitrary cohort
  return bloomFilter.test(userCohortHash);
}

// Advertiser sees only aggregates
const stats = {
  reach: "42% tech-enthusiasts",
  impressions: 125_000,
  // No individual data
};
```

## 8. Regulatory Compliance

### Legal Framework
```javascript
const compliance = {
  tokenType: "Utility token",
  supplyMechanic: "Hard contraction",
  profitPromise: false,
  legalOpinion: "DLx Law on file",
  
  kyc: "At custodial off-ramps only",
  aml: "Small-value on-chain rewards",
  
  gdpr: {
    personalData: "None stored",
    credentialIds: "Random",
    ipLogs: "Hashed after 24h for DDoS only",
    deviceFingerprint: "Not used - WebAuthn replaces"
  },
  
  geoFilter: "Campaign router supports geo_targets"
};
```

## 9. Infrastructure Scaling

### Load Calculations
```javascript
// 50M DAU scenario
const scaling = {
  vauPerSecond: 10_000,              // Average
  signatureVerifyTime: 0.18,         // ms on V8
  workerCapacity: 5_000,             // sigs/sec
  podsNeeded: 3,                     // per region
  
  computeCost: {
    cpuSeconds: 2,                   // per second
    monthlyBill: 2_000,              // USD on CF Workers
    comparison: "Peanuts vs buybacks"
  },
  
  chainData: {
    daily: "17 MB",
    withinLimits: "Solana ✓"
  }
};
```

## 10. Economic Death Spiral Prevention

### Multi-Layer Defense
```javascript
// Layer 1: Monotonic treasury
const pcftGrowth = dailyDecay * 0.9; // Always positive

// Layer 2: Buy-back bot
if (price <= floor * 0.97) {
  const budget = yesterdayDecay * 0.2;
  await buyAndBurn(budget);
}

// Layer 3: PID controller
if (Math.abs(imbalance) > threshold) {
  G = Math.max(G - adjustment, -G_MAX);
}

// Layer 4: Continuous burns
const dailyBurn = harbergerBurn + stakingLocks;

// Layer 5: Circuit breaker
if (emergency) {
  G = 0;
  buyBackBudget = dailyDecay * 1.0; // 100%
  duration = 24 * 60 * 60; // 24h hard peg
}

// Monte Carlo validation
const simResults = {
  paths: 10_000,
  floorBreach: 0,
  maxDrawdown: "floor × 0.965",
  pcftDirection: "Always up"
};
```

### Circuit Breaker Messaging
```javascript
// User-facing message (non-alarming)
const message = "Stability guard active – extra buy-backs running for the next 24h. Your earnings are unaffected.";

// Visual indicators
badge.color = "green"; // Stay green
tooltip.text = "Stability guard ON (price support)";

// Dashboard banner
showBanner("Floor-support mechanism active, no action required");

// Full transparency on status page only
statusPage.showEventLog(circuitBreakerDetails);
```

---

*This document consolidates ALL specific implementation details from Q&A sessions. For code implementations, see the individual integration guides.*