# Influencer Dashboard

Web dashboard for the Twist influencer staking system.

## Features

- Search and discover influencers with filters
- Real-time staking metrics and APY
- Stake/unstake TWIST tokens
- Portfolio management with pending rewards
- Detailed analytics and charts
- Solana wallet integration

## Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

## Configuration

The app expects the API to be running on `http://localhost:3001`. This is configured in `vite.config.ts`.

## Pages

- `/` - Homepage with platform overview
- `/staking` - Influencer staking search and management

## Components

- `InfluencerCard` - Display influencer metrics and staking options
- `StakingModal` - Handle stake transactions
- `InfluencerDetailsModal` - Detailed analytics and information

## Integration

The dashboard connects to:
- Influencer API service on port 3001
- Solana mainnet-beta for wallet transactions
- Uses Phantom wallet adapter