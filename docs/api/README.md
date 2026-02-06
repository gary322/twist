# TWIST Influencer API Documentation

## Overview

The TWIST Influencer API provides comprehensive endpoints for managing influencer staking, user portfolios, content generation, and analytics. This API powers the TWIST platform's influencer ecosystem.

**Base URL**: `https://api.twist.to/v1`

## Authentication

All API requests require authentication using a Bearer token obtained through wallet connection.

```http
Authorization: Bearer <token>
```

### Obtaining a Token

```http
POST /auth/connect
Content-Type: application/json

{
  "walletAddress": "DemoWa11etAddress...",
  "signature": "0x...",
  "message": "Connect to TWIST Staking\nTimestamp: 1234567890"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 86400
}
```

## Endpoints

### 1. Influencer Search & Discovery

#### Search Influencers

Search and filter influencers with various criteria.

```http
GET /influencers/search
```

**Query Parameters:**
- `q` (string, optional): Search query for username, display name, or bio
- `sort` (string, optional): Sort by `totalStaked`, `stakerCount`, `apy`, or `tier`
- `limit` (number, optional): Number of results (default: 20, max: 100)
- `offset` (number, optional): Pagination offset (default: 0)
- `minStaked` (number, optional): Minimum staked amount in TWIST
- `minApy` (number, optional): Minimum APY percentage
- `tiers` (string, optional): Comma-separated list of tiers (BRONZE,SILVER,GOLD,PLATINUM)

**Example Request:**
```http
GET /influencers/search?q=crypto&sort=apy&limit=10&minApy=15&tiers=GOLD,PLATINUM
```

**Response:**
```json
[
  {
    "id": "inf-123",
    "username": "crypto_master",
    "displayName": "Crypto Master",
    "avatar": "https://...",
    "tier": "PLATINUM",
    "verified": true,
    "bio": "Leading crypto influencer...",
    "poolAddress": "STAKxxxxx...",
    "metrics": {
      "totalStaked": "100000000000000",
      "stakerCount": 150,
      "revenueSharePercent": 20,
      "apy": 25.5,
      "totalRewardsDistributed": "5000000000000",
      "stakingTrend": "up"
    },
    "recentStakers": [
      {
        "userId": "usr-abc...",
        "amount": "10000000000000",
        "stakedAt": "2024-01-15T10:30:00Z"
      }
    ]
  }
]
```

#### Get Influencer Staking Details

Get detailed staking information for a specific influencer.

```http
GET /influencers/{influencerId}/staking
```

**Response:**
```json
{
  "influencer": {
    "id": "inf-123",
    "username": "crypto_master",
    "displayName": "Crypto Master",
    "avatar": "https://...",
    "tier": "PLATINUM",
    "bio": "Leading crypto influencer...",
    "verified": true
  },
  "pool": {
    "address": "STAKxxxxx...",
    "totalStaked": "100000000000000",
    "stakerCount": 150,
    "revenueSharePercent": 20,
    "minStake": "1000000000000",
    "createdAt": "2024-01-01T00:00:00Z"
  },
  "metrics": {
    "totalStaked": "100000000000000",
    "stakerCount": 150,
    "totalRewardsDistributed": "5000000000000",
    "pendingRewards": "250000000000",
    "apy": 25.5,
    "lastRewardDistribution": "2024-01-15T00:00:00Z"
  },
  "topStakers": [
    {
      "rank": 1,
      "userId": "usr-abc...",
      "amount": "10000000000000",
      "percentage": "10.00"
    }
  ],
  "recentActivity": [
    {
      "type": "stake",
      "userId": "usr-xyz...",
      "amount": "5000000000000",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ],
  "historicalApy": [
    {
      "date": "2024-01-15",
      "apy": 25.5
    }
  ]
}
```

### 2. Staking Operations

#### Stake on Influencer

Stake TWIST tokens on an influencer.

```http
POST /staking/stake
Content-Type: application/json

{
  "influencerId": "inf-123",
  "amount": "10000000000000",
  "wallet": "DemoWa11etAddress..."
}
```

**Response:**
```json
{
  "success": true,
  "transactionId": "5xKZn...",
  "poolAddress": "STAKxxxxx...",
  "newTotalStaked": "110000000000000",
  "estimatedApy": 25.5
}
```

#### Unstake Tokens

Withdraw staked tokens from an influencer pool.

```http
POST /staking/unstake
Content-Type: application/json

{
  "influencerId": "inf-123",
  "amount": "5000000000000",
  "wallet": "DemoWa11etAddress..."
}
```

**Response:**
```json
{
  "success": true,
  "transactionId": "3yBmn...",
  "remainingStake": "5000000000000"
}
```

#### Claim Rewards

Claim pending staking rewards.

```http
POST /staking/claim
Content-Type: application/json

{
  "influencerId": "inf-123",
  "wallet": "DemoWa11etAddress..."
}
```

**Response:**
```json
{
  "success": true,
  "transactionId": "7zPqr...",
  "claimedAmount": "250000000000",
  "totalClaimed": "1250000000000"
}
```

