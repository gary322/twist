# TWIST Universal Influencer Links & Codes

> How influencers can promote ANY product and earn TWIST tokens

## Overview

TWIST enables influencers to generate unique tracking links and promo codes for ANY product in the ecosystem - whether or not they have a formal partnership. This creates a permissionless influencer economy.

## Universal Link System

### Link Structure

```
Base format:
twist.to/p/{product_id}/ref/{influencer_id}

Examples:
twist.to/p/nike-store/ref/sarah
twist.to/p/coolapp/ref/cryptobro
twist.to/p/saas-tool/ref/techguru
```

### How Links Work

1. **Influencer visits** twist.to/links
2. **Searches** for any product
3. **Generates** unique link instantly
4. **Shares** with audience
5. **Earns** on every conversion

### Deep Linking

Links intelligently route based on platform:

```javascript
// Mobile Detection
if (iOS) {
    if (appInstalled) → Open in app
    else → App Store → Install → Open with attribution
}

if (Android) {
    if (appInstalled) → Open in app  
    else → Play Store → Install → Open with attribution
}

// Desktop
→ Product website with attribution cookie
```

## Promo Code System

### Automatic Code Generation

Format: `TWIST-{INFLUENCER}-{PRODUCT}-{YEAR}`

Examples:
```
TWIST-SARAH-NIKE-2024
TWIST-ALEX-SHOPIFY-2024
TWIST-MAYA-DISCORD-2024
```

### Code Usage

Codes work across ALL platforms:

**E-commerce:**
```
Checkout → Promo Code → "TWIST-SARAH-NIKE-2024"
Both user AND Sarah earn TWIST
```

**SaaS:**
```
Signup → Referral Code → "TWIST-ALEX-SAAS-2024"
Both parties rewarded
```

**Apps:**
```
Onboarding → "Have a code?" → "TWIST-MAYA-APP-2024"
Attribution tracked
```

## Influencer Dashboard

### Discovery Interface

```
┌─────────────────────────────────────────────────┐
│  Find Products to Promote                       │
│  ┌─────────────────────────────────────────┐   │
│  │ 🔍 Search products...                   │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  Popular Products:                              │
│  ┌────────────────────────────────────────┐    │
│  │ 👟 Nike Store                          │    │
│  │ 📱 CoolApp (iOS)                       │    │
│  │ 🛍️ Fashion Shop                        │    │
│  │ 🎮 Epic Game                           │    │
│  │ 💼 SaaS Tool                           │    │
│  └────────────────────────────────────────┘    │
│                                                 │
│  Categories: [All] [Apps] [Games] [Stores]     │
└─────────────────────────────────────────────────┘
```

### Link Generation

```
┌─────────────────────────────────────────────────┐
│  Generate Link for: Nike Store                  │
│                                                 │
│  Your Links:                                    │
│  ┌─────────────────────────────────────────┐   │
│  │ Standard Link:                          │   │
│  │ twist.to/p/nike-store/ref/sarah        │   │
│  │ [Copy] [QR Code] [Share]               │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ Promo Code:                             │   │
│  │ TWIST-SARAH-NIKE-2024                   │   │
│  │ [Copy] [Download Assets]                │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  Estimated Earnings:                            │
│  • Per Click: 0.5 TWIST                         │
│  • Per Signup: 5 TWIST                          │
│  • Per Purchase: 50 TWIST                       │
└─────────────────────────────────────────────────┘
```

### Performance Tracking

```
┌─────────────────────────────────────────────────┐
│  Your Performance                               │
│                                                 │
│  Total Earnings: 12,847 TWIST ($642)            │
│                                                 │
│  By Product:                                    │
│  ┌────────────────────────────────────────┐    │
│  │ Nike Store      ████████ 5,421 TWIST   │    │
│  │ CoolApp         █████ 3,234 TWIST      │    │
│  │ Fashion Shop    ███ 2,192 TWIST        │    │
│  │ SaaS Tool       ██ 1,500 TWIST         │    │
│  │ Others          █ 500 TWIST            │    │
│  └────────────────────────────────────────┘    │
│                                                 │
│  Top Performing Links:                          │
│  1. nike-store/ref/sarah - 2,341 clicks        │
│  2. coolapp/ref/sarah - 1,892 clicks           │
│  3. fashion/ref/sarah - 1,234 clicks           │
└─────────────────────────────────────────────────┘
```

## Attribution System

### Multi-Touch Attribution

```javascript
// Attribution windows per product type
const ATTRIBUTION_WINDOWS = {
  'e-commerce': 7 * 24 * 60 * 60,    // 7 days
  'saas': 30 * 24 * 60 * 60,         // 30 days
  'app': 14 * 24 * 60 * 60,          // 14 days
  'game': 3 * 24 * 60 * 60,          // 3 days
  'content': 24 * 60 * 60            // 24 hours
};
```

### Collision Resolution

When multiple influencers promote to same user:

1. **Last-click wins** (default)
2. **Multi-touch split** (if enabled by product)
3. **Highest tier action** (purchase > signup > click)

### Cross-Platform Tracking

