# Privacy & Security Implementation Guide

> Comprehensive documentation of TWIST's privacy-preserving targeting and multi-layered security approach

## Overview

TWIST implements privacy-first advertising through local computation, Bloom filters, and zero-knowledge techniques while maintaining robust security against bot farms and attacks.

## Privacy Architecture

### Local Cohort Computation

```javascript
// Browser extension - local classification
class LocalCohortEngine {
    constructor() {
        this.visitHistory = new Map(); // domain -> visit count
        this.interests = new Set();
        this.cohortCache = null;
        this.saltRotation = 7 * 24 * 60 * 60 * 1000; // 7 days
    }
    
    // Classify visit locally
    async classifyVisit(domain) {
        const categories = await this.domainToCategories(domain);
        
        for (const category of categories) {
            this.interests.add(category);
        }
        
        // Update visit frequency
        const visits = this.visitHistory.get(domain) || 0;
        this.visitHistory.set(domain, visits + 1);
        
        // Recompute cohort if needed
        if (this.shouldRecompute()) {
            this.cohortCache = await this.computeCohort();
        }
    }
    
    // Generate cohort from interests
    async computeCohort() {
        // Get top interests by frequency
        const sortedInterests = Array.from(this.interests)
            .map(interest => ({
                interest,
                score: this.calculateInterestScore(interest)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 5); // Top 5 interests
        
        // Generate cohort ID
        const cohortString = sortedInterests
            .map(i => i.interest)
            .sort() // Deterministic order
            .join('|');
            
        // Add temporal salt
        const salt = this.getCurrentSalt();
        const cohortId = await this.hash(cohortString + salt);
        
        return {
            id: cohortId,
            interests: sortedInterests.map(i => i.interest),
            confidence: this.calculateConfidence(sortedInterests),
            validUntil: Date.now() + this.saltRotation
        };
    }
    
    // Never send raw interests to server
    getCohortProof() {
        if (!this.cohortCache) return null;
        
        return {
            cohortId: this.cohortCache.id,
            timestamp: Date.now(),
            // No raw interests included
        };
    }
}
```

### Bloom Filter Targeting

```javascript
// Advertiser dashboard - cohort selection
class CohortBuilder {
    constructor() {
        this.availableCohorts = new Map(); // Pre-computed high-prevalence cohorts
        this.minPrevalence = 0.002; // 0.2% minimum
    }
    
    // Build Bloom filter for campaign
    async createTargetingFilter(selectedInterests) {
        // Expand to allowed combinations
        const validCohorts = this.expandToValidCohorts(selectedInterests);
        
        // Create Bloom filter
        const filter = new BloomFilter({
            size: 2048,        // bits
            hashFunctions: 3,
            falsePositive: 0.01
        });
        
        // Add valid cohort IDs
        for (const cohort of validCohorts) {
            filter.add(cohort.id);
        }
        
        // Add weekly salt for rotation
        const salt = this.getWeeklySalt();
        filter.setSalt(salt);
        
        return {
            filter: filter.serialize(),
            stats: {
                cohortsIncluded: validCohorts.length,
                estimatedReach: this.calculateReach(validCohorts),
                falsePositiveRate: filter.getFalsePositiveRate()
            }
        };
    }
    
    // Expand single interests to valid combinations
    expandToValidCohorts(interests) {
        const validCohorts = [];
        
        // All combinations of selected interests
        for (let r = 1; r <= Math.min(interests.length, 3); r++) {
            const combinations = this.getCombinations(interests, r);
            
            for (const combo of combinations) {
                const cohort = this.lookupCohort(combo);
                
                // Only include high-prevalence cohorts
                if (cohort && cohort.prevalence >= this.minPrevalence) {
                    validCohorts.push(cohort);
                }
            }
        }
        
        return validCohorts;
    }
}
```

### Edge Worker Verification

```typescript
// Edge Worker - verify cohort membership without learning interests
export async function verifyCohortMembership(
    request: Request,
    env: Env
): Promise<boolean> {
    const { cohortId, campaignId } = await request.json();
    
    // Get campaign's Bloom filter
    const campaign = await env.KV.get(`campaign:${campaignId}`, 'json');
    if (!campaign) return false;
    
    // Deserialize Bloom filter
    const filter = BloomFilter.deserialize(campaign.targetingFilter);
    
    // Check membership
    const isMember = filter.test(cohortId);
    
    // Log aggregate stats only
    await incrementMetric('cohort_checks', {
        campaign: campaignId,
        result: isMember ? 'match' : 'no_match'
        // No cohortId logged
    });
    
    return isMember;
}
```

### Privacy Guarantees

