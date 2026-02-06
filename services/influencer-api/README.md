# Influencer API Service

This is the backend API service for the Twist influencer staking system.

## Features

- User-to-influencer staking with TWIST tokens
- Revenue sharing between influencers and stakers (0-50%)
- Tier progression system (Bronze/Silver/Gold/Platinum)
- Real-time staking metrics and APY calculations
- Search and discovery with filters
- Comprehensive analytics and reporting

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Solana RPC access

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Update `.env` with your configuration

4. Run database migrations:
   ```bash
   npm run migration:run
   ```

5. Start the service:
   ```bash
   npm run dev
   ```

## API Endpoints

### Staking

- `GET /api/v1/staking/search` - Search influencers with filters
- `GET /api/v1/staking/influencer/:id` - Get influencer staking details
- `GET /api/v1/staking/user/:userId/stakes` - Get user's stakes
- `POST /api/v1/staking/stake` - Stake on an influencer
- `POST /api/v1/staking/unstake` - Unstake from an influencer
- `POST /api/v1/staking/claim` - Claim pending rewards

### Influencers

- `POST /api/v1/influencers/register` - Register new influencer
- `GET /api/v1/influencers/:username` - Get influencer by username
- `PUT /api/v1/influencers/:id/profile` - Update influencer profile

## Testing

Run tests:
```bash
npm test
```

Run tests with coverage:
```bash
npm run test:cov
```

## Building

Build for production:
```bash
npm run build
```

## Deployment

The service is containerized and can be deployed to Kubernetes. See `/k8s/influencer-api.yaml` for the deployment configuration.