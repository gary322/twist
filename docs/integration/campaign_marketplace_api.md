# Campaign Marketplace API

## Overview

The Campaign Marketplace API enables advertisers to create and manage campaigns, while allowing influencers to discover, join, and track their performance. This RESTful API integrates with the on-chain campaign router program and provides real-time updates via WebSocket connections.

## Base URL

```
Production: https://api.ahee.io/v1/marketplace
Testnet: https://api-testnet.ahee.io/v1/marketplace
```

## Authentication

```http
Authorization: Bearer YOUR_API_KEY
X-Wallet-Address: YOUR_SOLANA_WALLET
X-Signature: SIGNED_MESSAGE
```

## Advertiser Endpoints

### 1. Create Campaign

**POST** `/campaigns`

Create a new advertising campaign with locked tokens.

**Request Body:**
```json
{
  "name": "Nike Air Max 2024 Launch",
  "description": "Promote our new Air Max collection",
  "targetUrl": "https://nike.com/airmax",
  "appScheme": "nike://",
  "budget": {
    "amount": 10000,
    "token": "AC-D"
  },
  "duration": {
    "startDate": "2024-03-01T00:00:00Z",
    "endDate": "2024-03-31T23:59:59Z"
  },
  "rewards": {
    "visit": {
      "amount": 2,
      "requirements": {
        "minDuration": 30,
        "hardwareAttested": true
      }
    },
    "signup": {
      "amount": 30,
      "requirements": {
        "emailVerified": true,
        "uniqueUser": true
      }
    },
    "purchase": {
      "baseAmount": 50,
      "percentageBonus": 2,
      "requirements": {
        "minOrderValue": 100
      }
    }
  },
  "targeting": {
    "cohorts": ["fashion-enthusiasts", "sneaker-heads"],
    "geoTargets": ["US", "CA", "UK"],
    "languages": ["en"],
    "minInfluencerScore": 0.7
  },
  "limits": {
    "maxPerInfluencer": 1000,
    "dailyBudget": 500,
    "maxInfluencers": 1000
  },
  "branding": {
    "logo": "https://nike.com/logo.png",
    "colors": {
      "primary": "#111111",
      "secondary": "#FFFFFF"
    },
    "templates": {
      "social": ["template1.json", "template2.json"]
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "campaign": {
    "id": "CAMP-NIKE-X7K9M2P",
    "publicKey": "7xKXtg2CW87d97TxJSDpbD5jBkheTqA83TZNq6MNawM8",
    "status": "pending_tokens",
    "escrowAddress": "ESCRxKXtg2CW87d97TxJSDpbD5jBkheTqA83TZNq6M",
    "transaction": "3zxKXtg2CW87d97TxJSDpbD5jBkheTqA83TZNq6MNawM8..."
  },
  "instructions": {
    "nextStep": "Transfer 10000 AC-D to escrow address",
    "deadline": "2024-02-28T12:00:00Z"
  }
}
```

### 2. Lock Campaign Tokens

**POST** `/campaigns/{campaignId}/lock`

Lock tokens in escrow to activate campaign.

**Request Body:**
```json
{
  "amount": 10000,
  "tokenAccount": "TOKENxKXtg2CW87d97TxJSDpbD5jBkheTqA83TZN",
  "transaction": "3zxKXtg2CW87d97TxJSDpbD5jBkheTqA83TZNq6MNawM8"
}
```

**Response:**
```json
{
  "success": true,
  "campaign": {
    "id": "CAMP-NIKE-X7K9M2P",
    "status": "active",
    "lockedAmount": 10000,
    "remainingBudget": 10000,
    "activatedAt": "2024-02-28T12:30:00Z"
  },
  "shareableLink": "https://ahee.io/join/CAMP-NIKE-X7K9M2P"
}
```

### 3. Update Campaign

**PATCH** `/campaigns/{campaignId}`

Update campaign parameters (some restrictions apply to active campaigns).

