# TWIST

Production-focused monorepo for TWIST edge + backend components.

## Key paths

- Edge (Cloudflare Workers + Terraform): `modules/plan-2-edge/`
- Backend services (canonical): `services/`
- Shared packages: `packages/`

## CI

GitHub Actions CI lives in `.github/workflows/ci.yml`.

## Deploy

- Edge staging/prod deploy workflows:
  - `.github/workflows/deploy-edge-staging.yml`
  - `.github/workflows/deploy-edge-production.yml`
- Backend staging/prod deploy workflows (Docker Compose on VM):
  - `.github/workflows/deploy-backend-staging.yml`
  - `.github/workflows/deploy-backend-production.yml`

Backend compose file: `docker-compose.backend.yml`

Runbook (free tier VM): `docs/operations/backend_oracle_always_free.md`

## iCloud Drive warning (macOS)

If you keep this repo in iCloud Drive, “dataless” placeholders can break git/build tooling.

- Check: `bash scripts/icloud/check.sh`
- Materialize: `bash scripts/icloud/materialize.sh`

