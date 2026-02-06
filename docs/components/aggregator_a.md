# Aggregator Node (A, B, C)

Language: Rust 1.74  •   Target: x86_64-musl  •   Binary: `ahee-aggregator`

---
## 1. Purpose
* Receive validated VAUs from regional Edge Workers.
* Build incremental Merkle tree (Poseidon hash, fan-out 2).
* Every 5 s emit signed root `R_a` to Root Quorum (Kafka topic).
* Sign with ed25519 key stored in Hashicorp Vault HSM plug-in.

---
## 2. Inbound API
```
POST /v1/vau  Content-Type: application/json
{
  "site_hash": "...",
  "secs": 5,
  "ctr": "...",
  ...
  "cf_sign": "HMAC header from Edge"
}
```
Header `X-Edge-ID` identifies which edge sent it. HMAC validated with shared secret.

---
## 3. Data Pipeline
1. **Dedup Queue**: in-mem Bloom filter per 5 s bucket to drop duplicates.
2. **Bucket Buffer**: HashMap<index, Vec<NodeHash>>.
3. **Tree Builder**: every 250 ms run incremental Poseidon up tree.
4. **Root Emit**: at 4.9 s boundary, finalise root, write to Kafka `roots` topic.

```rust
if now % 5_000 == 0 {
   let root = build_merkle(bucket[i]);
   let sig  = ed25519::sign(root, keypair);
   kafka.send(RootMsg{index:i, root, sig});
}
```

---
## 4. Fault Tolerance
* Aggregator pods run in three clouds; each keeps local RocksDB WAL.  
* If pod restarts, rebuilds tree from WAL events.

---
## 5. Root Quorum Schema (Kafka)
```protobuf
message RootMsg {
  uint64 index = 1;
  bytes root   = 2;  // 32 bytes
  bytes sig    = 3;  // 64 bytes ed25519
  string node  = 4;  // "agg-a"
  int64  ts    = 5;
}
```

---
## 6. Security
* HMAC auth on inbound POSTs (Edge secret).  
* ed25519 keys are wrapped by Vault HSM; signing via plugin (non-exportable).
* Rate limit: 200 k VAU/sec per Aggregator.

---
## 7. Performance
* Poseidon hash via SIMD; 2 M leaves/s on c5.4xlarge.  
* Latency end-to-end Edge→Kafka < 150 ms.

---
## 8. Deployment
* Dockerfile provided; k8s Helm chart with HPA (CPU 70 %).  
* Prometheus exporter `/metrics`: `vau_ingest_rate`, `root_latency`, `dup_dropped`.

---
## 9. Tests
* Property test: 1 M random leaves, compare tree root with reference implementation.
* Integration: spin Edge mock, send 10 M VAUs, expect 2 root msgs per second.

---
End of file 