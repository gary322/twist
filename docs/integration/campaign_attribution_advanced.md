# Advanced Campaign & Attribution System

> Detailed implementation guide for TWIST's USDC-denominated campaigns and flexible attribution system

## Overview

TWIST campaigns are uniquely denominated in USDC while paying out in TWIST tokens, providing price stability for advertisers and guaranteed value for influencers.

## Campaign Architecture

### USDC Denomination Model

```solidity
// Core campaign structure
struct Campaign {
    address advertiser;
    uint256 budgetUSDC;          // Total USDC locked
    uint256 spentUSDC;           // USDC spent so far
    uint256 startTime;
    uint256 endTime;
    bool active;
    
    // Payout rules in USDC terms
    mapping(ActionType => uint256) payoutUSDC;
    
    // Attribution settings
    uint256 attributionWindowSeconds;
    bool multiClickFairShare;
    
    // Targeting
    bytes32 bloomFilterHash;
    string[] geoTargets;
}

enum ActionType {
    VIEW,
    CLICK,
    ADD_TO_CART,
    PURCHASE,
    CUSTOM_1,
    CUSTOM_2
}
```

### Campaign Creation Flow

```javascript
// 1. Advertiser creates campaign
async function createCampaign(params) {
    const tx = await program.methods.createCampaign({
        budgetUsdc: params.budget,
        payoutRules: {
            view: 0.50,      // $0.50 USDC per view
            click: 2.00,     // $2.00 USDC per click
            purchase: 50.00  // $50.00 USDC per purchase
        },
        attributionWindow: params.attributionDays * 86400,
        multiClickFairShare: params.enableSplitAttribution,
        bloomFilter: await generateBloomFilter(params.targeting)
    })
    .accounts({
        campaign: campaignPDA,
        advertiser: wallet.publicKey,
        systemProgram: SystemProgram.programId
    })
    .rpc();
}

// 2. Fund campaign with USDC
async function fundCampaign(campaignId, usdcAmount) {
    await transferUSDC(
        advertiserWallet,
        campaignPDA,
        usdcAmount
    );
}
```

### Payout Processing

```solidity
// Batch payout processor
contract CampaignPayoutProcessor {
    // Accumulate payouts per block
    struct PendingPayout {
        address recipient;
        uint256 usdcAmount;
        uint256 actionType;
        bytes32 attributionTag;
    }
    
    PendingPayout[] public pendingPayouts;
    
    function addPayout(
        address recipient,
        uint256 usdcAmount,
        uint256 actionType,
        bytes32 attributionTag
    ) internal {
        pendingPayouts.push(PendingPayout({
            recipient: recipient,
            usdcAmount: usdcAmount,
            actionType: actionType,
            attributionTag: attributionTag
        }));
    }
    
    function processBatch() external {
        uint256 totalUSDC = 0;
        
        // Calculate total USDC needed
        for (uint i = 0; i < pendingPayouts.length; i++) {
            totalUSDC += pendingPayouts[i].usdcAmount;
        }
        
        // Single swap USDC -> TWIST via Orca Whirlpool CPI
        uint256 twistReceived = IWhirlpool(WHIRLPOOL).swap(
            USDC,
            TWIST,
            totalUSDC,
            0, // No slippage protection needed (oracle price)
            address(this)
        );
        
        // Distribute TWIST proportionally
        for (uint i = 0; i < pendingPayouts.length; i++) {
            uint256 twistShare = twistReceived * 
                pendingPayouts[i].usdcAmount / totalUSDC;
                
            IERC20(TWIST).transfer(
                pendingPayouts[i].recipient,
                twistShare
            );
            
            emit PayoutProcessed(
                pendingPayouts[i].recipient,
                pendingPayouts[i].usdcAmount,
                twistShare,
                pendingPayouts[i].actionType
            );
        }
        
        delete pendingPayouts;
    }
    
    // Batch processing optimization details:
    // - Aggregates ~700 VAUs per Solana block (~400ms)
    // - Processes ~14 tx/sec at 10k payouts/s load
    // - Gas cost: ~90k CU per batch (well within 1.4M CU block limit)
    // - Total cost: <1 SOL/day in fees (paid by campaign pot)
}
```