```javascript
// K-anonymity enforcement
class PrivacyGuarantees {
    static readonly MIN_COHORT_SIZE = 1000;
    static readonly SALT_ROTATION_DAYS = 7;
    static readonly MAX_INTERESTS_PER_COHORT = 5;
    
    // Verify cohort meets privacy bar
    static isValidCohort(cohort: Cohort): boolean {
        return (
            cohort.userCount >= this.MIN_COHORT_SIZE &&
            cohort.interests.length <= this.MAX_INTERESTS_PER_COHORT &&
            cohort.prevalence >= 0.002 // 0.2% minimum
        );
    }
    
    // Prevent cohort intersection attacks
    static preventIntersectionAttack(
        userCohorts: Set<string>,
        queriedCohorts: Set<string>
    ): boolean {
        const intersection = new Set(
            [...userCohorts].filter(c => queriedCohorts.has(c))
        );
        
        // Require at least 3 cohorts in common
        return intersection.size >= 3;
    }
}
```

## Security Implementation

### Multi-Layer Bot Defense

```javascript
// Layer 1: Hardware attestation (see hardware_attestation_implementation.md)

// Layer 2: Economic caps
class EconomicDefense {
    // Per-device earning cap
    static calculateKappa(hardwareCost: number, twistPrice: number): number {
        return 3 * hardwareCost / twistPrice;
    }
    
    // Rate limiting
    static readonly MAX_VAUS_PER_DAY = 8640; // One per 10 seconds
    static readonly MAX_EARN_RATE = 0.001; // 0.1% of supply per day
    
    // Device-specific limits
    static getDeviceLimits(trustLevel: string): DeviceLimits {
        switch (trustLevel) {
            case 'trusted':
                return {
                    dailyCap: this.calculateKappa(50, 0.05), // ~3000 TWIST
                    vauRate: 1 / 10, // 1 per 10s
                    multiplier: 1.0
                };
            case 'untrusted':
                return {
                    dailyCap: this.calculateKappa(50, 0.05) / 5, // ~600 TWIST
                    vauRate: 1 / 30, // 1 per 30s
                    multiplier: 0.2
                };
            default:
                return {
                    dailyCap: 0,
                    vauRate: 0,
                    multiplier: 0
                };
        }
    }
}
```

### Behavioral Analysis

```javascript
// Layer 3: ML-based pattern detection
class BehavioralAnalysis {
    constructor() {
        this.patterns = new Map(); // deviceId -> pattern data
        this.threshold = 0.8; // Confidence threshold
    }
    
    async analyzeVAU(vau: VAU): Promise<TrustScore> {
        const devicePattern = this.getDevicePattern(vau.deviceId);
        
        // Feature extraction
        const features = {
            // Temporal features
            timeSinceLastVAU: vau.timestamp - devicePattern.lastTimestamp,
            hourOfDay: new Date(vau.timestamp).getHours(),
            
            // Behavioral features
            siteHashEntropy: this.calculateEntropy(devicePattern.siteHashes),
            dwellTimeVariance: this.calculateVariance(devicePattern.dwellTimes),
            
            // Consistency features
            deviceConsistency: this.checkDeviceConsistency(vau),
            geoConsistency: this.checkGeoConsistency(vau)
        };
        
        // Run through model
        const botProbability = await this.model.predict(features);
        
        // Update pattern
        this.updatePattern(vau.deviceId, vau);
        
        return {
            trustScore: 1 - botProbability,
            features,
            action: botProbability > this.threshold ? 'downgrade' : 'accept'
        };
    }
    
    // Detect click farm patterns
    detectClickFarmPattern(devices: Set<string>): boolean {
        const patterns = Array.from(devices).map(d => this.patterns.get(d));
        
        // Check for suspicious similarities
        const similarities = {
            temporalClustering: this.checkTemporalClustering(patterns),
            siteHashOverlap: this.checkSiteHashOverlap(patterns),
            dwellTimeUniformity: this.checkDwellTimeUniformity(patterns)
        };
        
        const suspicionScore = 
            similarities.temporalClustering * 0.4 +
            similarities.siteHashOverlap * 0.3 +
            similarities.dwellTimeUniformity * 0.3;
            
        return suspicionScore > 0.7;
    }
}
```

### Challenge System

```javascript
// Layer 4: Random interaction challenges
class ChallengeSystem {
    constructor() {
        this.challengeTypes = [
            'scroll_to_position',
            'click_element',
            'hover_duration',
            'text_selection'
        ];
    }
    
    // Issue random challenge
    async issueChallenge(deviceId: string): Promise<Challenge> {
        const type = this.randomChoice(this.challengeTypes);
        
        switch (type) {
            case 'scroll_to_position':
                return {
                    type,
                    target: Math.random() * 0.8 + 0.1, // 10-90% of page
                    timeout: 5000,
                    instruction: 'Scroll to highlighted section'
                };
                
            case 'click_element':
                return {
                    type,
                    selector: this.generateSafeSelector(),
                    timeout: 5000,
                    instruction: 'Click the highlighted button'
                };
                
            // ... other challenge types
        }
    }
    
    // Verify challenge completion
    async verifyChallenge(
        challenge: Challenge,
        response: ChallengeResponse
    ): Promise<boolean> {
        // Check timing
        if (response.completedAt - response.startedAt > challenge.timeout) {
            return false;
        }
        
        // Verify action
        switch (challenge.type) {
            case 'scroll_to_position':
                return Math.abs(response.scrollPosition - challenge.target) < 0.05;
                
            case 'click_element':
                return response.clickedElement === challenge.selector;
                
            // ... other verifications
        }
    }
}
```

