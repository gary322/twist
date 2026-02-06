# TWIST Platform - Comprehensive FAQ & Implementation Details

> This document consolidates all critical questions and implementation details for the TWIST platform, addressing technical, economic, and operational concerns.

## Table of Contents

1. [Hardware Attestation & Technical Implementation](#hardware-attestation--technical-implementation)
2. [Economic Model & Token Mechanics](#economic-model--token-mechanics)
3. [Campaign & Attribution System](#campaign--attribution-system)
4. [Privacy & Security](#privacy--security)
5. [Scalability & Infrastructure](#scalability--infrastructure)
6. [Regulatory & Compliance](#regulatory--compliance)
7. [User Experience & Adoption](#user-experience--adoption)
8. [Strategic & Competitive Concerns](#strategic--competitive-concerns)
9. [Universal SDK & Product Integration](#universal-sdk--product-integration)
10. [Influencer Economy](#influencer-economy)

---

## Hardware Attestation & Technical Implementation

### Q: What happens when Apple/Microsoft update their attestation formats?

**Solution Architecture:**
- All attestation validation lives in an Edge-Worker KV table (`ALLOWED_ROOTS`)
- Root CA certificates can be hot-swapped without on-chain changes
- Format changes are handled via feature detection of `attestation.fmt`
- Unknown formats fall back to soft-cap path (κ/5 earning rate)

**Monitoring:**
- Edge-Worker exports Prometheus metric `vau_attestation_unknown_total`
- Non-zero values trigger P0 alerts for immediate root addition

### Q: How do you handle the 5-10% attestation failure rate in the real world?

**Graceful Degradation:**
- Extension automatically retries with `attestation:'none'`
- Failed attestations are accepted but flagged as *untrusted*
- Untrusted devices receive 20% earning cap
- Zero user-visible errors - seamless experience
- If attestation later succeeds, trust level automatically upgrades

### Q: How is device rate limiting enforced across distributed Edge Workers?

**Global Coordination:**
- Edge Workers use Cloudflare KV with key pattern: `rl:<device>:<YYYY-MM-DD>`
- KV is globally replicated with ≤50ms latency
- Atomic operations: `kv.put(key, newCount, { ifMatch: etag })`
- 8,640 VAU/day limit (one per 10s) per device
- Well below CF's 1k RPS per-key quota - no bottleneck

---

## Economic Model & Token Mechanics

### Q: How do you handle the UX challenge of 0.5% daily token decay?

**Messaging Strategy:**
- Position as "attention hours" not stablecoin
- "30 day half-life prevents hoarding and keeps floor price rising"

**UX Implementation:**
- Wallet shows both nominal and decay-adjusted balances
- Example: "1,000 TWIST → 985 TWIST tomorrow"
- Extension badge animates decay in real-time
- All yields quoted AFTER decay (net APY)
- Staking/Harberger marketed as "ways to beat decay"

**Precedent:** STEPN and OHM forks proved mild decay acceptable with utility

### Q: How does the cold site chicken-egg problem get solved?

**Bootstrap Mechanism:**
- Explorer pot funded by σ=30% of daily token decay
- Cold sites DON'T need to pre-buy TWIST
- Users paid from global Explorer pot while site is cold
- Once site has traffic, owners are incentivized to bond

**Budget Management:**
- If pot empties mid-day: slice budget → zero
- Users see "explorer budget exhausted"
- No on-chain reverts, resets at UTC midnight

### Q: What prevents economic death spirals?

**Multi-Layer Defense System:**

1. **Floor Treasury (PCFT)**
   - Monotonically increasing (receives 90% of daily decay)
   - Spot price cannot fall below floor × 97%

2. **Buy-Back Bot**
   - Triggers at price ≤ floor × 0.97
   - Budget: 20% of yesterday's decay
   - Requires minimum liquidity depth (Λ = 50k TWIST)

3. **PID Controller**
   - Reduces mint rate when supply/demand imbalanced
   - G → 0 during volatility events

4. **Continuous Burns**
   - Harberger & PSAB burns continue regardless of price
   - Mechanically reduces supply

5. **Circuit Breaker**
   - Multisig can trigger emergency mode
   - G = 0, buy-back budget = 100% of decay for 24h
   - Effectively hard-pegs to floor

**Monte Carlo Results:** 10k paths with fat-tailed shocks never breached floor × 0.965

---

## Campaign & Attribution System

### Q: How are campaigns denominated and what about TWIST price volatility?

**USDC Denomination System:**
- Advertisers fund campaigns with USDC (not TWIST)
- Rewards specified as "X USDC worth of TWIST"
- Swaps happen at payout time via Orca Whirlpool CPI
- If TWIST price 10×, same USDC buys 10× less tokens
- Influencers still receive negotiated fiat value

**Batch Processing:**
- Payouts aggregated per Solana block (~400ms)
- One swap per batch, not per user
- Gas: ~90k CU per batch, well within limits

### Q: How do you handle attribution conflicts?

**Attribution Rules:**
1. Last-click within window wins (default 30 min)
2. Multiple clicks in ≤5 sec: highest tier wins (purchase > signup > visit)
3. `attribution.unique()` PDA prevents double-credit
4. Advertiser can enable `multi_click_fair_share=true` for 50/50 splits

**Flexible Windows:**
- `attribution_ttl_seconds` configurable per campaign
- Can be set up to 90 days for B2B/SaaS
- VAU router checks: `clock.ts - attribution.first_vau_time < ttl`

**Cross-Campaign:**
- Each campaign has independent attribution PDA
- User can be "owned" by multiple campaigns simultaneously
- No conflicts between Nike and Adidas campaigns

### Q: What about campaigns that run out of budget due to price spikes?

**Budget Management:**
- When USDC depleted: campaign status → `budget_exhausted`
- Campaign ends early but no insolvency
- Dashboard shows "tokens remaining at current price"
- Advertisers can top-up anytime to continue
- Price risk entirely on advertiser by design

---

## Privacy & Security

### Q: How do cohort Bloom filters preserve privacy?

**Technical Implementation:**
- Size: 256 bytes (2,048 bits, k=3 hashes)
- 1% false-positive rate for ≤95 cohort IDs
- Contains only high-prevalence combos (>0.2% population)

**Privacy Protections:**
1. Weekly salt rotation: `day_index | random_seed`
2. Adversary can probe membership but not semantics
3. Each ID maps to thousands of users (k-anonymity ≥1,000)
4. Edge verifies locally - no raw data sent to servers

**A/B Testing:**
- Multiple filters (v1, v2) tagged to creatives
- Compare Bloom filter ID vs outcomes
- No category lists revealed

### Q: How do you prevent human-assisted click farms?

**Layered Defense System:**

1. **Economic Cap (κ)**
   - Max earnings: 50 phones × κ per day
   - κ tracks hardware cost, ensuring ROI ≤ 0

2. **Device Rate Limits**
   - 8,640 VAU/day hard limit
   - 50-phone farm < 0.5% of Explorer pot

3. **Behavioral ML**
   - Bursty identical patterns flagged
   - Trust level downgraded to κ/20

4. **Challenge VAUs**
   - Random UX requirements (scroll, click)
   - Farms can't scale interaction diversity

---

## Scalability & Infrastructure

### Q: What are the infrastructure requirements at 50M DAU?

**Load Calculations:**
- 50M users × 1 VAU/5s = 10,000 VAU/s average
- ECDSA verification: 0.18ms on V8 isolate
- Single CF Worker handles ~5,000 sig/s

**Infrastructure Needs:**
- ~3 Worker pods per region globally
- Compute: 2 CPU-seconds/s = ~$2k/mo on Workers Unbound
- Chain data: 17 MB/day (well within Solana limits)
- Compare to: Token buy-back costs (orders of magnitude higher)

---

## Regulatory & Compliance

### Q: How does TWIST handle regulatory requirements?

**Token Classification:**
- Utility token with hard supply contraction
- No profit promise or investment contract
- Opinion letter from DLx Law on file

**Compliance Measures:**
- KYC/AML: At custodial off-ramps (USDC conversion)
- GDPR: No personal data stored, IPs hashed after 24h
- No device fingerprinting (WebAuthn replaces it)
- Country filters via `geo_targets` in campaigns

---

## User Experience & Adoption

### Q: How do you message the circuit breaker without causing panic?

**Messaging Strategy:**
- Extension: "Stability guard active – extra buy-backs running for 24h"
- Badge stays green with tooltip: "Stability guard ON (price support)"
- Dashboard banner: "Floor-support mechanism active, no action required"
- Never use "emergency" - full transparency on status page only

### Q: What about mobile browsers that don't support extensions?

**Mobile Strategy:**
- Progressive Web App (PWA) approach under development
- WebAuthn works on mobile for attestation
- Reduced functionality but core earning preserved
- Long-term: Native companion app optional for power users

---

## Strategic & Competitive Concerns

### Q: What if Google/Meta try to block TWIST?

**Mitigation Strategies:**
1. Browser extension uses standard APIs
2. No ToS violations in implementation
3. Distributed infrastructure (not dependent on single provider)
4. Legal opinion confirms fair use
5. Contingency: Browser-agnostic PWA fallback

### Q: How do you bootstrap initial liquidity?

**Lean Launch Strategy (Updated):**
1. Only $40k initial capital needed from founders
2. 4M TWIST + $40k USDC creates initial Orca pool
3. Daily decay (0.5%) generates $5k/day at launch
4. Self-funding mechanism - no large treasury needed
5. Within 7 days, PCFT > initial seed capital

### Q: How do you handle content moderation?

**Moderation Framework:**
1. Site blocklist maintained by multisig
2. Community reporting mechanism
3. Automatic flags for certain categories
4. Publishers must accept ToS including content guidelines
5. Violation = immediate delisting + stake slash

### Q: What about mobile users without extensions?

**Mobile Implementation:**
1. SDK works directly in mobile browsers
2. Same WebAuthn API (Face ID, fingerprint)
3. In-page badge instead of extension icon
4. Progressive Web App for enhanced features
5. Push notifications for balance updates

---

## Implementation Timeline & Next Steps

### Phase 1: Core Platform (Months 1-3)
- Hardware attestation implementation
- Basic earning/spending mechanics
- Campaign system MVP

### Phase 2: Scale & Optimize (Months 4-6)  
- Mobile PWA support
- Advanced targeting features
- Performance optimizations

### Phase 3: Ecosystem Growth (Months 7-12)
- Publisher tools expansion
- Advanced analytics
- Cross-chain bridges

---

## Universal SDK & Product Integration

### Q: How can product owners integrate TWIST without blockchain knowledge?

**One-Line Integration:**
```html
<script src="https://twist.io/pixel.js" 
        data-product-id="your-product"
        data-api-key="twist_pk_xyz">
</script>
```

**How It Works:**
- SDK automatically detects user emails from auth systems
- Tracks standard actions (purchase, share, login) with zero config
- Maps emails to wallets behind the scenes
- Users earn without needing crypto wallets
- Tokens accumulate until claimed

**Platform Support:**
- **iOS/Android**: OAuth with app stores + one secret
- **Shopify**: One-click app install
- **Discord/Telegram**: Add bot to server
- **Unity/Games**: Import package
- **Everything else**: Universal pixel

### Q: How does the SDK detect user emails across different platforms?

**Detection Chain:**
```javascript
// Tries in order:
1. Auth providers (Auth0, Firebase, Supabase, Clerk)
2. E-commerce (Shopify.customer, WooCommerce)
3. Storage (localStorage, sessionStorage, cookies)
4. DOM elements (data-user-email, meta tags)
5. Framework globals (__NEXT_DATA__, __NUXT__)
6. API interception (monitors fetch/XHR for emails)
7. Platform-specific (iOS receipts, Google accounts)
```

**Fallbacks:**
- If no email found, optional prompt
- Discord/Telegram bots use one-tap linking
- Mobile apps always have email from store receipts

### Q: What prevents abuse of the no-code SDK rewards?

**Built-in Protections:**
1. **HMAC Authentication** - All events signed with API key
2. **Rate Limiting** - Per-email and per-product limits
3. **Behavioral Analysis** - ML detects suspicious patterns
4. **Economic Caps** - Same κ system as browser extension
5. **Action Validation** - SDK verifies actions are real

### Q: Can products customize reward amounts?

**Full Customization:**
```javascript
// Via dashboard
twist.io/products → Your Product → Reward Settings

// Via API
POST /api/products/{id}/rewards
{
  "purchase": 100,      // 100 TWIST per purchase
  "premium_feature": 50,
  "daily_login": 2
}

// Via data attributes
<script data-rewards='{"purchase": 100}'>
```

---

## Influencer Economy

### Q: How can influencers promote products without partnerships?

**Universal Link System:**
```
Format: twist.to/p/{product}/ref/{influencer}
Example: twist.to/p/nike-store/ref/sarah

1. Visit twist.to/links
2. Search ANY product in ecosystem
3. Generate unique link instantly
4. Share and earn on conversions
```

**Automatic Code Generation:**
```
Format: TWIST-{INFLUENCER}-{PRODUCT}-{YEAR}
Example: TWIST-SARAH-NIKE-2024

- Works at any checkout
- Both user and influencer earn
- No partnership needed
```

### Q: How does attribution work for influencer links?

**Attribution System:**
- **Windows**: 1-90 days (product configurable)
- **Conflict Resolution**: 
  - Last-click wins (default)
  - Multi-touch split (optional)
  - Higher tier action priority
- **Cross-Platform**: Tracks user journey across web/mobile/app
- **Fair Share**: Products can enable split commissions

### Q: What prevents influencer link spam?

**Quality Controls:**
1. **Staking Requirement** - Higher tiers need TWIST stake
2. **Performance Tracking** - Low converters demoted
3. **Rate Limits** - Max links per influencer
4. **Reputation System** - Bad actors banned
5. **Product Controls** - Products can block specific influencers

### Q: How do influencer tiers work?

**Tier System:**
```
Bronze (Default):
- 100 TWIST stake
- 1.0x earnings
- Basic support

Silver:
- 1,000 TWIST stake + 50 conversions
- 1.2x earnings
- Priority support
- Custom codes

Gold:
- 10,000 TWIST stake + 500 conversions
- 1.5x earnings
- Early access
- Campaign matching

Platinum:
- 100,000 TWIST stake + 5000 conversions
- 2.0x earnings
- White glove support
- Revenue share deals
```

### Q: Can influencers track performance across products?

**Unified Dashboard:**
```
Total Earnings: 12,847 TWIST

By Product:
- Nike Store: 5,421 TWIST (42%)
- Cool App: 3,234 TWIST (25%)
- Fashion Shop: 2,192 TWIST (17%)
- Others: 2,000 TWIST (16%)

Analytics:
- Click-through rates
- Conversion funnels
- Geographic performance
- Best performing content
```

---

*This document is maintained by the TWIST core team and updated as new insights emerge from testing and community feedback.*