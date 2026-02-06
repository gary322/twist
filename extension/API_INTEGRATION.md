# TWIST Browser Extension - API Integration Documentation

## Overview

The TWIST Browser Extension integrates with multiple API endpoints to provide token earning, influencer staking, and wallet management functionality. This document details all API integrations, request/response formats, and error handling.

## Base Configuration

### API Endpoints

```typescript
const API_ENDPOINTS = {
  PRODUCTION: 'https://api.twist.io',
  VAU: 'https://vau.twist.io',
  WALLET: 'https://wallet.twist.io',
  STAGING: 'https://api-staging.twist.io'
};
```

### Authentication Headers

All API requests include:
```typescript
{
  'Content-Type': 'application/json',
  'X-Extension-Version': chrome.runtime.getManifest().version,
  'X-Device-Id': deviceId,
  'Authorization': `Bearer ${apiKey}` // When authenticated
}
```

## API Endpoints

### 1. Authentication & Identity

#### POST `/api/v1/auth/extension-login`
Authenticate user and obtain session token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "hashed_password",
  "deviceId": "unique-device-id",
  "platform": "WEB"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "usr_123456",
    "email": "user@example.com",
    "deviceId": "unique-device-id",
    "trustScore": 100,
    "walletAddress": "7xKXtg2CW87d...",
    "createdAt": "2024-01-10T12:00:00Z",
    "token": "jwt_token_here"
  }
}
```

#### POST `/api/v1/auth/identify`
Identify user by email (SDK method).

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "userId": "usr_123456",
  "email": "user@example.com",
  "deviceId": "device_123",
  "trustScore": 100,
  "createdAt": "2024-01-10T12:00:00Z"
}
```

### 2. VAU (Verified Active Usage)

#### POST `/api/v1/vau/submit`
Submit verified active usage data for token earnings.

**Request:**
```json
{
  "userId": "usr_123456",
  "deviceId": "device_123",
  "siteId": "pub_789",
  "platform": "WEB",
  "timeSpent": 45000,
  "attestation": {
    "source": "browser_extension",
    "version": "2.0.0",
    "trustScore": 100,
    "activities": [
      { "type": "scroll", "count": 5 },
      { "type": "click", "count": 3 }
    ]
  }
}
```

**Response:**
```json
{
  "vauId": "vau_987654",
  "earned": 5,
  "totalEarned": 1500,
  "trustScore": 100,
  "nextSubmissionTime": "2024-01-10T12:05:00Z"
}
```

#### GET `/api/v1/vau/history`
Get user's VAU submission history.

**Query Parameters:**
- `userId`: User ID
- `startDate`: ISO date string
- `endDate`: ISO date string
- `limit`: Number of results (default: 100)
- `offset`: Pagination offset

**Response:**
```json
{
  "total": 250,
  "items": [
    {
      "vauId": "vau_123",
      "siteId": "pub_456",
      "earned": 5,
      "timestamp": "2024-01-10T11:00:00Z",
      "platform": "WEB"
    }
  ]
}
```

### 3. Publisher Management

#### POST `/api/v1/publishers/check`
Verify if a domain is a registered TWIST publisher.

**Request:**
```json
{
  "domain": "example.com"
}
```

**Response:**
```json
{
  "id": "pub_123",
  "domain": "example.com",
  "name": "Example Publisher",
  "verified": true,
  "tier": "GOLD",
  "earningRate": 1.5,
  "categories": ["news", "technology"]
}
```

#### GET `/api/v1/publishers/list`
Get list of all verified publishers.

**Query Parameters:**
- `category`: Filter by category
- `tier`: Filter by tier (BRONZE, SILVER, GOLD, PLATINUM)
- `search`: Search term

**Response:**
```json
{
  "total": 1500,
  "publishers": [
    {
      "id": "pub_123",
      "domain": "example.com",
      "name": "Example Publisher",
      "tier": "GOLD",
      "categories": ["news"]
    }
  ]
}
```

### 4. Influencer Operations

#### POST `/api/v1/influencers/search`
Search for influencers to stake on.

**Request:**
```json
{
  "query": "crypto",
  "sortBy": "apy",
  "filters": {
    "tier": ["GOLD", "PLATINUM"],
    "minApy": 10,
    "platform": ["twitter", "youtube"]
  },
  "limit": 20,
  "offset": 0
}
```