**Request Body:**
```json
{
  "rewards": {
    "visit": {
      "amount": 3  // Increase visit reward
    }
  },
  "limits": {
    "dailyBudget": 750  // Increase daily limit
  },
  "endDate": "2024-04-15T23:59:59Z"  // Extend campaign
}
```

### 4. Add Budget

**POST** `/campaigns/{campaignId}/add-budget`

Add more tokens to an active campaign.

**Request Body:**
```json
{
  "amount": 5000,
  "transaction": "4yxKXtg2CW87d97TxJSDpbD5jBkheTqA83TZNq6MNawM9"
}
```

### 5. Pause/Resume Campaign

**POST** `/campaigns/{campaignId}/pause`
**POST** `/campaigns/{campaignId}/resume`

Temporarily pause or resume a campaign.

### 6. Get Campaign Analytics

**GET** `/campaigns/{campaignId}/analytics`

Retrieve detailed campaign performance metrics.

**Query Parameters:**
- `startDate`: ISO 8601 date
- `endDate`: ISO 8601 date
- `groupBy`: `hour`, `day`, `week`
- `metrics`: Comma-separated list

**Response:**
```json
{
  "campaign": {
    "id": "CAMP-NIKE-X7K9M2P",
    "status": "active"
  },
  "metrics": {
    "overview": {
      "totalSpent": 3421,
      "remainingBudget": 6579,
      "activeInfluencers": 127,
      "totalActions": 8943
    },
    "actions": {
      "visits": {
        "count": 7234,
        "cost": 14468,
        "avgCost": 2
      },
      "signups": {
        "count": 892,
        "cost": 26760,
        "avgCost": 30,
        "conversionRate": 0.123
      },
      "purchases": {
        "count": 127,
        "cost": 8234,
        "avgCost": 64.83,
        "avgOrderValue": 156.72
      }
    },
    "influencers": {
      "top": [
        {
          "code": "NIKE-SARAH-24",
          "handle": "@sneakerqueen",
          "actions": 234,
          "earned": 892,
          "roi": 3.4
        }
      ]
    },
    "timeline": [
      {
        "date": "2024-03-15",
        "actions": 234,
        "spent": 567,
        "newInfluencers": 12
      }
    ]
  }
}
```

### 7. Export Campaign Data

**GET** `/campaigns/{campaignId}/export`

Export detailed campaign data as CSV or JSON.

**Query Parameters:**
- `format`: `csv`, `json`
- `data`: `actions`, `influencers`, `timeline`

## Influencer Endpoints

### 1. Browse Campaigns

**GET** `/campaigns`

Discover available campaigns to join.

**Query Parameters:**
- `status`: `active`, `upcoming`, `ending_soon`
- `category`: Industry category filter
- `minBudget`: Minimum remaining budget
- `minPayout`: Minimum payout per action
- `sort`: `budget_desc`, `payout_desc`, `newest`, `popular`
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 20)

**Response:**
```json
{
  "campaigns": [
    {
      "id": "CAMP-NIKE-X7K9M2P",
      "name": "Nike Air Max 2024",
      "brand": {
        "name": "Nike",
        "logo": "https://nike.com/logo.png",
        "verified": true
      },
      "budget": {
        "total": 10000,
        "remaining": 6579,
        "currency": "AC-D"
      },
      "rewards": {
        "visit": 2,
        "signup": 30,
        "purchase": "50 + 2%"
      },
      "stats": {
        "activeInfluencers": 127,
        "avgEarnings": 198,
        "successRate": 0.76
      },
      "requirements": {
        "minScore": 0.7,
        "geoRestrictions": ["US", "CA", "UK"]
      },
      "endsIn": "21 days"
    }
  ],
  "pagination": {
    "page": 1,
    "totalPages": 12,
    "totalResults": 234
  }
}
```

### 2. Get Campaign Details

**GET** `/campaigns/{campaignId}`

Get detailed information about a specific campaign.

