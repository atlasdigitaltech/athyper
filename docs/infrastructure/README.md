# Infrastructure Documentation

Canonical home for everything stack-, env-, and deployment-related. The companion
[../meta-entity/](../meta-entity/) folder covers the metadata/entity model; this folder
covers how the platform runs.

---

## Start here

| You want to… | Go to |
|---|---|
| Set up Windows local dev (first time) | [local-dev-setup.md](./local-dev-setup.md) |
| Compare local vs staging vs production | [environments.md](./environments.md) |
| Build a fresh Ubuntu staging/production server (Phases 0–26) | [staging-setup.md](./staging-setup.md) |
| Operate an already-deployed staging environment (CI/CD, ops) | [staging-operations.md](./staging-operations.md) |
| Understand the v13 permission model and architecture | [infrastructure-plan.md](./infrastructure-plan.md) |

## Runbooks

| Doc | Scope |
|---|---|
| [local-dev-setup.md](./local-dev-setup.md) | Windows workstation — Docker Desktop, hosts file, TLS, seed data, Options A/B/C |
| [staging-setup.md](./staging-setup.md) | Ubuntu 22.04/24.04 server — full 26-phase installation runbook (covers staging and production) |
| [staging-operations.md](./staging-operations.md) | Day-to-day staging operations: CI/CD, Traefik file-provider routes, PgBouncer sizing, health checks, secrets options |
| [environments.md](./environments.md) | Local / staging / production matrix — script behaviour, profile defaults, two-root layout |
| [infrastructure-plan.md](./infrastructure-plan.md) | v13 architecture overview, permission model, pre-deploy code gates |
| [weekly-reset-reseed-export.md](./weekly-reset-reseed-export.md) | Weekly DB reset, re-seed, export, and restore validation until base completion |
| [weekly-reset-run-log.md](./weekly-reset-run-log.md) | Run-by-run log of the weekly reset exercise |
| [secrets-management.md](./secrets-management.md) | Secret inventory, generation, rotation, per-environment injection (Vault / AWS SM / Infisical) |

## Stack contracts

| Doc | Scope |
|---|---|
| [env-reference.md](./env-reference.md) | Complete per-variable reference — all env vars, local/staging/production values, secret flags, two-file model, config-layer architecture |
| [kernel-config-reference.md](./kernel-config-reference.md) | Kernel config JSON per-field reference — IAM realm topology, feature flags, LOCKED sentinel, SUPERSTAR pattern, parity invariants |
| [feature-parameter-reference.md](./feature-parameter-reference.md) | Runtime-reloadable feature parameter catalog — 109 parameters, resolution chain, tenant override how-to |
| [scripts-reference.md](./scripts-reference.md) | Full reference for every script under `stack/scripts/` — parameters, exit codes, destructive flags |
| [docker-services.md](./docker-services.md) | Complete reference for all Docker Compose services (images, ports, volumes, networks) |
| [mesh-seed-db.md](./mesh-seed-db.md) | Mesh-specific DB provisioning — bounded DDL + tenant seed for the `athyper_mesh` database |

## Compose profiles

| Doc | Scope |
|---|---|
| [profile-analytics.md](./profile-analytics.md) | Metabase / analyticsboard hedge — DEFERRED; gating questions before enable |
| [profile-security.md](./profile-security.md) | ClamAV (`security`) and Infisical (`security-infisical`) profile contracts |
| [profile-render.md](./profile-render.md) | Gotenberg (docrender) + Tika (docparser) — adapter status, scaling, DLQ contract |

## IAM / Keycloak

| Doc | Scope |
|---|---|
| [iam-realm-config.md](./iam-realm-config.md) | Realm JSON files (`realm-athyper.json`, `realm-platform-control.json`) and demo fixtures |
| [iam-protocol-mappers.md](./iam-protocol-mappers.md) | `tenant_id`, `allowed_tenants`, `required_actions` claim mappers + attach script |

## Render pipeline

| Doc | Scope |
|---|---|
| [render-pipeline-config.md](./render-pipeline-config.md) | docrender CLI flags, docparser Tika XML, render DLQ error-category contract |

## Monitoring

| Doc | Scope |
|---|---|
| [monitoring-statuswatch.md](./monitoring-statuswatch.md) | Uptime Kuma (statuswatch) JSON-in-git monitor definitions + import/export flow |
