# Athyper â€” Environments Overview

**Scope:** how the three environments differ in topology, scripts, and config.
**Detailed runbooks:** [`local-dev-setup.md`](local-dev-setup.md) (Windows local), [`staging-setup.md`](staging-setup.md) (Ubuntu staging). Production runs the same image set as staging with the `production` override and a production env file.

The three environments â€” `local`, `staging`, `production` â€” share the same compose definitions, application images, and kernel-config schema. They differ only in:

1. **Where each process runs** (host vs containerized vs managed)
2. **Which compose profile is active**
3. **Where secrets come from**
4. **Which override file picks the env-specific knobs**

The `ENVIRONMENT` value in `stack/env/.env` is the master switch. Every `stack/scripts/**` script reads it and chooses the correct behavior automatically.

---

## At-a-glance matrix

| Concern | `local` (Windows / WSL / macOS) | `staging` (Ubuntu VM) | `production` (Ubuntu VM) |
|---|---|---|---|
| **Six apps** (3 web BFFs + api + worker + scheduler) | **Host** via `pnpm dev` / `tsx watch` | Docker images, container | Docker images, container |
| **Infra** (db, redis, iam, gateway, minio, mailtrap) | Docker | Docker | Docker (or managed for db/redis/object storage where chosen) |
| **Observability stack** (telemetry, monitoring, search, render) | Off by default; opt-in per profile | On (selected profiles) | On (full set) |
| **TLS** | Self-signed (`*.athyper.local` via Traefik file provider) | Let's Encrypt or internal CA | Let's Encrypt or internal CA |
| **DNS** | Hosts file (`*.athyper.local`) | Real DNS (`*.athyper.com` / your domain) | Real DNS |
| **Secrets source** | Plain env file (`stack/env/.env`) â€” local-only credentials | Bootstrap env + `/opt/stack/athyper/secrets/*` files | Bootstrap env + SUPERSTAR / Infisical-managed secrets |
| **Default compose profile** | `core` (infra only) â€” apps run on host | `all` (everything containerized) | `all` (everything containerized) |
| **Compose override file** | `athyper.override.local.yml` | `athyper.override.staging.yml` | `athyper.override.production.yml` |
| **Kernel config** | `apps/kernel.config.local.parameter.json` | `apps/kernel.config.staging.parameter.json` | `apps/kernel.config.production.parameter.json` |
| **Source-edit feedback loop** | Sub-second (Next.js Fast Refresh + tsx watch) | Image rebuild + container restart | Image rebuild + container restart |
| **Two-root layout** | `D:\Products\athyper` (git) + `D:\Stack\athyper` (runtime) | `/opt/products/athyper` + `/opt/stack/athyper` | `/opt/products/athyper` + `/opt/stack/athyper` |
| **Run as** | Logged-in dev user | `athyper` service account (UID 9000) via systemd | `athyper` service account via systemd |
| **Detailed runbook** | [`local-dev-setup.md`](local-dev-setup.md) | [`staging-setup.md`](staging-setup.md) | [`staging-setup.md`](staging-setup.md) + deltas below |

---

## Script behavior is environment-aware

The same script does the right thing per environment â€” you do not switch scripts when moving between environments. Examples:

| Script | `ENVIRONMENT=local` | `ENVIRONMENT=staging` / `production` |
|---|---|---|
| `stack/scripts/app/api-up.{bat,sh}` | `pnpm --filter @athyper/runtime-server dev` on host, translates `dbpool-apps` â†’ `127.0.0.1:6432` etc. | `docker compose build` (if `--build`), then `docker compose up -d --no-deps api` |
| `stack/scripts/app/api-up worker` / `scheduler` | `pnpm dev:worker` / `dev:scheduler` on host | `docker compose up -d --no-deps worker` / `scheduler` |
| `stack/scripts/app/web-up.{bat,sh} <plane>` | `next dev` on host on port 3101 / 3102 / 3103 | `docker compose up -d --no-deps <plane>-web` |
| `stack/scripts/stack-profile/up.{bat,sh}` | Uses `STACK_PROFILE=core` by default â†’ infra only | Uses `STACK_PROFILE=all` (or whatever the env file sets) â†’ everything |
| `stack/scripts/app/planes-up.bat` | Opens 3 host Next.js windows | (refuses) â€” use `web-up.sh all` |
| `stack/scripts/dev-local.{bat,sh}` | One command: stops stale containers + brings up infra + opens host windows | (refuses) â€” staging/production must not use this |

