# Edge Infrastructure Operations Runbook

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Daily Operations](#daily-operations)
4. [Incident Response](#incident-response)
5. [Maintenance Procedures](#maintenance-procedures)
6. [Performance Optimization](#performance-optimization)
7. [Security Operations](#security-operations)
8. [Monitoring & Alerting](#monitoring--alerting)
9. [Troubleshooting Guide](#troubleshooting-guide)
10. [Emergency Contacts](#emergency-contacts)

## Overview

The TWIST Edge Computing infrastructure runs on Cloudflare Workers, providing global distribution and low-latency processing for VAU (Verified Attention Unit) submissions. This runbook covers operational procedures for maintaining the edge infrastructure.

### Key Components
- **VAU Processor**: Main worker handling VAU submissions
- **Security Worker**: WAF and security enforcement
- **Rate Limiter**: Durable Object for distributed rate limiting
- **Queue Processor**: Batch processing of VAUs
- **Cache Layer**: Performance optimization
- **Monitoring**: Prometheus-compatible metrics

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│   Users     │────▶│ Security WAF │────▶│ VAU Processor │
└─────────────┘     └──────────────┘     └───────────────┘
                            │                      │
                            ▼                      ▼
                    ┌──────────────┐      ┌───────────────┐
                    │ Rate Limiter │      │ Queue System  │
                    │   (DO)       │      │               │
                    └──────────────┘      └───────────────┘
                                                  │
                                                  ▼
                                         ┌───────────────┐
                                         │ Analytics/R2  │
                                         └───────────────┘
```

## Daily Operations

### Morning Checks (9:00 AM UTC)

1. **Check Worker Health**
   ```bash
   curl https://api.twist.io/health
   ```

2. **Review Overnight Metrics**
   - Open [Grafana Dashboard](https://grafana.twist.io/d/twist-edge-overview)
   - Check for:
     - Error rate spikes
     - Latency anomalies
     - Cache hit rate drops
     - Rate limit violations

3. **Check Queue Backlog**
   ```bash
   wrangler queues list --env production
   ```

4. **Review Security Events**
   ```bash
   # Check security blocks from last 24h
   curl https://api.twist.io/metrics | grep edge_security_blocks_total
   ```

### Hourly Checks

1. **Monitor Real-time Metrics**
   ```bash
   # Get current request rate
   curl https://api.twist.io/metrics | grep edge_requests_total
   
   # Check error rate
   curl https://api.twist.io/metrics | grep edge_errors_total
   ```

2. **Verify Cache Performance**
   ```bash
   # Cache hit rate
   curl https://api.twist.io/metrics | grep -E 'edge_cache_hits|edge_cache_misses'
   ```

## Incident Response

### Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| P0 | Critical - Service Down | 15 min | Complete outage, data loss |
| P1 | Major - Degraded Service | 30 min | High error rate, >50% failures |
| P2 | Minor - Partial Issues | 2 hours | Slow response, <10% failures |
| P3 | Low - Monitoring Only | 24 hours | Minor alerts, no user impact |

### Response Procedures

#### P0 - Service Down

1. **Immediate Actions**
   ```bash
   # Check worker status
   wrangler tail vau-processor-production --format json
   
   # Enable circuit breaker
   wrangler secret put CIRCUIT_BREAKER_ENABLED true --env production
   
   # Check Cloudflare status
   curl https://www.cloudflarestatus.com/api/v2/status.json
   ```

2. **Rollback if Needed**
   ```bash
   # Trigger rollback workflow
   gh workflow run rollback-edge.yml -f environment=production -f reason="Service outage"
   ```

3. **Communication**
   - Update status page
   - Notify stakeholders via Slack
   - Create incident channel

#### P1 - High Error Rate

1. **Identify Error Type**
   ```bash
   # Get error breakdown
   wrangler tail vau-processor-production --format json | \
     jq '.logs[] | select(.level == "error") | .message' | \
     sort | uniq -c | sort -nr | head -20
   ```

2. **Check Recent Changes**
   ```bash
   # List recent deployments
   wrangler deployments list
   
   # Check commit history
   git log --oneline -20 modules/plan-2-edge/
   ```

3. **Mitigation Options**
   - Scale up workers
   - Increase rate limits
   - Enable caching for more endpoints
   - Rollback if deployment-related

### Incident Template

```markdown
# Incident Report: [Title]

**Incident ID**: INC-YYYY-MM-DD-XXX
**Severity**: P[0-3]
**Duration**: [Start] - [End]
**Impact**: [User impact description]

## Timeline
- HH:MM - Alert triggered
- HH:MM - Engineer acknowledged
- HH:MM - Root cause identified
- HH:MM - Mitigation applied
- HH:MM - Service restored

## Root Cause
[Description of what caused the incident]

## Resolution
[Steps taken to resolve]

## Action Items
- [ ] [Preventive measure 1]
- [ ] [Preventive measure 2]
```

## Maintenance Procedures

### Weekly Maintenance

#### Sunday 00:00 UTC - Salt Rotation
```bash
# Verify salt rotation completed
wrangler kv:key list --namespace-id=$KV_NS --prefix="salt:week"

# Check for rotation errors
wrangler tail vau-processor-production --format json | grep "salt rotation"
```

#### Wednesday 02:00 UTC - Cache Cleanup
```bash
# Purge stale cache entries
curl -X POST https://api.twist.io/admin/cache/purge \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"older_than": "7d"}'
```

### Monthly Maintenance

1. **Security Audit**
   ```bash
   # Run security scan
   cd modules/plan-2-edge
   npm run security:pentest
   
   # Review WAF rules
   terraform plan -target=cloudflare_ruleset.security_rules
   ```

2. **Performance Review**
   - Analyze P95/P99 latency trends
   - Review cache hit rates
   - Optimize slow endpoints

3. **Cost Optimization**
   - Review worker invocation counts
   - Analyze KV/R2 storage usage
   - Optimize queue batch sizes

## Performance Optimization

### Identifying Bottlenecks

1. **CPU Time Analysis**
   ```bash
   # Get CPU time distribution
   curl https://api.twist.io/metrics | grep edge_cpu_time_ms
   ```

2. **Memory Usage**
   ```bash
   # Check memory consumption
   curl https://api.twist.io/metrics | grep edge_memory_usage_bytes
   ```

3. **Queue Processing Time**
   ```bash
   # Analyze queue performance
   curl https://api.twist.io/metrics | grep edge_queue_processing_duration
   ```

### Optimization Strategies

#### Cache Optimization
```javascript
// Add cache rules for new endpoints
const CACHE_RULES = {
  '/api/v1/new-endpoint': {
    browserTTL: 300,
    edgeTTL: 60,
    bypassCache: false,
    revalidate: true
  }
};
```

#### Rate Limit Tuning
```bash
# Adjust rate limits based on usage patterns
terraform apply -var="api_rate_limit=200" -var="vau_rate_limit=2000"
```

#### Worker Scaling
```bash
# Scale workers for high traffic
terraform apply -var="worker_count=20"
```

## Security Operations

### Daily Security Tasks

1. **Review Security Blocks**
   ```bash
   # Get security metrics
   curl https://api.twist.io/metrics | grep edge_security_blocks_total
   
   # Check blocked IPs
   wrangler kv:key list --namespace-id=$KV_NS --prefix="blocked:ip:"
   ```

2. **Monitor Geographic Blocks**
   ```bash
   # Check geo-blocking effectiveness
   curl https://api.twist.io/metrics | grep 'edge_security_blocks_total{rule="geo_block"}'
   ```

### Threat Response

#### DDoS Attack
1. Enable Under Attack Mode
   ```bash
   curl -X PATCH "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/settings/security_level" \
     -H "Authorization: Bearer $CF_API_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"value":"under_attack"}'
   ```

2. Tighten rate limits
   ```bash
   wrangler secret put RATE_LIMIT_MULTIPLIER 0.1 --env production
   ```

3. Enable additional WAF rules
   ```bash
   terraform apply -var="enable_strict_waf=true"
   ```

#### Security Incident
1. Preserve evidence
   ```bash
   # Export security logs
   node scripts/export-security-logs.js --start="2024-01-15T00:00:00Z" --end="2024-01-15T23:59:59Z"
   ```

2. Block malicious actors
   ```bash
   # Add IP to blocklist
   wrangler kv:put "blocked:ip:1.2.3.4" "security_incident" --namespace-id=$KV_NS
   ```

## Monitoring & Alerting

### Key Metrics

| Metric | Normal Range | Warning | Critical |
|--------|--------------|---------|----------|
| Request Rate | 1k-10k/s | >15k/s | >20k/s |
| Error Rate | <0.1% | >0.5% | >1% |
| P95 Latency | <100ms | >500ms | >1s |
| Cache Hit Rate | >90% | <80% | <70% |
| CPU Time | <10ms | >25ms | >50ms |
| Queue Backlog | <100 | >500 | >1000 |

### Alert Response

#### High Latency Alert
```bash
# 1. Check worker CPU time
wrangler tail vau-processor-production --format json | \
  jq '.outcome.cpuTime' | stats

# 2. Identify slow operations
wrangler tail vau-processor-production --format json | \
  jq 'select(.outcome.cpuTime > 25) | .logs'

# 3. Enable performance mode
wrangler secret put PERFORMANCE_MODE true --env production
```

#### Low Cache Hit Rate
```bash
# 1. Analyze cache misses
wrangler logpull --fields=CacheCacheStatus,ClientRequestURI | \
  awk '$1=="MISS" {print $2}' | sort | uniq -c | sort -nr | head -20

# 2. Update cache rules for common misses
# Edit cache.ts and deploy

# 3. Purge stale cache
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

## Troubleshooting Guide

### Common Issues

#### Worker Timeout
**Symptoms**: 522 errors, incomplete responses
**Solution**:
```bash
# 1. Check CPU time
wrangler tail vau-processor-production --format json | jq '.outcome.cpuTime'

# 2. Identify long-running operations
# 3. Optimize or move to queue processing
```

#### KV Consistency Issues
**Symptoms**: Stale data, missing keys
**Solution**:
```bash
# 1. Check KV replication lag
wrangler kv:key get "test-key" --namespace-id=$KV_NS --preview=false

# 2. Implement eventual consistency handling
# 3. Use cache-aside pattern
```

#### Queue Processing Delays
**Symptoms**: Growing backlog, slow processing
**Solution**:
```bash
# 1. Check queue depth
wrangler queues list --env production

# 2. Increase batch size
terraform apply -var="queue_batch_size=200"

# 3. Add more consumer workers
```

### Debugging Commands

```bash
# Live tail logs
wrangler tail vau-processor-production

# Get specific error
wrangler tail vau-processor-production --format json | \
  jq 'select(.exceptions | length > 0)'

# Check durable object state
wrangler tail rate-limiter-production --format json

# Export metrics for analysis
curl https://api.twist.io/metrics > metrics-$(date +%Y%m%d-%H%M%S).txt

# Check worker memory usage
wrangler tail vau-processor-production --format json | \
  jq '.outcome.memoryUsage'
```

## Emergency Contacts

### Escalation Path

1. **On-Call Engineer**: Check PagerDuty
2. **Team Lead**: infrastructure-lead@twist.io
3. **Platform Lead**: platform-lead@twist.io
4. **CTO**: cto@twist.io

### External Contacts

- **Cloudflare Enterprise Support**: enterprise-support@cloudflare.com
- **PagerDuty Support**: support@pagerduty.com
- **Status Page**: status.twist.io

### Communication Channels

- **Slack Channels**:
  - #edge-alerts - Automated alerts
  - #edge-oncall - On-call discussion
  - #incidents - Active incidents
- **War Room**: zoom.twist.io/warroom

## Appendix

### Useful Scripts

#### Export Daily Metrics
```bash
#!/bin/bash
DATE=$(date -d "yesterday" +%Y%m%d)
curl https://api.twist.io/metrics > metrics-$DATE.txt
aws s3 cp metrics-$DATE.txt s3://twist-metrics/edge/$DATE/
```

#### Check All Systems
```bash
#!/bin/bash
echo "=== Health Check ==="
curl -s https://api.twist.io/health | jq .

echo -e "\n=== Queue Status ==="
wrangler queues list --env production

echo -e "\n=== Recent Errors ==="
curl -s https://api.twist.io/metrics | grep edge_errors_total | tail -5

echo -e "\n=== Cache Performance ==="
curl -s https://api.twist.io/metrics | grep -E 'cache_hits|cache_misses' | tail -2
```

### Recovery Procedures

#### Complete Service Recovery
1. Verify all workers are responding
2. Check queue processing has resumed
3. Verify cache is working
4. Confirm metrics are being collected
5. Run smoke tests
6. Update status page
7. Send all-clear notification

### Post-Incident Review

After every P0/P1 incident:
1. Create incident report (within 24h)
2. Schedule blameless postmortem (within 48h)
3. Create action items
4. Update runbook with learnings
5. Share findings with team

---

Last Updated: 2024-01-15
Version: 1.0.0