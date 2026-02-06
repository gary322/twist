# Campaign Payout Service (`campaign_payout.rs`)

Language: Rust 1.74 • Binary `ahee-campaign-payout` • Runs continuously (Kafka consumer)

---
## 1. Purpose
Distribute influencer / affiliate bounties based on `UsageEvent` PDAs with campaign tags. Calls the on-chain `campaign_reward_router` program.

---
## 2. Data Sources
| Source | Data | Method |
|--------|------|--------|
| Solana RPC | `UsageEvent` PDAs (unclaimed) | `get_program_accounts` with memcmp filter |
| Solana RPC | Rule PDAs (`campaign_rule`) | cached once per 5 min |

`UsageEvent` PDA seeds: `b"event", mint, event_hash` and stores `{wallet, feature_id, campaign_tag, ts}`.

---
## 3. Payout Logic
```rust
loop {
  for event in fetch_unclaimed_events(limit=100) {
    let rule = load_rule(event.mint, event.feature_id)?;
    if !within_caps(rule, event.wallet) { continue; }
    let tx = router::distribute(event, rule.reward_per_event);
    send_and_confirm(tx, payer)?;
    mark_event_claimed(event.pda);
  }
  sleep(3s);
}
```
Caps reuse same PDA-counter scheme as BrandReward router.

---
## 4. Fraud Mitigation
* Each event must be signed by Edge Worker HMAC and include referential blockhash to prevent spoof.  
* Duplicate detection via `event.claimed` bit in PDA.

---
## 5. Deployment
Docker; env `RPC_URL`, `PAYER_KEYPAIR`.

Horizontal scaling: events partitioned by `campaign_tag % num_shards`.

---
End of file 