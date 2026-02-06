# Buy-Back Bot (`buyback.rs`)

Language: Rust 1.74 • Binary `ahee-buyback` • Runs continuously on two independent operators

---
## 1. Purpose
Burn circulating AC-D when market spot price falls below protocol floor band, using up to 20 % of yesterday's decay revenue.

---
## 2. Inputs
| Source | Data | Method |
|--------|------|--------|
| Solana RPC | `pcft_usdc`, `decay_yesterday` PDAs | `get_account_data` |
| Price Feeds | Pyth & Switchboard 30 m TWAP | Websocket |
| Orca Whirlpool | Depth & slippage stats | gRPC SDK |

---
## 3. Trigger Condition
```text
if  P ≤ F × (1 − θ)   AND   depth_30m ≥ Λ
```
* `θ = 0.03`, `Λ = 50 000 AC`.
* Floor `F` computed on-chain: `pcft_usdc × P / S`.

---
## 4. Budget Calculation
`budget_usdc = 0.2 × decay_yesterday_usdc`

Bot checks PDA `buyback_spent::<day>` to ensure not exceeding budget.

---
## 5. Action Flow
1. Compute amount_out = `budget_usdc / P`.  
2. Submit `swap_exact_out` to Orca Whirlpool USDC→AC with slippage ≤0.5 %.  
3. On fill: build Solana tx with two CPIs:
```rust
// CPI 1  transfer AC from bot temp acct → burn authority
token::burn(ac_mint, amount_out);
// CPI 2  update buyback_spent PDA
```
4. Emit `BuyBack {amount_ac, price}` event.

---
## 6. Safety Checks
* Max single-tx spend 5 % of daily budget. Remainder loops if price still below band.
* If swap expected price impact >1 %, abort.
* Requires 2-of-3 multisig signature (same keys as PID crank) via detached Cosign flow.

---
## 7. Metrics (Prometheus)
* `buyback_executed_total` (USDC, AC)  
* `buyback_price_before`, `buyback_price_after`  
* `budget_remaining`  
* `errors_total`

---
## 8. Deployment
Docker image. Env: `RPC_URL`, `ORCA_ID`, `MSIG_KEYS`, `PYTH_URL`, `SWITCH_URL`.
Systemd service with restart on failure.

---
## 9. Tests
* Unit: simulate price dip; check spend ≤ budget.  
* Integration: localnet Whirlpool pool, mock price feed.

---
End of file 