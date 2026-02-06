# TWIST Universal SDK - Complete Implementation Guide

> One SDK for ALL platforms: iOS, Android, Web, Shopify, Discord, Telegram, Unity, and more

## Overview

The TWIST Universal SDK enables any product to reward users with TWIST tokens for engagement, with near-zero integration effort. The same simple setup works across all platforms.

## Core Setup: Product ID + API Key

```
Product ID: your-product-name    → Maps to Site PDA on-chain
API Key: twist_pk_abc123xyz      → HMAC key for Edge Workers
```

## Quick Start by Platform

### Web/SaaS - One Line Integration

```html
<!-- Universal pixel (alias for ahee_no_code_widget) -->
<script src="https://twist.io/pixel.js" 
        data-product-id="your-product-name"
        data-api-key="twist_pk_abc123xyz">
</script>
```

**That's it!** The SDK automatically:
- Detects user emails from your auth system
- Tracks standard actions (login, purchase, share)
- Rewards users without them needing wallets
- Maps emails to TWIST wallets behind the scenes

### iOS App - 2 Minute Setup

**Via App Store Connect:**
```
1. Login to twist.io/products
2. Click "Connect iOS App"
3. OAuth with App Store Connect
4. Paste App Store Shared Secret (for receipt verification)
5. Done!
```

**What happens:**
- We receive App Store Server Notifications
- Track purchases, subscriptions, reviews automatically
- Email always available from receipts
- Zero code in your app

**Alternative Manual Setup:**
```xml
<!-- Info.plist -->
<key>TwistProductID</key>
<string>your-product-name</string>
<key>TwistAPIKey</key>
<string>twist_pk_abc123xyz</string>
```

### Android App - 3 Minute Setup

**Via Google Play Console:**
```
1. Login to twist.io/products
2. Click "Connect Android App"
3. Upload Google Play service-account JSON key
4. Done!
```

**Edge cases handled:**
- Family accounts may have masked emails
- Fallback to Play Services account_email
- All handled automatically

**Alternative Manual Setup:**
```xml
<!-- AndroidManifest.xml -->
<meta-data android:name="com.twist.product_id" 
           android:value="your-product-name" />
<meta-data android:name="com.twist.api_key" 
           android:value="twist_pk_abc123xyz" />
```

### Shopify Store - One Click

```
1. Visit Shopify App Store
2. Search "TWIST Rewards"
3. Click "Add app"
4. Done!
```

Automatically tracks:
- Customer emails
- Purchases, cart adds, reviews
- Product shares
- Referrals

### Discord Bot

```
1. Add @TwistRewardsBot to your server
2. Run: /setup your-product-name twist_pk_abc123xyz
3. Done!
```

If user email not available:
- Bot sends one-tap link
- User connects email once
- Then automatic tracking

### Telegram Bot

```
1. Add @TwistRewardsBot to your channel
2. Run: /setup your-product-name twist_pk_abc123xyz
3. Done!
```

### Unity Game

```csharp
// Package Manager
// Add: https://packages.twist.io/unity
// Auto-configures from project settings
```

### WordPress

```
1. Install "TWIST Rewards" plugin
2. Enter Product ID and API Key
3. Done!
```

## How It Works - Universal Architecture

### 1. Email-Based Identity

The SDK automatically detects user emails across all platforms:

```javascript
// Web Detection Chain
const emailDetectors = [
  // Auth Systems
  () => Auth0.user?.email,
  () => Firebase.auth().currentUser?.email,
  () => Supabase.auth.user()?.email,
  
  // E-commerce
  () => Shopify.customer?.email,
  () => WooCommerce.customer?.email,
  
  // Storage
  () => localStorage.getItem('userEmail'),
  () => sessionStorage.getItem('email'),
  
  // DOM
  () => document.querySelector('[data-user-email]')?.dataset.userEmail,
  () => document.querySelector('meta[name="user-email"]')?.content,
  
  // Frameworks
  () => window.__NEXT_DATA__?.props?.user?.email,
  () => window.__NUXT__?.state?.auth?.user?.email
];

// Mobile Detection
iOS: App Store receipt email (always present)
Android: Google account or Play receipt email

// Platform Detection
Discord: User profile email or one-tap link
Shopify: Customer object email
Stripe: Payment email
```

### 2. Automatic Action Tracking

The SDK tracks these actions with ZERO configuration:

