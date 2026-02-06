# Requirements: Make TWIST production-ready end-to-end

## Goal

Make TWIST **deployable and operable** in staging and production with repeatable CI/CD, consistent authentication, baseline security controls, and clear runbooks, while staying within a **$0 infrastructure baseline**.

## Users / personas

- Repo maintainers / operators (deploy, debug, rotate secrets, recover from incidents).
- Contributors (run locally, change code safely, ship via PRs).
- Integrators (frontends/SDKs calling edge + backend APIs).

## User stories

### US-1: Safe staging + production deployments

**As a** maintainer/operator  
**I want** staging deployments to run automatically and production deployments to be manual and auditable  
**So that** releases are repeatable, safe, and debuggable

**Acceptance criteria**
- AC-1.1: A PR must pass CI + security checks before it can land on `main`.
- AC-1.2: Pushing to `main` triggers staging deploy workflows for edge and backend.
- AC-1.3: Production deploy workflows are `workflow_dispatch` and gated by GitHub Environment secrets.
- AC-1.4: Deploy workflows support rollback (at minimum: re-deploy previous image/bundle; edge uses Terraform state + versioned bundles).

### US-2: Local developer experience

**As a** contributor  
**I want** to run the backend stack locally and run unit tests reliably  
**So that** I can change code without guessing

**Acceptance criteria**
- AC-2.1: `docker compose --env-file .env.backend -f docker-compose.backend.yml up -d --build` brings up Postgres, Redis, `auth-service`, and `influencer-api`.
- AC-2.2: `modules/plan-2-edge`, `services/auth-service`, `services/influencer-api`, and shared packages build and test in CI (already required checks).
- AC-2.3: Documentation calls out known incomplete areas (e.g., mock chain client) rather than claiming “fully built”.

### US-3: Auth works end-to-end

**As a** frontend/SDK integrator  
**I want** a single JWT format that authorizes backend actions  
**So that** protected endpoints are actually protected and identity mapping is consistent

**Acceptance criteria**
- AC-3.1: A JWT minted by `services/auth-service` can be used to call protected endpoints in `services/influencer-api`.
- AC-3.2: The backend derives `userId`/`influencerId` from verified claims (not from request bodies).
- AC-3.3: Sensitive endpoints are guarded consistently (no “JWT guard” classes that are unconfigured/broken).

## Functional requirements (FR)

| ID | Requirement | Priority | Verification |
|----|-------------|----------|--------------|
| FR-1 | Edge deploys via Terraform from `modules/plan-2-edge/` in both `staging` and `production` GitHub Environments | High | Run deploy workflow in each env; confirm routes respond |
| FR-2 | Backend deploys via GitHub Actions to a free VM using Docker Compose | High | Run deploy workflow; hit `/health` and `/ready` |
| FR-3 | Backend auth is standardized (JWT issuance + verification + claims mapping) | High | Integration test: auth-service token works for influencer-api |
| FR-4 | Staking/link/payout endpoints enforce authorization for writes | High | Security review + tests; attempt unauthorized calls |
| FR-5 | Database migrations are runnable in CI and during deploy | High | `npm run migration:run` (or equivalent) succeeds in staging |
| FR-6 | Observability is consistent (health/readiness/metrics, structured logs) | Medium | Scrape metrics; check logs in deploy run |
| FR-7 | Runbooks exist for common incidents and key rotations | Medium | Docs review |

## Non-functional requirements (NFR)

| ID | Category | Target | Notes |
|----|----------|--------|-------|
| NFR-1 | Performance | Edge VAU p95 < 200ms | Measured at edge; excludes client network variance |
| NFR-2 | Security | No plaintext secrets in repo or logs | Enforced by gitleaks + review; secrets only in GitHub Environments |
| NFR-3 | Reliability | 99.9% monthly availability for public endpoints | Achieved via retries/backoff + health checks + safe deploys |
| NFR-4 | Maintainability | Clear “canonical paths” and docs | Avoid “dead” modules being treated as production |

## Out of scope / non-goals

- Implementing the full advertiser/publisher product lines that exist as prototypes elsewhere in the repo.
- Guaranteeing tokenomics correctness until the mock chain client is replaced with real settlement.
- Multi-region backend HA (the free-tier baseline is a single VM).

## Assumptions

- A Cloudflare account and zone/domain exist for edge deployment.
- A free VM exists for backend (Oracle Always Free recommended) with Docker installed.
- Postgres + Redis are acceptable as the canonical backend stores.

## Dependencies

- Cloudflare secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- Backend deploy secrets: `BACKEND_DEPLOY_HOST`, `BACKEND_DEPLOY_USER`, `BACKEND_DEPLOY_PATH`, `DEPLOY_SSH_PRIVATE_KEY`.
- A Solana RPC endpoint for any chain integration (`SOLANA_RPC_ENDPOINT`).

## Success metrics

- `main` remains protected and PR-only, with required checks green.
- Staging deploys succeed from a clean repo state within 30 minutes.
- A wallet-auth token can authorize influencer-api writes (stake, link generation, payouts) without passing identity in request bodies.
