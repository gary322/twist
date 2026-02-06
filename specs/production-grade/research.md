---
spec: production-grade
phase: research
created: 2026-02-06T10:21:38+00:00
---

# Research: production-grade

## Goal

Make the TWIST monorepo production-grade end-to-end (buildable, testable, deployable to staging + production).

## Executive summary

- Feasibility: **High**, but it is not “production-ready” today despite existing reports/docs claiming it is.
- Key constraints:
  - Repo is currently stored in iCloud Drive. Many files are flagged `compressed,dataless` and intermittently fail reads (Git indexing errors like “short read while indexing”). This blocks reliable builds, tests, and even `git add`.
  - Multiple subprojects exist (web, extension, edge workers, backend services, on-chain programs, MVP variants) with inconsistent wiring, duplicated implementations, and mismatched infrastructure configs.
  - GitHub Actions workflows exist in subdirectories (e.g. `modules/plan-2-edge/.github/workflows/*`) which **will not run** unless moved to repo-root `.github/workflows/`.
- Primary risks:
  - **Security**: edge request/audit logging currently captures full headers and request bodies in some places; risk of secret/PII leakage into R2 logs.
  - **Deploy correctness**: Terraform/workflow paths for built artifacts do not match actual build output locations; production routes may send all traffic to the security worker which is not a reverse proxy.
  - **Code correctness**: cryptography, rate limiting, and queue processing contain stubs/incorrect implementations; “production-grade” claims are inconsistent with code.
  - **Supply chain**: multiple `node_modules` directories present locally; need a clean install/build story that never depends on committed artifacts.

## Codebase scan

### Relevant existing components

- `docker-compose.production.yml` — attempts to orchestrate a “full platform” stack; references missing files/dirs (e.g. `nginx/`) and services/modules that must be validated and made buildable.
- `k8s/` + `kubernetes/` — Kubernetes manifests exist but are inconsistent (ports, env vars, service names) and not clearly used by CI/CD.
- `modules/plan-2-edge/` — Cloudflare Workers + Durable Objects + Terraform + tests; contains several real implementations but also critical mismatches (bindings, logging recursion, signature verification naming/logic, queue handler stub, Terraform artifact paths, workflow location).
- `services/influencer-api/` — backend API with known compile/runtime inconsistencies and schema mismatches (from earlier review).
- `services/auth-service/` — wrapper that imports from `modules/plan-3-auth/...` plus missing deps; may be incomplete due to iCloud “dataless” files.
- `programs/`, `twist-blockchain/`, `MVP/smart-contracts/` — multiple Solana/Anchor program trees; at least one readable program (`programs/influencer-staking/src/lib_secure.rs`) appears incomplete/uncompilable; other sources often “dataless”.
- `web/`, `extension/`, `mobile/` — client apps (reviewed earlier) need consistent build/release pipelines and security hardening.

### Patterns to follow

- Plan-2 Edge’s use of path aliases and typed `Env` bindings is a good baseline (once aligned with wrangler/terraform): `modules/plan-2-edge/tsconfig.json`.
- Durable Objects follow a clean “REST-ish” internal API style: `modules/plan-2-edge/durable-objects/rate-limiter/src/index.ts`.
- Unit tests exist for several edge components (Bloom filter, cache manager, queue processor, security worker): `modules/plan-2-edge/tests/*`.

### Gaps / missing pieces

- **Repo bootstrap**: no repo-root `.github/workflows/*` for CI/CD; no single “source of truth” for build/test across subprojects.
- **Hydration**: iCloud “dataless” files must be materialized before Git/CI can be trusted.
- **Edge correctness**:
  - Logger recursion in VAU worker utils: `modules/plan-2-edge/workers/vau-processor/src/utils/logger.ts`.
  - Signature verification mismatch (Ed25519 labeled “ECDSA”, public key sourcing unclear): `modules/plan-2-edge/workers/vau-processor/src/utils/crypto.ts`.
  - Queue handler does not use `QueueProcessor`: `modules/plan-2-edge/workers/vau-processor/src/index.ts`.
  - Durable Object aggregator caches `currentHour` without hour rollover handling: `modules/plan-2-edge/durable-objects/aggregator/src/index.ts`.
  - Terraform expects different build output file paths than `tsc` emits: `modules/plan-2-edge/terraform/main.tf`.
- **Security worker enforcement**: rules with `action: 'challenge'` are recorded but not enforced in `processRequest()`: `modules/plan-2-edge/workers/security-worker/src/index.ts`.
- **Infra drift**: docker-compose references missing dirs (`nginx/`) and likely mismatched ports; k8s manifests also appear inconsistent.

## External research (optional)

- Not required yet. Prefer stabilizing against official Cloudflare Workers + Durable Objects docs, Solana/Anchor docs, and GitHub Actions docs once requirements are locked.

## Open questions

- What is the intended **production runtime** for backend services: Kubernetes (existing `k8s/` manifests), Docker Compose (as “prod”), or managed services (ECS/GKE/etc.)?
- Which subset of components is the **production-critical path** for “v1” (edge VAU + influencer API + auth + web/extension), and which are planned but can ship later?
- What are the canonical domain names/endpoints for staging vs production (API base URLs, Cloudflare routes, web domains)?
- What is the source of truth for on-chain programs: `MVP/smart-contracts/` vs `programs/` vs `twist-blockchain/` vs `modules/plan-1-blockchain/`?
- What secrets management approach is required (GitHub Environments secrets, 1Password, AWS Secrets Manager, Vault)?

## Sources

- Local repo scan and deep dives into: `modules/plan-2-edge/`, `services/*`, `docker-compose.production.yml`, `k8s/`, `kubernetes/`.
