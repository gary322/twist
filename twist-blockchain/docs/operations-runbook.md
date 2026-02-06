# TWIST Token Production Operations Runbook

## Table of Contents

1. [Overview](#overview)
2. [Daily Operations](#daily-operations)
3. [Automated Systems](#automated-systems)
4. [Emergency Procedures](#emergency-procedures)
5. [Incident Response](#incident-response)
6. [Maintenance Procedures](#maintenance-procedures)
7. [Security Protocols](#security-protocols)
8. [Monitoring & Alerts](#monitoring--alerts)
9. [Disaster Recovery](#disaster-recovery)
10. [Contact Information](#contact-information)

## Overview

This runbook contains all operational procedures for maintaining the TWIST token ecosystem in production. All procedures must be followed exactly to ensure system stability and security.

### Critical Systems

- **Solana Program**: `TWSTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- **Monitoring Dashboard**: `https://monitor.twist.io`
- **Alert System**: PagerDuty + Discord + Email
- **Multi-sig**: 3-of-5 Squads Protocol wallet

## Daily Operations

### Morning Checklist (09:00 UTC)

#### 1. System Health Verification

```bash
# Check monitoring dashboard
curl -s https://monitor.twist.io/health | jq .

# Expected output:
{
  "healthy": true,
  "checks": {
    "rpc": "healthy",
    "program": "healthy",
    "oracles": "healthy",
    "liquidity": "healthy",
    "circuit_breaker": "healthy"
  }
}
```

#### 2. Economic Health Check

- [ ] Verify decay executed in last 25 hours
- [ ] Check floor price vs market price (should be within 3%)
- [ ] Review 24h volume (alert if < $100k or > $10M)
- [ ] Verify treasury balances match expected
- [ ] Check staking APYs are within bounds

```bash
# Run economic health check
./scripts/health/economic-check.sh

# Key metrics to verify:
# - Price ratio: 0.97x - 1.5x
# - Daily volume: $500k - $5M
# - Treasury ratio: >80% in floor
# - Active stakers: >1000
```

#### 3. Oracle Health Verification

```bash
# Check oracle status
./scripts/health/oracle-check.sh

# Verify:
# - All 3 oracles reporting
# - Price divergence < 2%
# - Update frequency < 30s
# - Confidence intervals acceptable
```

#### 4. Liquidity Pool Health

```bash
# Check Orca pool
./scripts/health/liquidity-check.sh

# Verify:
# - TVL > $1M
# - Price impact for $10k < 1%
# - Concentrated liquidity in range
# - No unusual activity
```

### Evening Checklist (21:00 UTC)

- [ ] Review day's alerts and incidents
- [ ] Check bot performance (buyback, arbitrage)
- [ ] Verify all automated tasks completed
- [ ] Prepare handoff notes for next shift

## Automated Systems

### 1. Decay Execution Bot

**Schedule**: Daily at 00:00 UTC  
**Location**: `/opt/twist/bots/decay-bot`  
**Service**: `systemctl status twist-decay`

```bash
# Manual execution if needed
cd /opt/twist/bots/decay-bot
npm run execute-decay -- --dry-run  # Test first
npm run execute-decay               # Execute
```

**Troubleshooting**:
- If decay fails, check oracle prices first
- Verify no circuit breaker active
- Check gas balance in bot wallet
- Review logs: `/var/log/twist/decay.log`

### 2. Buyback Bot

**Schedule**: Continuous (checks every 60s)  
**Location**: `/opt/twist/bots/buyback-bot`  
**Service**: `systemctl status twist-buyback`

```bash
# View bot status
./scripts/bots/buyback-status.sh

# Restart if needed
sudo systemctl restart twist-buyback

# View logs
journalctl -u twist-buyback -f
```

**Daily Limits**:
- Maximum: $50,000 USDC per day
- Per transaction: $100 - $5,000
- Resets at 00:00 UTC

### 3. Arbitrage Monitor

**Schedule**: Continuous (checks every 5s)  
**Location**: `/opt/twist/bots/arbitrage-monitor`  
**Service**: `systemctl status twist-arbitrage`

```bash
# Check opportunities
./scripts/bots/arb-opportunities.sh

# Only alerts on opportunities > $100 profit
```

### 4. Circuit Breaker Monitor

**Schedule**: Continuous  
**Location**: Integrated in monitoring dashboard

Automatic triggers:
- Price volatility > 50% in 1 hour
- Volume spike > 10x average
- Oracle divergence > 5%
- Supply change > 2% in 24h

## Emergency Procedures

### 1. Circuit Breaker Triggered

**Severity**: HIGH  
**Response Time**: < 5 minutes

```bash
# 1. Verify trigger reason
curl https://monitor.twist.io/api/circuit-breaker

# 2. Check if legitimate
./scripts/emergency/verify-circuit-breaker.sh

# 3. If false positive, reset after cooldown
./scripts/emergency/reset-circuit-breaker.sh --verify

# 4. If legitimate threat, escalate to security team
```

**Notification Chain**:
1. Automated alert to on-call
2. Page security team lead
3. Notify CTO if critical

### 2. Oracle Failure

**Severity**: MEDIUM-HIGH  
**Response Time**: < 15 minutes

```bash
# Check oracle status
./scripts/oracles/health-check.sh

# If single oracle down:
# - System continues with 2/3 oracles
# - Monitor divergence closely
# - Contact oracle provider

# If multiple oracles down:
# - Trigger circuit breaker
# - Pause buyback bot
# - Emergency team meeting
```

### 3. Liquidity Crisis

**Severity**: HIGH  
**Response Time**: < 10 minutes

Signs:
- TVL drops below $500k
- Price impact > 5% for $10k trade
- Rapid liquidity withdrawal

Actions:
```bash
# 1. Pause buyback bot
sudo systemctl stop twist-buyback

# 2. Alert market making team
./scripts/alerts/liquidity-crisis.sh

# 3. Deploy emergency liquidity if authorized
# (Requires multi-sig)
```

### 4. Security Breach Suspected

**Severity**: CRITICAL  
**Response Time**: IMMEDIATE

```bash
# 1. IMMEDIATELY pause all operations
./scripts/emergency/EMERGENCY-PAUSE-ALL.sh

# 2. Snapshot current state
./scripts/emergency/snapshot-state.sh

# 3. Alert entire team
./scripts/alerts/security-breach.sh

# 4. Begin incident response procedure
```

## Incident Response

### Incident Classification

- **P0 (Critical)**: System down, funds at risk
- **P1 (High)**: Major functionality impaired
- **P2 (Medium)**: Minor functionality impaired
- **P3 (Low)**: Cosmetic or minor issues

### Response Procedure

1. **Detect & Alert** (0-5 min)
   - Automated monitoring triggers alert
   - On-call engineer acknowledges

2. **Assess** (5-15 min)
   - Determine severity
   - Check if known issue
   - Gather initial data

3. **Mitigate** (15-30 min)
   - Apply immediate fixes
   - Prevent further damage
   - Communicate status

4. **Resolve** (varies)
   - Implement permanent fix
   - Test thoroughly
   - Deploy carefully

5. **Post-Mortem** (within 48h)
   - Document timeline
   - Identify root cause
   - Create action items

### Communication Templates

**Initial Alert**:
```
🚨 INCIDENT: [P0/P1/P2/P3] - [Brief Description]
Status: Investigating
Impact: [User impact description]
ETA: Assessing
```

**Update**:
```
📊 UPDATE: [Incident Title]
Status: [Investigating/Mitigating/Monitoring]
Progress: [What's been done]
Next: [What's next]
ETA: [Time estimate]
```

**Resolution**:
```
✅ RESOLVED: [Incident Title]
Duration: [Start - End time]
Impact: [Final impact summary]
Cause: [Brief cause]
Post-mortem: [Date/time]
```

## Maintenance Procedures

### Weekly Maintenance (Sundays 10:00 UTC)

#### 1. System Updates

```bash
# Check for updates
./scripts/maintenance/check-updates.sh

# Apply security patches (if any)
./scripts/maintenance/apply-patches.sh --security-only

# Update monitoring agents
./scripts/maintenance/update-monitoring.sh
```

#### 2. Performance Review

```bash
# Generate performance report
./scripts/reports/weekly-performance.sh

# Key metrics:
# - Transaction success rate (target: >99.5%)
# - Average confirmation time (target: <2s)
# - Bot efficiency (buyback execution rate)
# - Gas usage optimization opportunities
```

#### 3. Backup Verification

```bash
# Verify all backups
./scripts/maintenance/verify-backups.sh

# Test restore procedure (on testnet)
./scripts/maintenance/test-restore.sh --network testnet
```

### Monthly Maintenance (First Sunday)

#### 1. Security Audit

```bash
# Run security scanner
./scripts/security/monthly-audit.sh

# Review:
# - Access logs
# - Unusual patterns
# - Failed authentication attempts
# - Program upgrade keys security
```

#### 2. Economic Model Review

- Review decay rate effectiveness
- Analyze buyback performance
- Check staking distribution
- Evaluate treasury growth

#### 3. Infrastructure Review

- RPC node performance
- Monitoring system health
- Alert fatigue analysis
- Cost optimization opportunities

### Upgrade Procedures

**Program Upgrades** (Requires multi-sig):

```bash
# 1. Build and test new version
cd programs/twist-token
anchor build
anchor test

# 2. Deploy to devnet
./scripts/deploy/upgrade-devnet.sh

# 3. Run integration tests
./scripts/test/integration-suite.sh --network devnet

# 4. Create upgrade proposal
./scripts/multisig/propose-upgrade.sh \
  --program twist-token \
  --buffer <buffer-address> \
  --description "Upgrade to v1.2.0: Fix X, Add Y"

# 5. Multi-sig members approve
# 6. Execute after timelock
```

## Security Protocols

### Key Management

1. **Program Upgrade Authority**: 3-of-5 multi-sig
2. **Treasury Access**: 3-of-5 multi-sig with 24h timelock
3. **Bot Wallets**: Hardware wallets, rotated monthly
4. **Monitoring Access**: 2FA required, IP whitelist

### Access Control

```bash
# Review access monthly
./scripts/security/audit-access.sh

# Revoke access
./scripts/security/revoke-access.sh --user <email>

# Grant access (requires approval)
./scripts/security/grant-access.sh --user <email> --role <role>
```

### Security Checklist

Daily:
- [ ] Review failed login attempts
- [ ] Check for unusual transaction patterns
- [ ] Verify multi-sig transactions

Weekly:
- [ ] Rotate bot wallet keys
- [ ] Review program logs for anomalies
- [ ] Update security patches

Monthly:
- [ ] Full security audit
- [ ] Penetration testing (quarterly)
- [ ] Social engineering training

## Monitoring & Alerts

### Alert Channels

1. **Critical (P0)**: PagerDuty → Phone call
2. **High (P1)**: PagerDuty → SMS + Discord
3. **Medium (P2)**: Discord + Email
4. **Low (P3)**: Email only

### Key Metrics & Thresholds

| Metric | Normal | Warning | Critical |
|--------|--------|---------|----------|
| Price vs Floor | 0.97-1.5x | <0.97 or >2x | <0.95 or >3x |
| Daily Volume | $500k-5M | <$200k or >10M | <$50k or >20M |
| Decay Delay | 24-25h | 25-26h | >26h |
| Oracle Divergence | <1% | 1-2% | >2% |
| TVL | >$1M | $500k-1M | <$500k |
| Gas Price | <0.001 SOL | >0.01 SOL | >0.1 SOL |
| Transaction Success | >99.5% | 98-99.5% | <98% |

### Custom Alerts

```bash
# Add custom alert
./scripts/monitoring/add-alert.sh \
  --metric "custom_metric" \
  --threshold "> 100" \
  --severity "medium" \
  --message "Custom metric exceeded threshold"
```

## Disaster Recovery

### Backup Strategy

- **State Snapshots**: Every 6 hours to S3
- **Transaction Logs**: Continuous to CloudWatch
- **Configuration**: Git + encrypted backups
- **Monitoring Data**: 30-day retention

### Recovery Procedures

#### 1. Program Corruption

```bash
# 1. Pause operations
./scripts/emergency/pause-all.sh

# 2. Assess damage
./scripts/recovery/assess-program.sh

# 3. Restore from backup
./scripts/recovery/restore-program.sh --timestamp <backup-time>

# 4. Verify integrity
./scripts/recovery/verify-state.sh

# 5. Resume operations
./scripts/recovery/resume-operations.sh
```

#### 2. RPC Node Failure

```bash
# Automatic failover should handle this
# If manual intervention needed:

# 1. Switch to backup RPC
./scripts/infrastructure/switch-rpc.sh --endpoint <backup-rpc>

# 2. Verify connectivity
./scripts/infrastructure/test-rpc.sh

# 3. Update all services
./scripts/infrastructure/update-services.sh
```

#### 3. Complete System Recovery

Full recovery playbook available at:
`/opt/twist/disaster-recovery/FULL-RECOVERY-PLAYBOOK.pdf`

**Recovery Priority**:
1. Secure all keys and wallets
2. Restore program state
3. Verify oracle connections
4. Re-establish liquidity
5. Resume automated systems
6. Enable user operations

## Contact Information

### Escalation Matrix

| Level | Role | Contact | Availability |
|-------|------|---------|--------------|
| L1 | On-Call Engineer | PagerDuty | 24/7 |
| L2 | Tech Lead | [REDACTED] | 24/7 |
| L3 | Security Lead | [REDACTED] | 24/7 |
| L4 | CTO | [REDACTED] | Business hours |
| L5 | CEO | [REDACTED] | Emergency only |

### External Contacts

| Service | Contact | Purpose |
|---------|---------|---------|
| Solana RPC | support@[provider].com | RPC issues |
| Orca | bd@orca.so | DEX issues |
| Pyth | support@pyth.network | Oracle issues |
| Switchboard | support@switchboard.xyz | Oracle issues |
| AWS | [Account manager] | Infrastructure |
| Security Firm | [REDACTED] | Incident response |

### Communication Channels

- **Operations**: #ops-twist (Discord)
- **Alerts**: #alerts-twist (Discord)
- **Engineering**: #eng-twist (Discord)
- **Incidents**: #incident-response (Discord)
- **Public Status**: https://status.twist.io

## Appendices

### A. Common Commands

```bash
# View program state
./scripts/view/program-state.sh

# Check bot wallets balance
./scripts/view/bot-balances.sh

# Generate daily report
./scripts/reports/daily-summary.sh

# Test transaction
./scripts/test/send-test-tx.sh
```

### B. Troubleshooting Guide

Common issues and solutions available at:
`/opt/twist/docs/troubleshooting.md`

### C. Regulatory Compliance

- KYC/AML procedures: See legal team
- Reporting requirements: Monthly to compliance
- Audit trail: All operations logged

### D. Change Log

All operational changes must be logged:
```bash
./scripts/changelog/add-entry.sh \
  --type "procedure|system|config" \
  --description "What changed" \
  --approver "who approved"
```

---

**Last Updated**: 2024-01-15  
**Version**: 1.0.0  
**Next Review**: 2024-02-15

**Remember**: When in doubt, escalate. Better safe than sorry.