# TWIST Attribution Flow - Clarified Implementation

> Based on the latest clarifications, this document shows exactly how attribution works in TWIST

## Core Attribution Mechanics

### 1. How Attribution is Tracked

When a user clicks an influencer's link, the flow works as follows:

```
User clicks: https://fashion.com/summer?twid=emma_style
                                           ↓
VAU includes attribution_tag: 'emma_style'
                                           ↓
Campaign Reward Router creates/checks Attribution PDA
Key: (userWallet, campaignId)
                                           ↓
All subsequent actions credit @emma_style
```

### 2. Attribution PDA Structure

```javascript
// Attribution stored on-chain
const attributionPDA = {
    key: deriveAddress(['attribution', userWallet, campaignId]),
    data: {
        influencer: 'emma_style',
        firstTouch: 1704832122000,
        expiresAt: 1704833922000,  // firstTouch + TTL
        campaign: 'summer_2024',
        user: 'FH3n...9xKp'
    }
};

// Campaign configuration
const campaign = {
    id: 'summer_2024',
    attribution_ttl_seconds: 1800,  // 30 min default
    // Can be set up to 90 days (7776000 seconds)
};
```

### 3. Last-Click-Wins Logic

Within a campaign's TTL window:

```javascript
// User clicks @emma_style link at 10:00 AM
processAttribution({
    user: 'FH3n...9xKp',
    campaign: 'summer_2024',
    influencer: 'emma_style',
    timestamp: '10:00 AM'
});

// User clicks @fashion_guru link at 10:15 AM (within 30 min)
processAttribution({
    user: 'FH3n...9xKp',
    campaign: 'summer_2024',
    influencer: 'fashion_guru',  // OVERWRITES emma_style
    timestamp: '10:15 AM'
});

// Purchase at 10:20 AM credits @fashion_guru (last click)
```

### 4. Cross-Campaign Independence

A user can be attributed to different influencers across campaigns:

```javascript
// User's attribution state
const userAttributions = [
    {
        campaign: 'nike_running',
        influencer: '@fitness_jane',
        expiresAt: '2024-01-15 14:00'
    },
    {
        campaign: 'adidas_soccer',
        influencer: '@sports_mike',
        expiresAt: '2024-01-15 15:30'
    },
    {
        campaign: 'summer_fashion',
        influencer: '@emma_style',
        expiresAt: '2024-01-15 16:00'
    }
];
// All three influencers can earn simultaneously
```

## Event Tracking for Dashboards

### Campaign VAU Processed Event

```javascript
emit('CampaignVAUProcessed', {
    campaign: 'summer_2024',
    influencer: 'emma_style',
    user: 'FH3n...9xKp',
    feature: 'product_360_view',  // Which feature was used
    timestamp: 1704832122000,
    deviceTrust: 'trusted'
});
```

### Conversion Paid Event

```javascript
emit('ConversionPaid', {
    campaign: 'summer_2024',
    influencer: 'emma_style',
    user: 'FH3n...9xKp',
    action: 'purchase',
    product: 'SKU-12345',
    amountUSDC: 50.00,
    amountTWIST: 1041.67,  // At current price
    timestamp: 1704832722000
});
```

## Dashboard Aggregation

Dashboards can now answer: "Which feature-area was used by which referrer?"

```javascript
// Influencer Analytics Query
const getInfluencerFeatureUsage = async (influencerId, campaignId) => {
    const events = await queryEvents({
        type: 'CampaignVAUProcessed',
        influencer: influencerId,
        campaign: campaignId
    });
    
    // Aggregate by feature
    return {
        '360_view': events.filter(e => e.feature === 'product_360_view').length,
        'size_guide': events.filter(e => e.feature === 'size_guide').length,
        'reviews': events.filter(e => e.feature === 'reviews').length,
        'add_to_cart': events.filter(e => e.feature === 'add_to_cart').length
    };
};
```

## Wallet Integration Clarification

### Extension Architecture

```javascript
class TwistExtension {
    constructor() {
        // Extension capabilities
        this.capabilities = {
            viewBalance: true,      // Via wallet.getBalance()
            signVAU: true,         // Signs attention units
            displayDecay: true,    // Shows balance animation
            
            // NEVER does these
            holdKeys: false,       // No private keys
            signTransactions: false, // Wallet does this
            storeTokens: false     // Wallet custody only
        };
    }
    
    // Example: User wants to stake on influencer
    async stakeOnInfluencer(influencerId, amount) {
        // 1. Extension builds transaction
        const tx = buildStakeTransaction(influencerId, amount);
        
        // 2. Pass to wallet - native modal pops
        const signed = await window.solana.signTransaction(tx);
        
        // 3. Extension just shows result
        this.showNotification(`Staked ${amount} TWIST on ${influencerId}`);
        this.updateBalance(); // Display new balance/decay
    }
}
```

## Influencer Link Generation

### Creating Links for Any Product

```javascript
// Influencer dashboard or API call
const createLink = async () => {
    const response = await fetch('/v1/referral/link', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${influencerToken}` },
        body: JSON.stringify({
            campaignId: 'summer_2024',  // Optional - can be open
            url: 'https://anywebsite.com/any-product',
            customTracking: {
                source: 'instagram',
                post: 'reel_123'
            }
        })
    });
    
    const { signedUrl } = await response.json();
    // Returns: https://anywebsite.com/any-product?twid=signed_hash_xyz
    
    // Router validates hash - can't be forged or tampered
    return signedUrl;
};
```

### No Whitelist Required

- Influencers can link to ANY public URL
- Service signs the parameters creating tamper-proof hash
- Router validates signature on every VAU
- Works for integrated merchants AND open web

## Summary

1. **Attribution** is tracked via `twid` parameter creating PDAs per (user, campaign)
2. **TTL windows** are configurable (30 min to 90 days) determining attribution duration
3. **Last-click-wins** within a campaign, but users can be attributed across multiple campaigns
4. **Extension** only views/signs - all tokens stay in user's actual wallet
5. **Influencers** can create signed links for any URL without restrictions
6. **Events** enable detailed analytics of which features were used by which referrals

This implementation ensures clear attribution, wallet security, and maximum flexibility for influencers.