**Response:**
```json
{
  "total": 45,
  "influencers": [
    {
      "id": "inf_123",
      "username": "cryptoking",
      "displayName": "Crypto King",
      "avatar": "https://cdn.twist.io/avatars/123.jpg",
      "tier": "PLATINUM",
      "verified": true,
      "platforms": {
        "twitter": "@cryptoking",
        "youtube": "@CryptoKingOfficial"
      },
      "metrics": {
        "totalStaked": "50000000000000",
        "stakerCount": 1500,
        "apy": 25,
        "volume24h": "1000000000000",
        "avgStakeAmount": "33333333333"
      }
    }
  ]
}
```

#### GET `/api/v1/influencers/{influencerId}`
Get detailed influencer information.

**Response:**
```json
{
  "id": "inf_123",
  "username": "cryptoking",
  "displayName": "Crypto King",
  "bio": "Leading crypto educator and trader",
  "avatar": "https://cdn.twist.io/avatars/123.jpg",
  "banner": "https://cdn.twist.io/banners/123.jpg",
  "tier": "PLATINUM",
  "verified": true,
  "joinedAt": "2023-01-15T00:00:00Z",
  "platforms": {
    "twitter": {
      "handle": "@cryptoking",
      "followers": 250000,
      "verified": true
    },
    "youtube": {
      "handle": "@CryptoKingOfficial",
      "subscribers": 500000,
      "verified": true
    }
  },
  "metrics": {
    "totalStaked": "50000000000000",
    "stakerCount": 1500,
    "apy": 25,
    "apyHistory": [
      { "date": "2024-01-01", "apy": 22 },
      { "date": "2024-01-08", "apy": 25 }
    ],
    "volume24h": "1000000000000",
    "volume7d": "7000000000000",
    "avgStakeAmount": "33333333333"
  },
  "performance": {
    "roi30d": 15.5,
    "roi90d": 48.2,
    "winRate": 68.5,
    "riskScore": 3.2
  }
}
```

#### POST `/api/v1/influencers/stake`
Stake tokens on an influencer.

**Request:**
```json
{
  "influencerId": "inf_123",
  "amount": "100000000000",
  "wallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
}
```

**Response:**
```json
{
  "success": true,
  "transactionId": "5WjZ3qGvPFrnbHxJkPYvbGy",
  "stake": {
    "id": "stk_789",
    "influencerId": "inf_123",
    "amount": "100000000000",
    "stakedAt": "2024-01-10T12:00:00Z",
    "apy": 25,
    "lockPeriod": 30,
    "unlockDate": "2024-02-09T12:00:00Z"
  },
  "receipt": {
    "blockHeight": 123456789,
    "signature": "transaction_signature"
  }
}
```

### 5. Staking Management

#### GET `/api/v1/stakes/user/{userId}`
Get all stakes for a user.

**Response:**
```json
{
  "total": 5,
  "totalStaked": "500000000000",
  "totalPendingRewards": "25000000000",
  "stakes": [
    {
      "id": "stk_123",
      "influencer": {
        "id": "inf_123",
        "username": "cryptoking",
        "displayName": "Crypto King",
        "avatar": "https://cdn.twist.io/avatars/123.jpg",
        "tier": "PLATINUM"
      },
      "stake": {
        "amount": "100000000000",
        "stakedAt": "2024-01-01T00:00:00Z",
        "pendingRewards": "5000000000",
        "claimedRewards": "2000000000",
        "apy": 25,
        "lockPeriod": 30,
        "unlockDate": "2024-01-31T00:00:00Z",
        "status": "ACTIVE"
      }
    }
  ]
}
```

#### POST `/api/v1/stakes/claim-rewards`
Claim pending rewards from a stake.

**Request:**
```json
{
  "stakeId": "stk_123",
  "influencerId": "inf_123",
  "wallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
}
```

**Response:**
```json
{
  "success": true,
  "transactionId": "6YkA4rHvPGsobJyLmNZxcDw",
  "claimedAmount": "5000000000",
  "remainingStake": "100000000000",
  "receipt": {
    "blockHeight": 123456790,
    "signature": "claim_signature"
  }
}
```

#### POST `/api/v1/stakes/unstake`
Unstake tokens (after lock period).

**Request:**
```json
{
  "stakeId": "stk_123",
  "amount": "50000000000",
  "wallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
}
```

**Response:**
```json
{
  "success": true,
  "transactionId": "7ZlB5sIwQHtpcKzMoOaydEx",
  "unstakedAmount": "50000000000",
  "remainingStake": "50000000000",
  "penaltyAmount": "0",
  "receipt": {
    "blockHeight": 123456791,
    "signature": "unstake_signature"
  }
}
```

### 6. Wallet Operations

#### POST `/api/v1/wallet/connect`
Link Solana wallet to user account.

**Request:**
```json
{
  "userId": "usr_123",
  "walletAddress": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "signature": "signed_message_for_verification",
  "platform": "WEB"
}
```

