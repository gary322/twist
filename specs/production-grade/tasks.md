# Tasks: Make the TWIST monorepo production-grade end-to-end (buildable, testable, deployable to staging + production).

## Overview

Total tasks: 35 (initial pass; may be refined during implementation)

POC-first workflow:
1. Make it work (POC)
2. Refactor
3. Tests
4. Quality gates
5. (Optional) PR/release lifecycle

## Task format

For each task, include:

- **Do**: exact steps
- **Files**: paths to create/modify
- **Done when**: explicit success criteria
- **Verify**: command(s) or manual checks

## Phase 1: Make it work (POC)

- [ ] 1.1 Materialize iCloud “dataless” files (repo hygiene preflight)
  - **Do**:
    - Add a script that detects `compressed,dataless` files and can materialize them (rsync/copy loop + retries).
    - Document the Finder alternative (“Download Now” / disable Optimize Mac Storage) for humans.
    - Add a CI preflight that fails fast if any “dataless” files are present (CI runners won’t have iCloud).
  - **Files**: `scripts/icloud/materialize.sh`, `scripts/icloud/check.sh`, `docs/dev/icloud.md`
  - **Done when**: `scripts/icloud/check.sh` reports zero dataless files in tracked paths.
  - **Verify**: `bash scripts/icloud/check.sh`
  - _Reqs: FR-1, FR-2_

- [ ] 1.2 GitHub bootstrap: initialize repo, push, branch protections
  - **Do**:
    - Ensure `.gitignore` covers all secrets/local files (e.g. `.claude/settings.local.json`).
    - Initialize git (if not already), set `origin`, push `main`.
    - Configure GitHub branch protection and required checks (manual step in GitHub UI).
  - **Files**: `.gitignore`, `.github/` (later tasks)
  - **Done when**: `main` exists on GitHub; PRs require CI.
  - **Verify**: `git status`, `git remote -v`, `git push -u origin main`
  - _Reqs: FR-1, FR-2_

- [ ] 1.3 Create repo-root CI workflow (PR + main)
  - **Do**:
    - Add `.github/workflows/ci.yml` at repo root.
    - CI runs per-subproject install/build/test in a matrix (edge, services, web, extension, mobile, chain) with caching.
    - Upload build artifacts where useful (e.g. worker bundles, docker build outputs metadata).
  - **Files**: `.github/workflows/ci.yml`, `scripts/ci/*`
  - **Done when**: PR CI runs on GitHub and fails on compile/test errors.
  - **Verify**: GitHub Actions run; locally `bash scripts/ci/local.sh` (if added)
  - _Reqs: FR-2, AC-2.1_

- [ ] 1.4 Define “v1 critical path” and smoke suite
  - **Do**:
    - Create a short document listing the must-work flows (inputs/outputs, owners, environments).
    - Implement a minimal smoke suite that can run against staging endpoints (HTTP checks + a small VAU submission scenario).
  - **Files**: `docs/release/critical-path.md`, `e2e-tests/smoke/*`
  - **Done when**: Smoke suite exists and is runnable from CI.
  - **Verify**: `npm run e2e:smoke` (to be added) or `node e2e-tests/...`
  - _Reqs: FR-8, AC-4.1_

- [ ] 1.5 Fix Plan-2 Edge correctness blockers (make it actually deployable)
  - **Do**:
    - Fix logger recursion (`logger.log` self-call) and ensure logs are structured and safe.
    - Fix signature verification naming/implementation and clarify public key source (Ed25519 vs ECDSA).
    - Wire queue handler to use `QueueProcessor` (or remove dead code).
    - Fix DO aggregator hour rollover and add tests.
    - Align `Env` bindings: wrangler ↔ shared `Env` interface ↔ terraform.
    - Move/copy workflows from `modules/plan-2-edge/.github/workflows/*` into repo-root workflows (or call them).
    - Fix Terraform worker artifact paths to match build output locations.
  - **Files**:
    - `modules/plan-2-edge/workers/vau-processor/src/utils/logger.ts`
    - `modules/plan-2-edge/workers/vau-processor/src/utils/crypto.ts`
    - `modules/plan-2-edge/workers/vau-processor/src/index.ts`
    - `modules/plan-2-edge/durable-objects/aggregator/src/index.ts`
    - `modules/plan-2-edge/shared/types/env.ts`
    - `modules/plan-2-edge/terraform/main.tf`
    - `modules/plan-2-edge/IMPLEMENTATION_SUMMARY.md` (update to match reality)
  - **Done when**: `modules/plan-2-edge` builds, tests are deterministic, and deploy wiring is consistent.
  - **Verify**: `cd modules/plan-2-edge && npm ci && npm run build && npm test`
  - _Reqs: FR-2, FR-4, FR-5_

- [ ] 1.6 Fix Security Worker behavior to match intent
  - **Do**:
    - Decide whether `action: 'challenge'` should be enforced; implement response semantics.
    - Ensure audit logs redact secrets; avoid storing full headers by default.
    - Ensure routing: security worker should not capture all traffic unless it proxies.
  - **Files**: `modules/plan-2-edge/workers/security-worker/src/index.ts`, `modules/plan-2-edge/workers/security-worker/src/audit-logger.ts`, `modules/plan-2-edge/terraform/main.tf`
  - **Done when**: Security worker behavior matches infra routing and tests.
  - **Verify**: `cd modules/plan-2-edge && npm test -- --testNamePattern=\"Security\"`