**Response:**
```json
{
  "campaign": {
    "id": "CAMP-NIKE-X7K9M2P",
    "name": "Nike Air Max 2024",
    "description": "Promote our new Air Max collection...",
    "targetUrl": "https://nike.com/airmax",
    "rewards": {
      "visit": {
        "amount": 2,
        "requirements": [
          "Minimum 30 seconds on site",
          "Hardware attestation required"
        ]
      },
      "signup": {
        "amount": 30,
        "requirements": [
          "Valid email required",
          "One per user"
        ]
      },
      "purchase": {
        "baseAmount": 50,
        "percentageBonus": 2,
        "requirements": [
          "Minimum order $100",
          "Tracked through checkout"
        ]
      }
    },
    "performance": {
      "totalInfluencers": 234,
      "activeInfluencers": 127,
      "totalConversions": 8943,
      "averageEarnings": 198,
      "topEarner": {
        "code": "NIKE-STAR-01",
        "earnings": 1892
      }
    },
    "materials": {
      "graphics": [
        "https://cdn.ahee.io/nike/banner1.jpg",
        "https://cdn.ahee.io/nike/banner2.jpg"
      ],
      "videos": [
        "https://cdn.ahee.io/nike/promo.mp4"
      ],
      "copyTemplates": [
        "Check out the new Nike Air Max! Use code {CODE} for exclusive access 👟",
        "Just got my Air Max 2024! You can get yours at nike.com with my code {CODE}"
      ]
    }
  }
}
```

### 3. Join Campaign

**POST** `/campaigns/{campaignId}/join`

Join a campaign and generate a unique referral code.

**Request Body:**
```json
{
  "preferredCode": "NIKE-SARAH-24",
  "socialHandles": {
    "instagram": "@sneakerqueen",
    "tiktok": "@sarahkicks",
    "youtube": "SarahSneakers"
  },
  "audienceInfo": {
    "primaryPlatform": "instagram",
    "followers": 45000,
    "engagement": 0.047,
    "demographics": {
      "interests": ["fashion", "fitness", "lifestyle"]
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "membership": {
    "campaignId": "CAMP-NIKE-X7K9M2P",
    "influencerId": "INF-SARAH-M9K2",
    "code": "NIKE-SARAH-24",
    "status": "active",
    "joinedAt": "2024-03-15T10:30:00Z"
  },
  "assets": {
    "trackingLinks": {
      "web": "https://nike.com/airmax?ref=NIKE-SARAH-24",
      "mobile": "nike://airmax?ref=NIKE-SARAH-24",
      "shortened": "https://ahee.link/ns24"
    },
    "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANS...",
    "socialAssets": {
      "graphics": [
        {
          "url": "https://cdn.ahee.io/nike/sarah/banner1.jpg",
          "platform": "instagram",
          "dimensions": "1080x1080"
        }
      ]
    }
  },
  "dashboard": "https://dashboard.ahee.io/campaigns/CAMP-NIKE-X7K9M2P"
}
```

### 4. Get My Campaigns

**GET** `/influencer/campaigns`

List all campaigns the influencer has joined.

**Query Parameters:**
- `status`: `active`, `completed`, `all`
- `sort`: `earnings_desc`, `recent`, `ending_soon`

**Response:**
```json
{
  "campaigns": [
    {
      "campaign": {
        "id": "CAMP-NIKE-X7K9M2P",
        "name": "Nike Air Max 2024",
        "brand": "Nike"
      },
      "membership": {
        "code": "NIKE-SARAH-24",
        "joinedAt": "2024-03-15T10:30:00Z",
        "status": "active"
      },
      "performance": {
        "clicks": 342,
        "actions": {
          "visits": 298,
          "signups": 28,
          "purchases": 7
        },
        "earnings": 456,
        "rank": 12,
        "percentile": 91
      },
      "recentActivity": [
        {
          "type": "signup",
          "amount": 30,
          "timestamp": "2024-03-20T14:23:00Z"
        }
      ]
    }
  ]
}
```

### 5. Get Campaign Performance

**GET** `/influencer/campaigns/{campaignId}/performance`

Detailed performance metrics for a specific campaign.

**Query Parameters:**
- `period`: `today`, `week`, `month`, `all`
- `timezone`: IANA timezone (default: UTC)

