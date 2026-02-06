# TWIST Volume Tracker

Real-time volume tracking and metrics exporter for TWIST token trading activity across multiple DEXes.

## Features

- **Multi-DEX Support**: Tracks trades on Orca and Raydium
- **Real-time Monitoring**: WebSocket subscriptions for instant trade detection
- **Comprehensive Metrics**: Volume by time period, trade counts, unique traders, buy/sell pressure
- **Prometheus Integration**: Exports metrics in Prometheus format for monitoring
- **SQLite Storage**: Persistent storage of trade history with efficient queries
- **Alert System**: Configurable alerts for volume spikes, imbalances, and low activity
- **Historical Analysis**: APIs for retrieving historical volume data

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Orca Pool     │────▶│  Volume Tracker  │────▶│ Metrics Export  │
└─────────────────┘     │                  │     └─────────────────┘
                        │  - Trade Analysis │              │
┌─────────────────┐     │  - Volume Calc   │              ▼
│  Raydium Pool   │────▶│  - Alert System  │     ┌─────────────────┐
└─────────────────┘     │  - Data Storage  │     │   Prometheus    │
                        └──────────────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  SQLite DB      │
                        └─────────────────┘
```

## Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

## Configuration

### Environment Variables

```bash
# RPC Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Program Configuration
TWIST_PROGRAM_ID=TWSTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# DEX Pool Addresses
ORCA_POOL=<orca-pool-address>
RAYDIUM_POOL=<raydium-pool-address>

# Tracking Configuration
VOLUME_UPDATE_INTERVAL=60000  # Update interval in ms (default: 1 minute)
VOLUME_DB_PATH=./data/volume.db
VOLUME_METRICS_PORT=9092

# Alerts (optional)
VOLUME_WEBHOOK_URL=https://your-webhook.com/alerts
```

## Usage

### Running Locally

```bash
# Run in foreground
./run.sh

# Run as daemon
./run.sh --daemon

# Stop daemon
./stop.sh
```

### Running as System Service

```bash
# Copy service file
sudo cp volume-tracker.service /etc/systemd/system/twist-volume-tracker.service

# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable twist-volume-tracker
sudo systemctl start twist-volume-tracker

# Check status
sudo systemctl status twist-volume-tracker

