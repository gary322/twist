# TWIST Token Buyback Bot

Automated market buyback bot that monitors TWIST price and executes buybacks when the market price falls below the floor price threshold.

## Features

- **Automated Price Monitoring**: Continuously monitors TWIST price across multiple oracles
- **Smart Execution**: Executes buybacks when price drops below configurable threshold
- **Adaptive Sizing**: Dynamically adjusts buyback amounts based on market conditions
- **MEV Protection**: Includes anti-sandwich attack measures and random delays
- **Safety Limits**: Daily buyback limits and circuit breaker integration
- **Real-time Alerts**: Discord/Slack notifications for all buyback events
- **Performance Analytics**: Tracks buyback effectiveness and provides optimization suggestions

## Configuration

### Environment Variables

```bash
# Required
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
TWIST_PROGRAM_ID=TWSTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ORCA_WHIRLPOOL=WHRLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
BUYBACK_WALLET_PATH=/path/to/wallet.json

# Buyback Parameters
MAX_DAILY_BUYBACK=50000        # Maximum USDC per day
BUYBACK_THRESHOLD=97           # Trigger at 97% of floor price
MIN_BUYBACK=100               # Minimum USDC per buyback
MAX_BUYBACK=5000              # Maximum USDC per buyback
CHECK_INTERVAL=60000          # Check every 60 seconds

# Safety
MAX_SLIPPAGE=1.0              # Maximum 1% slippage
MAX_PRICE_IMPACT=2.0          # Maximum 2% price impact
GAS_LIMIT=400000              # Compute units
PRIORITY_FEE=50000            # Priority fee in lamports

# Monitoring (Optional)
DISCORD_WEBHOOK=https://discord.com/api/webhooks/xxx
WEBHOOK_URL=https://your-monitoring.com/webhook
```

### Configuration File

Edit `config.json` to customize buyback strategy:

```json
{
  "mainnet": {
    "buybackThresholdPercent": 97,    // Trigger below 97% of floor
    "aggressiveMode": true,           // More aggressive when far below floor
    "adaptiveSizing": true,           // Adjust size based on conditions
    "liquidityThreshold": 100000      // Minimum pool liquidity required
  }
}
```

## Usage

### Running the Bot

```bash
# Install dependencies
npm install

# Run in production
npm run buyback-bot

# Run with custom config
BUYBACK_CONFIG=./custom-config.json npm run buyback-bot

# Run in development mode
npm run buyback-bot:dev
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install
CMD ["npm", "run", "buyback-bot"]
```

```bash
# Build and run
docker build -t twist-buyback-bot .
docker run -d \
  --name twist-buyback \
  --env-file .env \
  -v /path/to/wallet:/wallet:ro \
  twist-buyback-bot
```

### Systemd Service

```ini
[Unit]
Description=TWIST Buyback Bot
After=network.target

[Service]
Type=simple
User=twist
WorkingDirectory=/opt/twist/buyback-bot
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=twist-buyback

[Install]
WantedBy=multi-user.target
```

## Monitoring

### Metrics Exposed (Prometheus format)

- `twist_buyback_total` - Total number of buybacks executed
- `twist_buyback_volume_usdc` - Total USDC spent on buybacks
- `twist_buyback_volume_twist` - Total TWIST purchased
- `twist_buyback_avg_discount` - Average discount captured
- `twist_buyback_daily_used` - Daily budget utilization
- `twist_buyback_errors_total` - Total errors encountered

### Health Check Endpoint

```bash
curl http://localhost:9091/health
```

### Grafana Dashboard

Import the dashboard from `monitoring/grafana-dashboard.json`

## Strategy

### Basic Strategy

1. Monitor price every 60 seconds
2. If price < 97% of floor price, trigger buyback
3. Calculate size based on discount (larger discount = larger buyback)
4. Execute with maximum 1% slippage tolerance

### Advanced Features

**Adaptive Sizing**
- Scales buyback size based on:
  - Price discount from floor
  - 24h trading volume
  - Available floor liquidity
  - Recent volatility

**MEV Protection**
- Random execution delays (0-30 seconds)
- Priority fees to ensure inclusion
- Monitors for sandwich attacks
- Splits large orders if needed

**Safety Checks**
- Oracle consensus required (max 5% divergence)
- Minimum liquidity check
- Circuit breaker integration
- Daily limit enforcement

## Troubleshooting

### Common Issues

**"Insufficient liquidity"**
- Pool TVL is below minimum threshold
- Solution: Wait for more liquidity or reduce buyback size

**"Oracle divergence too high"**
- Oracle prices differ by more than 5%
- Solution: Wait for oracles to converge or check oracle health

**"Daily limit reached"**
- Already spent maximum daily allocation
- Solution: Wait for next UTC day or increase limit

**"Transaction simulation failed"**
- Slippage too high or pool state changed
- Solution: Increase slippage tolerance or reduce size

### Debug Mode

```bash
# Enable verbose logging
DEBUG=twist:* npm run buyback-bot

# Dry run mode (no actual transactions)
DRY_RUN=true npm run buyback-bot
```

## Performance Optimization

### Recommendations

1. **Timing**: Avoid US market open/close for better prices
2. **Size**: Smaller, frequent buybacks often better than large ones
3. **Threshold**: 97% captures good discounts without being too aggressive
4. **Monitoring**: Watch for patterns in successful buybacks

### Analytics

Run performance analysis:

```bash
npm run analyze-buybacks -- --days 30
```

Outputs:
- Average execution price vs market price
- Total value captured
- Optimal execution times
- Size recommendations

## Security

- Wallet private key never logged
- All webhooks use HTTPS
- Transactions simulated before execution
- Automatic pause on repeated failures
- Read-only RPC access where possible

## Development

### Testing

```bash
# Unit tests
npm test

# Integration tests (uses devnet)
npm run test:integration

# Simulate buyback conditions
npm run test:simulate-buyback
```

### Adding New Strategies

1. Extend `BuybackStrategy` class
2. Override `shouldTriggerBuyback()` and `calculateBuybackAmount()`
3. Add configuration parameters
4. Test thoroughly on devnet first

## License

Copyright (c) 2024 TWIST Protocol. All rights reserved.