- [ ] 1.7 Backend MVP: choose canonical backend path and make it buildable
  - **Do**:
    - Decide which backend is canonical (likely `services/*` vs `MVP/backend/*` vs `modules/plan-*/services/*`).
    - For the canonical set: fix dependency lists, compile errors, migrations/entities mismatches, and health endpoints.
    - Add dockerfiles and k8s manifests that match the actual ports/env vars.
  - **Files**: `services/*`, `MVP/backend/*`, `k8s/*`, `kubernetes/*`, `docker-compose.production.yml`
  - **Done when**: canonical backend services build and start locally.
  - **Verify**: `docker compose -f docker-compose.test.yml up -d` (or equivalent), then curl health endpoints.
  - _Reqs: FR-1, FR-4, FR-5_

- [ ] 1.8 On-chain: pick source of truth and make it compile/test
  - **Do**:
    - Decide canonical program tree and remove/mark others as archived.
    - Ensure Anchor workspace builds; add program tests; define key management for upgrade authority.
  - **Files**: `programs/*` and/or `MVP/smart-contracts/*` and/or `twist-blockchain/*`
  - **Done when**: `anchor test` (or `cargo test`) passes in CI.
  - **Verify**: `anchor test` (command depends on chosen tree)
  - _Reqs: FR-1, FR-2_

- [ ] 1.9 POC checkpoint (staging deploy)
  - **Do**:
    - Deploy edge layer + minimal backend to staging from GitHub Actions.
    - Run smoke suite against staging.
  - **Files**: `.github/workflows/deploy-staging.yml`, `docs/release/staging.md`
  - **Done when**: staging deploy is reproducible and smoke suite passes.
  - **Verify**: GitHub Actions + `e2e-tests/smoke`
  - _Reqs: AC-3.1, AC-4.2_

## Phase 2: Refactor

- [ ] 2.1 Monorepo build orchestration
  - **Do**:
    - Add a repo-root “orchestrator” layer (`scripts/ci/*`) or adopt a workspace tool (npm workspaces/pnpm/turbo).
    - Standardize Node version (`.nvmrc`), TS base config, and lint config where feasible.
  - **Files**: `.nvmrc`, `tsconfig.base.json`, `.eslintrc.*` (as needed), `scripts/ci/*`
  - **Done when**: `scripts/ci/` can run checks for all critical packages with consistent Node/tooling.
  - **Verify**: `bash scripts/ci/all.sh` (to be added)

- [ ] 2.2 Quality checkpoint
  - **Verify**: CI workflow green (lint + typecheck + tests + builds)

## Phase 3: Tests

- [ ] 3.1 Repair/replace flaky tests and remove fake “E2E” scripts
  - **Do**:
    - Fix non-deterministic crypto mocks and test harnesses that produce random digests.
    - Replace placeholder E2E scripts with real, executable checks that hit real endpoints or Miniflare.
  - **Files**: `modules/plan-2-edge/jest.config.js`, `modules/plan-2-edge/scripts/e2e-test.ts`, `e2e-tests/*`
  - **Done when**: tests are deterministic locally and in CI.
  - **Verify**: `npm test` in each package

- [ ] 3.2 End-to-end smoke suite in CI and in staging
  - **Do**:
    - Ensure smoke suite runs in CI against local docker compose (for services) and Miniflare (for workers) where possible.
    - Ensure staging deploy workflow runs smoke suite against deployed endpoints.
  - **Files**: `.github/workflows/deploy-staging.yml`, `e2e-tests/smoke/*`
  - **Done when**: smoke failures block promotion.
  - **Verify**: GitHub Actions

## Phase 4: Quality gates

- [ ] 4.1 Lint/format/types
  - **Do**: add consistent lint/typecheck entrypoints per package and enforce in CI
  - **Verify**: `npm run lint`, `npm run typecheck` in each package (or orchestrated)

- [ ] 4.2 Full test suite / build
  - **Verify**: `bash scripts/ci/all.sh` (or CI matrix)

## Phase 5: PR / release (optional)

- [ ] 5.1 Production deployment workflow with approvals + rollback docs
  - **Do**:
    - Add `.github/workflows/deploy-production.yml` using GitHub Environments protections.
    - Document rollback steps per component (edge rollback, service rollback, chain upgrade rollback strategy).
  - **Files**: `.github/workflows/deploy-production.yml`, `docs/release/production.md`
  - **Done when**: production deploy requires approval and is reproducible.
  - **Verify**: manual GitHub Actions run in production env

- [ ] 5.2 Hardening: security scanning + dependency automation
  - **Do**: add gitleaks/trufflehog + CodeQL + Dependabot config
  - **Files**: `.github/dependabot.yml`, `.github/workflows/codeql.yml`, `.github/workflows/secret-scan.yml`
  - **Done when**: scans run on PRs and scheduled; failures block merge.
