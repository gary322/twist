---
spec: production-readiness
phase: research
created: 2026-02-06T15:49:16+00:00
---

# Research: production-readiness

## Goal

Make TWIST production-ready end-to-end

## Executive summary

- Feasibility: **Medium** (edge is deployable today; backend and auth flows need hardening/standardization before “production-grade” is accurate).
- Key constraints:
  - **Free tier**: staging/prod must be runnable at $0 cost (Cloudflare free tier + Oracle Always Free VM is the realistic baseline).
  - **GitHub-driven deploys**: CI/CD and environment separation must live in GitHub Actions + GitHub Environments.
  - **Canonical backend**: `services/*` is the only supported backend path.
  - **Edge deploy path**: Cloudflare Workers + Terraform only (no wrangler-only deploy flow).
- Risks:
  - **Auth mismatch**: `services/auth-service` issues wallet JWTs that do not currently satisfy `services/influencer-api` assumptions (claims/identity mapping).
  - **Mock blockchain client**: `packages/blockchain-sdk` is a stub; several “tx ids” are generated without on-chain settlement.
  - **Incomplete endpoint hardening**: some endpoints accept `userId`/`wallet` in request bodies; guards are inconsistent.
  - **Operational gaps**: staging/prod secrets are partially defined; backend deploy requires host/user/path + an actual VM to exist.

## Codebase scan

### Relevant existing components

- `modules/plan-2-edge/` — Cloudflare Worker(s) + Durable Objects + KV/R2/Queues + Terraform deploy; VAU ingestion exists and is already wired into CI/CD.
- `services/auth-service/` — Express wallet-auth service (nonce + Solana signature verify) that issues JWTs.
- `services/influencer-api/` — NestJS service with influencer, staking, links, click/conversion tracking, payouts, websockets; persists to Postgres and uses Redis/Bull.
- `packages/messages/` — shared message types (used by services; part of CI).
- `packages/blockchain-sdk/` — currently a mock Solana client; used by backend services for “token” ops.
- `.github/workflows/*` — CI, deploy workflows, CodeQL, gitleaks scanning.
- `docker-compose.backend.yml` — production-like local backend stack (auth + API + Postgres + Redis).
- `docs/operations/*` — Oracle Always Free runbook + SSH deploy key notes (backend deploy mechanism).

### Patterns to follow

- GitHub Environments separation (staging vs production): deploy workflows already use `environment: staging|production`.
- Encrypted Terraform state in `infra-state` branch: edge deploy workflows already persist state safely without Terraform Cloud.

### Gaps / missing pieces

- **Single canonical auth model** — needed so “wallet auth” can authorize influencer actions consistently (and so guards don’t rely on fictional JWT claims).
- **Guard consistency** — remove/replace broken Passport-based JWT guards (or wire the missing strategy) and enforce auth on sensitive endpoints.
- **Staking/payout correctness** — current “blockchain” operations are mocked; production requires a real settlement layer (on-chain or authoritative off-chain ledger).
- **Staging/prod backend hosting** — GitHub cannot host long-running backend services; repo needs a free VM or serverless target with a realistic ops story.
- **DB lifecycle** — migrations, indexes, backup/restore runbooks, and safe deploy sequencing.
- **Observability** — metrics exist in parts; need consistent logging + dashboards + alerting + SLOs.

## External research (optional)

- N/A for now (focus is on making existing repo deployable + secure on free-tier infra).

## Open questions

- “Production-ready” scope: is it enough to run edge + backend with off-chain accounting, or must Solana programs be required for v1?
- Identity model: should the system be wallet-first (wallet is `sub`) or email-first (wallet is a secondary attribute)?
- Staging/prod runtime target for backend: Oracle Always Free VM (recommended) vs rewriting backend into Workers/D1 to avoid SSH/VM ops.

## Sources

- `README.md`
- `modules/plan-2-edge/workers/vau-processor/src/middleware/auth.ts`
- `modules/plan-2-edge/workers/vau-processor/src/handlers/vau.ts`
- `services/auth-service/src/routes/auth.ts`
- `services/influencer-api/src/controllers/*`
- `services/influencer-api/src/guards/*`
- `packages/blockchain-sdk/src/index.ts`
