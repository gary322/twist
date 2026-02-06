# Product-Owner Dashboard (Next.js)

Stack: Next.js 14 (App Router) + Tailwind + Solana Wallet Adapter

---
## 1. Pages & Routes
| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `SummaryPage` | KPIs, traffic, burns |
| `/collateral` | `CollateralWizard` | Bond / unbond curve |
| `/brand` | `BrandTokenPage` | Create BrandToken, rules |
| `/licences` | `LicenceMgr` | CHB licences own/set price |
| `/users` | `RefAnalytics` | top referrers CSV |

---
## 2. Auth & Wallet
`<WalletProvider>` with Phantom/Backpack; verifies owner owns `site_hash` via PDA check.

---
## 3. GraphQL API (Hasura)
* Mirrors on-chain PDAs via indexer.  
* Queries: `pageBurns(site_hash)`, `bondStatus`, `yieldStats`, `brandSupply`.

---
## 4. Collateral Wizard Flow
1. Stepper UI collects USDC amount, curve params.  
2. Calls `bond_site` ix via Wallet Adapter.  
3. Shows pending BondNFT referrer option.

---
## 5. Rule Builder (Brand Reward)
React Hook Form validating `max_daily≤remaining_supply`.  Saves to `brand_reward_router::init_rule`.

---
## 6. Build & Deploy
* `next build && next start` inside Docker.  
* Cloud Run or Vercel.  
* CI checks Lighthouse score ≥ 90.

---
End of file 