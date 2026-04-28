# Athyper — Secrets Management

**Scope:** All environments — local, staging, production.

Three invariants this document enforces:
1. Dev defaults (`athyperadmin-*`) must never reach staging or production.
2. `validate-env.sh` must pass before any `up.sh` call.
3. Secrets are rotated via the playbook — never edited in place while services are running.

---

## Contents

1. [Secret Injection by Environment](#1-secret-injection-by-environment)
2. [Secrets Inventory](#2-secrets-inventory)
3. [Secret Generation Reference](#3-secret-generation-reference)
4. [Infisical — Self-Hosted Secret Manager](#4-infisical--self-hosted-secret-manager)
5. [Alternative Backends](#5-alternative-backends)
6. [Rotation Runbook](#6-rotation-runbook)
7. [TELEMETRY_ADMIN_PASSWORD Migration](#7-telemetry_admin_password-migration-action-required)
8. [Validation](#8-validation)

---

## 1. Secret Injection by Environment

| Tier | How secrets get in | Where they live | Dev defaults allowed? |
|---|---|---|---|
| `local` | `.env.example` ships all defaults | `stack/env/.env` (git-ignored) | Yes — intentional for dev UX |
| `staging` | CI/CD injects into `.env`; or operator fills manually | `/opt/stack/athyper/secrets/.env` (outside git) | No — `validate-env.sh` blocks |
| `production` | CI/CD injects into `.env`; or Infisical B3.2 (deferred) | `/opt/stack/athyper/secrets/.env` | No — `validate-env.sh` blocks |

> **Why `.env.example` ships plaintext dev defaults:** The alternative — empty placeholders —
> breaks `docker compose up` on first clone for every developer. The `athyperadmin` password
> is intentionally weak and is blocked by `validate-env.sh` before any non-local deploy.
> It buys zero security value to hide these in `.env.example`.

> **Why `/opt/stack/athyper/secrets/` on the server:** The secrets directory sits outside
> the git checkout (`/opt/products/athyper`). A `git pull` or branch switch never touches
> it. Accidental `git clean` can't reach it. This is the two-root rule applied to secrets.

---

## 2. Secrets Inventory

Every variable below must be injected in staging/production. In local dev, `.env.example`
provides defaults — do not change these unless you are testing a specific auth scenario.

### Database

| Variable | Service | Why it matters |
|---|---|---|
| `DB_ADMIN_PASSWORD` | PostgreSQL | `POSTGRES_PASSWORD` in the DB container. All other DB passwords derive from this at seed time. Rotation requires `seed-db.sh` re-run. |
| `DATABASE_URL` | PgBouncer apps pool | Full connection string including password. Used by all application DB queries via the `6432` pool. |
| `DATABASE_ADMIN_URL` | Direct PostgreSQL | Bypasses PgBouncer — used by migrations and DDL scripts. Requires `postgres` superuser rights. |
| `DBPOOL_APPS_PASSWORD` | PgBouncer apps | Written to `userlist.txt` at container start. Must match the Postgres role password in `DATABASE_URL`. |
| `DBPOOL_SESSION_PASSWORD` | PgBouncer session | Written to `userlist.txt` at container start. Must match the Postgres role used by the session pool (`6433`). |

### Redis / Cache

| Variable | Service | Why it matters |
|---|---|---|
| `REDIS_URL` | Application | Full `redis://:password@host:port/db` URL. The `memorycache` service enforces a password via ACL — a missing or wrong password causes silent connection failures. |
| `MEMORYCACHE_PASSWORD` | Redis ACL (`default` user) | The password for the standard Redis `default` ACL user. Written to `redis-acl.conf` as a SHA-256 hash. Rotation requires container restart. |
| `REDIS_ADMIN_PASSWORD` | Redis ACL (`admin` user) | Full-access ACL user — used only for admin tooling (e.g. `redis-cli AUTH admin <password> CONFIG GET *`). Keep this separate from `MEMORYCACHE_PASSWORD`. |
| `REDIS_EXPORTER_PASSWORD` | Redis Prometheus exporter | Read-only ACL user for metrics export. Separate password reduces blast radius if the exporter is compromised. |

### Object Storage

| Variable | Service | Why it matters |
|---|---|---|
| `S3_ACCESS_KEY` | MinIO / S3 | Also the MinIO root user login. Changing this requires updating the MinIO admin UI or running `mc admin user add`. |
| `S3_SECRET_KEY` | MinIO / S3 | MinIO root password. Rotation without updating `DATABASE_URL`-equivalent S3 env vars causes all file upload/download to fail silently. |

### IAM / Keycloak

| Variable | Service | Why it matters |
|---|---|---|
| `IAM_ADMIN_PASSWORD` | Keycloak master realm admin | Bootstrap credential. After first boot, Keycloak does not re-read this from `.env` — it stores hashes in its own database. Rotating requires a `kcadm.sh` call or a realm wipe-and-reimport. |
| `IAM_CLIENT_SECRET` | Keycloak API client | Shared secret between the API and the Keycloak `athyper-api` client. Rotation must be applied in both Keycloak (via admin console or realm JSON) and `.env` simultaneously or JWT verification breaks. |
| `IAM_DB_PASSWORD` | Keycloak database | Password for the `keycloak` Postgres role. Used by Keycloak's JPA datasource. Rotating requires both a Postgres `ALTER ROLE` and a `.env` update before the KC container restarts. |

### Application Runtime

| Variable | Service | Why it matters |
|---|---|---|
| `CREDENTIAL_MASTER_KEY` | `CredentialEncryptionService` | AES key used to encrypt tenant credential payloads (webhook signing keys, endpoint auth tokens) in the database. **Rotation without a re-encryption migration invalidates all existing encrypted rows.** Minimum 32 characters. See the rotation note in §6. |
| `RENDERER_INTERNAL_TOKEN` | Document renderer | `X-Renderer-Token` request header. The renderer rejects all requests missing this header — a wrong value causes all PDF generation to silently fail with 401. |

### Gateway

| Variable | Service | Why it matters |
|---|---|---|
| `GATEWAY_DASHBOARD_HTPASSWD` | Traefik dashboard | `user:bcrypt_hash` format. The dollar signs in bcrypt hashes must be doubled (`$$`) for Docker Compose interpolation — see generation command in §3. Wrong format causes Traefik to boot but reject all dashboard logins. |

### Email

| Variable | Service | Why it matters |
|---|---|---|
| `KC_SMTP_USERNAME` | Keycloak SMTP | Keycloak email provider credentials for password-reset and verification emails. |
| `KC_SMTP_PASSWORD` | Keycloak SMTP | Keycloak SMTP auth password. A wrong value causes silent email delivery failure — no error in app logs, only in Keycloak event log. |

### Telemetry

| Variable | Service | Why it matters |
|---|---|---|
| `TELEMETRY_ADMIN_USER` | Grafana | `GF_SECURITY_ADMIN_USER`. Use the canonical name exactly — aliases to `GRAFANA_ADMIN_USER` have been removed. See §7. |
| `TELEMETRY_ADMIN_PASSWORD` | Grafana | `GF_SECURITY_ADMIN_PASSWORD`. An empty or wrong value locks ops out of Loki, Tempo, and Prometheus dashboards — exactly when they are needed during incidents. See §7. |

### Infisical Bootstrap

Only required when the `security-infisical` compose profile is active.
`validate-env.sh` enforces these in non-local environments regardless of whether the profile
is active — so the profile cannot be later enabled with placeholder keys.

| Variable | Purpose | Generation |
|---|---|---|
| `INFISICAL_ENCRYPTION_KEY` | 32 hex chars (128-bit). Per-workspace data-key derivation. Distinct from `CREDENTIAL_MASTER_KEY`. | `openssl rand -hex 16` |
| `INFISICAL_AUTH_SECRET` | ≥ 32 chars. Signs Infisical's own session JWTs. | `openssl rand -base64 32` |

### Kernel Config Secrets

| Pattern | Service | Why it matters |
|---|---|---|
| `ATHYPER_SUPER__IAM_SECRET__*` | Runtime kernel | SUPERSTAR env var pattern — read by the kernel config loader and projected into the kernel config struct at startup. These are service-internal secrets injected without exposing them in the kernel config JSON file. |

---

## 3. Secret Generation Reference

Use these commands when provisioning a fresh environment. All values are cryptographically
random — never use placeholder values from examples on staging/production.

```bash
# Database passwords — long random strings
openssl rand -base64 32     # DB_ADMIN_PASSWORD
openssl rand -base64 32     # DBPOOL_APPS_PASSWORD
openssl rand -base64 32     # DBPOOL_SESSION_PASSWORD
openssl rand -base64 32     # IAM_DB_PASSWORD

# Redis passwords — avoid % and @ which break URL parsing
openssl rand -hex 24        # MEMORYCACHE_PASSWORD
openssl rand -hex 24        # REDIS_ADMIN_PASSWORD
openssl rand -hex 24        # REDIS_EXPORTER_PASSWORD

# S3 / MinIO credentials
openssl rand -hex 16        # S3_ACCESS_KEY (MinIO access key — alphanumeric only)
openssl rand -base64 32     # S3_SECRET_KEY

# Application runtime
openssl rand -base64 48     # CREDENTIAL_MASTER_KEY (must be >= 32 chars; 48-char b64 gives 360-bit key)
openssl rand -hex 32        # RENDERER_INTERNAL_TOKEN

# IAM client secret
openssl rand -base64 32     # IAM_CLIENT_SECRET

# Infisical
openssl rand -hex 16        # INFISICAL_ENCRYPTION_KEY (exactly 32 hex chars = 128-bit)
openssl rand -base64 32     # INFISICAL_AUTH_SECRET

# Traefik dashboard htpasswd — bcrypt; double $ signs for compose interpolation
htpasswd -nbB admin "$(openssl rand -base64 24)" | sed 's/\$/\$\$/g'
# Paste the full output as GATEWAY_DASHBOARD_HTPASSWD
```

> **Why double `$$` for Traefik htpasswd:** Docker Compose interprets a single `$` in
> environment variable values as the start of a variable substitution. Bcrypt hashes contain
> multiple `$` separators — they must all be escaped as `$$` or Compose silently strips them,
> leaving a malformed hash that Traefik rejects on every login attempt.

> **Why `openssl rand -hex` for Redis passwords instead of `-base64`:** Redis ACL `RESETPASS`
> and `NOPASS` parsing treats `%`, `+`, `=`, and `@` as command tokens in some versions.
> Hex output is alphanumeric only — safe in ACL config lines, URL-embedded credentials,
> and shell variables without quoting complexity.

> **Why 48-char base64 for `CREDENTIAL_MASTER_KEY`:** AES-256 requires a 32-byte key. A
> 48-char base64 string encodes 36 bytes, providing a 288-bit key after the runtime derives
> the actual AES key via HKDF. The extra length is a one-time cost that buys margin against
> future algorithm changes without breaking any existing behaviour.

---

## 4. Infisical — Self-Hosted Secret Manager

athyper uses Infisical as its self-hosted secret manager. The integration ships in four
slices; only B3.1 is implemented. Do not start B3.2 work until all gating questions in
§4.2 are answered.

### Status Map

| Slice | Ships | Status |
|---|---|---|
| B3.1 | Compose service + env + `security-infisical` profile + Traefik route + `infisical` Postgres DB | **Implemented** |
| B3.2 | `config.ts` SDK fetch before Zod parse; `athyper/platform/*` path convention | **BLOCKED** — see §4.2 |
| B3.3 | Tenant-scoped secrets behind `CredentialEncryptionService`; `athyper/tenant/{id}/*` | Not started |
| B3.4 | `CREDENTIAL_MASTER_KEY` rotation utility; re-encryption batch | Not started |

### B3.1 Operational Contract

- **Activation:** opt-in via `security-infisical` compose profile. `up.sh core` does NOT
  start Infisical. Use `up.sh core,security-infisical` (or `--profile security-infisical`)
  to include it.
- **State:** Postgres DB `infisical` (seeded by `stack/config/db/local/init-databases.sh`)
  + Redis DB index 2 on the shared `memorycache` service. Infisical itself is stateless —
  no named Docker volume. Back up via the standard `pg_dump` runbook; `infisical` is listed
  alongside `glitchtip` and `healthchecks` in the database registry.
- **Public route:** `https://${INFISICAL_HOST}` behind Traefik with standard TLS. No
  additional dashboard-auth middleware — Infisical enforces its own email/password auth.
- **Bootstrap:** first-boot admin signup happens via the Infisical UI. B3.1 does not seed
  any secrets via IaC.
- **App integration:** none. `config.ts` still reads from `.env`. `CREDENTIAL_MASTER_KEY`
  still comes from env. Storing secrets in Infisical today is for human reference only
  until B3.2 wires the SDK.

### B3.2 Gating Questions

> **Status: BLOCKED.** Do not open PRs against `bootstrap.ts` or `config.ts` until all
> five questions below are answered by Ops/Security and recorded here. Engineering cannot
> answer these alone — wiring the SDK without a CI/CD injection story produces a
> half-integrated secret manager that gets bypassed in practice.

1. Where do production secrets live today? (CI env vars, K8s secrets, `.env` on disk?)
2. Who manages them? (DevOps, developers, security team?)
3. What is the current rotation practice? (none, ad-hoc, scheduled?)
4. How does CI/CD inject secrets at deploy? (this is the real integration surface)
5. Do developers need Infisical running locally? (Recommendation: no — keep `.env` with
   `athyperadmin-*` defaults. Infisical is staging/prod only.)

### B3.3 Cutover Design Note

Existing encrypted rows in the database must continue to decrypt during transition to
Infisical-sourced keys, while new writes move to the new key-resolution path. The
`CredentialEncryptionService` needs a dual-read path during cutover: try decryption with
the Infisical-sourced key first; fall back to the legacy env-var key if that fails. New
encryptions always use the Infisical-sourced key.

Once all rows have been re-encrypted (either by the B3.4 sweep job or natural rotation),
the fallback path is removed. This connects directly to B3.4: the phased fallback and the
rotation sweep are two sides of the same design.

---

## 5. Alternative Backends

These are reference designs for teams who already operate Vault or AWS Secrets Manager.
B3 (Infisical) is the committed path — these sections exist for evaluation and migration
planning only.

### HashiCorp Vault

#### KV Secret Layout

```text
secret/athyper/
  staging/
    db/          → DB_ADMIN_PASSWORD, DATABASE_URL, DBPOOL_APPS_PASSWORD, ...
    redis/       → MEMORYCACHE_PASSWORD, REDIS_URL, REDIS_ADMIN_PASSWORD, ...
    iam/         → IAM_ADMIN_PASSWORD, IAM_CLIENT_SECRET, IAM_DB_PASSWORD
    s3/          → S3_ACCESS_KEY, S3_SECRET_KEY
    gateway/     → GATEWAY_DASHBOARD_HTPASSWD
    runtime/     → CREDENTIAL_MASTER_KEY, RENDERER_INTERNAL_TOKEN
    smtp/        → KC_SMTP_USERNAME, KC_SMTP_PASSWORD
    telemetry/   → TELEMETRY_ADMIN_USER, TELEMETRY_ADMIN_PASSWORD
  production/
    (same layout, different values)
```

#### Vault Agent Template

```hcl
template {
  source      = "/etc/vault-agent/templates/athyper.env.tpl"
  destination = "/opt/stack/athyper/secrets/.env"
  perms       = "0600"
  # Restart the stack after render so containers pick up the new values.
  command     = "systemctl restart athyper-stack"
}
```

`athyper.env.tpl` (excerpt):

```hcl
{{- with secret "secret/athyper/staging/db" }}
DB_ADMIN_PASSWORD={{ .Data.data.admin_password }}
DATABASE_URL={{ .Data.data.url }}
DATABASE_ADMIN_URL={{ .Data.data.admin_url }}
DBPOOL_APPS_PASSWORD={{ .Data.data.pool_apps_password }}
DBPOOL_SESSION_PASSWORD={{ .Data.data.pool_session_password }}
{{- end }}
{{- with secret "secret/athyper/staging/redis" }}
REDIS_URL={{ .Data.data.url }}
MEMORYCACHE_PASSWORD={{ .Data.data.password }}
REDIS_ADMIN_PASSWORD={{ .Data.data.admin_password }}
REDIS_EXPORTER_PASSWORD={{ .Data.data.exporter_password }}
{{- end }}
```

### AWS Secrets Manager

#### Secret Layout

```text
athyper/staging/db        → JSON: { "admin_password", "url", "admin_url", "pool_apps_password", "pool_session_password" }
athyper/staging/redis     → JSON: { "password", "url", "admin_password", "exporter_password" }
athyper/staging/iam       → JSON: { "admin_password", "client_secret", "db_password" }
athyper/staging/s3        → JSON: { "access_key", "secret_key" }
athyper/staging/runtime   → JSON: { "credential_master_key", "renderer_token" }
athyper/staging/gateway   → JSON: { "dashboard_htpasswd" }
athyper/staging/smtp      → JSON: { "username", "password" }
athyper/staging/telemetry → JSON: { "admin_user", "admin_password" }
```

#### Fetch Script

```bash
#!/usr/bin/env bash
# stack/scripts/setup/fetch-secrets-aws.sh
# Fetches secrets from AWS Secrets Manager and appends to .env
set -euo pipefail

ENV="${1:?Usage: fetch-secrets-aws.sh <staging|production>}"
PREFIX="athyper/$ENV"
ENV_FILE="${STACK_DIR:-/opt/stack/athyper/secrets}/.env"

fetch() { aws secretsmanager get-secret-value --secret-id "$1" --query SecretString --output text; }
field() { echo "$1" | jq -r ".$2"; }

DB=$(fetch "$PREFIX/db")
REDIS=$(fetch "$PREFIX/redis")
IAM=$(fetch "$PREFIX/iam")
S3=$(fetch "$PREFIX/s3")
RUNTIME=$(fetch "$PREFIX/runtime")
GW=$(fetch "$PREFIX/gateway")
SMTP=$(fetch "$PREFIX/smtp")
TELE=$(fetch "$PREFIX/telemetry")

cat >> "$ENV_FILE" <<EOF
DB_ADMIN_PASSWORD=$(field "$DB" admin_password)
DATABASE_URL=$(field "$DB" url)
DATABASE_ADMIN_URL=$(field "$DB" admin_url)
DBPOOL_APPS_PASSWORD=$(field "$DB" pool_apps_password)
DBPOOL_SESSION_PASSWORD=$(field "$DB" pool_session_password)
REDIS_URL=$(field "$REDIS" url)
MEMORYCACHE_PASSWORD=$(field "$REDIS" password)
REDIS_ADMIN_PASSWORD=$(field "$REDIS" admin_password)
REDIS_EXPORTER_PASSWORD=$(field "$REDIS" exporter_password)
IAM_ADMIN_PASSWORD=$(field "$IAM" admin_password)
IAM_CLIENT_SECRET=$(field "$IAM" client_secret)
IAM_DB_PASSWORD=$(field "$IAM" db_password)
S3_ACCESS_KEY=$(field "$S3" access_key)
S3_SECRET_KEY=$(field "$S3" secret_key)
CREDENTIAL_MASTER_KEY=$(field "$RUNTIME" credential_master_key)
RENDERER_INTERNAL_TOKEN=$(field "$RUNTIME" renderer_token)
GATEWAY_DASHBOARD_HTPASSWD=$(field "$GW" dashboard_htpasswd)
KC_SMTP_USERNAME=$(field "$SMTP" username)
KC_SMTP_PASSWORD=$(field "$SMTP" password)
TELEMETRY_ADMIN_USER=$(field "$TELE" admin_user)
TELEMETRY_ADMIN_PASSWORD=$(field "$TELE" admin_password)
EOF

echo "Secrets injected into $ENV_FILE for environment: $ENV"
```

---

## 6. Rotation Runbook

### Standard Password Rotation

1. **Generate a new value** — use the commands in §3, never reuse old credentials.
2. **Update the secret store** — Infisical, Vault, AWS SM, or the server `.env` depending
   on your environment's injection method.
3. **Verify the new value is in `.env`** — if using a fetch script, run it and check the
   output with `grep VARIABLE_NAME /opt/stack/athyper/secrets/.env`.
4. **Run `validate-env.sh`** — it will fail if the value looks like an unresolved placeholder
   or a known dev default.
5. **Restart affected services only** — do not restart the full stack for a single credential
   change unless required:
   ```bash
   docker compose restart memorycache   # Redis password
   docker compose restart objectstorage # S3/MinIO credentials
   docker compose restart iam           # KC admin or client secret
   docker compose restart api           # CREDENTIAL_MASTER_KEY, RENDERER_INTERNAL_TOKEN
   ```
6. **Verify service health** — run `smoke-staging.sh` and confirm all checks pass.

### Traefik Dashboard (`GATEWAY_DASHBOARD_HTPASSWD`)

```bash
# Generate a new bcrypt-hashed credential.
# The sed step doubles every $ for Docker Compose interpolation.
htpasswd -nbB admin "$(openssl rand -base64 24)" | sed 's/\$/\$\$/g'
```

Update the value in the secret store and in `.env`, then reload the gateway:

```bash
docker compose restart gateway
# Verify: open https://gateway.<domain> and log in with the new password.
```

### Adding a Missing Secret After an Upgrade

When a new secret variable is added to `write-env-staging.sh` in a later commit, an
already-provisioned server will not have it in its `secrets/.env`. The symptom is one
or more containers entering a crash-restart loop at startup with a config-validation
error naming the missing variable.

**Do not re-run `write-env-staging.sh`** — that rotates all 22 secrets and requires
re-applying every downstream credential (DB, Redis, IAM, S3, etc.).

Instead, run the patch script as root. It adds only the missing variables and
deduplicates any accidental double entries, leaving all existing values untouched:

```bash
sudo bash /opt/products/athyper/stack/scripts/setup/patch-missing-secrets.sh
```

The script prints a summary of what was added vs. what was already present, and tells
you which services to restart. After restarting, re-run `validate-env.sh` to confirm.

> **Keeping the script current:** `patch-missing-secrets.sh` maintains a canonical list
> of all generated secrets (mirroring `write-env-staging.sh`). When you add a new secret
> to `write-env-staging.sh`, add the corresponding `has_key` / `add_key` block to
> `patch-missing-secrets.sh` in the same commit.

---

### `CREDENTIAL_MASTER_KEY` Rotation

> **Warning:** rotating `CREDENTIAL_MASTER_KEY` invalidates all encrypted credential rows
> in the database (webhook signing keys, endpoint auth tokens, notification provider
> credentials). A re-encryption migration must run before the old key is removed.

1. Generate a new key: `openssl rand -base64 48`
2. Add the new key as `CREDENTIAL_MASTER_KEY_NEW` to `.env`.
3. Run the re-encryption migration (B3.4 — not yet implemented): it reads existing rows with
   the old key and re-encrypts with the new key in a single transaction.
4. Once the migration completes successfully, promote `CREDENTIAL_MASTER_KEY_NEW` to
   `CREDENTIAL_MASTER_KEY` and remove the old variable.
5. Restart the API: `docker compose restart api`

Until B3.4 is implemented, rotating `CREDENTIAL_MASTER_KEY` requires a manual re-encryption
script against the database. Do not rotate it without coordinating with the team.

### Keycloak IAM Secret Rotation

`IAM_CLIENT_SECRET` must be updated in two places atomically or JWT verification breaks:

1. Update the secret in Keycloak: Admin Console → Clients → `athyper-api` → Credentials →
   Regenerate Secret. Copy the new value.
2. Update `IAM_CLIENT_SECRET` in `.env`.
3. Restart the API: `docker compose restart api`

Do not update `.env` first and restart — there is a window where the API tries to use the
new secret against Keycloak's old record, causing all token exchanges to fail.

### Redis ACL Rotation

Redis passwords are stored as SHA-256 hashes in `redis-acl.conf`. The file is rendered by
`validate-env.sh` from the plaintext `.env` values:

1. Update `MEMORYCACHE_PASSWORD`, `REDIS_ADMIN_PASSWORD`, `REDIS_EXPORTER_PASSWORD` in `.env`.
2. Re-render the ACL file: `./stack/scripts/setup/validate-env.sh`
3. Restart Redis: `docker compose restart memorycache`
4. Verify: `docker exec athyper-memorycache-1 redis-cli -a NEW_PASSWORD ping` must return `PONG`.

The `redis-acl.conf` file is mode `0640` (group `svc-redis`) on the server — it contains
hashes, not plaintext passwords, but still should not be world-readable.

---

## 7. TELEMETRY_ADMIN_PASSWORD Migration (ACTION REQUIRED)

**Action required before the next staging/production deploy.**

`staging.env.example` and `production.env.example` previously used the alias
`TELEMETRY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}`. The alias has been removed — both
files now expect `TELEMETRY_ADMIN_PASSWORD` to be injected directly. `validate-env.sh`
enforces this in non-local environments and will refuse `up.sh` if the value is missing
or still contains `${...}`.

> **Why the rename was forced:** The indirection silently resolved to an empty string
> whenever the secret store was missing the legacy `GRAFANA_ADMIN_PASSWORD` key. An empty
> `GF_SECURITY_ADMIN_PASSWORD` locks ops out of the Loki / Tempo / Prometheus dashboards
> exactly when they are needed — during an active incident. The alias was the root cause of
> a previous ops lockout.

### What to do per environment

**Step 1 — Rename the secret in the store, preserving the value.**

- **AWS Secrets Manager:**
  ```bash
  aws secretsmanager put-secret-value \
    --secret-id "athyper/staging/telemetry" \
    --secret-string '{"admin_user":"admin","admin_password":"<value of old GRAFANA_ADMIN_PASSWORD>"}'
  ```
  Update the fetch script to write `TELEMETRY_ADMIN_USER` / `TELEMETRY_ADMIN_PASSWORD`
  (the example in §5 already uses the canonical names).

- **HashiCorp Vault:**
  ```bash
  vault kv put secret/athyper/staging/telemetry \
    admin_user="admin" admin_password="<value of old GRAFANA_ADMIN_PASSWORD>"
  ```
  Update the Vault Agent template to render `TELEMETRY_ADMIN_USER` /
  `TELEMETRY_ADMIN_PASSWORD`.

- **Infisical:** rename the secret key `GRAFANA_ADMIN_PASSWORD` →
  `TELEMETRY_ADMIN_PASSWORD` in the env project. Add `TELEMETRY_ADMIN_USER` if absent.

- **GitHub Actions repo secrets:** add `TELEMETRY_ADMIN_PASSWORD` with the same value as
  `GRAFANA_ADMIN_PASSWORD`. Update the workflow that writes `.env` to reference the new
  name. Delete the old secret after the first successful deploy.

**Step 2 — Validate before deploying.**

```bash
./stack/scripts/setup/validate-env.sh
```

If the output contains `FAIL  TELEMETRY_ADMIN_PASSWORD = ${TELEMETRY_ADMIN_PASSWORD}`,
the secret store rename has not propagated. Do not run `up.sh`.

**Step 3 — Verify post-deploy.**

Log into Grafana at `https://${TELEMETRY_HOST}` with the new credentials.

If login fails, Grafana may still hold the old password in its internal SQLite database.
Force a reset:

```bash
docker exec athyper-telemetry-observability-1 \
  grafana-cli admin reset-admin-password NEW_PASSWORD
docker compose restart telemetry-observability
```

The old `GRAFANA_ADMIN_PASSWORD` secret can be deleted from the store after the first
successful deploy on each environment.

---

## 8. Validation

`validate-env.sh` (and `validate-env.bat` on Windows) runs automatically at the start of
every `up.sh` call. You can also run it standalone:

```bash
./stack/scripts/setup/validate-env.sh
# Windows:
stack\scripts\setup\validate-env.bat
```

### What it checks

| Check | Local | Staging/Production |
|---|---|---|
| All required variables are set | ✅ | ✅ |
| No `${...}` unresolved placeholders | ✅ | ✅ |
| `CREDENTIAL_MASTER_KEY` is ≥ 32 characters | ✅ | ✅ |
| `INFISICAL_ENCRYPTION_KEY` is exactly 32 hex chars | only if profile active | ✅ (always) |
| No `athyperadmin` dev defaults | skipped | ✅ |
| Kernel config `publicBaseUrl` matches `PUBLIC_BASE_URL` | ✅ | ✅ |
| Redis ACL file rendered (mode `0644` → tightened to `0640` by `setup-config.sh` on server) | ✅ | ✅ |

### Interpreting failures

```text
FAIL  DB_ADMIN_PASSWORD = ${DB_ADMIN_PASSWORD}
  → Secret store fetch did not run, or the variable was not injected by CI/CD.

FAIL  CREDENTIAL_MASTER_KEY too short (12 chars, minimum 32)
  → Dev placeholder leaked into a non-local .env.

FAIL  TELEMETRY_ADMIN_PASSWORD = ${TELEMETRY_ADMIN_PASSWORD}
  → See §7 — secret rename has not been applied.

FAIL  publicBaseUrl mismatch: kernel=api.athyper.com, env=api-stg.athyper.com
  → Kernel config JSON and .env point to different environments.
    Update ATHYPER_KERNEL_CONFIG_PATH in .env to the correct config file.
```

The script exits with code `1` on any failure — `up.sh` will not proceed.
