# TWIST Market Maker Bot

Automated market making bot for TWIST token on Orca Whirlpool with dynamic spread management and risk controls.

## Overview

The TWIST Market Maker bot provides continuous liquidity to the TWIST/USDC pool by:
- Placing buy and sell orders at calculated spreads
- Dynamically adjusting spreads based on market conditions
- Managing inventory to maintain target balances
- Implementing comprehensive risk management
- Optimizing for profitability while providing liquidity

## Features

### Dynamic Spread Management
- Base spread with automatic adjustments
- Volatility-based spread widening
- Volume-based spread tightening
- Inventory skew adjustments
- Competition analysis

### Inventory Management
- Target inventory maintenance
- Automatic rebalancing
- Skew monitoring and alerts
- Trend analysis

### Risk Controls
- Maximum exposure limits
- Daily loss limits
- Volatility circuit breakers
- Inventory imbalance protection
- Emergency stop functionality

### Order Management
- Multiple order levels
- Size optimization
- Fill tracking
- P&L calculation

## Architecture

```
┌─────────────────────┐
│   Market Maker Bot  │
├─────────────────────┤
│  Spread Calculator  │ ◄─── Market conditions
│  Order Manager      │ ◄─── Order execution
│  Inventory Manager  │ ◄─── Balance tracking
│  Risk Manager       │ ◄─── Risk monitoring
└─────────────────────┘
          │
          ▼
    ┌─────────────┐
    │ Orca Pool   │
    └─────────────┘
```

## Installation

```bash
# Install dependencies
npm install

# Create wallet (if needed)
solana-keygen new -o wallet.json

# Fund wallet with TWIST and USDC
# Recommended: 100,000 TWIST + 5,000 USDC minimum
```

## Configuration

### Environment Variables

```bash
# RPC Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Wallet
MARKET_MAKER_WALLET=./wallet.json

# Program IDs
TWIST_PROGRAM_ID=TWSTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ORCA_POOL=<orca-pool-address>

# Target Inventory
TARGET_TWIST_INVENTORY=100000   # Target TWIST balance
TARGET_USDC_INVENTORY=5000      # Target USDC balance

# Spread Configuration (in basis points)
BASE_SPREAD_BPS=50              # Base spread (0.5%)
MIN_SPREAD_BPS=20               # Minimum spread (0.2%)
MAX_SPREAD_BPS=200              # Maximum spread (2%)

# Order Configuration
MIN_ORDER_SIZE=100              # Minimum order size in USDC
MAX_ORDER_SIZE=1000             # Maximum order size in USDC
ORDER_LEVELS=5                  # Number of order levels

# Risk Parameters
MAX_EXPOSURE=20000              # Maximum total exposure in USD
INVENTORY_SKEW_LIMIT=0.3        # Maximum 30% inventory imbalance
STOP_LOSS_THRESHOLD=0.1         # 10% stop loss

# Update Intervals
UPDATE_INTERVAL=5000            # Order update interval (ms)
METRICS_INTERVAL=60000          # Metrics reporting interval (ms)
```

## Usage

### Running the Bot

```bash
# Run in foreground
npm start

# Run with custom config
SOLANA_RPC_URL=<your-rpc> npm start

# Run with TypeScript directly
ts-node index.ts
```

### Monitoring

The bot logs key information to console:

```
🤖 Starting TWIST Market Maker Bot...

Configuration:
  Base spread: 0.5%
  Order levels: 5
  Max exposure: $20,000

Initial inventory:
  TWIST: 100,000
  USDC: $5,000

📊 Market State at 2024-01-15T10:30:00.000Z
  Mid price: $0.0500
  Spread: 50 bps → 45 bps
  Inventory skew: -5.2%
  Total exposure: $10,000
  24h volume: $500,000
  Volatility: 2.1%

✅ Placed buy order: $500.00 at $0.0497
✅ Placed sell order: 10000.00 TWIST at $0.0503
```

## Strategies

### 1. Base Strategy
The default strategy maintains a constant spread around the mid-market price, adjusted for market conditions.

### 2. Inventory-Based Strategy
Adjusts spreads to encourage trades that rebalance inventory:
- Tighter buy spreads when TWIST inventory is low
- Tighter sell spreads when TWIST inventory is high

### 3. Volume-Based Strategy
Tightens spreads during high-volume periods to capture more trades.

### 4. Volatility-Based Strategy
Widens spreads during volatile markets to protect against adverse selection.

## Risk Management

### Exposure Limits
- Maximum total exposure across all orders
- Per-order size limits
- Dynamic sizing based on inventory

### Loss Limits
- Daily loss limit (default: 5% of max exposure)
- Automatic trading pause when exceeded
- Manual reset required

### Circuit Breakers
Automatic pause triggers:
- Extreme volatility (>10%)
- Severe inventory imbalance (>50%)
- Technical issues (RPC failures, etc.)

### Emergency Stop
Manual emergency stop:
- Press Ctrl+C to initiate graceful shutdown
- All orders cancelled
- Positions closed
- Final P&L reported

## Performance Metrics

### Real-time Metrics
- Active orders count
- Total liquidity provided
- Current P&L
- Inventory status

### Historical Analysis
- Fill rate
- Average spread captured
- Sharpe ratio
- Maximum drawdown

## Troubleshooting

### Bot not placing orders
1. Check wallet balance
2. Verify pool address
3. Check RPC connection
4. Review risk limits

### High losses
1. Review spread settings
2. Check market volatility
3. Analyze fill patterns
4. Adjust risk parameters

### Inventory imbalance
1. Review rebalancing settings
2. Check for directional market
3. Adjust target inventory
4. Consider manual rebalancing

## Advanced Configuration

### Custom Spread Function
```typescript
// In spread-calculator.ts
calculateOptimalSpread(marketState: any): number {
  // Implement custom logic
  return customSpread;
}
```

### Custom Risk Rules
```typescript
// In risk-manager.ts
checkCustomRisk(state: any): RiskCheck {
  // Implement custom risk checks
  return { passed: true, severity: 'low', actions: [] };
}
```

## Security Considerations

1. **Wallet Security**
   - Use hardware wallet in production
   - Never share private keys
   - Rotate keys regularly

2. **API Security**
   - Use private RPC endpoints
   - Implement rate limiting
   - Monitor for unusual activity

3. **Strategy Security**
   - Don't expose strategy parameters
   - Randomize order timings
   - Implement anti-gaming measures

## Maintenance

### Daily Tasks
- Check P&L performance
- Review risk incidents
- Monitor inventory balance
- Verify system health

### Weekly Tasks
- Analyze spread efficiency
- Review fill statistics
- Optimize parameters
- Update risk limits

### Monthly Tasks
- Full performance review
- Strategy optimization
- Security audit
- Wallet rotation

## Integration

### Monitoring Integration
```bash
# Prometheus metrics (coming soon)
curl http://localhost:9090/metrics

# Health check
curl http://localhost:8080/health
```

### Alert Integration
- Discord webhooks
- Email alerts
- PagerDuty integration
- Custom webhooks

## Disclaimer

This market maker bot is provided as-is for educational purposes. Market making involves significant risk of loss. Always test thoroughly on devnet before using real funds. The authors are not responsible for any losses incurred through use of this software.

## License

MIT