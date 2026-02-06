# TWIST Backend APIs

This repo contains two backend HTTP services that are deployed together via Docker Compose:

- `services/auth-service/` (Express): Solana wallet signature authentication, JWT issuance, metrics.
- `services/influencer-api/` (NestJS): Influencer + staking domain APIs, Postgres persistence, Redis caching/queues.

For the edge APIs (Cloudflare Workers), see `modules/plan-2-edge/`.

## Base URLs (local)

When running `docker-compose.backend.yml` locally:

- Auth service: `http://localhost:3001`
- Influencer API: `http://localhost:3003` (host port mapped to container port `3000`)

Health endpoints:

- `GET http://localhost:3001/health`
- `GET http://localhost:3003/health`

## Auth service (`services/auth-service`)

Key endpoints:

- `GET /health`
- `GET /ready`
- `GET /metrics` (Prometheus)
- `POST /auth/nonce` with `{ walletAddress }` -> returns `{ message, nonce, ttlSeconds }`
- `POST /auth/verify` with `{ walletAddress, signature }` -> returns `{ accessToken }`

Wallet auth handshake:

1. Call `/auth/nonce` to get a one-time message.
2. Have the user sign the message with their Solana wallet.
3. Send the signature to `/auth/verify` to mint a JWT.

## Influencer API (`services/influencer-api`)

The full endpoint surface is defined by controllers under `services/influencer-api/src/controllers/`.

Common endpoints:

- `GET /health`
- `GET /ready`
- `GET /staking/search`
- `POST /staking/stake`
- `POST /influencers/register`

Swagger docs:

- Enabled only when `NODE_ENV != production`.
- Path: `GET /api/docs`

WebSocket namespaces (Socket.IO):

- `/staking` (see `services/influencer-api/src/gateways/staking.gateway.ts`)
- `/realtime` (see `services/influencer-api/src/gateways/realtime.gateway.ts`)

Important notes:

- JWT authentication is not yet standardized end-to-end. Some controllers are guarded, others are not, and JWT claim expectations differ across components. Do not treat this as production-complete auth without auditing and consolidation.
- Some staking flows generate mock transaction ids and persist state in Postgres (see comments in `services/influencer-api/src/services/staking.service.ts`).

## Environment variables (backend compose)

See `.env.backend.example` and `docker-compose.backend.yml` for the authoritative list.
