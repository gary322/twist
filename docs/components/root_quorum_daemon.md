# Root Quorum Daemon (`root_quorum_daemon`)

Language: Rust 1.74  •  Binary: `ahee-root-quorum`  •  Runs on: AWS Fargate, Fly.io, Akamai Linode (3 replicas)

---
## 1. Function
*Consumes the `RootMsg` Kafka topic produced by Aggregators, forms a 2-of-3 consensus for each 5-second bucket index, and submits the canonical root to the on-chain `root_recorder` program.*

---
## 2. Input & Output Streams
| Stream | Proto | Purpose |
|--------|-------|---------|
| `roots` (Kafka) | `RootMsg` (§5 of `aggregator_a.md`) | incoming candidate roots |
| Solana RPC | tx `commit_root` | writes canonical root to chain |

---
## 3. Algorithm
```rust
for msg in kafka_stream {
    let bucket = msg.index;
    map[bucket].push((msg.root, msg.sig, msg.node));
    if map[bucket].len() == 3 {
        let tally = count_equal_roots(map[bucket]);
        if tally.max_count >= 2 {
           submit_root(bucket, tally.majority_root);
        } else {
           log::error!("no quorum for {}", bucket);
        }
        drop map[bucket];
    }
}
```
* `count_equal_roots` uses constant-time compare.
* If after 7 s a bucket has <3 messages, majority of what exists is accepted (≥2). Otherwise skipped and alarm emitted.

---
## 4. On-Chain Submission
Uses Anchor client (even though on-chain program is native):
```rust
fn submit_root(idx: u64, root: [u8;32]) {
   let pda = Pubkey::find_program_address(&[b"root", &idx.to_le_bytes()], &ROOT_RECORDER_ID).0;
   let ix = commit_root_ix(idx, root, pda);
   send_and_confirm(ix, payer).expect("submit");
}
```
Failure retries up to 5× with back-off; safe-mode triggered if >5 min gap (`thermostat_safe_mode.trigger`).

---
## 5. Security
* Verifies ed25519 signature against hard-coded pubkeys of Aggregators.
* Metrics exported to Prometheus: `quorum_gap_seconds`, `root_submit_latency`.

---
## 6. Deployment & Ops
* Docker image, env `RPC_URL`, `KAFKA_BROKERS`, `PAYER_KEYPAIR` (in AWS Secrets).  
* One replica per cloud region, but only **first successful tx** per bucket will land; duplicates simply fail with `AccountAlreadyInitialized`.

---
## 7. Tests
* Unit: feed synthetic roots with mismatched hashes; ensure only majority submitted.  
* Integration: localnet with three aggregators, kill one; daemon still submits.

---
End of file 