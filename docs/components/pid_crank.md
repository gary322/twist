# PID Cranker (`pid_crank.rs`)

Language: Rust 1.74  •  Binary: `ahee-pid-crank`  •  Schedule: every 10 min via systemd timer or Kubernetes CronJob

---
## 1. Purpose
Adjust the global gain `G_t` stored in the `gain_controller` program according to discrete-time PID logic, and trigger the circuit-breaker when price volatility exceeds threshold.

---
## 2. Inputs
| Source | Data | Method |
|--------|------|--------|
| Solana RPC | `I = imbalance` account (PDA) | `get_account_data` |
| Solana RPC | `S = supply` from `decay_state` | `get_account_data` |
| Pyth + Switchboard | AC/USDC TWAP 1 h sampling every 1 min | Websocket |
| Redis | integral accumulator | persistence between runs |

---
## 3. Algorithm
```rust
const KP: f64 = 0.8;
const KI: f64 = 0.03;
const DT: f64 = 600.0; // seconds

loop {
  let I = fetch_imbalance(); // AC units
  let S = fetch_supply();    // AC units
  let err = I as f64 / S as f64;
  let integral_prev = redis.get("pid_integral").unwrap_or(0.0);
  let integral_new = integral_prev + err * DT;
  let delta_g = KP*err + KI*integral_new;
  let g_prev = fetch_g();
  let g_unclamped = g_prev + delta_g;
  let g_new = g_unclamped.clamp(-G_MAX, 0.0);

  // circuit-breaker
  if price_change_1h() > 0.08 {
     g_new = 0.0; // freeze for 6 h
     set_freeze_until(now + 6*3600);
  }

  submit_set_gain(g_new);
  redis.set("pid_integral", integral_new);
  sleep(Duration::from_secs(DT as u64));
}
```

---
## 4. On-Chain Interaction
Writes `set_gain` instruction (signer must be 3-of-5 multisig). Failure triggers retry.

---
## 5. Security
* Uses read-only RPC; only sends one transaction per cycle signed by multisig hardware keys.
* Monitors `freeze_until` state to avoid overrides during CB window.

---
## 6. Metrics
Exposed via Prometheus:
* `pid_err`
* `pid_integral`
* `g_value`
* `circuit_breaker_active`

---
## 7. Deployment
Docker image; env vars `RPC_URL`, `MSIG_KEYPAIR`, `PYTH_URL`, `SWITCH_URL`, `REDIS_URL`.

K8s CronJob spec runs `*/10 * * * *`.

---
## 8. Unit Tests
* Feed synthetic imbalance jump; assert `g_new` saturates at `-G_MAX` and decays.
* Mock 10 % price jump; ensure circuit-breaker sets g=0 and freeze timer.

---
End of file 