**Response:**
```json
{
  "campaign": "CAMP-NIKE-X7K9M2P",
  "code": "NIKE-SARAH-24",
  "period": "week",
  "metrics": {
    "summary": {
      "totalClicks": 342,
      "uniqueVisitors": 287,
      "conversions": {
        "visits": 234,
        "signups": 28,
        "purchases": 7
      },
      "earnings": 456,
      "conversionRate": 0.097,
      "avgOrderValue": 156.43
    },
    "timeline": [
      {
        "date": "2024-03-14",
        "clicks": 45,
        "conversions": 12,
        "earnings": 67
      }
    ],
    "sources": {
      "instagram": {
        "clicks": 234,
        "conversions": 24,
        "earnings": 312
      },
      "tiktok": {
        "clicks": 89,
        "conversions": 11,
        "earnings": 123
      }
    },
    "topConversions": [
      {
        "type": "purchase",
        "amount": 52,
        "orderValue": 234.56,
        "timestamp": "2024-03-19T16:45:00Z"
      }
    ]
  },
  "ranking": {
    "currentRank": 12,
    "totalInfluencers": 127,
    "percentile": 91,
    "change": "+3"
  }
}
```

### 6. Get Earnings Summary

**GET** `/influencer/earnings`

Overview of earnings across all campaigns.

**Response:**
```json
{
  "earnings": {
    "available": 2341,
    "pending": 123,
    "withdrawn": 15670,
    "total": 18134
  },
  "currency": {
    "AC-D": {
      "balance": 2341,
      "usdValue": 234.10,
      "exchangeRate": 0.10
    }
  },
  "recentEarnings": [
    {
      "campaign": "Nike Air Max",
      "action": "signup",
      "amount": 30,
      "timestamp": "2024-03-20T14:23:00Z"
    }
  ],
  "payoutHistory": [
    {
      "id": "PAY-X7K9M2",
      "amount": 5000,
      "usdValue": 500,
      "method": "bank",
      "status": "completed",
      "date": "2024-03-15"
    }
  ]
}
```

### 7. Request Payout

**POST** `/influencer/payouts`

Convert AC-D earnings to USD.

**Request Body:**
```json
{
  "amount": 1000,
  "currency": "AC-D",
  "destination": {
    "type": "bank",
    "account": {
      "routing": "123456789",
      "account": "987654321",
      "type": "checking"
    }
  }
}
```

## Real-Time Updates

### WebSocket Connection

```javascript
const ws = new WebSocket('wss://api.ahee.io/v1/marketplace/ws');

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'YOUR_API_KEY'
  }));
  
  ws.send(JSON.stringify({
    type: 'subscribe',
    channels: ['campaigns', 'earnings', 'actions']
  }));
});
```

### Event Types

**Campaign Updates:**
```json
{
  "type": "campaign.update",
  "campaign": "CAMP-NIKE-X7K9M2P",
  "data": {
    "remainingBudget": 6234,
    "activeInfluencers": 128
  }
}
```

**Action Notifications:**
```json
{
  "type": "action.completed",
  "data": {
    "campaign": "CAMP-NIKE-X7K9M2P",
    "code": "NIKE-SARAH-24",
    "action": "signup",
    "reward": 30,
    "timestamp": "2024-03-20T14:23:00Z"
  }
}
```

**Earnings Updates:**
```json
{
  "type": "earnings.update",
  "data": {
    "campaign": "CAMP-NIKE-X7K9M2P",
    "amount": 30,
    "total": 486,
    "rank": 11
  }
}
```

## Webhook Integration

### Configure Webhooks

**POST** `/webhooks`

```json
{
  "url": "https://yourapp.com/webhooks/ahee",
  "events": ["action.completed", "payout.processed"],
  "secret": "your-webhook-secret"
}
```

### Webhook Payload

