# Athyper — Kernel Config Reference

Single authoritative reference for the kernel configuration JSON files at
`stack/config/apps/kernel.config.*.parameter.json`.

**For env var reference** → [env-reference.md](env-reference.md)
**For in-context editing guide** → [stack/config/apps/README.md](../../stack/config/apps/README.md)

---

## Contents

1. [What kernel config is](#1-what-kernel-config-is)
2. [Load path](#2-load-path)
3. [Field reference](#3-field-reference)
4. [LOCKED sentinel](#4-locked-sentinel)
5. [SUPERSTAR secret reference pattern](#5-superstar-secret-reference-pattern)
6. [Parity invariants](#6-parity-invariants)
7. [How to add a new tenant](#7-how-to-add-a-new-tenant)
8. [How to add a new realm](#8-how-to-add-a-new-realm)
9. [Known gaps](#9-known-gaps)

---

## 1. What kernel config is

Kernel config is the second configuration layer (between env vars and the feature parameter
table). It owns **IAM realm topology and realm-level feature flags** — settings that apply
to all tenants within a realm and require a deploy to change.

| Layer | Owns | Reloadable |
|---|---|---|
| ENV vars | Secrets, credentials, connection strings | No |
| **Kernel config JSON** | **IAM realm topology, realm-level flags, public URLs** | **No** |
| Feature parameter table | Business tunables, tenant-overridable defaults | Yes |

Kernel config is intentionally **not** tenant-specific. If a setting needs to vary per tenant
(e.g., session timeout), it belongs in the feature parameter table, not here.

---

## 2. Load path

```
ATHYPER_CONFIG=<base dir>                       # Docker: /config, local: D:\Stack\athyper\config
ATHYPER_KERNEL_CONFIG_PATH=apps/kernel.config.local.parameter.json

server/src/kernel-config.ts::loadKernelConfig()
  → join(ATHYPER_CONFIG, ATHYPER_KERNEL_CONFIG_PATH)
  → JSON.parse → stripLocked() → Zod validate → resolveSecret() per realm
  → ResolvedKernelConfig | null
```

`loadKernelConfig()` returns `null` when `ATHYPER_KERNEL_CONFIG_PATH` is unset. The server
then operates in env-var-only single-realm IAM mode (logs `kernel_config_absent`).

`setup-config.sh` copies the per-env file from `stack/config/apps/` into
`$ATHYPER_CONFIG/apps/` during server provisioning.

---

## 3. Field reference

### Top-level fields

| Field | Type | local | staging | production | Notes |
|---|---|---|---|---|---|
| `env` | enum | `local` | `staging` | `production` | Must match `ENVIRONMENT` env var |
| `mode` | string | `api` | `api` | `api` | Server run mode |
| `serviceName` | string | `athyper-runtime` | `athyper-runtime` | `athyper-runtime` | Appears in OTel spans and logs |
| `port` | int | `3000` | `3000` | `3000` | HTTP listen port inside the container |
| `logLevel` | enum | `debug` | `info` | `warn` | Pino log level. `debug` in local enables verbose auth logs |
| `shutdownTimeoutMs` | ms | `15 000` | `30 000` | `60 000` | Graceful drain window before SIGKILL |
| `publicBaseUrl` | URL | `https://api.athyper.local` | `https://api-stg.athyper.com` | `https://api.athyper.com` | Must match `PUBLIC_BASE_URL` env var |
| `publicWebUrl` | URL | `https://neon.athyper.local` | `https://neon-stg.athyper.com` | `https://neon.athyper.com` | Must match `PUBLIC_WEB_URL` env var |

### `db` block

| Field | local | staging | production | Notes |
|---|---|---|---|---|
| `url` | `LOCKED` | `LOCKED` | `LOCKED` | Read from `DATABASE_URL` env var |
| `adminUrl` | `LOCKED` | `LOCKED` | `LOCKED` | Read from `DATABASE_ADMIN_URL` env var |
| `poolMax` | `5` | `20` | `50` | Kysely connection pool ceiling — safe to commit |

### `redis` block

All fields are `LOCKED_USE_ENV_VAR`. Real values come from env vars:

| JSON key | Env var | Default |
|---|---|---|
| `url` | `REDIS_URL` | — |
| `connectTimeoutMs` | `REDIS_CONNECT_TIMEOUT_MS` | `5000` |
| `maxRetries` | `REDIS_MAX_RETRIES` | `2` |
| `errorLogCooldownMs` | `REDIS_ERROR_LOG_COOLDOWN_MS` | `10 000` |

### `s3` block

All fields are `LOCKED_USE_ENV_VAR`. Real values come from `S3_*` env vars:

| JSON key | Env var | Default |
|---|---|---|
| `endpoint` | `S3_ENDPOINT` | — |
| `accessKey` | `S3_ACCESS_KEY` | — |
| `secretKey` | `S3_SECRET_KEY` | — |
| `region` | `S3_REGION` | `us-east-1` |
| `bucket` | `S3_BUCKET` | — (staging: `athyper-staging`, prod: `athyper`) |
| `useSSL` | `S3_USE_SSL` | `false` (local), `true` (upper envs) |
| `multipartPartSizeMb` | `S3_MULTIPART_PART_SIZE_MB` | `5` |
| `multipartQueueSize` | `S3_MULTIPART_QUEUE_SIZE` | `4` |
| `maxUploadMb` | `S3_MAX_UPLOAD_MB` | `100` |
| `presignedTtlSeconds` | `S3_PRESIGNED_TTL_SECONDS` | `900` |

### `iam` block

| Field | local | staging | production | Notes |
|---|---|---|---|---|
| `strategy` | `single_realm` | `single_realm` | `single_realm` | `multi_realm` when three-plane realm split lands |
| `defaultRealmKey` | `athyper` | `athyper` | `athyper` | Must exist in `iam.realms` |
| `defaultTenantKey` | `"default"` | `null` | `null` | Local has a seeded default tenant; upper envs require tenant claims from KC tokens |
| `defaultOrgKey` | `null` | `null` | `null` | Reserved for future org-scoped IAM |
| `requireTenantClaimsInProd` | `false` | `true` | `true` | Rejects tokens missing `tenant_id` / `tenant_key` claims |

### `iam.realms.<key>` block

| Field | Type | Notes |
|---|---|---|
| `iam.issuerUrl` | URL | KC realm issuer. **Must match `IAM_ISSUER_URL` env var** — checked by `validate-env.sh` |
| `iam.clientId` | string | KC client ID for the API runtime (`athyper-api-runtime`) |
| `iam.allowedAzp` | string[] | Accepted `azp` claim values — all plane clients listed here |
| `iam.clientSecretRef` | string | Secret name resolved via SUPERSTAR pattern (see §5) |
| `defaults.features.metaStudio` | bool | Enables Metadata Studio UI. `true` in local+staging, `false` in production |
| `defaults.features.debugMode` | bool | Enables verbose auth error responses. `true` in local only |
| `defaults.policies.strictTenantIsolation` | bool | Enforces row-level tenant boundaries in queries. `false` in local, `true` in upper envs |
| `tenants` | object | Per-tenant defaults map. Empty in staging/production (tenant claims from KC). Local has `"default"` seed entry |

### `telemetry` block

| Field | Notes |
|---|---|
| `serviceName` | OTel `service.name` resource attribute |
| `serviceVersion` | OTel `service.version` resource attribute |
| `otlpEndpoint` | `LOCKED` — read from `OTEL_EXPORTER_OTLP_ENDPOINT` env var |

Telemetry enablement (on/off) is controlled by OTel SDK env vars (`OTEL_SDK_DISABLED`,
`OTEL_TRACES_EXPORTER`), not by this file.

---

## 4. LOCKED sentinel

`stripLocked()` in `kernel-config.ts` removes all `$`-prefixed annotation keys and any key
whose value is exactly `"LOCKED_USE_ENV_VAR"` before Zod validation:

```typescript
function stripLocked(value: unknown): unknown {
  // ...
  if (k.startsWith("$")) continue;          // removes $comment, $schema, $comment_*
  if (v === "LOCKED_USE_ENV_VAR") continue; // removes LOCKED infrastructure fields
  // ...
}
```

A `LOCKED_USE_ENV_VAR` value is a compile-time marker that says "look in env, not here." The
JSON file remains committable (no real secrets) while still expressing the full config shape.

**Rule:** Only use `LOCKED_USE_ENV_VAR` for fields that the server reads from env vars
anyway. Do not use it to "hide" configurable values — those belong in the feature parameter
table.

---

## 5. SUPERSTAR secret reference pattern

Client secrets for KC realms are referenced by name, not by value:

```json
"iam": {
  "clientSecretRef": "IAM_ATHYPER_CLIENT_SECRET"
}
```

At load time, `resolveSecret("IAM_ATHYPER_CLIENT_SECRET")` reads:

```
process.env["ATHYPER_SUPER__IAM_SECRET__IAM_ATHYPER_CLIENT_SECRET"]
```

If the env var is missing, the server throws at startup — never silently uses an empty secret.

**Naming convention:** `ATHYPER_SUPER__<category>__<ref>`

- Category `IAM_SECRET` is the only active category today
- `<ref>` must exactly match the `clientSecretRef` string in the JSON

**Adding a new secret reference:**

```json
// kernel.config.*.parameter.json
"clientSecretRef": "MY_REALM_CLIENT_SECRET"
```

```bash
# secrets/.env (staging/production)
ATHYPER_SUPER__IAM_SECRET__MY_REALM_CLIENT_SECRET=<generated-value>

# stack/env/.env (local)
ATHYPER_SUPER__IAM_SECRET__MY_REALM_CLIENT_SECRET=local-dev-secret
```

Run `validate-env.sh` after — it invokes `loadKernelConfig()` indirectly via the server
startup check and will surface a missing secret ref.

---

## 6. Parity invariants

`validate-env.sh` section `[4/6]` checks three cross-layer invariants on every `up.sh`
invocation:

| Kernel config field | Env var | Effect of mismatch |
|---|---|---|
| `publicBaseUrl` | `PUBLIC_BASE_URL` | CORS / CSRF origin validation breaks; OAuth redirect_uri rejected by KC |
| `publicWebUrl` | `PUBLIC_WEB_URL` | BFF session cookie domain wrong; post-login redirect fails |
| `iam.realms.*.iam.issuerUrl` | `IAM_ISSUER_URL` | Token verification rejects every access token; all API calls return 401 |

A mismatch exits `validate-env.sh` with code 2 (warning). `up.sh` treats exit 2 as
non-blocking by default but logs the mismatch prominently.

---

## 7. How to add a new tenant

Local dev only — staging/production tenants are provisioned via KC claims, not this file.

```json
// kernel.config.local.parameter.json
"tenants": {
  "default": { "defaults": { "country": "US", "currency": "USD", "timezone": "UTC" }, "orgs": {} },
  "acme": { "defaults": { "country": "GB", "currency": "GBP", "timezone": "Europe/London" }, "orgs": {} }
}
```

The `tenants` key under a realm maps `tenantKey` → `{ defaults, orgs }`. The defaults set
the fallback country/currency/timezone when the tenant has no explicit DB record.

---

## 8. How to add a new realm

Currently `single_realm` with one `athyper` realm is active. The three-plane architecture
(neon / mesh / admin) is planned to introduce separate KC realms. When that work lands:

1. Create a KC realm for the new plane (e.g., `athyper-mesh`)
2. Add a new `realms` entry in all three parameter files:

```json
"iam": {
  "strategy": "multi_realm",
  "realms": {
    "athyper": { ... },
    "athyper-mesh": {
      "iam": {
        "issuerUrl": "https://iam.athyper.com/realms/athyper-mesh",
        "clientId": "mesh-api-runtime",
        "allowedAzp": ["mesh-svc-bff", "mesh-web"],
        "clientSecretRef": "IAM_MESH_CLIENT_SECRET"
      },
      "defaults": { "features": { "metaStudio": false, "debugMode": false }, "policies": { "strictTenantIsolation": true } },
      "tenants": {}
    }
  }
}
```

3. Add `ATHYPER_SUPER__IAM_SECRET__IAM_MESH_CLIENT_SECRET` to each env's secrets
4. Update `IAM_ISSUER_URL` handling — with `multi_realm`, the server selects the realm
   based on the token's `iss` claim, not the env var
5. Run `validate-env.sh` and fix any parity warnings

---

## 9. Known gaps

| ID | Severity | Description |
|---|---|---|
| K1 | Warn | `metaStudio: true` in staging but `false` in production — staging does not fully mirror prod for this flag |
| K6 | High | Three-plane realm split: kernel config currently has one realm; `allowedAzp` lists all six plane clients in a single realm. Multi-realm topology for neon/mesh/admin is pending |
| K7 | Medium | No standalone `validate-kernel-config.sh` script — validation requires a full env setup via `validate-env.sh` or server startup. A dedicated script + CI gate on `kernel.config.*.parameter.json` changes is recommended |

---

## Related documentation

| Document | Scope |
|---|---|
| [env-reference.md](env-reference.md) | All env vars — including three-layer architecture decision flowchart |
| [secrets-management.md](secrets-management.md) | Secret generation commands and rotation runbooks |
| [iam-realm-config.md](iam-realm-config.md) | Keycloak realm JSON configuration |
| [stack/config/apps/README.md](../../stack/config/apps/README.md) | In-context editing guide |
| [feature-parameter-reference.md](feature-parameter-reference.md) | Runtime-reloadable business parameter catalog |
