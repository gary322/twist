# Attribution, Wallet Integration & Influencer Staking Guide

> Comprehensive guide for multi-touch attribution, non-custodial wallet integration, and influencer staking features

## Table of Contents

1. [Advanced Attribution Models](#advanced-attribution-models)
2. [Product-Level Tracking](#product-level-tracking)
3. [Non-Custodial Wallet Integration](#non-custodial-wallet-integration)
4. [Influencer Staking System](#influencer-staking-system)
5. [Influencer Link Generation](#influencer-link-generation)

---

## Advanced Attribution Models

### Attribution Implementation Details

TWIST uses a PDA-based attribution system with clear rules:

```javascript
// Attribution tracking via VAU
const vau = {
    siteHash: SHA256('example.com'),
    attributionTag: 'emma_style',  // From URL param ?twid=emma_style
    // ... other VAU fields
};

// Campaign Reward Router stores Attribution PDA
const attributionPDA = deriveAddress([
    'attribution',
    userWallet,
    campaignId
]);

// Attribution rules
const ATTRIBUTION_RULES = {
    DEFAULT_TTL: 30 * 60,        // 30 minutes default
    MAX_TTL: 90 * 24 * 60 * 60,  // 90 days max
    RESOLUTION: 'LAST_CLICK',     // Last click wins per campaign
    TIER_PRIORITY: {             // Higher tier wins in ties
        purchase: 3,
        add_to_cart: 2,
        view: 1
    }
};

// Campaign setup with attribution model
const campaign = {
    id: 'summer_2024',
    budget: 10000, // USDC
    attributionModel: AttributionModels.TIME_DECAY,
    attributionWindow: 7 * 24 * 60 * 60, // 7 days
    
    // Credit distribution for time decay (example)
    creditDistribution: {
        day0_1: 0.40,  // 40% credit for actions in first 24h
        day1_3: 0.30,  // 30% for days 1-3
        day3_5: 0.20,  // 20% for days 3-5
        day5_7: 0.10   // 10% for days 5-7
    }
};
```

### Handling Multiple Influencer Touches

```javascript
class MultiTouchAttributionEngine {
    // Track all influencer touchpoints
    async recordTouch(userId, influencerId, campaignId, action) {
        const touchpoint = {
            userId,
            influencerId,
            campaignId,
            action,
            timestamp: Date.now(),
            weight: this.calculateWeight(action)
        };
        
        await this.db.addTouchpoint(touchpoint);
    }
    
    // Store attribution in PDA when first VAU arrives
    async processAttribution(vau, campaignId) {
        const attributionPDA = deriveAddress([
            'attribution',
            vau.userWallet,
            campaignId
        ]);
        
        // Check if attribution already exists
        const existing = await getAccount(attributionPDA);
        
        if (!existing || Date.now() > existing.expiresAt) {
            // Create or update attribution
            await program.methods.setAttribution({
                user: vau.userWallet,
                campaign: campaignId,
                influencer: vau.attributionTag,
                timestamp: Date.now(),
                expiresAt: Date.now() + campaign.attribution_ttl_seconds * 1000
            })
            .accounts({ attributionPDA })
            .rpc();
            
            // Emit event for dashboard
            emit('AttributionSet', {
                user: vau.userWallet,
                campaign: campaignId,
                influencer: vau.attributionTag
            });
        }
    }
    
    // Router events for tracking
    async emitTrackingEvents(action, attribution) {
        if (action.type === 'vau') {
            emit('CampaignVAUProcessed', {
                campaign: attribution.campaign,
                influencer: attribution.influencer,
                feature: action.feature,
                timestamp: Date.now()
            });
        } else if (action.type === 'conversion') {
            emit('ConversionPaid', {
                campaign: attribution.campaign,
                influencer: attribution.influencer,
                amount: action.amount,
                product: action.productId,
                timestamp: Date.now()
            });
        }
    }
    
    // Time decay calculation
    timeDecayAttribution(touchpoints, value) {
        const now = Date.now();
        const credits = touchpoints.map(tp => {
            const ageInDays = (now - tp.timestamp) / (1000 * 60 * 60 * 24);
            const decayFactor = Math.exp(-0.1 * ageInDays); // Exponential decay
            
            return {
                influencer: tp.influencerId,
                credit: value * decayFactor,
                percentage: decayFactor
            };
        });
        
        // Normalize to 100%
        const total = credits.reduce((sum, c) => sum + c.percentage, 0);
        return credits.map(c => ({
            ...c,
            credit: value * (c.percentage / total)
        }));
    }
}
```

### Return Visit Attribution

```javascript
// Handle users returning after attribution window
async function handleReturnVisit(user, campaign, newInfluencer) {
    const lastAttribution = await getLastAttribution(user, campaign);
    
    if (!lastAttribution) {
        // First visit
        return createAttribution(user, campaign, newInfluencer);
    }
    
    const timeSinceFirst = Date.now() - lastAttribution.firstTouch;
    const window = campaign.attributionWindow;
    
    if (timeSinceFirst <= window) {
        // Within window - apply attribution model
        return updateAttribution(lastAttribution, newInfluencer);
    } else {
        // Outside window - new attribution cycle
        // But track for cohort analysis
        return {
            primary: createAttribution(user, campaign, newInfluencer),
            historical: lastAttribution,
            isReactivation: true
        };
    }
}
```

---

## Product-Level Tracking

### Enhanced VAU for Granular Tracking

```javascript
// Extended VAU structure for product interactions
interface ProductVAU extends BaseVAU {
    siteHash: string;
    attributionTag: string;
    
    // Product context
    product: {
        id: string;           // SKU or product ID
        category: string;     // Product category
        price: number;        // For commission calculation
        variant?: string;     // Size, color, etc.
    };
    
    // Interaction details
    interaction: {
        type: 'view' | 'click' | 'add_to_cart' | 'purchase' | 'custom';
        feature?: string;     // '360_view', 'size_guide', 'reviews'
        duration?: number;    // Time spent on feature
        depth?: number;       // Scroll depth, video progress, etc.
    };
    
    // Session tracking
    session: {
        id: string;
        referrer: string;
        entryPoint: string;
        touchNumber: number;  // Which touch in the journey
    };
}

// Track specific product interactions
async function trackProductInteraction(interaction: ProductInteraction) {
    const vau: ProductVAU = {
        ...generateBaseVAU(),
        
        product: {
            id: interaction.productId,
            category: await getProductCategory(interaction.productId),
            price: await getProductPrice(interaction.productId)
        },
        
        interaction: {
            type: interaction.type,
            feature: interaction.feature,
            duration: interaction.duration
        },
        
        session: {
            id: getCurrentSession(),
            touchNumber: getSessionTouchCount()
        }
    };
    
    await emitVAU(vau);
}
```

---

## Non-Custodial Wallet Integration

### CRITICAL: TWIST Extension is NOT a Wallet

```javascript
/**
 * TWIST Extension Architecture
 * - Extension is only a viewer + VAU signer
 * - All token custody lives in user's Solana wallet
 * - Never holds private keys
 * - Uses Wallet Adapter for RPC calls only
 */
class TwistExtension {
    constructor() {
        this.isWallet = false; // EXPLICITLY NOT A WALLET
        this.isViewer = true;  // Only views balances
        this.isVAUSigner = true; // Signs VAUs with device attestation
        this.connectedWallet = null;
        this.walletAdapter = null;
    }
    
    // Detect and connect to user's actual wallet
    async connectWallet() {
        const wallets = await this.detectWallets();
        
        // Show wallet selection UI
        const selected = await this.showWalletSelector(wallets);
        
        try {
            switch(selected) {
                case 'phantom':
                    this.provider = window.solana;
                    break;
                case 'solflare':
                    this.provider = window.solflare;
                    break;
                case 'ledger':
                    this.provider = await this.connectLedger();
                    break;
                // ... other wallets
            }
            
            const response = await this.provider.connect();
            this.connectedWallet = response.publicKey.toString();
            
            // Sync earnings from chain
            await this.syncEarnings();
            
        } catch (error) {
            console.error('Wallet connection failed:', error);
            throw error;
        }
    }
    
    // Use Wallet Adapter for balance queries only
    async getBalance() {
        return await this.walletAdapter.getBalance(this.connectedWallet);
    }
    
    // Any transfer/stake/bond pops native wallet modal
    async initiateTransfer(amount, destination) {
        // Build transaction
        const tx = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: new PublicKey(this.connectedWallet),
                toPubkey: new PublicKey(destination),
                lamports: amount
            })
        );
        
        // Native wallet (Phantom/Backpack/Ledger) pops confirmation
        // Extension NEVER touches private key
        const signedTx = await this.walletAdapter.signTransaction(tx);
        
        // After tx, extension just shows updated balance/decay
        await this.updateDisplayedBalance();
        
        return signedTx;
    }
    
    // Read-only balance checking
    async syncEarnings() {
        const earnings = await connection.getEarnings(this.connectedWallet);
        
        this.earnings = {
            unclaimed: earnings.unclaimed,
            lifetime: earnings.lifetime,
            pending: earnings.pending
        };
        
        this.updateUI();
    }
    
    // Security checks
    detectWallets() {
        const wallets = [];
        
        if (window.solana?.isPhantom) wallets.push('phantom');
        if (window.solflare) wallets.push('solflare');
        if (window.ethereum?.isMetaMask) wallets.push('metamask');
        // ... detect other wallets
        
        return wallets;
    }
}
```

### Wallet Security Best Practices

```javascript
// Security measures
const WalletSecurity = {
    // Never store private keys
    NEVER_STORE: ['privateKey', 'mnemonic', 'seed'],
    
    // Only request necessary permissions
    PERMISSIONS: {
        required: ['view_balance', 'sign_transaction'],
        never: ['export_private_key', 'manage_tokens']
    },
    
    // Transaction validation
    validateTransaction(tx) {
        // Check it's only claiming from TWIST escrow
        if (tx.from !== TWIST_ESCROW_PDA) {
            throw new Error('Invalid transaction source');
        }
        
        // Check recipient is connected wallet
        if (tx.to !== this.connectedWallet) {
            throw new Error('Invalid recipient');
        }
        
        // Check amount matches on-chain earnings
        if (tx.amount > this.earnings.unclaimed) {
            throw new Error('Amount exceeds claimable');
        }
    }
};
```

---

## Influencer Staking System

### Implementation from influencer_staking_program.md

Users can stake on influencers to earn from their performance:

```solidity
// Influencer Staking Program (from docs/programs/influencer_staking_program.md)
contract InfluencerStaking {
    // Users deposit AC-D into InfluencerPool PDA
    struct InfluencerProfile {
        address wallet;
        uint256 totalStaked;
        uint256 performanceScore;    // 0-1000
        uint256 conversionRate;      // Historical average
        uint256 minimumStake;        // e.g., 100 TWIST
        bool verified;               // Platform verified
    }
    
    struct StakePosition {
        uint256 id;
        address staker;
        address influencer;
        uint256 amount;
        uint256 stakedAt;
        uint256 lockPeriod;         // 30, 60, 90 days
        uint256 apy;               // Based on lock period
        uint256 rewardsEarned;
        uint256 lastClaimTime;
    }
    
    mapping(address => InfluencerProfile) public influencers;
    mapping(uint256 => StakePosition) public stakes;
    
    // Stake on an influencer
    function stakeOnInfluencer(
        address influencer,
        uint256 amount,
        uint256 lockDays
    ) external returns (uint256 stakeId) {
        require(influencers[influencer].verified, "Not verified");
        require(amount >= influencers[influencer].minimumStake, "Below minimum");
        require(lockDays >= 30, "Minimum 30 days");
        
        // Transfer TWIST to staking pool
        TWIST.transferFrom(msg.sender, address(this), amount);
        
        // Calculate APY based on influencer performance and lock period
        uint256 apy = calculateAPY(influencer, lockDays);
        
        // Create stake position
        stakeId = nextStakeId++;
        stakes[stakeId] = StakePosition({
            id: stakeId,
            staker: msg.sender,
            influencer: influencer,
            amount: amount,
            stakedAt: block.timestamp,
            lockPeriod: lockDays * 1 days,
            apy: apy,
            rewardsEarned: 0,
            lastClaimTime: block.timestamp
        });
        
        // Update influencer metrics
        influencers[influencer].totalStaked += amount;
        
        emit Staked(msg.sender, influencer, amount, lockDays);
    }
    
    // Calculate rewards based on influencer performance
    function calculateRewards(uint256 stakeId) public view returns (uint256) {
        StakePosition memory stake = stakes[stakeId];
        InfluencerProfile memory influencer = influencers[stake.influencer];
        
        // Base rewards from APY
        uint256 timeStaked = block.timestamp - stake.lastClaimTime;
        uint256 baseRewards = stake.amount * stake.apy * timeStaked / 365 days / 100;
        
        // Performance multiplier (0.5x to 2x based on conversions)
        uint256 perfMultiplier = getPerformanceMultiplier(stake.influencer);
        
        return baseRewards * perfMultiplier / 100;
    }
    
    // Performance tracking
    function updateInfluencerPerformance(
        address influencer,
        uint256 conversions,
        uint256 revenue
    ) external onlyRouter {
        InfluencerProfile storage profile = influencers[influencer];
        
        // Update rolling averages
        profile.conversionRate = (profile.conversionRate * 9 + conversions) / 10;
        profile.performanceScore = calculateScore(conversions, revenue);
        
        // Distribute bonus rewards to stakers if performance exceeds threshold
        if (profile.performanceScore > 800) {
            distributePerformanceBonus(influencer);
        }
    }
}
```

### Staker Dashboard UI

Pool yield = Σ campaign influencer payouts × dynamic boost, distributed pro-rata once per epoch.

```javascript
// Extension "Support Creator" button opens stake modal
const InfluencerStakingDashboard = () => {
    // Show top influencers to stake on
    const topInfluencers = [
        {
            handle: '@emma_style',
            avatar: 'emma.jpg',
            stats: {
                followers: '125K',
                conversionRate: '3.2%',
                avgOrderValue: '$87',
                performanceScore: 920
            },
            staking: {
                totalStaked: '1.2M TWIST',
                currentAPY: '45%',
                minimumStake: '100 TWIST',
                availableCapacity: '300K TWIST'
            }
        }
        // ... more influencers
    ];
    
    return (
        <div className="staking-dashboard">
            <h2>Stake on Top Influencers</h2>
            
            {topInfluencers.map(influencer => (
                <InfluencerCard
                    key={influencer.handle}
                    influencer={influencer}
                    onStake={(amount, period) => 
                        stakeOnInfluencer(influencer.wallet, amount, period)
                    }
                />
            ))}
            
            <MyStakes>
                {/* Show user's current stakes */}
            </MyStakes>
        </div>
    );
};
```

---

## Influencer Link Generation

### Universal Link Creation System

From campaign_reward_router_program.md and browser_extension.md §5:

```javascript
class UniversalLinkGenerator {
    // After registering, influencer can call createReferralLink
    async createReferralLink(campaignId, url) {
        // Via dashboard UI or REST endpoint /v1/referral/link
        const response = await fetch('/v1/referral/link', {
            method: 'POST',
            body: JSON.stringify({
                campaignId,
                url,
                influencerId: this.currentUser.id
            })
        });
        
        const data = await response.json();
        
        // Service signs parameters and appends twid=<hash>
        // Returns ready-to-share URL - no whitelist, any public URL works
        // Router validates hash so links can't be forged
        return data.signedUrl; // e.g., https://example.com/product?twid=hash123
    }
    
    // Influencers can create links for ANY product
    async createAffiliateLink(params) {
        const {
            productUrl,
            influencerId,
            requestedCommission,
            customTracking,
            expiryDate
        } = params;
        
        // Parse product URL to identify merchant
        const merchant = await this.identifyMerchant(productUrl);
        
        // Check if merchant has TWIST integration
        const hasIntegration = await this.checkIntegration(merchant);
        
        if (hasIntegration) {
            // Merchant has agreed rates
            return this.createIntegratedLink(params, merchant);
        } else {
            // Open marketplace - influencer sets rate
            return this.createOpenLink(params);
        }
    }
    
    // For integrated merchants
    async createIntegratedLink(params, merchant) {
        const commission = merchant.influencerRates[params.influencerId] || 
                          merchant.defaultRate;
        
        const link = {
            id: generateId(),
            destination: params.productUrl,
            influencer: params.influencerId,
            merchant: merchant.id,
            commission: commission,
            autoApproved: true,
            tracking: {
                source: 'twist',
                medium: 'influencer',
                campaign: params.customTracking?.campaign,
                content: params.customTracking?.content
            }
        };
        
        await this.saveLink(link);
        return `https://twist.link/${link.id}`;
    }
    
    // For any product (open marketplace)
    async createOpenLink(params) {
        const link = {
            id: generateId(),
            destination: params.productUrl,
            influencer: params.influencerId,
            requestedCommission: params.requestedCommission || 10, // 10% default
            status: 'pending_approval',
            tracking: params.customTracking,
            
            // Smart contract escrow for trust
            escrowContract: await this.deployEscrow({
                influencer: params.influencerId,
                commission: params.requestedCommission
            })
        };
        
        // Notify merchant (if identifiable)
        await this.notifyMerchant(link);
        
        await this.saveLink(link);
        return `https://twist.link/${link.id}`;
    }
    
    // Merchant approval flow
    async handleMerchantResponse(linkId, response) {
        const link = await this.getLink(linkId);
        
        if (response.approved) {
            link.status = 'active';
            link.commission = response.counterOffer || link.requestedCommission;
            
            // Set up payment routing
            await this.setupPaymentRouting(link);
        } else {
            link.status = 'rejected';
            link.reason = response.reason;
        }
        
        await this.updateLink(link);
        await this.notifyInfluencer(link);
    }
}

// Influencer dashboard component
const LinkCreator = () => {
    const [productUrl, setProductUrl] = useState('');
    const [commission, setCommission] = useState(10);
    const [customParams, setCustomParams] = useState({});
    
    const createLink = async () => {
        const link = await linkGenerator.createAffiliateLink({
            productUrl,
            influencerId: currentUser.id,
            requestedCommission: commission,
            customTracking: customParams
        });
        
        // Copy to clipboard
        navigator.clipboard.writeText(link);
        toast.success('Link created and copied!');
    };
    
    return (
        <div className="link-creator">
            <h3>Create Affiliate Link</h3>
            
            <input
                type="url"
                placeholder="Product URL"
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
            />
            
            <div className="commission-selector">
                <label>Requested Commission: {commission}%</label>
                <input
                    type="range"
                    min="5"
                    max="50"
                    value={commission}
                    onChange={(e) => setCommission(e.target.value)}
                />
            </div>
            
            <details>
                <summary>Advanced Tracking</summary>
                <input
                    placeholder="Campaign name"
                    onChange={(e) => setCustomParams({
                        ...customParams,
                        campaign: e.target.value
                    })}
                />
            </details>
            
            <button onClick={createLink}>
                Generate Link
            </button>
        </div>
    );
};
```

### Link Performance Analytics

```javascript
// Track link performance for influencers
class LinkAnalytics {
    async trackClick(linkId, userData) {
        const event = {
            linkId,
            timestamp: Date.now(),
            user: userData.deviceId, // Privacy preserved
            referrer: userData.referrer,
            deviceTrust: userData.trustLevel
        };
        
        await this.recordEvent('click', event);
        
        // Real-time update to influencer
        await this.updateInfluencerMetrics(linkId);
    }
    
    async getInfluencerAnalytics(influencerId, period) {
        const links = await this.getInfluencerLinks(influencerId);
        
        const analytics = {
            totalLinks: links.length,
            activeLinks: links.filter(l => l.status === 'active').length,
            
            performance: {
                clicks: 0,
                conversions: 0,
                revenue: 0,
                averageOrderValue: 0,
                conversionRate: 0
            },
            
            topProducts: [],
            topMerchants: [],
            
            earnings: {
                pending: 0,
                paid: 0,
                lifetime: 0
            }
        };
        
        // Aggregate performance across all links
        for (const link of links) {
            const linkStats = await this.getLinkStats(link.id, period);
            analytics.performance.clicks += linkStats.clicks;
            analytics.performance.conversions += linkStats.conversions;
            analytics.performance.revenue += linkStats.revenue;
        }
        
        analytics.performance.conversionRate = 
            (analytics.performance.conversions / analytics.performance.clicks) * 100;
            
        return analytics;
    }
}
```

---

## Implementation Checklist

### Attribution System
- [ ] Implement multi-touch attribution models
- [ ] Add product-level tracking to VAUs
- [ ] Create attribution analytics dashboard
- [ ] Test with multiple influencer scenarios

### Wallet Integration
- [ ] Remove ALL custodial wallet code
- [ ] Implement wallet detection
- [ ] Add transaction building (not signing)
- [ ] Create security validation layer
- [ ] Test with major wallets (Phantom, Solflare, Ledger)

### Influencer Staking
- [ ] Deploy staking smart contract
- [ ] Create staker dashboard UI
- [ ] Implement performance tracking
- [ ] Add reward distribution system
- [ ] Test different lock periods and APYs

### Link Generation
- [ ] Build universal link generator
- [ ] Create merchant approval flow
- [ ] Implement analytics tracking
- [ ] Add commission negotiation system
- [ ] Test with integrated and non-integrated merchants

---

*This comprehensive guide ensures TWIST provides advanced attribution, maintains wallet security, enables influencer staking, and allows universal link creation.*