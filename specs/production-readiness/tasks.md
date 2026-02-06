# Tasks: Make TWIST production-ready end-to-end

## Overview

Total tasks: 13

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

- [ ] 1.1 Make `auth-service` JWT authorize `influencer-api`
  - **Do**:
    - Implement a canonical JWT claims parser in `services/influencer-api` that accepts `{ sub, walletAddress }` from `services/auth-service`.
    - Map `walletAddress -> influencerId/userId` via Postgres lookup (and cache in Redis where appropriate).
    - Attach a normalized `req.user` shape `{ walletAddress, userId?, influencerId?, isAdmin? }`.
  - **Files**:
    - `services/influencer-api/src/guards/auth.guard.ts` (or replace with a clearer guard)
    - `services/influencer-api/src/services/*` (new auth context / lookup helper)
    - `services/influencer-api/src/modules/*` (wire providers where needed)
  - **Done when**:
    - A token minted by `services/auth-service` is accepted by guarded `services/influencer-api` endpoints.
  - **Verify**:
    - Local docker compose up; call `POST /auth/nonce` + `POST /auth/verify` then hit a guarded influencer-api endpoint.
  - _Reqs: AC-3.1, AC-3.2, FR-3_

- [ ] 1.2 Remove broken Passport-only guards (or add the missing strategy)
  - **Do**:
    - Either (preferred) rewrite `JwtAuthGuard` / `OptionalAuthGuard` to use the canonical JWT verifier, or implement a working `JwtStrategy` and register it globally.
    - Ensure controllers are not mixing guard semantics.
  - **Files**:
    - `services/influencer-api/src/guards/jwt-auth.guard.ts`
    - `services/influencer-api/src/guards/optional-auth.guard.ts`
    - `services/influencer-api/src/app.module.ts` and/or module wiring files
  - **Done when**:
    - Any endpoint annotated with “JWT protected” actually enforces JWT in runtime.
  - **Verify**:
    - Start service; call one protected endpoint without a token (expect `401`), then with a token (expect `2xx`).
  - _Reqs: AC-3.3, FR-4_

- [ ] 1.3 Guard staking writes and derive identity server-side
  - **Do**:
    - Require JWT for `POST /staking/stake`, `/unstake`, `/claim`.
    - Stop accepting `userId`/`wallet` in request bodies for authorization; derive from `req.user`.
  - **Files**:
    - `services/influencer-api/src/controllers/staking.controller.ts`
    - `services/influencer-api/src/services/staking.service.ts`
  - **Done when**:
    - Staking writes cannot be executed without JWT, and cannot stake “as someone else”.
  - **Verify**:
    - Manual requests with/without JWT; ensure `userId`/`wallet` spoofing fails.
  - _Reqs: FR-4, AC-3.2_

- [ ] 1.4 Quality checkpoint
  - **Do**: run local checks to catch regressions early
  - **Verify**: `npm test` (edge) + `npm run build` (services + packages)
  - **Done when**: all checks pass locally/CI

- [ ] 1.5 POC checkpoint (end-to-end)
  - **Do**: validate the feature works in a realistic environment
  - **Verify**:
    - Backend up: auth-service token can call influencer-api guarded endpoints
    - Link generation + click tracking + conversion endpoints accept JWT where intended
  - **Done when**: the core auth flow and guarded writes are demonstrable

## Phase 2: Refactor

- [ ] 2.1 Extract and align with project patterns
  - **Do**:
    - Consolidate all “who is the caller?” logic into a single module/service.
    - Define a single `RequestUser` type and reuse it across HTTP + WS.
  - **Files**:
    - `services/influencer-api/src/*`
  - **Done when**: code is idiomatic for this repo
  - **Verify**: `npm run build` in `services/influencer-api`

- [ ] 2.2 Quality checkpoint
  - **Verify**: CI green on a PR

## Phase 3: Tests

- [ ] 3.1 Unit tests
  - **Do**:
    - Add unit tests for JWT parsing and wallet->identity mapping.
    - Add unit tests for staking controller identity derivation.
  - **Verify**: `cd services/influencer-api && npm test`
  - _Reqs: AC-3.1, AC-3.2_

- [ ] 3.2 Integration tests (if applicable)
  - **Do**:
    - Spin up Postgres/Redis; run a smoke test that mints a token from auth-service and calls influencer-api.
  - **Verify**: a minimal script or Jest integration suite in CI

## Phase 4: Quality gates

- [ ] 4.1 Lint/format/types
  - **Verify**: repo CI jobs required by branch protection are green

- [ ] 4.2 Full test suite / build
  - **Verify**: CI + CodeQL + gitleaks green; deploy workflows runnable

## Phase 5: PR / release (optional)

- [ ] 5.1 Update docs/changelog (if needed)
- [ ] 5.2 Monitor CI and resolve failures