`.bat` scripts are explicitly local-only. `.sh` scripts handle all three environments â€” staging and production deploys always use them.

---

## Local â€” the canonical recipe

The default in `stack/env/.env`:

```bash
ENVIRONMENT=local
COMPOSE_PROJECT_NAME=athyper
STACK_PROFILE=core
```

**One-command bootstrap (recommended):**

```cmd
stack\scripts\dev-local.bat
```

This stops any stale app containers (using the `${COMPOSE_PROJECT_NAME}-<svc>-1` convention), brings up the `core` profile (infra only), then opens the api + 3 web plane dev servers in separate windows. Add `--with-jobs` for the worker + scheduler windows.

**Equivalent explicit form** (three terminals â€” what `dev-local` automates):

```cmd
:: Terminal 1 â€” infra
stack\scripts\stack-profile\up.bat core

:: Terminal 2 â€” api on host
stack\scripts\app\api-up.bat

:: Terminal 3 â€” Neon + Mesh + Admin in three spawned windows
stack\scripts\app\local-ui-up.bat
```

**Why not "everything in Docker" for local?** Source edits to `packages/shared/platform-auth/auth-bff` etc. don't propagate into a baked Next.js bundle. A container that was built 30 minutes ago will silently run stale code while you edit and reload â€” a failure mode that wastes hours. Host-mode `next dev` and `tsx watch` give you sub-second feedback and stack traces in source coordinates.

**Defence in depth.** Even if you bypass `dev-local.bat`, the per-script guards in `api-up.{bat,sh}` and `web-up.{bat,sh}` detect a running `${COMPOSE_PROJECT_NAME}-<svc>-1` container and warn you before starting host dev â€” pausing for confirmation so you cannot silently shadow yourself.

Detailed setup, including hosts file, TLS cert generation, seed data, and the Option A / B / C trade-offs, lives in [`local-dev-setup.md`](local-dev-setup.md).

---

## Staging â€” Ubuntu, everything containerized

The full server-build runbook (Phases 0â€“26: user/group setup, two-root layout, hardening, GitHub deploy key, config deployment, secrets, smoke tests, systemd, backups) lives in [`staging-setup.md`](staging-setup.md). The summary:

- `ENVIRONMENT=staging`, `STACK_PROFILE=all` (or whichever profile set you ship)
- `athyper.override.staging.yml` switches Keycloak to `start --import-realm` (production mode), enables real SMTP, and applies staging resource limits
- All six apps run as containers built from `Dockerfile.dev` (or the prod variant when promoted)
- Secrets are file-based in `/opt/stack/athyper/secrets/` (mode 0600, `athyper:athyper`), referenced by the bootstrap env
- Real DNS, real Let's Encrypt certs via Traefik's ACME provider (`acme.json` mode 0600 is mandatory)
- Service runs under systemd unit `athyper-stack.service` as user `athyper` (UID 9000)
- Backups via Phase 23 cron entries, log retention via Phase 4.2 journald limits

**Bring-up command after Phase 16:**

```bash
sudo -iu athyper
cd /opt/products/athyper
stack/scripts/stack-profile/up.sh
```