**Response:**
```json
{
  "success": true,
  "wallet": {
    "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "linkedAt": "2024-01-10T12:00:00Z",
    "verified": true
  }
}
```

#### GET `/api/v1/wallet/balance/{walletAddress}`
Get TWIST token balance.

**Response:**
```json
{
  "balance": "1000000000000",
  "lockedBalance": "200000000000",
  "availableBalance": "800000000000",
  "pendingRewards": "50000000000",
  "lastUpdated": "2024-01-10T12:00:00Z"
}
```

### 7. Token Metrics

#### GET `/api/v1/token/metrics`
Get current TWIST token metrics.

**Response:**
```json
{
  "price": 0.05,
  "priceChange24h": 5.2,
  "marketCap": "50000000",
  "volume24h": "2500000",
  "circulatingSupply": "1000000000",
  "totalSupply": "10000000000",
  "holders": 125000,
  "transactions24h": 45000,
  "lastUpdated": "2024-01-10T12:00:00Z"
}
```

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid staking amount",
    "details": {
      "minimum": "10000000000",
      "provided": "5000000000"
    }
  }
}
```

### Common Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `UNAUTHORIZED` | Invalid or missing authentication | 401 |
| `FORBIDDEN` | Insufficient permissions | 403 |
| `NOT_FOUND` | Resource not found | 404 |
| `INVALID_REQUEST` | Invalid request parameters | 400 |
| `RATE_LIMITED` | Too many requests | 429 |
| `INSUFFICIENT_BALANCE` | Not enough tokens | 400 |
| `STAKE_LOCKED` | Stake still in lock period | 400 |
| `WALLET_NOT_CONNECTED` | Wallet not linked to account | 400 |
| `INTERNAL_ERROR` | Server error | 500 |

### Rate Limiting

API endpoints implement rate limiting:
- Authentication: 10 requests/minute
- VAU submission: 60 requests/hour
- Search operations: 100 requests/minute
- Transaction operations: 30 requests/minute

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704888000
```

## WebSocket Events (Real-time Updates)

### Connection

```typescript
const ws = new WebSocket('wss://api.twist.io/v1/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'jwt_token'
  }));
};
```

### Event Types

#### Price Updates
```json
{
  "type": "price_update",
  "data": {
    "price": 0.052,
    "change": 0.002,
    "timestamp": "2024-01-10T12:00:00Z"
  }
}
```

#### Staking Alerts
```json
{
  "type": "stake_alert",
  "data": {
    "influencerId": "inf_123",
    "alert": "apy_change",
    "oldValue": 20,
    "newValue": 25,
    "timestamp": "2024-01-10T12:00:00Z"
  }
}
```

#### Reward Notifications
```json
{
  "type": "rewards_available",
  "data": {
    "stakeId": "stk_123",
    "amount": "5000000000",
    "influencer": "cryptoking"
  }
}
```

## SDK Integration Examples

### Initialize SDK

```typescript
import { TwistWebSDK } from '@twist/web-sdk';

const sdk = new TwistWebSDK({
  apiKey: process.env.TWIST_API_KEY,
  environment: 'production',
  options: {
    timeout: 30000,
    retries: 3,
    cacheTime: 300000 // 5 minutes
  }
});
```

### Common Operations

```typescript
// Search influencers with caching
const influencers = await sdk.searchInfluencers({
  query: 'crypto',
  sortBy: 'apy',
  limit: 20
});

// Stake with error handling
try {
  const result = await sdk.stakeOnInfluencer({
    influencerId: 'inf_123',
    amount: 100 * 10**9,
    wallet: walletAddress
  });
  console.log('Staked successfully:', result.transactionId);
} catch (error) {
  if (error.code === 'INSUFFICIENT_BALANCE') {
    console.error('Not enough TWIST tokens');
  }
}

// Monitor stake performance
const stakes = await sdk.getUserStakes();
stakes.forEach(stake => {
  if (stake.stake.pendingRewards > 10 * 10**9) {
    console.log(`High rewards available: ${stake.influencer.displayName}`);
  }
});
```

## Security Considerations

1. **API Key Management**
   - Never expose API keys in client-side code
   - Rotate keys regularly
   - Use environment-specific keys

2. **Request Signing**
   - All transaction requests require wallet signature
   - Implement request replay protection

3. **Data Validation**
   - Validate all responses before processing
   - Implement timeout handling
   - Verify transaction signatures on-chain

4. **Error Recovery**
   - Implement exponential backoff for retries
   - Queue failed VAU submissions
   - Provide offline functionality where possible

---

For implementation details, see [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md). For user-facing documentation, see [USER_GUIDE.md](./USER_GUIDE.md).