# Wallet-Link API (`wallet_link_api.ts`)

Language: TypeScript (Node 18) • Framework: Fastify • Deployed on Cloud Run

---
## 1. Purpose
Securely map a user's Solana wallet address to their Telegram `user_id` (or any future chat ID) so that backend services can push portfolio updates without holding private keys.

---
## 2. End-points
### 2.1 POST /link
```http
POST /link  Content-Type: application/json
{
  "wallet": "<base58 pubkey>",
  "telegram_id": 123456789,
  "sig": "<base64 signature>",
  "nonce": "1699999999"
}
```
*Validations*
1. `now - nonce ≤ 120 s`  
2. `sig` must be a valid Ed25519 signature of the UTF-8 string
   `"Link wallet:<wallet>:<nonce>"` by `wallet` pubkey.  
3. Check `telegram_id` not already linked to another wallet.

Stores row in Postgres table: `link(wallet TEXT PK, telegram BIGINT UNIQUE, linked_at TIMESTAMP)`.

### 2.2 DELETE /unlink
Authenticated via Telegram login widget; removes mapping.

### 2.3 GET /wallet/:telegram_id
Internal token-protected endpoint used by portfolio service to resolve wallet.

---
## 3. Security
* **Replay attack** blocked by 120-second nonce window + UNIQUE constraint.  
* All DB writes wrapped in SERIALIZABLE tx.  
* Rate-limit 5 POST /link per IP per hour.

---
## 4. Deployment
* Docker (Node 18-slim) → Cloud Run; autoscales 0->10.  
* Secrets: `DATABASE_URL`, `JWT_SECRET` (for internal auth).

---
## 5. Monitoring
Prometheus exporter `/metrics`:
* `links_total`, `unlinks_total`, `link_errors_total`.

---
## 6. Tests
* Unit: signature verification success/fail.  
* E2E: run `telegram-login-mock`, ensure mapping created.

---
End of file 