`up.sh` reads `STACK_PROFILE` from `/opt/stack/athyper/secrets/.env` (the file that's actually populated; the git copy is a template).

**Why staging matters for testing realm changes.** Local KC has `start-dev --import-realm` which skips imports on existing DBs (per `feedback_kc_reset_approach.md`). Staging has `start --import-realm` with the same skip behavior, so when you ship a realm JSON change, you must wipe the KC DB on staging before restart â€” same gotcha, same fix. Document the runbook step before promoting realm changes.

---

## Production â€” same shape as staging, three deltas

Production reuses the staging Ubuntu runbook end-to-end. Three things change:

1. **Override file** â€” `athyper.override.production.yml` is selected by `up.sh` when `ENVIRONMENT=production`. It pins higher resource limits, disables debug routes, sets log level to `warn`, and may switch to a non-dev `server/Dockerfile.prod` if your pipeline builds one.

2. **Secrets source** â€” production uses SUPERSTAR (or Infisical, per `project_infra_review_april2026.md`). Secret files are populated by your secrets manager's sync agent rather than copied by `setup-config`. See [`secrets-management.md`](secrets-management.md) Â§1 for the per-environment matrix.

3. **Managed dependencies where chosen** â€” production typically moves Postgres and object storage to managed services (RDS / Cloud SQL / S3 / GCS). The compose db / objectstorage services are then omitted from the active profile set, and `DATABASE_URL` / `S3_ENDPOINT` in the env file point to the managed endpoints. Keycloak's PG behind it is the most common candidate for "move to managed" because clustering KC itself stays simpler.

Everything else â€” two-root layout, service identities (svc-redis 9100, svc-minio 9101, etc.), systemd unit, backups â€” is identical to staging. The runbook in [`staging-setup.md`](staging-setup.md) applies verbatim.

**One operational difference worth calling out:** in production never run `git pull` directly on the server. Your release pipeline builds a tagged image set, syncs the matching commit to `/opt/products/athyper`, then runs `up.sh` with the new images. Staging may allow direct pulls for rapid iteration; production should not.

---

## Default profile per environment

`STACK_PROFILE` is set explicitly in each env file. Override on a per-invocation basis via CLI arg:

```bash
stack/scripts/stack-profile/up.sh telemetry   # one-off: add telemetry to running stack
```

| Environment | `STACK_PROFILE` in env file | What runs |
|---|---|---|
| local | `core` | DB, PgBouncer, Redis, MinIO, Traefik, Keycloak, mailtrap, socket-proxies |
| staging | `all` (typical) | Everything including apps, observability, render, search |
| production | `all` (typical) | Same as staging plus any prod-only sidecars |

A developer working on a specific concern locally can opt in to extra profiles by running `up.bat <profile>` repeatedly â€” profiles accumulate. See [Â§6 Stack Profiles in local-dev-setup.md](local-dev-setup.md#6-stack-profiles) for the full table.

---

## When to use which doc

| You want toâ€¦ | Go here |
|---|---|
| Set up Windows for the first time | [`local-dev-setup.md`](local-dev-setup.md) Â§3 Initial Setup |
| Just start coding after a reboot | [`local-dev-setup.md`](local-dev-setup.md) Quick Start (one command: `dev-local.bat`) |
| Understand `next dev` vs Docker for a plane | [`local-dev-setup.md`](local-dev-setup.md) Â§4 Options A/B/C |
| Build a fresh staging server | [`staging-setup.md`](staging-setup.md) Part B (Phases 0â€“26) |
| Promote to production | [`staging-setup.md`](staging-setup.md) + this doc's "Production" section |
| Edit a secret across environments | [`secrets-management.md`](secrets-management.md) |
| Understand the architecture | [`infrastructure-plan.md`](infrastructure-plan.md) |
| Restore from a backup | [`weekly-reset-reseed-export.md`](weekly-reset-reseed-export.md) |

---

## Related Documentation

| Document | Purpose |
|---|---|
| [`local-dev-setup.md`](local-dev-setup.md) | Windows local development â€” full setup, Options A/B/C, gotchas |
| [`staging-setup.md`](staging-setup.md) | Ubuntu server runbook â€” Phases 0â€“26, v13 permission model |
| [`infrastructure-plan.md`](infrastructure-plan.md) | Architecture overview, pre-deployment gates |
| [`secrets-management.md`](secrets-management.md) | Secret inventory, generation, rotation, per-environment injection model |
| [`weekly-reset-reseed-export.md`](weekly-reset-reseed-export.md) | Weekly DB reset / export / restore validation |
