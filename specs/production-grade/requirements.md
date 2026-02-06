# Requirements: Make the TWIST monorepo production-grade end-to-end (buildable, testable, deployable to staging + production).

## Goal

Turn the current repository into a **reproducible, deployable, secure** system that can be cloned from GitHub and deployed to **staging** and **production** with clear quality gates. “Production-grade” here means builds/tests are deterministic, deploy artifacts match infrastructure expectations, secrets are handled correctly, and core user journeys work end-to-end.

## Users / personas

- Platform engineer / DevOps (owns CI/CD, infra, deployments)
- Backend/frontend developer (ships changes safely)
- Security/compliance (ensures no secret/PII leakage, good access controls)
- Product/QA (validates end-to-end journeys)

## User stories

### US-1: Clone, build, and run locally

**As a** developer
**I want** to clone the repo and run the system locally (or in a local “dev stack”)
**So that** I can develop and debug without relying on a bespoke environment.

**Acceptance criteria**
- AC-1.1: A documented local workflow exists (docker compose or equivalent) that starts required dependencies and services.
- AC-1.2: Core services expose health/readiness endpoints and pass basic smoke checks.

### US-2: Deterministic CI on every PR

**As a** platform engineer
**I want** CI to run lint/typecheck/tests/build on pull requests
**So that** broken or unsafe changes do not merge.

**Acceptance criteria**
- AC-2.1: Repo-root GitHub Actions workflows run for PRs and main branch, with caching and clear logs.
- AC-2.2: CI does not rely on local-only artifacts (`node_modules`, `dist`, `target`, iCloud “dataless” placeholders).

### US-3: Automated staging deploy + controlled production promotion

**As a** platform engineer
**I want** staging deploys to run automatically from main (or a release branch) and production deploys to require an approval gate
**So that** I can ship quickly but safely.

**Acceptance criteria**
- AC-3.1: Staging deployment can be triggered automatically and is reproducible from GitHub.
- AC-3.2: Production deployment uses GitHub Environments protection rules (required reviewers) and has rollback guidance.

### US-4: End-to-end critical path works

**As a** product owner
**I want** the end-to-end “critical path” journeys to work (client -> edge -> services -> chain/ledger -> analytics)
**So that** the system provides real value in production.

**Acceptance criteria**
- AC-4.1: A defined list of “v1 critical path” journeys exists with executable e2e/smoke tests.
- AC-4.2: Staging runs those tests against deployed endpoints; failures block promotion.

## Functional requirements (FR)

| ID | Requirement | Priority | Verification |
|----|-------------|----------|--------------|
| FR-1 | Repo can be cloned and built from scratch on CI (no local artifacts) | High | GitHub Actions CI green from a clean runner |
| FR-2 | Provide repo-root CI workflows (PR + main) covering lint/typecheck/tests/build for all production-target packages | High | `.github/workflows/*` runs; artifacts uploaded |
| FR-3 | Provide staging + production deployment workflows with environment-specific configuration and approvals | High | Successful staging deploy; production requires approval |
| FR-4 | Align infrastructure config with actual build outputs (Terraform/Wrangler/docker/k8s) | High | Deploy uses produced artifacts; routes/bindings validated |
| FR-5 | Implement/repair health/readiness endpoints and basic observability (logs + metrics) for all production services | High | `/health` and `/ready` endpoints + metrics scrape works |
| FR-6 | Secrets are never committed; runtime secrets come from environment/secret stores and are redacted from logs | High | Secret scanning + log redaction tests |
| FR-7 | Define and enforce API contracts (OpenAPI/JSON schema and/or shared types) between clients/edge/services | Medium | Contract tests + schema validation |
| FR-8 | Provide a documented release process (versioning, migrations, rollback) | Medium | Docs + runbooks in `docs/` |

## Non-functional requirements (NFR)

| ID | Category | Target | Notes |
|----|----------|--------|-------|
| NFR-1 | Build reproducibility | Same commit → same artifacts | Lockfiles + pinned toolchains; CI from clean runner |
| NFR-2 | Security | Least privilege + no secret/PII leakage | Redaction, secret scanning, principle of least privilege for tokens |
| NFR-3 | Reliability | Clear SLOs for critical APIs | Define SLOs for edge + API and wire alerts to them |
| NFR-4 | Observability | Logs/metrics for edge + services | Structured logs, request IDs, basic dashboards/alerts |
| NFR-5 | Maintainability | Fast feedback loop | CI duration targets; caching; small deploy units |

## Out of scope / non-goals

- New product features unrelated to productionization (tokenomics redesign, new UI features, new chain functionality).
- “Perfect” refactors across the whole repo that don’t improve reliability/security/deployability.

## Assumptions

- GitHub is the source of truth for code and CI/CD.
- Staging and production exist as separate environments with distinct secrets/config (GitHub Environments).
- Cloudflare Workers/Durable Objects remain the edge runtime for `modules/plan-2-edge/`.

## Dependencies

- GitHub repo access (owner/admin) to set branch protection and GitHub Environments.
- Cloudflare account (API token, account ID, zone ID, DNS control).
- Backend runtime target (k8s cluster and registry, or an alternative) plus PostgreSQL/Redis and secret store.
- Solana deployment target(s) (localnet/devnet/testnet/mainnet) and key management for upgrade authority.

## Success metrics

- CI green on PRs and main with <15–20 min runtime for the full suite (or a tiered pipeline).
- One-command staging deploy, and gated production deploy, both reproducible from GitHub.
- “Critical path” e2e smoke suite passes in staging; failures block promotion.
- No secrets/PII in logs and secret scanning shows 0 committed secrets.
