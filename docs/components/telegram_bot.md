# Telegram Bot + Mini-App (`bot.py` & WebApp)

Language: Python 3.11 (`aiogram`) for bot API  •  WebApp: React 18 hosted on Vercel

---
## 1. Bot Commands
| Command | Description |
|---------|-------------|
| `/start` | deep-link with nonce for wallet link |
| `/balance` | Show top holdings (inline keyboard) |
| `/earnings_today` | AC earned / burned today |
| `/licences` | List AL-NFTs + `Heartbeat` buttons |
| `/staking` | BondNFTs, unlock timers, `Claim` buttons |
| `/search <q>` | Natural-language site discovery |
| `/unlink` | Remove wallet mapping |

---
## 2. Wallet Link Flow
1. `/start` deep-link contains `nonce`.  
2. Bot replies with `Tap to Link` button (opens extension link).  
3. After backend `/link` success, bot edits message: "Wallet linked ✅".

Security: backend verifies signature; bot stores only wallet pubkey in Redis keyed by Telegram ID.

---
## 3. Inline Buttons & Callback Data
* `heartbeat::<licence_id>` → bot calls `harberger::heartbeat` CPI via signers.  
* `claim_bond::<nft_mint>` → bot submits `redeem` ix.

Callback queries validated against wallet ownership.

---
## 4. Mini-App WebView
`https://tg.ahee.xyz/?wallet=<pk>&jwt=<token>`  
Loads same React component bundle as extension Portfolio tab; JWT signed by backend.

---
## 5. Deployment & Ops
* Bot running on Fly.io; webhook endpoint `/telegram-webhook`.  
* Rate-limit: 20 msgs/min/user.  
* Secrets: `BOT_TOKEN`, `JWT_SECRET`, `RPC_URL`, `PAYER_KEYPAIR`.

---
## 6. Metrics
Prometheus via `/metrics` exporter: `tg_msgs_total`, `cmd_latency`, `errors_total`.

---
## 7. Tests
* Unit: signature verification of wallet link.  
* Integration: mock licence heartbeat, ensure on-chain tx success.

---
End of file 