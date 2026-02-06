# Monitoring & Observability Stack

Stack: Prometheus + Grafana + Loki  •  Managed via Helm on Kubernetes

---
## 1. Scope
Collect metrics and logs from:
* On-chain programs (via Solana RPC `--subscribe` instrumentation)
* Off-chain services (Edge, Aggregator, Quorum, PID, Buy-back, Splitter, Portfolio, Oracles)
* Browser extension (anonymised error logs via Sentry)

---
## 2. Prometheus Targets
| Job | Endpoint | Metrics |
|-----|----------|---------|
| edge_worker | `https://edge*.ahee.xyz/metrics` | `vau_verified_total`, `rate_limit_blocks` |
| aggregator | `http://agg-*/metrics` | `root_emit_latency_ms` |
| quorum_daemon | `http://quorum-*/metrics` | `quorum_gap_seconds` |
| pid_crank | `http://pid/metrics` | `pid_err`, `g_value` |
| buyback | `http://buyback/metrics` | `buyback_executed_total` |
| splitter | `http://split/metrics` | `usdc_split_total` |
| portfolio | `https://portfolio.ahee.xyz/metrics` | `rpc_latency_ms` |

Prometheus scraping interval: 15 s (Edge, Agg) / 60 s (others).

---
## 3. Grafana Dashboards
1. **System Health**: root quorum freshness, PCFT balance, floor price.  
2. **Edge → Root Latency**: VAU ingest to chain commit histogram.  
3. **Economic KPIs**: Daily ΔS, burns, locks, buy-back spend.  
4. **User UX**: average badge latency, portfolio API p99.

Alerts via Grafana Alerting → PagerDuty:
* `quorum_gap_seconds > 300` CRITICAL.  
* `buyback_budget_remaining < 10 %` WARNING.  
* `pcft_growth < 0` CRITICAL.

---
## 4. Loki Log Pipelines
* Edge Worker—structured JSON logs; index fields `status`, `err`.  
* buyback/pid—stdout; grep for `ERR`.  
* Retention 7 days; stored in S3.

---
## 5. Deployment
Helm chart `ahee-monitoring` installs:
```yaml
grafana:
  ingress: grafana.ahee.xyz
auth:
  oauth: GitHub org=ahee-labs
```
Prometheus remote_write to Cortex (optional) for 30-day retention.

---
End of file 