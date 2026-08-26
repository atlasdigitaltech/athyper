# Kernel Config — `stack/config/apps/`

This directory holds the per-environment kernel configuration JSON files consumed by the
runtime server (`server/src/kernel-config.ts`) at startup.

**Full field reference and operational guide →** [`docs/infrastructure/kernel-config-reference.md`](../../../docs/infrastructure/kernel-config-reference.md)

---

## Files

| File | Purpose |
|---|---|
| `kernel.config.local.parameter.json` | Local development (Windows / macOS / Linux host dev) |
| `kernel.config.staging.parameter.json` | Ubuntu staging server |
| `kernel.config.production.parameter.json` | Ubuntu production server |
| `kernel.config.schema.json` | JSON Schema — editor validation and CI schema-check |

---

## What these files control

Kernel config owns **IAM realm topology** and **business feature flags** — things that require
a deploy to change and apply to all tenants within a realm:

- Which Keycloak realms the server trusts (`iam.realms`)
- The `issuerUrl`, `clientId`, and `allowedAzp` for each realm
- Per-realm feature flags: `metaStudio`, `debugMode`, `strictTenantIsolation`
- Per-tenant defaults: country, currency, timezone (in `tenants.*`)
- `publicBaseUrl` / `publicWebUrl` — must match `PUBLIC_BASE_URL` / `PUBLIC_WEB_URL` in the env file
- `db.poolMax`, `logLevel`, `shutdownTimeoutMs` — tuning that differs per environment

These files do **not** contain secrets or connection strings. Those go in env vars.

---

## LOCKED sentinel

Fields that reference infrastructure values carry `"LOCKED_USE_ENV_VAR"` as their JSON value:

```json
"db": {
  "url": "LOCKED_USE_ENV_VAR",
  "adminUrl": "LOCKED_USE_ENV_VAR",
  "poolMax": 20
}
```

The server loader strips any key whose value is exactly `"LOCKED_USE_ENV_VAR"` before Zod
validation. The real value always comes from the corresponding env var (`DATABASE_URL`,
`DATABASE_ADMIN_URL`, etc.). `poolMax` is NOT locked — it is safe to commit and differs per
environment.

---

## SUPERSTAR secret reference pattern

IAM realm client secrets are never stored in this file. Instead, each realm entry uses a
`clientSecretRef` name:

```json
"iam": {
  "clientSecretRef": "IAM_ATHYPER_CLIENT_SECRET"
}
```

The loader resolves this at startup by reading:

```
ATHYPER_SUPER__IAM_SECRET__IAM_ATHYPER_CLIENT_SECRET
```

from the process environment. This env var must be present in `secrets/.env` on the server
(staging/production) or in `stack/env/.env` (local dev).

**To add a new secret reference:**
1. Add `clientSecretRef: "MY_NEW_SECRET"` to the realm `iam` block in this file
2. Set `ATHYPER_SUPER__IAM_SECRET__MY_NEW_SECRET=<value>` in `secrets/.env`
3. Run `pnpm athyper plan <instance>` — it will fail if required configuration is missing

---

## Parity invariants

Three fields in this file must match their env var counterparts. `validate-env.sh` section
`[4/6]` checks these automatically before every `docker compose up`:

| JSON field | Env var |
|---|---|
| `publicBaseUrl` | `PUBLIC_BASE_URL` |
| `publicWebUrl` | `PUBLIC_WEB_URL` |
| `iam.realms.*.iam.issuerUrl` | `IAM_ISSUER_URL` |

If they diverge, `validate-env.sh` emits a `WARN` and exits 2. Fix the mismatch before
running `up.sh`.

---

## What differs per environment

| Field | local | staging | production |
|---|---|---|---|
| `logLevel` | `debug` | `info` | `warn` |
| `shutdownTimeoutMs` | 15 000 ms | 30 000 ms | 60 000 ms |
| `db.poolMax` | 5 | 20 | 50 |
| `publicBaseUrl` | `https://api.athyper.local` | `https://api-stg.athyper.com` | `https://api.athyper.com` |
| `publicWebUrl` | `https://neon.athyper.local` | `https://neon-stg.athyper.com` | `https://neon.athyper.com` |
| `issuerUrl` | `iam.athyper.local/realms/athyper` | `iam-stg.athyper.com/realms/athyper` | `iam.athyper.com/realms/athyper` |
| `requireTenantClaimsInProd` | `false` | `true` | `true` |
| `strictTenantIsolation` | `false` | `true` | `true` |
| `debugMode` | `true` | `false` | `false` |
| `metaStudio` | `true` | `true` | `false` |
| `tenants` | `{ "default": { ... } }` | `{}` | `{}` |

---

## How to validate

```bash
# Runs automatically via up.sh — or standalone:
pnpm athyper plan dev

# Checks performed:
#  [2/6] ATHYPER_KERNEL_CONFIG_PATH is set
#  [2/6] Kernel file exists at $ATHYPER_CONFIG/$ATHYPER_KERNEL_CONFIG_PATH
#  [4/6] Stale-orphan sibling warning (newer sibling file = wrong pointer)
#  [4/6] publicBaseUrl / publicWebUrl / issuerUrl parity vs env vars
#
# Server startup also validates:
#  kernel-config.ts → Zod schema parse → throws on invalid fields
#  auth-flag-validator.ts → AUTH_* flag cross-checks vs kernel config
```

No standalone `validate-kernel-config` script exists yet. Validation currently requires a
full env file. See [K7 in the quality-check findings](../../../docs/infrastructure/kernel-config-reference.md#known-gaps).