```javascript
const UNIVERSAL_ACTIONS = {
  // Authentication
  'signup': 'New user registration',
  'login': 'User session start',
  
  // Commerce
  'purchase': 'Payment completed',
  'add_to_cart': 'Product added to cart',
  'subscribe': 'Subscription started',
  
  // Engagement
  'feature_use': 'Key feature activated',
  'content_view': 'Content consumed',
  'daily_active': 'Daily visit',
  'streak_7': '7-day activity streak',
  
  // Social
  'share': 'Content shared',
  'refer': 'Friend invited',
  'review': 'Review posted',
  
  // Platform Specific
  'ios_purchase': 'In-app purchase',
  'android_purchase': 'Play Store purchase',
  'discord_active': 'Discord participation',
  'game_achievement': 'Achievement unlocked'
};
```

### 3. Edge Worker Architecture

All events flow through edge_feature_pipe_worker:

```javascript
// Edge Worker Routes (edge_feature_pipe_worker)
const routes = {
  '/webhooks/shopify': handleShopifyWebhook,
  '/webhooks/stripe': handleStripeWebhook,
  '/webhooks/apple': handleAppleWebhook,
  '/webhooks/google': handleGoogleWebhook,
  '/webhooks/discord': handleDiscordWebhook,
  '/pixel/track': handlePixelEvent
};

// All include:
// - HMAC verification using api_key
// - Rate limiting (429 protection)
// - Canonical action mapping
// - Automatic email → wallet resolution
```

### 4. Wallet Safety

**Users don't need crypto wallets!**

```javascript
// Behind the scenes:
1. User performs action (purchase, share, etc.)
2. SDK detects email
3. Edge worker maps email → Site PDA wallet
4. campaign_reward_router mints tokens
5. Tokens accumulate in their account
6. Later, user can connect ANY Solana wallet to claim
```

## Universal Features

### Automatic Reward Distribution

```javascript
// Default reward amounts (configurable)
const DEFAULT_REWARDS = {
  'signup': 10,
  'login': 1,
  'purchase': 50,
  'share': 5,
  'refer': 25,
  'review': 15,
  'daily_active': 2,
  'feature_use': 3
};

// Override via dashboard or API
POST /api/products/{product_id}/rewards
{
  "purchase": 100,
  "premium_feature": 25
}
```

### Cross-Platform User Tracking

```javascript
// One user, many products
{
  "email": "user@example.com",
  "total_earned": 12847,
  "products": {
    "cool-ios-app": {
      "platform": "ios",
      "earned": 5421,
      "last_active": "2024-01-15"
    },
    "web-saas": {
      "platform": "web",
      "earned": 3234,
      "last_active": "2024-01-14"
    },
    "discord-community": {
      "platform": "discord",
      "earned": 4192,
      "last_active": "2024-01-15"
    }
  }
}
```

### Influencer Integration

**Automatic code generation for ANY product:**

```javascript
// Influencer requests code
GET /api/influencer/code?product=nike-store
Returns: TWIST-SARAH-NIKE-2024

// Automatic tracking
- User uses code at checkout
- Both user and influencer earn
- Works across ALL platforms
```

### Universal Links

```
twist.to/p/{product}              → Product page
twist.to/p/{product}/ref/{user}   → Referral link
twist.to/p/{product}/share        → Share portal

// Deep linking for mobile
twist.to/p/coolapp → Opens app if installed
                   → App store if not
                   → Web fallback always available
```

## Visual Dashboard

**Same dashboard for ALL products:**

```
┌─────────────────────────────────────────────┐
│  TWIST Universal Dashboard                  │
│                                             │
│  Your Products:                             │
│  ┌────────────────────────────────────┐     │
│  │ 📱 CoolApp (iOS)                   │     │
│  │    Status: ✅ Connected             │     │
│  │    Users: 45,231                   │     │
│  │    Earned Today: 8,924 TWIST       │     │
│  │    [Configure Rewards] [Analytics] │     │
│  └────────────────────────────────────┘     │
│                                             │
│  ┌────────────────────────────────────┐     │
│  │ 🛍️ MyStore (Shopify)               │     │
│  │    Status: ✅ App Active            │     │
│  │    Users: 12,421                   │     │
│  │    Earned Today: 3,234 TWIST       │     │
│  │    [Configure Rewards] [Analytics] │     │
│  └────────────────────────────────────┘     │
│                                             │
│  ┌────────────────────────────────────┐     │
│  │ 🌐 SaaSProduct (Web)               │     │
│  │    Status: ✅ Pixel Active          │     │
│  │    Users: 8,234                    │     │
│  │    Earned Today: 2,123 TWIST       │     │
│  │    [Configure Rewards] [Analytics] │     │
│  └────────────────────────────────────┘     │
│                                             │
│  [+ Add Another Product]                    │
└─────────────────────────────────────────────┘
```

