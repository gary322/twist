# Runbook: Edge High Error Rate

## Alert: EdgeHighErrorRate

**Severity**: Critical  
**Team**: Infrastructure  
**SLO Impact**: Yes - Affects availability SLO

## Overview

This alert fires when the error rate on edge workers exceeds 10 errors per second for more than 2 minutes.

## Impact

- User requests may be failing
- VAU processing may be interrupted
- Revenue impact if errors persist

## Dashboard

[Edge Overview Dashboard](https://grafana.twist.io/d/twist-edge-overview)

## Investigation Steps

### 1. Check Error Types

```bash
# Check current error distribution
curl https://api.twist.io/metrics | grep edge_errors_total

# Look for specific error types
wrangler tail vau-processor-production --format json | \
  jq '.logs[] | select(.level == "error") | .message' | \
  sort | uniq -c | sort -nr
```

### 2. Check Recent Deployments

```bash
# List recent deployments
wrangler deployments list

# Check deployment times against error spike
git log --oneline -10 modules/plan-2-edge/
```

### 3. Check External Dependencies

- Verify Solana RPC is responsive
- Check KV namespace health
- Verify R2 bucket accessibility

### 4. Check Worker Resources

```bash
# CPU and memory usage
curl https://api.twist.io/metrics | grep -E 'edge_cpu_time_ms|edge_memory_usage'

# Check for rate limiting
curl https://api.twist.io/metrics | grep edge_rate_limit_hits_total
```

## Mitigation Steps

### Immediate Actions

1. **Enable Circuit Breaker** (if error rate > 50/sec)
   ```bash
   wrangler secret put CIRCUIT_BREAKER_ENABLED true --env production
   ```

2. **Scale Up Workers** (if CPU bound)
   ```bash
   terraform apply -var="worker_count=10" -auto-approve
   ```

3. **Rollback** (if deployment related)
   ```bash
   npm run rollback:production
   ```

### Root Cause Analysis

1. Collect error logs for the incident period
2. Identify error patterns
3. Create incident report
4. Update monitoring if new error type discovered

## Recovery Verification

1. Confirm error rate has dropped below threshold
2. Check that VAU processing has resumed
3. Verify no data loss during incident
4. Update status page

## Prevention

1. Implement gradual rollouts
2. Add error budget monitoring
3. Improve pre-production testing
4. Add chaos engineering tests

## Contacts

- On-call: Check PagerDuty
- Escalation: infrastructure-lead@twist.io
- Status Page: status.twist.io