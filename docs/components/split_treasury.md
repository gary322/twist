# Treasury Splitter (`split_treasury.rs`)

Language: Rust 1.74 • Binary `ahee-split-treasury` • Frequency: once per UTC day (00:05)

---
## 1. Purpose
Move yesterday's USDC revenue held by `attention_token` PDA into four pots per Chapter 2 ratios (90 / σ / π₁ / π₂).

---
## 2. Inputs
| Source | Data | Method |
|--------|------|--------|
| Solana RPC | `decay_state.supply` + `pcft_usdc` | `get_account_data` |
| Config TOML | σ, π₁, π₂ | env/configmap |

---
## 3. Algorithm
```rust
let now = Clock::get()?.unix_timestamp;
let today = now / 86_400;
if get_pda::<DayMarker>(day_pda(today)).is_ok() { return; } // already split

let usdc_total = token::balance(pcft_pda);
let explorer = usdc_total * SIGMA_NUM / 10_000;  // e.g. 3000 = 0.30
let user_ref = usdc_total * PI1_NUM / 10_000;
let owner_ref = usdc_total * PI2_NUM / 10_000;
let reserve   = usdc_total - explorer - user_ref - owner_ref;

cpi_transfer(pcft_pda, explorer_pda(today), explorer);
cpi_transfer(pcft_pda, ref_user_pot(today), user_ref);
cpi_transfer(pcft_pda, ref_owner_pot(today), owner_ref);
// reserve stays in PCFT
mark_day_done(today);
```
PDA `day_marker` ensures idempotency.

---
## 4. Security
* Executable signed by 3-of-5 multisig; but transfer amounts are deterministic—program reverts if computed `explorer` ≠ amount in memo (defence-in-depth).

---
## 5. Deployment
* Kubernetes CronJob: schedule `5 0 * * *` UTC.  
* Env: `RPC_URL`, `PCFT_PDA`, `SIGMA_NUM` etc.

---
## 6. Prometheus Metrics
* `split_success_total`, `split_duration_seconds`, `usdc_reserve_after`.

---
End of file 