## Attribution System

### Flexible Attribution Windows

```javascript
// Campaign-specific attribution windows
const ATTRIBUTION_PRESETS = {
    'instant': 30 * 60,           // 30 minutes (default)
    'daily': 24 * 60 * 60,        // 24 hours
    'weekly': 7 * 24 * 60 * 60,   // 7 days
    'monthly': 30 * 24 * 60 * 60, // 30 days
    'custom': null                 // Up to 90 days
};

// Validation
function validateAttributionWindow(seconds) {
    const MAX_WINDOW = 90 * 24 * 60 * 60; // 90 days
    const MIN_WINDOW = 5 * 60;             // 5 minutes
    
    require(seconds >= MIN_WINDOW && seconds <= MAX_WINDOW,
        "Attribution window out of bounds");
}
```

### Attribution Conflict Resolution

```solidity
// Attribution tracking per campaign
mapping(bytes32 => Attribution) public attributions;

struct Attribution {
    address influencer;
    uint256 timestamp;
    uint256 tier;  // 0=view, 1=click, 2=cart, 3=purchase
    bytes32 campaignId;
}

function resolveAttribution(
    address user,
    bytes32 campaignId,
    bytes32 newAttributionTag,
    uint256 actionTier
) internal returns (address) {
    bytes32 key = keccak256(abi.encodePacked(user, campaignId));
    Attribution memory existing = attributions[key];
    
    Campaign memory campaign = campaigns[campaignId];
    uint256 windowEnd = existing.timestamp + campaign.attributionWindowSeconds;
    
    // Check if within attribution window
    if (block.timestamp > windowEnd) {
        // New attribution period
        attributions[key] = Attribution({
            influencer: msg.sender,
            timestamp: block.timestamp,
            tier: actionTier,
            campaignId: campaignId
        });
        return msg.sender;
    }
    
    // Within window - resolve conflict
    if (campaign.multiClickFairShare) {
        // Split attribution enabled
        return address(0); // Special case: split payout
    } else if (actionTier > existing.tier) {
        // Higher tier action takes precedence
        attributions[key].tier = actionTier;
        return msg.sender;
    } else {
        // Last-click within same tier
        return existing.influencer;
    }
}
```

### Multi-Click Fair Share

```solidity
// When multiClickFairShare is enabled
function processFairSharePayout(
    address[] memory influencers,
    uint256 totalUSDC
) internal {
    uint256 sharePerInfluencer = totalUSDC / influencers.length;
    
    for (uint i = 0; i < influencers.length; i++) {
        addPayout(
            influencers[i],
            sharePerInfluencer,
            ActionType.SHARED,
            0x0 // No specific attribution tag
        );
    }
}
```

### Cross-Campaign Attribution

```javascript
// Each campaign maintains independent attribution
class AttributionManager {
    constructor() {
        // Map: campaignId -> userId -> attribution
        this.attributions = new Map();
    }
    
    setAttribute(campaignId, userId, influencerId, timestamp) {
        if (!this.attributions.has(campaignId)) {
            this.attributions.set(campaignId, new Map());
        }
        
        this.attributions.get(campaignId).set(userId, {
            influencer: influencerId,
            timestamp: timestamp,
            conversions: []
        });
    }
    
    getAttribution(campaignId, userId) {
        return this.attributions.get(campaignId)?.get(userId);
    }
    
    // User can be attributed to multiple campaigns
    getUserCampaigns(userId) {
        const campaigns = [];
        for (const [campaignId, users] of this.attributions) {
            if (users.has(userId)) {
                campaigns.push(campaignId);
            }
        }
        return campaigns;
    }
}
```

