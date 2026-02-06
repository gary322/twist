# TWIST Token Technical Documentation

Comprehensive technical documentation for the TWIST token ecosystem on Solana blockchain.

## Table of Contents

1. **Architecture**
   - [System Architecture](./architecture/README.md)
   - [Smart Contract Design](./architecture/smart-contracts.md)
   - [Economic Model](./architecture/economic-model.md)
   - [Security Architecture](./architecture/security.md)

2. **Core Components**
   - [Token Program](./core/token-program.md)
   - [Staking System](./core/staking.md)
   - [Decay Mechanism](./core/decay.md)
   - [Treasury Management](./core/treasury.md)
   - [Oracle Integration](./core/oracles.md)

3. **DeFi Features**
   - [Liquidity Pools](./defi/liquidity-pools.md)
   - [Buyback Mechanism](./defi/buyback.md)
   - [Yield Aggregation](./defi/yield.md)
   - [Cross-Chain Bridge](./defi/bridge.md)

4. **Automated Systems**
   - [Buyback Bot](./bots/buyback-bot.md)
   - [Market Maker](./bots/market-maker.md)
   - [Arbitrage Monitor](./bots/arbitrage-monitor.md)
   - [Volume Tracker](./bots/volume-tracker.md)

5. **SDK & Integration**
   - [TypeScript SDK](./sdk/typescript.md)
   - [API Reference](./sdk/api-reference.md)
   - [Integration Guide](./sdk/integration-guide.md)
   - [Code Examples](./sdk/examples.md)

6. **Operations**
   - [Operations Runbook](./operations-runbook.md)
   - [Deployment Guide](./operations/deployment.md)
   - [Monitoring Setup](./operations/monitoring.md)
   - [Incident Response](./operations/incidents.md)

7. **Security**
   - [Security Audit](./security/audit.md)
   - [Threat Model](./security/threats.md)
   - [Best Practices](./security/best-practices.md)
   - [Bug Bounty](./security/bug-bounty.md)

8. **Testing**
   - [Test Strategy](./testing/strategy.md)
   - [Unit Tests](./testing/unit-tests.md)
   - [Integration Tests](./testing/integration-tests.md)
   - [Performance Tests](./testing/performance.md)

## Quick Start

### For Developers

1. **Install SDK**
   ```bash
   npm install @twist/sdk
   ```

2. **Basic Usage**
   ```typescript
   import { TwistClient } from '@twist/sdk';
   
   const client = new TwistClient({
     connection,
     wallet,
   });
   
   // Buy TWIST tokens
   await client.swap('USDC', 100);
   
   // Stake tokens
   await client.stake(1000, 90); // 1000 TWIST for 90 days
   ```

3. **Read the Guides**
   - [Getting Started](./sdk/getting-started.md)
   - [Common Patterns](./sdk/patterns.md)
   - [Troubleshooting](./sdk/troubleshooting.md)

### For Operators

1. **Deploy Infrastructure**
   - Follow the [Deployment Guide](./operations/deployment.md)
   - Setup [Monitoring](./operations/monitoring.md)
   - Configure [Alerts](./operations/alerts.md)

2. **Run Bots**
   - [Buyback Bot Setup](./bots/buyback-bot.md#setup)
   - [Market Maker Config](./bots/market-maker.md#configuration)
   - [Bot Coordination](./bots/coordination.md)

3. **Emergency Procedures**
   - [Circuit Breaker](./operations/circuit-breaker.md)
   - [Incident Response](./operations/incidents.md)
   - [Recovery Procedures](./operations/recovery.md)

## Key Concepts

### Decay Mechanism
TWIST implements a 0.5% daily decay on all token balances, creating deflationary pressure:
- Automated daily execution
- 90% to floor treasury, 10% to operations
- Compound decay calculations
- MEV-resistant implementation

### Floor Price Support
The protocol maintains a price floor through:
- Automated buybacks when price < 97% of floor
- Dynamic buyback sizing based on price deviation
- Treasury-backed liquidity
- PID controller for supply regulation

### Staking Rewards
Multi-tier staking system with decay-adjusted APYs:
- 30 days: 10% APY
- 90 days: 20% APY
- 180 days: 35% APY
- 365 days: 67% APY

### Cross-Chain Bridge
Wormhole-powered bridge supporting:
- Ethereum
- BSC
- Polygon
- Avalanche

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines.

## Support

- Discord: [discord.gg/twist](https://discord.gg/twist)
- GitHub: [github.com/twist-protocol](https://github.com/twist-protocol)
- Email: support@twist.io

## License

MIT - See [LICENSE](../LICENSE)