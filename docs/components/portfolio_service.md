# Portfolio Service (`portfolio_service.ts`)

Language: TypeScript (Node 18) • Framework: Fastify • Deployed on Vercel Edge or AWS Lambda@Edge

---
## 1. Purpose
Serve a consolidated, real-time view of every token/NFT position a wallet holds:
* AC-D (decaying balance)
* Sector wrappers (sAC-*)
* BrandTokens
* BondNFTs (with unlock & yield)
* AL-NFTs (licences)

---
## 2. HTTP API
### 2.1  `GET /portfolio/:wallet`
Response schema:
```json
[
  {
    "mint": "ATTN111…",
    "symbol": "AC-D",
    "amount": "1234567890",   // raw
    "uiAmount": "12.34",
    "meta": { "type":"fungible" }
  },
  {
    "mint":"sAC-NEWS…",
    "symbol":"sAC-NEWS",
    "amount":"500000000",
    "uiAmount":"0.5",
    "meta":{
       "type":"fungible",
       "unlockable": false
    }
  },
  {
    "mint":"BONDNFT…",
    "symbol":"BondNFT",
    "amount":"1000000000",
    "uiAmount":"1",
    "meta":{
        "type":"bond_nft",
        "unlockTs": 1728000000,
        "yieldAccrued":"0.12"
    }
  }
]
```
Cache-Control: `max-age=60`.

### 2.2  Errors
* `400` invalid wallet pubkey.  
* `502` RPC failure.

---
## 3. Data Gathering Pipeline
1. **Token Accounts** via `getTokenAccountsByOwner` (Helius).  
2. **Metadata** via Metaplex gPA.  
3. **Bond Yield** `bond_pool::pending_yield()` (readonly).  
4. **Decay** : AC-D balances adjusted client-side (`amount * e^{-δ Δt}`) using `last_rebase` timestamp from `decay_state`.

Implementation uses `@solana/web3.js` batch requests with `Promise.allSettled`.

---
## 4. Security & Rate Limiting
* JWT signed by extension / Telegram bot: `sub=wallet`, exp ≤ 60 s.  
* API gateway throttles 2 req/min per wallet.

---
## 5. Deployment
* Dockerfile (Node 18-slim).  
* CI: GitHub Actions runs `npm test` + `tsc --noEmit`.  
* CD: Vercel prod on `main` branch.

---
## 6. Monitoring
* Prometheus scrape via /metrics: `rpc_latency`, `wallet_cache_hits`, `errors_4xx`.

---
## 7. Tests
* Unit: mock RPC JSON, ensure output schema passes Zod validator.  
* E2E: `jest` against devnet wallet preloaded with every asset type.

---
End of file 