### Rate Limiting Infrastructure

```javascript
// Global rate limiting using Cloudflare KV
class RateLimiter {
    constructor(env: Env) {
        this.kv = env.RATE_LIMIT_KV;
    }
    
    async checkLimit(
        deviceId: string,
        limitType: 'vau' | 'earn' | 'challenge'
    ): Promise<RateLimitResult> {
        const key = `rl:${deviceId}:${limitType}:${this.getCurrentWindow()}`;
        
        // Atomic increment with compare-and-swap
        let current = 0;
        let success = false;
        
        for (let retry = 0; retry < 3; retry++) {
            const data = await this.kv.get(key, 'json') || { count: 0, etag: null };
            current = data.count;
            
            const limit = this.getLimit(limitType);
            if (current >= limit) {
                return {
                    allowed: false,
                    current,
                    limit,
                    resetAt: this.getWindowEnd()
                };
            }
            
            // Try to increment
            try {
                await this.kv.put(
                    key,
                    JSON.stringify({ count: current + 1 }),
                    {
                        expiration: this.getWindowEnd(),
                        metadata: { etag: data.etag }
                    }
                );
                success = true;
                break;
            } catch (e) {
                // Concurrent modification, retry
                await this.sleep(Math.random() * 100);
            }
        }
        
        return {
            allowed: success,
            current: current + (success ? 1 : 0),
            limit: this.getLimit(limitType),
            resetAt: this.getWindowEnd()
        };
    }
    
    private getLimit(type: string): number {
        switch (type) {
            case 'vau': return 8640; // Per day
            case 'earn': return 3000; // TWIST per day
            case 'challenge': return 10; // Per hour
            default: return 0;
        }
    }
}
```

## GDPR & Privacy Compliance

```javascript
// Data minimization and compliance
class PrivacyCompliance {
    // No personal data stored
    static readonly STORED_DATA = {
        deviceId: 'random UUID - no link to identity',
        cohortId: 'hashed interests - no reverse mapping',
        ipAddress: 'hashed after 24h for DDoS only',
        wallet: 'public key only - pseudonymous'
    };
    
    // Right to be forgotten
    static async deleteUserData(wallet: string): Promise<void> {
        // Remove from all systems
        await Promise.all([
            env.KV.delete(`user:${wallet}`),
            env.KV.delete(`device:${wallet}`),
            env.KV.delete(`cohort:${wallet}`),
            env.KV.delete(`attribution:${wallet}`)
        ]);
        
        // Log deletion for compliance
        await logDeletion(wallet, Date.now());
    }
    
    // Data portability
    static async exportUserData(wallet: string): Promise<UserDataExport> {
        const data = {
            wallet,
            earnings: await getEarnings(wallet),
            campaigns: await getCampaignParticipation(wallet),
            // No personal data to export
        };
        
        return data;
    }
}
```

## Security Monitoring

```javascript
// Real-time security metrics
interface SecurityMetrics {
    attestation: {
        trusted: number;
        untrusted: number;
        failed: number;
        unknownFormats: number;
    };
    
    rateLimit: {
        violations: number;
        uniqueViolators: number;
        topViolators: Array<{deviceId: string; count: number}>;
    };
    
    behavioral: {
        suspiciousPatterns: number;
        downgraded: number;
        challenged: number;
        failedChallenges: number;
    };
    
    economic: {
        dailyMinted: number;
        dailyBurned: number;
        treasuryGrowth: number;
        activeCircuitBreaker: boolean;
    };
}

// Prometheus metrics
const metrics = {
    attestationCounter: new Counter({
        name: 'twist_attestation_total',
        help: 'Total attestation attempts',
        labelNames: ['status', 'type']
    }),
    
    rateLimitCounter: new Counter({
        name: 'twist_rate_limit_violations',
        help: 'Rate limit violations',
        labelNames: ['type', 'severity']
    }),
    
    botDetectionGauge: new Gauge({
        name: 'twist_bot_probability',
        help: 'Current bot detection probability',
        labelNames: ['device_trust_level']
    })
};
```

---

*This implementation ensures user privacy while maintaining robust security against all known attack vectors.*