## Edge Cases & Solutions

### Campaign Budget Exhaustion

```solidity
function handlePayout(uint256 usdcAmount) internal {
    require(campaign.active, "Campaign inactive");
    require(
        campaign.spentUSDC + usdcAmount <= campaign.budgetUSDC,
        "Insufficient campaign budget"
    );
    
    campaign.spentUSDC += usdcAmount;
    
    // Auto-pause if budget exhausted
    if (campaign.spentUSDC >= campaign.budgetUSDC * 95 / 100) {
        campaign.active = false;
        emit CampaignBudgetNearlyExhausted(campaignId);
    }
}
```

### Price Spike Protection

```javascript
// Dashboard warning system
function calculateRemainingImpressions(campaign) {
    const remainingUSDC = campaign.budgetUSDC - campaign.spentUSDC;
    const currentTwistPrice = getTWAPPrice();
    
    // Show both USDC and estimated TWIST
    return {
        usdcRemaining: remainingUSDC,
        estimatedTwistAtCurrentPrice: remainingUSDC / currentTwistPrice,
        priceAlert: currentTwistPrice > campaign.startPrice * 2 ?
            "TWIST price has doubled - same USDC buys fewer tokens" : null
    };
}
```

### Attribution Tag Collision

```solidity
// Prevent double-claiming
mapping(bytes32 => bool) public usedAttributionTags;

function claimConversion(
    bytes32 attributionTag,
    uint256 actionType
) external {
    bytes32 claimId = keccak256(
        abi.encodePacked(attributionTag, msg.sender, actionType)
    );
    
    require(!usedAttributionTags[claimId], "Already claimed");
    usedAttributionTags[claimId] = true;
    
    // Process payout
}
```

## Implementation Examples

### B2B SaaS Campaign (30-day window)

```javascript
const b2bCampaign = {
    name: "Enterprise CRM Trial",
    budget: 50000, // $50k USDC
    attributionWindow: 30 * 24 * 60 * 60, // 30 days
    payouts: {
        trial_start: 25,    // $25
        feature_use: 10,    // $10
        team_invite: 50,    // $50
        paid_conversion: 500 // $500
    },
    targeting: {
        cohorts: ['b2b_decision_makers', 'saas_buyers'],
        geos: ['US', 'UK', 'CA']
    }
};
```

### E-commerce Flash Sale (30-min window)

```javascript
const flashSale = {
    name: "2-Hour Sneaker Drop",
    budget: 10000, // $10k USDC
    attributionWindow: 30 * 60, // 30 minutes
    multiClickFairShare: true, // Split between multiple influencers
    payouts: {
        view: 0.10,      // $0.10
        add_to_cart: 5,  // $5
        purchase: 100    // $100
    }
};
```

### Content Subscription (7-day trial)

```javascript
const contentSub = {
    name: "Premium Content Trial",
    budget: 20000, // $20k USDC
    attributionWindow: 7 * 24 * 60 * 60, // 7 days
    payouts: {
        trial_start: 5,           // $5
        content_consumed: 2,      // $2 per piece
        trial_to_paid: 50,       // $50
        referred_friend: 25      // $25
    }
};
```

## Monitoring & Analytics

```javascript
// Real-time campaign metrics
interface CampaignMetrics {
    campaignId: string;
    budgetUSDC: number;
    spentUSDC: number;
    spentTWIST: number;
    
    conversions: {
        total: number;
        byType: Record<ActionType, number>;
        byInfluencer: Record<string, number>;
    };
    
    performance: {
        ctr: number;
        conversionRate: number;
        avgCPA: number;
        roasEstimate: number;
    };
    
    attribution: {
        uniqueInfluencers: number;
        avgAttributionDelay: number;
        multiClickSplits: number;
    };
}
```

---

*This advanced implementation ensures fair, transparent, and efficient campaign management while protecting all parties from token price volatility.*