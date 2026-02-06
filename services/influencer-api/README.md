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

- Node.js 20+
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

4. Start the service:
   ```bash
   npm run dev
   ```

## API Endpoints

### Staking

- `GET /staking/search` - Search influencers with filters
- `GET /staking/influencer/:influencerId` - Get influencer staking details
- `GET /staking/user/:userId/stakes` - Get user's stakes
- `POST /staking/stake` - Stake on an influencer
- `POST /staking/unstake` - Unstake from an influencer
- `POST /staking/claim` - Claim pending rewards

### Influencers

- `POST /influencers/register` - Register new influencer
- `GET /influencers/:username` - Get influencer by username
- `PUT /influencers/:influencerId/profile` - Update influencer profile (JWT-protected)

### Health

- `GET /health`
- `GET /ready`

## Swagger

Swagger is only enabled when `NODE_ENV != production`:

- `GET /api/docs`

## WebSockets

Socket.IO namespaces:

- `/staking` (staking events)
- `/realtime` (misc real-time updates)

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

This repo deploys backend services via Docker Compose on a VM:

- Compose: `docker-compose.backend.yml`
- VM runbook: `docs/operations/backend_oracle_always_free.md`

Note: `services/influencer-api/Dockerfile` expects **repo-root** docker build context (it builds local packages under `packages/*`).

## Production notes

- Authentication is not yet consistently enforced across all controllers; harden before production use.
- Several staking flows generate mock transaction ids; treat on-chain integration as incomplete unless verified.