### 3. User Portfolio

#### Get User Stakes

Get all active stakes for the authenticated user.

```http
GET /user/stakes
```

**Response:**
```json
[
  {
    "influencer": {
      "id": "inf-123",
      "username": "crypto_master",
      "displayName": "Crypto Master",
      "avatar": "https://...",
      "tier": "PLATINUM"
    },
    "stake": {
      "amount": "10000000000000",
      "stakedAt": "2024-01-01T00:00:00Z",
      "pendingRewards": "250000000000",
      "totalClaimed": "1000000000000",
      "apy": 25.5
    },
    "pool": {
      "totalStaked": "100000000000000",
      "stakerCount": 150,
      "revenueSharePercent": 20
    }
  }
]
```

#### Get Portfolio Statistics

Get aggregated portfolio statistics.

```http
GET /user/portfolio/stats
```

**Response:**
```json
{
  "totalStaked": "50000000000000",
  "totalPendingRewards": "1250000000000",
  "totalClaimed": "5000000000000",
  "activeStakes": 5,
  "averageApy": 22.3,
  "portfolioValue": "51250000000000"
}
```

### 4. Referral Links & Analytics

#### Generate Referral Link

Create a custom referral link with optional promo code.

```http
POST /links/generate
Content-Type: application/json

{
  "productId": "twist-premium",
  "promoCode": "CRYPTO20",
  "customPath": "premium-offer"
}
```

**Response:**
```json
{
  "id": "link-abc123",
  "linkCode": "CM7X9K",
  "fullUrl": "https://twist.to/r/CM7X9K",
  "qrCodeUrl": "https://api.twist.to/qr/CM7X9K.png",
  "promoCode": "CRYPTO20",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

#### Get Link Analytics

Get click and conversion analytics for a referral link.

```http
GET /links/{linkCode}/analytics?days=30
```

**Response:**
```json
{
  "linkCode": "CM7X9K",
  "metrics": {
    "clicks": 1250,
    "uniqueClicks": 890,
    "conversions": 45,
    "conversionRate": 5.06,
    "revenue": "45000.00",
    "commission": "4500.00"
  },
  "clicksByDay": [
    {
      "date": "2024-01-15",
      "clicks": 125,
      "conversions": 5
    }
  ],
  "topReferrers": [
    {
      "source": "twitter.com",
      "clicks": 450,
      "conversions": 20
    }
  ],
  "deviceBreakdown": {
    "mobile": 60,
    "desktop": 35,
    "tablet": 5
  }
}
```

### 5. Content Generation

#### Get Content Templates

Get available content templates for marketing materials.

```http
GET /content/templates?type=banner&category=staking
```

**Response:**
```json
[
  {
    "id": "tpl-123",
    "name": "Staking Announcement Banner",
    "type": "banner",
    "category": "staking",
    "dimensions": {
      "width": 1200,
      "height": 630
    },
    "formats": ["png", "jpg", "svg"],
    "variables": [
      {
        "name": "headline",
        "type": "text",
        "default": "Stake on me and earn {apy}% APY!",
        "required": true
      }
    ],
    "previewUrl": "https://...",
    "downloadUrl": "https://..."
  }
]
```

#### Generate Content

Generate customized marketing content from a template.

```http
POST /content/generate
Content-Type: application/json