```http
POST https://yourapp.com/webhooks/ahee
X-AHEE-Signature: sha256=7d38cdd689735b008b3c702edd92eea23791c5f6
Content-Type: application/json

{
  "event": "action.completed",
  "timestamp": "2024-03-20T14:23:00Z",
  "data": {
    "campaign": "CAMP-NIKE-X7K9M2P",
    "influencer": "INF-SARAH-M9K2",
    "code": "NIKE-SARAH-24",
    "action": {
      "type": "purchase",
      "reward": 52,
      "orderValue": 234.56,
      "user": "USR-ANON-X7K9"
    }
  }
}
```

### Verify Webhook Signature

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return `sha256=${expectedSignature}` === signature;
}
```

## Rate Limits

- **Browse Endpoints**: 100 requests/minute
- **Action Endpoints**: 500 requests/minute
- **Analytics Endpoints**: 20 requests/minute
- **WebSocket Messages**: 100 messages/minute

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1616544000
```

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "INSUFFICIENT_BUDGET",
    "message": "Campaign does not have enough remaining budget",
    "details": {
      "required": 100,
      "available": 75
    }
  },
  "timestamp": "2024-03-20T14:23:00Z",
  "requestId": "req-x7k9m2p"
}
```

### Common Error Codes

- `INVALID_CODE`: Referral code already taken or invalid format
- `CAMPAIGN_INACTIVE`: Campaign is paused or ended
- `INSUFFICIENT_BUDGET`: Campaign budget exhausted
- `RATE_LIMITED`: Too many requests
- `UNAUTHORIZED`: Invalid API key or signature
- `GEO_RESTRICTED`: User location not allowed
- `DUPLICATE_ACTION`: Action already recorded

## SDK Examples

### JavaScript/TypeScript

```typescript
import { AHEEMarketplace } from '@ahee/marketplace-sdk';

const marketplace = new AHEEMarketplace({
  apiKey: process.env.AHEE_API_KEY,
  environment: 'production'
});

// Browse campaigns
const campaigns = await marketplace.campaigns.browse({
  minBudget: 1000,
  category: 'fashion',
  sort: 'payout_desc'
});

// Join campaign
const membership = await marketplace.campaigns.join('CAMP-NIKE-X7K9M2P', {
  preferredCode: 'NIKE-SARAH-24',
  socialHandles: {
    instagram: '@sneakerqueen'
  }
});

// Track earnings in real-time
marketplace.on('earnings.update', (data) => {
  console.log(`Earned ${data.amount} AC-D!`);
});
```

### Python

```python
from ahee_marketplace import AHEEMarketplace

marketplace = AHEEMarketplace(
    api_key=os.environ['AHEE_API_KEY'],
    environment='production'
)

# Create campaign
campaign = marketplace.campaigns.create({
    'name': 'Summer Collection',
    'budget': {'amount': 5000, 'token': 'AC-D'},
    'rewards': {
        'visit': 2,
        'signup': 25,
        'purchase': {'base': 40, 'percentage': 2}
    }
})

# Monitor performance
analytics = marketplace.campaigns.get_analytics(
    campaign['id'],
    start_date='2024-03-01',
    end_date='2024-03-20'
)
```

## Best Practices

### For Advertisers

1. **Budget Management**
   - Start with smaller budgets to test performance
   - Use daily limits to control spend
   - Monitor ROI and adjust rewards accordingly

2. **Reward Structure**
   - Balance rewards to incentivize quality over quantity
   - Use percentage bonuses for high-value purchases
   - Set reasonable requirements

3. **Campaign Optimization**
   - A/B test different reward structures
   - Analyze influencer performance patterns
   - Adjust targeting based on results

### For Influencers

1. **Code Selection**
   - Choose memorable, brand-relevant codes
   - Keep codes consistent across campaigns
   - Test links before sharing

2. **Performance Tracking**
   - Monitor real-time metrics
   - Identify best-performing content
   - Optimize posting times

3. **Audience Engagement**
   - Be transparent about partnerships
   - Share genuine experiences
   - Respond to audience questions

## Support

- API Status: https://status.ahee.io
- Documentation: https://docs.ahee.io/marketplace
- Support: marketplace@ahee.io
- Discord: https://discord.gg/ahee-devs 