# View logs
journalctl -u twist-volume-tracker -f
```

## Metrics

The volume tracker exports the following metrics on port 9092 (configurable):

### Volume Metrics
- `twist_volume_1m` - 1 minute trading volume in USD
- `twist_volume_5m` - 5 minute trading volume in USD
- `twist_volume_15m` - 15 minute trading volume in USD
- `twist_volume_1h` - 1 hour trading volume in USD
- `twist_volume_24h` - 24 hour trading volume in USD
- `twist_volume_7d` - 7 day trading volume in USD
- `twist_volume_30d` - 30 day trading volume in USD

### Trade Metrics
- `twist_trade_count_1h` - Number of trades in the last hour
- `twist_trade_count_24h` - Number of trades in the last 24 hours
- `twist_unique_traders_24h` - Number of unique traders in 24h
- `twist_avg_trade_size_24h` - Average trade size in USD

### Buy/Sell Metrics
- `twist_buy_volume_24h` - 24 hour buy volume in USD
- `twist_sell_volume_24h` - 24 hour sell volume in USD
- `twist_buy_pressure` - Buy pressure ratio (0-1)

### DEX-specific Metrics
- `twist_trades_total_orca{side}` - Total trades on Orca
- `twist_volume_total_orca{side}` - Total volume on Orca
- `twist_trades_total_raydium{side}` - Total trades on Raydium
- `twist_volume_total_raydium{side}` - Total volume on Raydium

### Distribution Metrics
- `twist_trade_size_usd` - Histogram of trade sizes
- `twist_execution_price` - Histogram of execution prices
- `twist_trade_fee_usd` - Histogram of trade fees

## API Endpoints

### Prometheus Metrics
```
GET /metrics
```

### Health Check
```
GET /health
```

### Current Summary
```
GET /summary
```

## Database Schema

### trades
- `signature` (TEXT) - Transaction signature
- `timestamp` (INTEGER) - Trade timestamp
- `trader` (TEXT) - Trader wallet address
- `dex` (TEXT) - DEX name (Orca/Raydium)
- `side` (TEXT) - buy/sell
- `amount_in` (REAL) - Input token amount
- `amount_out` (REAL) - Output token amount
- `price` (REAL) - Execution price
- `volume_usd` (REAL) - Volume in USD
- `fee` (REAL) - Trading fee

### volume_snapshots
- `timestamp` (INTEGER) - Snapshot timestamp
- `volume_*` (REAL) - Volume for different periods
- `trade_count_24h` (INTEGER) - 24h trade count
- `unique_traders_24h` (INTEGER) - Unique traders
- `buy_volume_24h` (REAL) - Buy volume
- `sell_volume_24h` (REAL) - Sell volume
- `buy_pressure` (REAL) - Buy pressure ratio

### trader_stats
- `trader` (TEXT) - Trader address
- `first_trade` (INTEGER) - First trade timestamp
- `last_trade` (INTEGER) - Last trade timestamp
- `total_trades` (INTEGER) - Total number of trades
- `total_volume` (REAL) - Total volume traded
- `avg_trade_size` (REAL) - Average trade size

## Alerts

The volume tracker can send alerts via webhook for:

### Volume Spike Alert
Triggered when 24h volume exceeds 3x the 30-day average.

### Volume Imbalance Alert
Triggered when buy or sell pressure exceeds 80%.

### Low Volume Alert
Triggered when 24h volume drops below $50,000.

Alert format:
```json
{
  "type": "volume_spike",
  "severity": "high",
  "message": "Volume spike detected: 5.2x average",
  "data": {
    "current24h": 2600000,
    "average24h": 500000
  },
  "timestamp": 1234567890000,
  "source": "volume-tracker"
}
```

## Maintenance

### Database Cleanup
Old trade data is automatically cleaned up after 90 days to prevent database bloat.

### Manual Cleanup
```bash
# Clean trades older than 30 days
sqlite3 ./data/volume.db "DELETE FROM trades WHERE timestamp < strftime('%s', 'now', '-30 days') * 1000"
```

### Backup
```bash
# Backup database
cp ./data/volume.db ./data/volume.db.backup

# Restore from backup
cp ./data/volume.db.backup ./data/volume.db
```

## Troubleshooting

### Volume tracker not detecting trades
1. Check RPC connection: `curl <RPC_URL>/health`
2. Verify pool addresses are correct
3. Check logs for WebSocket errors

### High memory usage
1. Reduce in-memory trade retention period
2. Increase database cleanup frequency
3. Check for memory leaks in logs

### Database errors
1. Check disk space: `df -h`
2. Verify database integrity: `sqlite3 ./data/volume.db "PRAGMA integrity_check"`
3. Repair if needed: `sqlite3 ./data/volume.db "VACUUM"`

## Development

### Running Tests
```bash
npm test
```

### Building
```bash
npm run build
```

### Type Checking
```bash
npm run typecheck
```

## Security Considerations

1. **RPC Access**: Use authenticated RPC endpoints in production
2. **Database**: Regular backups and access control
3. **Webhooks**: Use HTTPS and authentication for webhook URLs
4. **Metrics**: Consider authentication for metrics endpoint in production

## Performance Tuning

### RPC Optimization
- Use dedicated RPC nodes for better performance
- Implement request batching where possible
- Monitor RPC rate limits

### Database Optimization
- Regular VACUUM operations
- Proper indexing (already implemented)
- Consider partitioning for very high volume

### Memory Optimization
- Adjust trade retention period based on available memory
- Use streaming for large data exports
- Monitor memory usage with metrics

## License

MIT