# Design: Make the TWIST monorepo production-grade end-to-end (buildable, testable, deployable to staging + production).

## Overview

Treat “production-grade” as an engineering deliverable with explicit quality gates: **repo hygiene → deterministic builds → CI → staging deploy → production promotion**. The implementation approach is incremental: start by making the repo build/test reliably from a clean machine, then align infra with artifacts, then fix the critical-path runtime correctness issues, then add end-to-end smoke coverage and deploy automation.

## Architecture

### Component diagram (edit to match the codebase)

```mermaid
graph TB
  User[End User] --> Extension[Browser Extension]
  User --> Web[Web App]

  Extension --> Edge[Edge Workers (Cloudflare)]
  Web --> Edge

  Edge --> SecurityWAF[Security Worker / WAF]
  SecurityWAF --> VAU[VAU Processor Worker]
  VAU --> DO[Durable Objects]
  VAU --> Queues[Queues]
  VAU --> R2[R2 Audit/Analytics]

  Edge --> Services[Backend Services]
  Services --> Postgres[(Postgres)]
  Services --> Redis[(Redis)]

  Services --> Chain[Solana Programs]
  Chain --> Analytics[Analytics Pipeline]
```

### Key components

- **Clients** (`web/`, `extension/`, `mobile/`, `MVP/browser-extension/`): capture/submit events, display rewards/dashboards.
- **Edge layer** (`modules/plan-2-edge/`, `edge-workers/`): WAF/security checks, VAU validation, dedupe, rate limiting, queueing, audit logging.
- **Backend services** (`services/*`, `modules/plan-*/services/*`, `MVP/backend/*`): persistence, business logic, analytics, token distribution, admin APIs.
- **On-chain programs** (`programs/`, `twist-blockchain/`, `MVP/smart-contracts/`, `modules/plan-1-blockchain/`): staking, rewards, campaign registry, token, etc.
- **Infra & deploy** (`modules/plan-2-edge/terraform`, `k8s/`, `kubernetes/`, `docker-compose.production.yml`): staging/prod environments, deployments, monitoring.

## Data model / state

This repo spans multiple stores; the productionization work focuses on **consistency and contracts**, not redesign:
- **Postgres**: core relational state (users, campaigns, referrals, staking metadata, payouts).
- **Redis/KV/DO storage**: rate limits, sessions, dedupe keys, short-lived caches.
- **R2/Clickhouse/Analytics**: audit logs and analytics events.
- **Solana**: authoritative token/staking state.

## Interfaces / APIs

We will formalize interfaces in a way that is testable:
- **Edge public APIs**: `/api/v1/vau`, `/api/v1/vau/batch`, `/health`, `/metrics` (and security `/check` if used internally).
- **Service APIs**: use OpenAPI specs per service and/or a shared type package, with contract tests.
- **Queue message schemas**: versioned message types for `VAU_QUEUE`, `REWARD_QUEUE`, etc.
- **Error model**: consistent JSON error envelope, stable error codes, retry semantics.

## File-level changes

| File | Action | Purpose |
|------|--------|---------|
| `.github/workflows/ci.yml` | Create | Repo-root CI for PR/main |
| `.github/workflows/deploy-staging.yml` | Create | Automated staging deploy |
| `.github/workflows/deploy-production.yml` | Create | Gated production deploy |
| `scripts/ci/*` | Create/Modify | Standard entrypoints to build/test each component |
| `scripts/icloud/materialize.sh` | Create | Ensure no iCloud “dataless” files before CI/Git operations |
| `docs/` | Modify | “How to run”, release/deploy runbooks, environment setup |
| `modules/plan-2-edge/**` | Modify | Fix correctness and infra/artifact alignment |
| `services/**` | Modify | Fix compile/runtime issues, health endpoints, migrations |
| `programs/**` / `MVP/smart-contracts/**` | Modify | Choose source of truth, make Anchor builds/tests real |

## Failure modes & error handling

- iCloud dataless/truncated reads → preflight “materialize” step → fail-fast in CI with actionable output.
- Secret/PII in logs → redaction + header allowlists → audit logs contain only safe fields.
- Artifact path mismatch (tsc output vs Terraform) → enforce build outputs and verify in CI → deployments use correct files.
- Partial deployments / drift → environment-specific configs and idempotent infra apply → repeatable deploys.

## Edge cases

- Cross-runtime crypto: Node vs Workers crypto APIs → isolate crypto helpers with explicit algorithms and tests.
- Queue retries/idempotency: duplicate message processing → idempotency keys + safe ack/retry behavior.
- Hour rollover in Durable Objects aggregations → explicit hour keying + rollover logic.

## Security & privacy

- Prefer GitHub OIDC and environment-scoped secrets over long-lived “deploy tokens”.
- Enforce least-privilege Cloudflare API tokens and segregate staging vs production secrets.
- Implement request logging with:
  - header allowlist (never log `Authorization`, cookies, HMAC signatures, etc.)
  - payload redaction/sampling
  - explicit PII policy for analytics/audit logs
- Add secret scanning (gitleaks/trufflehog), dependency scanning (Dependabot), and CodeQL where applicable.

## Performance considerations

- Keep edge handlers lightweight; move heavy processing to queues.
- Avoid unbounded DO storage growth (alarms/cleanup) and ensure rate limiter keys are bounded.
- Use caching correctly (avoid caching sensitive endpoints; respect `Vary`, `Cache-Control`).

## Test strategy

Map tests back to acceptance criteria.

- **Unit**: per package (edge utils, services, SDKs).
- **Integration**: docker-compose test stack for service-to-service + DB/Redis; Miniflare for Workers; Anchor for programs.
- **E2E smoke**: “critical path” flows in staging (extension/web -> edge -> services -> chain) with a small deterministic dataset.

## Rollout / migration plan (if needed)

- Stage 0: make repo build/test deterministically and green in CI.
- Stage 1: deploy edge + minimal backend subset to staging; run smoke suite.
- Stage 2: fix remaining correctness gaps; expand e2e coverage.
- Stage 3: enable production deploy with manual approval gate; add rollback playbooks.
