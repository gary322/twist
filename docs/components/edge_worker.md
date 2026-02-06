# Edge Worker (A, B, C) — Cloudflare Durable Object

Version: v0.1 • Target runtime: Cloudflare Workers 2024-x • Language: TypeScript

---
## 1. Purpose
* Verify incoming VAU packets (FIDO2 ECDSA signature, counter freshness, user-presence flag).
* Apply per-device rate-limit (≤8 640 VAU/day).
* Forward valid VAU to the regional Aggregator via HTTPS POST.
* Reject invalid VAU with concise error code for metrics.

---
## 2. HTTP Interface
```
POST /v1/vau  Content-Type: application/json
{
  "site_hash": "<32-byte hex>",
  "secs": 5,
  "ctr": "<uint64>",
  "sig": "<r|s hex>",
  "attCRT": "<base64 DER>",
  "device_pubkey": "<hex>"
}
```
**2xx** → `{ "status":"ok" }`  
**4xx** → `{ "err":"<code>" }` (INVALID_SIG, REPLAY, RATE_LIMIT, BAD_CA).

---
## 3. Verification Pipeline
```ts
validateCA(attCRT)     // root in allowlist
pub = extractPub(attCRT)
valid = ecdsaVerify(sig, H(site_hash|secs|ctr), pub)
require(valid)
require(getUserPresence(bitArray))
require(!replayed(device_pubkey, ctr))
require(rateLimit(device_pubkey))
forwardToAggregator(payload)
```
* `rateLimit` uses Cloudflare KV: key=`rl:<pubkey>:<YYYY-MM-DD>` counter++; reject if >8640.
* `replayed` stores last ctr per device.

---
## 4. Forwarding Logic
* Select Aggregator endpoint via round-robin DNS weight.  
* `POST https://agg-<region>.ahee.xyz/v1/vau` JSON body identical to input plus Cloudflare Worker signature header (`CF-Sign` HMAC).
* Retry with exponential back-off up to 3 ×.

---
## 5. Deployment & Scaling
* Three identical workers (**edge_a**, **edge_b**, **edge_c**), each bound to its own Durable Object namespace so their KV counters do not collide—prevents single-DO hot-key.
* Routes:
```
a->  *.ahee.xyz/v1/vau
b->  *.ahee-eu.xyz/v1/vau
c->  *.ahee-asia.xyz/v1/vau
```
Global DNS `vau.ahee.xyz` is Geo-steered to nearest edge.

---
## 6. Security Notes
* CA allowlist pinned to thumbprints in `constants.ts`; updates require re-deploy.
* Worker secret `FORWARD_HMAC_KEY` rotated weekly via Wrangler.
* Logs omit sig bytes to avoid leaking key material.

---
## 7. Testing
`npm run test:e2e` spawns mock hardware token, injects 8 641 VAU in <24 h ⇒ last one should 429.

---
## 8. CI/CD
* GitHub Actions → `wrangler publish --var FORWARD_HMAC_KEY=${{secrets.HMAC}}` on tag v*.

---
End of file 