{
  "templateId": "tpl-123",
  "customization": {
    "text": {
      "headline": "Join my staking pool for 25% APY!"
    },
    "colors": {
      "primaryColor": "#FF6B6B"
    }
  }
}
```

**Response:**
```json
{
  "id": "gen-456",
  "type": "banner",
  "urls": {
    "twitter": "https://cdn.twist.to/content/..._twitter.png",
    "facebook": "https://cdn.twist.to/content/..._facebook.png",
    "instagram": "https://cdn.twist.to/content/..._instagram.png"
  },
  "downloadUrl": "https://api.twist.to/content/download/gen-456.zip"
}
```

### 6. Notifications

#### Get Notifications

Get notifications for the authenticated user.

```http
GET /notifications?unreadOnly=true&limit=20
```

**Response:**
```json
{
  "notifications": [
    {
      "id": "notif-789",
      "type": "new_stake",
      "title": "🎉 New Stake!",
      "message": "John Doe just staked 1,000 TWIST on you!",
      "data": {
        "stakerId": "usr-xyz",
        "amount": "1000000000000"
      },
      "read": false,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 15,
  "unreadCount": 12
}
```

#### Mark Notifications as Read

Mark specific notification or all notifications as read.

```http
PUT /notifications/{notificationId}/read
```

```http
PUT /notifications/read-all
```

### 7. Payouts

#### Get Payout History

Get payout history for an influencer or staker.

```http
GET /payouts/history?type=influencer&limit=10
```

**Response:**
```json
{
  "items": [
    {
      "id": "pay-123",
      "amount": 500.25,
      "currency": "TWIST",
      "type": "influencer",
      "processedAt": "2024-01-15T00:00:00Z",
      "transactionId": "9xKmN...",
      "period": {
        "start": "2024-01-08",
        "end": "2024-01-14"
      },
      "metadata": {
        "conversions": 125,
        "revenue": 12500.00,
        "commissionRate": 0.1
      }
    }
  ],
  "total": 52,
  "limit": 10,
  "offset": 0
}
```

#### Get Payout Statistics

Get aggregated payout statistics.

```http
GET /payouts/stats
```

**Response:**
```json
{
  "totalEarned": 25000.50,
  "totalDistributedToStakers": 5000.10,
  "pendingAmount": 500.25,
  "lastPayoutDate": "2024-01-15T00:00:00Z",
  "lastPayoutAmount": 500.25,
  "averageWeeklyEarnings": 625.50
}
```

## WebSocket Events

Connect to real-time updates via WebSocket.

**Endpoint**: `wss://api.twist.to/staking`

### Authentication

```javascript
const socket = io('wss://api.twist.to/staking', {
  auth: {
    token: 'Bearer <token>'
  }
});
```

### Events

#### Subscribe to Influencer Updates

```javascript
socket.emit('subscribe:influencer', { influencerId: 'inf-123' });

socket.on('stake:update', (data) => {
  console.log('New stake:', data);
  // {
  //   influencerId: 'inf-123',
  //   newStake: { userId: '...', amount: '...' },
  //   totalStaked: '...',
  //   stakerCount: 151
  // }
});
```

#### Portfolio Updates

```javascript
socket.emit('subscribe:portfolio');

socket.on('portfolio:update', (data) => {
  console.log('Portfolio updated:', data);
  // {
  //   action: 'stake' | 'unstake' | 'claim',
  //   influencerId: '...',
  //   amount: '...'
  // }
});
```

#### Real-time Notifications

```javascript
socket.on('notification:new', (notification) => {
  console.log('New notification:', notification);
  // {
  //   id: '...',
  //   type: 'new_stake',
  //   title: '...',
  //   message: '...'
  // }
});
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": {
    "code": "INSUFFICIENT_STAKE",
    "message": "Stake amount must be at least 1000 TWIST",
    "details": {
      "minimum": "1000000000000",
      "provided": "500000000000"
    }
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Common Error Codes

- `UNAUTHORIZED`: Invalid or missing authentication token
- `NOT_FOUND`: Resource not found
- `INSUFFICIENT_STAKE`: Stake amount below minimum
- `INSUFFICIENT_BALANCE`: Insufficient token balance
- `POOL_INACTIVE`: Staking pool is not active
- `RATE_LIMITED`: Too many requests
- `INVALID_SIGNATURE`: Wallet signature verification failed
- `FRAUD_DETECTED`: Transaction blocked due to suspicious activity

## Rate Limits

- **General endpoints**: 100 requests per minute
- **Staking operations**: 10 requests per minute
- **Content generation**: 20 requests per hour
- **WebSocket connections**: 5 concurrent connections per user

Rate limit headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642339200
```

## SDK Examples

### JavaScript/TypeScript

```typescript
import { TwistAPI } from '@twist/sdk';

const api = new TwistAPI({
  apiKey: 'your-api-key',
  baseURL: 'https://api.twist.to/v1'
});

// Search influencers
const influencers = await api.influencers.search({
  query: 'crypto',
  sortBy: 'apy',
  filters: {
    minApy: 20,
    tiers: ['GOLD', 'PLATINUM']
  }
});

// Stake on influencer
const result = await api.staking.stake({
  influencerId: 'inf-123',
  amount: '10000000000000'
});

// Subscribe to updates
api.ws.subscribe('influencer', 'inf-123', (event) => {
  console.log('Update:', event);
});
```

### Python

```python
from twist_sdk import TwistAPI

api = TwistAPI(
    api_key='your-api-key',
    base_url='https://api.twist.to/v1'
)

# Search influencers
influencers = api.influencers.search(
    query='crypto',
    sort_by='apy',
    min_apy=20,
    tiers=['GOLD', 'PLATINUM']
)

# Stake on influencer
result = api.staking.stake(
    influencer_id='inf-123',
    amount='10000000000000'
)

# Get portfolio
portfolio = api.user.get_stakes()
```

## Webhooks

Configure webhooks to receive real-time updates for your account.

### Webhook Events

- `stake.created`: New stake on your pool
- `stake.withdrawn`: Stake withdrawn from your pool
- `rewards.distributed`: Rewards distributed to your pool
- `payout.processed`: Weekly payout processed
- `tier.upgraded`: Your tier has been upgraded

### Webhook Payload

```json
{
  "event": "stake.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "influencerId": "inf-123",
    "userId": "usr-456",
    "amount": "10000000000000",
    "poolAddress": "STAKxxxxx...",
    "transactionId": "5xKZn..."
  }
}
```

### Webhook Security

All webhooks include a signature header for verification:

```http
X-Twist-Signature: sha256=<signature>
```

Verify webhooks using your webhook secret:

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return `sha256=${hash}` === signature;
}
```

## Support

For API support and questions:
- Email: api@twist.to
- Discord: https://discord.gg/twist
- Documentation: https://docs.twist.to/api