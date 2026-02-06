# Influencer Staking API

## Overview

This API allows front-end clients and third-party services to interact with the Influencer Staking Program.  Core capabilities:
1. Create / query influencer pools
2. Stake / unstake AC-D tokens
3. Claim accumulated yield
4. Retrieve ROI & APY statistics
5. Real-time event subscriptions

Base URL: `https://api.ahee.io/v1/staking`

## Authentication
Same scheme as Marketplace API (`Authorization: Bearer …`, `X-Wallet-Address`, `X-Signature`).

---
### 1. List Pools
**GET** `/pools`
```
Query Params:
  category     = fashion|gaming|tech … (optional)
  minAPY       = number               (optional)
  sort         = apy_desc|roi_desc|newest
  page         = 1 … n
  limit        = 20 (default)
```
Response excerpt:
```json
{
  "pools": [
    {
      "influencer": {
        "id": "INF-SARAH-M9K2",
        "handle": "@sneakerqueen",
        "avatar": "https://ipfs.io/ipfs/Qm…",
        "platforms": ["instagram", "tiktok"],
        "followers": 45200
      },
      "pool": {
        "address": "POOLxKXtg2CW87…",
        "totalStaked": 1234500,
        "apy": 18.2,
        "roi30d": 8.1,
        "lockPeriod": 30,
        "yieldShare": 500  // 5% of earnings
      }
    }
  ],
  "pagination": { … }
}
```

---
### 2. Pool Details
**GET** `/pools/{poolAddress}`
Returns full on-chain state + stats.

---
### 3. Stake Tokens
**POST** `/pools/{poolAddress}/stake`
```json
{
  "amount": 2500,
  "lockPeriod": 30,
  "tx": "3zxKXtg2…"  // signed SPL-Token transfer + CPI call
}
```
Response → receipt NFT mint address, explorer link.

---
### 4. Claim Yield
**POST** `/pools/{poolAddress}/claim`
```json
{
  "tx": "4yxKXtg2…"
}
```
Returns amount claimed.

---
### 5. Unstake
**POST** `/pools/{poolAddress}/unstake`
```json
{
  "receiptMint": "NFTxKXtg2…",
  "tx": "5yxKXtg2…"
}
```
If before lock expiry → returns `penalty` field.

---
### 6. My Positions
**GET** `/positions`
```
Query Params: includeHistory=true|false
```

---
### 7. APY History
**GET** `/pools/{poolAddress}/apy-history`
```
Query Params: period=7d|30d|90d
```
Returns array of { date, apy }.

---
## WebSocket Events
Endpoint: `wss://api.ahee.io/v1/staking/ws`

Event types:
- `stake.confirmed`  – User stake minted
- `yield.deposit`    – Influencer earnings added
- `claim.processed`  – User claimed yield
- `unstake.redeemed` – Tokens + penalty returned

---
## Rate Limits
- Stake / Unstake: 10 req / minute
- Queries: 100 req / minute
---
## Error Codes
`POOL_LOCKED`, `INSUFFICIENT_BALANCE`, `LOCK_PERIOD_ACTIVE`, `INVALID_RECEIPT`, `RATE_LIMITED`, `TX_FAILED` 