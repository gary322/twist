# TWIST Product Integration Guide

> Enable ANY product to reward users with TWIST tokens using our Universal SDK

## Overview

TWIST's Universal SDK allows any product - mobile apps, websites, games, SaaS platforms, e-commerce stores - to reward users with tokens for engagement. Integration takes minutes, not days.

## Core Concepts

### Product Registration

Every product gets:
- **Product ID**: Unique identifier (maps to Site PDA on-chain)
- **API Key**: Authentication key (HMAC for edge workers)

### Universal Actions

We automatically track and reward:
- User signup/login
- Purchases/subscriptions
- Feature usage
- Content sharing
- Friend referrals
- Daily activity

### Email-Based Identity

- Users identified by email across all platforms
- No blockchain knowledge required
- Tokens accumulate automatically
- Users claim later with any Solana wallet

## Integration by Platform

### Web Applications

```html
<!-- One line in your HTML -->
<script src="https://twist.io/pixel.js" 
        data-product-id="your-product"
        data-api-key="twist_pk_xyz">
</script>
```

### iOS Apps

```
1. Connect via App Store Connect OAuth
2. Provide App Store Shared Secret
3. We handle everything via Server Notifications
```

### Android Apps

```
1. Connect via Google Play Console
2. Upload service account JSON
3. Automatic tracking via Play Developer API
```

### E-commerce Platforms

- **Shopify**: Install TWIST app from store
- **WooCommerce**: Install TWIST plugin
- **Magento**: Add TWIST extension
- **Custom**: Use webhook API

### Games & Communities

- **Unity**: Import TWIST package
- **Discord**: Add TWIST bot
- **Telegram**: Add TWIST bot
- **Roblox**: Add TWIST module

## Feature-Based Rewards

### Automatic Detection

The SDK automatically detects and rewards common actions:

```javascript
// E-commerce
- Product viewed
- Added to cart
- Purchase completed
- Review posted
- Referral link shared

// SaaS
- Account created
- Feature activated  
- Subscription upgraded
- File uploaded
- Team member invited

// Gaming
- Game started
- Level completed
- Achievement unlocked
- In-app purchase
- Friend challenged

// Social
- Content created
- Comment posted
- Reaction given
- Content shared
- User followed
```

### Custom Actions

Define product-specific actions:

```javascript
// Via Dashboard
twist.io/products → Your Product → Custom Actions

// Via API
POST /api/products/{id}/actions
{
  "complete_tutorial": 25,
  "use_premium_feature": 10,
  "30_day_streak": 100
}

// Track in code
twist.track('complete_tutorial');
```

## User Experience

### What Users See

1. **Notification** (optional)
   ```
   "You earned 50 TWIST for your purchase! 🎉"
   ```

2. **In-Product Widget** (optional)
   ```
   [TWIST Balance: 1,234 🌀]
   ```

3. **Email Summary** (optional)
   ```
   Weekly TWIST Earnings:
   - Purchases: 150 TWIST
   - Daily logins: 14 TWIST  
   - Referrals: 75 TWIST
   Total: 239 TWIST
   ```

### Claiming Tokens

Users can claim accumulated tokens by:
1. Visiting twist.io
2. Signing in with email
3. Connecting any Solana wallet
4. Tokens transfer instantly

## Influencer Integration

### Automatic Code Generation

Influencers can generate codes for ANY product:

```
1. Influencer visits: twist.to/codes
2. Searches for your product
3. Gets unique code: TWIST-SARAH-YOURPRODUCT-2024
4. Shares with audience
5. Both parties earn when code is used
```

### Attribution Tracking

- Last-click attribution within window
- Configurable attribution windows (1-90 days)
- Multi-touch attribution options
- Automatic influencer discovery

## Analytics Dashboard

### Real-Time Metrics

```
Active Users: 12,453
Tokens Distributed Today: 45,234 TWIST
Top Actions: Purchase (42%), Share (28%), Login (30%)
User Retention: 67% (7-day)
Viral Coefficient: 1.3
```

### User Insights

```
Cohort Analysis
Lifetime Value
Feature Adoption
Referral Networks
Geographic Distribution
```

## Best Practices

### Reward Strategy

1. **Balance rewards** - Not too high (unsustainable) or too low (not motivating)
2. **Reward quality** - Focus on valuable actions, not just volume
3. **Progressive rewards** - Increase rewards for continued engagement
4. **Special campaigns** - 2x rewards for product launches

### User Communication

1. **Onboarding** - Explain TWIST rewards during signup
2. **Progress** - Show earnings in real-time
3. **Milestones** - Celebrate achievement unlocks
4. **Education** - Help users understand token value

### Fraud Prevention

Built-in protections:
- Rate limiting per user
- Behavioral analysis
- Device fingerprinting
- Economic caps (κ system)

## Advanced Features

### Batch Operations

```javascript
// Bulk reward distribution
POST /api/rewards/batch
{
  "rewards": [
    {"email": "user1@example.com", "amount": 100, "reason": "contest_winner"},
    {"email": "user2@example.com", "amount": 50, "reason": "referral_bonus"}
  ]
}
```

### Staking Pools

Create product-specific staking pools:
- Users stake TWIST tokens
- Earn additional rewards
- Increase engagement
- Build community

### Brand Tokens

Advanced: Create your own token backed by TWIST:
- Custom token symbol
- Controlled supply
- Exchange rate to TWIST
- Enhanced loyalty program

## API Reference

### Core Endpoints

```javascript
// Get product stats
GET /api/products/{product_id}/stats

// Configure rewards
PUT /api/products/{product_id}/rewards

// Track custom event
POST /api/events
{
  "product_id": "your-product",
  "email": "user@example.com",
  "event": "custom_action",
  "metadata": {}
}

// Query user balance
GET /api/users/{email}/balance

// Webhook endpoint
POST /api/webhooks/track
Headers: {
  'X-Product-ID': 'your-product',
  'X-API-Key': 'twist_pk_xyz',
  'X-Signature': 'hmac_sha256'
}
```

## Support & Resources

- **Documentation**: docs.twist.io
- **Dashboard**: dashboard.twist.io  
- **Support**: support@twist.io
- **Discord**: discord.gg/twist

---

*Start rewarding your users in minutes with TWIST Universal SDK!*