```javascript
// User journey tracked across platforms
{
  "user": "buyer@example.com",
  "journey": [
    {
      "timestamp": "2024-01-15T10:00:00Z",
      "influencer": "sarah",
      "product": "nike-store",
      "platform": "twitter",
      "action": "link_click"
    },
    {
      "timestamp": "2024-01-15T10:05:00Z",
      "product": "nike-store",
      "platform": "web",
      "action": "browse"
    },
    {
      "timestamp": "2024-01-15T10:15:00Z",
      "product": "nike-store",
      "platform": "ios_app",
      "action": "purchase",
      "attributed_to": "sarah"
    }
  ]
}
```

## Implementation for Products

### Supporting Influencer Links

Products automatically support influencer links via Universal SDK:

```javascript
// Automatic attribution detection
const attribution = new URLSearchParams(window.location.search);
const refId = attribution.get('ref');

if (refId) {
    // Store attribution
    localStorage.setItem('twist_ref', refId);
    
    // Set cookie (30 days)
    document.cookie = `twist_ref=${refId};max-age=2592000`;
}

// SDK handles the rest automatically
```

### Supporting Promo Codes

```javascript
// E-commerce integration
function validatePromoCode(code) {
    // TWIST codes follow pattern
    const twistPattern = /^TWIST-(\w+)-(\w+)-(\d{4})$/;
    const match = code.match(twistPattern);
    
    if (match) {
        const [, influencer, product, year] = match;
        
        // Verify product matches
        if (product.toLowerCase() === PRODUCT_ID) {
            return {
                valid: true,
                influencer,
                discount: INFLUENCER_DISCOUNT, // Set by product
                attribution: influencer
            };
        }
    }
    
    return { valid: false };
}
```

## Influencer Tiers & Benefits

### Tier System

```javascript
const INFLUENCER_TIERS = {
  'bronze': {
    requirement: 'Stake 100 TWIST',
    benefits: {
      earning_multiplier: 1.0,
      priority_support: false,
      custom_codes: false
    }
  },
  'silver': {
    requirement: 'Stake 1,000 TWIST + 50 conversions',
    benefits: {
      earning_multiplier: 1.2,
      priority_support: true,
      custom_codes: true
    }
  },
  'gold': {
    requirement: 'Stake 10,000 TWIST + 500 conversions',
    benefits: {
      earning_multiplier: 1.5,
      priority_support: true,
      custom_codes: true,
      early_access: true
    }
  },
  'platinum': {
    requirement: 'Stake 100,000 TWIST + 5000 conversions',
    benefits: {
      earning_multiplier: 2.0,
      white_glove_support: true,
      custom_campaigns: true,
      revenue_share: true
    }
  }
};
```

## Smart Link Features

### A/B Testing

Influencers can test different approaches:

```
twist.to/p/nike-store/ref/sarah/a → Landing page A
twist.to/p/nike-store/ref/sarah/b → Landing page B

Dashboard shows conversion rates for each
```

### Custom Parameters

```
twist.to/p/product/ref/sarah?campaign=youtube&video=abc123

Tracks:
- Traffic source
- Specific content
- Campaign performance
```

### QR Codes

Every link auto-generates QR code:
- High-res download
- Custom branding options
- Tracking built-in

## Best Practices for Influencers

### Content Integration

1. **Natural Mentions**
   ```
   "I've been earning TWIST tokens just by using CoolApp! 
   Here's my link if you want to try: twist.to/p/coolapp/ref/sarah"
   ```

2. **Value Proposition**
   ```
   "Use code TWIST-SARAH-NIKE-2024 for 10% off + we both earn tokens!"
   ```

3. **Transparency**
   ```
   "Full disclosure: We both earn TWIST tokens when you use my link"
   ```

### Platform Strategies

**YouTube:**
- Links in description
- QR codes in video
- Verbal code callouts

**Instagram:**
- Link in bio
- Story swipe-ups
- QR code posts

**Twitter:**
- Thread with benefits
- Pinned tweet
- Regular reminders

**TikTok:**
- Link in bio
- Comment with code
- Demo videos

## API for Developers

### Generate Links Programmatically

```javascript
// Generate influencer link
POST /api/links/generate
{
  "product_id": "nike-store",
  "influencer_id": "sarah",
  "campaign": "spring-sale"
}

Response:
{
  "link": "twist.to/p/nike-store/ref/sarah",
  "code": "TWIST-SARAH-NIKE-2024",
  "qr_code": "data:image/png;base64,...",
  "attribution_window": 604800
}
```

### Track Performance

```javascript
// Get influencer stats
GET /api/influencers/{id}/stats

Response:
{
  "total_earned": 12847,
  "total_clicks": 45234,
  "total_conversions": 892,
  "by_product": {
    "nike-store": {
      "clicks": 23421,
      "conversions": 445,
      "earned": 5421
    }
  }
}
```

## Success Stories

### Case Study: Fashion Influencer

```
Sarah (50k followers):
- Promoted 15 different brands
- Generated 2,341 purchases
- Earned 45,234 TWIST ($2,261)
- No formal partnerships needed
```

### Case Study: Tech Reviewer

```
Alex (100k subscribers):
- Reviewed 30 apps/tools
- 5,892 installs generated
- Earned 89,234 TWIST ($4,461)
- Products approached him after success
```

---

*TWIST Universal Links - Empowering every influencer to monetize any product recommendation!*