## Advanced Configuration

### Custom Events

```javascript
// Define custom events for your product
POST /api/products/{product_id}/events
{
  "custom_events": {
    "complete_onboarding": 50,
    "use_ai_feature": 20,
    "create_team": 30,
    "export_data": 5
  }
}

// Track via SDK
twist.track('complete_onboarding', { 
  user_email: 'user@example.com' 
});
```

### Webhook Configuration

```javascript
// Send your own webhooks
POST https://twist.io/api/webhook
Headers: {
  'X-Product-ID': 'your-product',
  'X-API-Key': 'twist_pk_abc123xyz',
  'X-Signature': 'hmac_signature'
}
Body: {
  "email": "user@example.com",
  "action": "custom_action",
  "metadata": { ... }
}
```

### Feature-Based Rewards

```javascript
// Reward based on feature usage
const featureRewards = {
  'basic_features': {
    'create_document': 1,
    'save_document': 0.5
  },
  'premium_features': {
    'use_ai_assistant': 10,
    'advanced_export': 5
  },
  'social_features': {
    'share_document': 3,
    'collaborate': 5
  }
};

// SDK tracks automatically based on:
// - Button clicks
// - API calls  
// - Route changes
// - Feature flags
```

## Implementation Examples

### SaaS Product (Next.js)

```javascript
// pages/_app.js
import Script from 'next/script'

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Script 
        src="https://twist.io/pixel.js"
        data-product-id="my-saas"
        data-api-key="twist_pk_abc123xyz"
        strategy="afterInteractive"
      />
      <Component {...pageProps} />
    </>
  )
}
```

### E-commerce (Custom)

```html
<!-- Before </body> -->
<script src="https://twist.io/pixel.js" 
        data-product-id="my-store"
        data-api-key="twist_pk_abc123xyz">
</script>

<!-- Help SDK detect purchase -->
<div data-purchase-complete="true" 
     data-amount="99.99"
     data-user-email="<?= $customer->email ?>">
</div>
```

### Mobile Game (Unity)

```csharp
// Automatic after package install
// Tracks: playtime, achievements, purchases, ads watched

// Optional: Custom events
TwistSDK.Track("boss_defeated", new {
    boss_name = "Dragon",
    difficulty = "hard"
});
```

## Troubleshooting

### Email Detection Failed?

```html
<!-- Option 1: Data attribute -->
<div data-user-email="user@example.com"></div>

<!-- Option 2: Meta tag -->
<meta name="user-email" content="user@example.com">

<!-- Option 3: JavaScript -->
<script>
  window.TWIST?.identify('user@example.com');
</script>

<!-- Option 4: Backend webhook -->
POST to your webhook endpoint
```

### Testing Integration

```javascript
// Enable debug mode
window.TWIST_DEBUG = true;

// Console will show:
TWIST: Email detected: user@example.com
TWIST: Action tracked: purchase
TWIST: Reward pending: 50 TWIST
TWIST: Wallet mapped: 4Xm9...3nB2
```

## Security & Privacy

- **No private keys** - SDK never handles wallet keys
- **Email hashing** - Emails hashed before transmission
- **HMAC authentication** - All requests verified
- **Rate limiting** - Automatic 429 protection
- **No PII storage** - Only hashed identifiers

## FAQ

**Q: Do users need crypto wallets?**
A: No! Tokens accumulate with their email. They can claim later with any wallet.

**Q: What if users have multiple emails?**
A: Each email gets its own balance. Users can merge them later in the dashboard.

**Q: How fast do users receive tokens?**
A: Instantly! Tokens appear in real-time as actions occur.

**Q: Can I customize reward amounts?**
A: Yes! Configure per-action rewards in your dashboard.

**Q: What prevents gaming the system?**
A: Built-in fraud detection, rate limiting, and behavioral analysis.

---

*The TWIST Universal SDK - making Web3 rewards as simple as adding Google Analytics!*