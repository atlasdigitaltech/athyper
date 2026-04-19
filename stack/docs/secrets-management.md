# Secret Management Guide

Guidance for managing secrets across athyper stack environments (local, staging, production).

## Current State

| Tier | Secret Injection Method | Credential Storage |
|------|------------------------|--------------------|
| Local | Hardcoded in `.env.example` (`athyperadmin`) | Plaintext in repo (intentional for dev UX) |
| Staging | `${VAR}` placeholders in `staging.env.example` | CI/CD secrets or manual `.env` file |
| Production | `${VAR}` placeholders in `production.env.example` | CI/CD secrets or manual `.env` file |

### Secrets Inventory

The following env vars contain secrets that MUST be injected in staging/production:

| Variable | Service | Notes |
|----------|---------|-------|
| `DB_ADMIN_PASSWORD` | PostgreSQL | `POSTGRES_PASSWORD` in db container |
| `DATABASE_URL` | PgBouncer (apps) | Full connection string with password |
| `DATABASE_ADMIN_URL` | Direct PostgreSQL | Admin/migration connection |
| `DBPOOL_APPS_PASSWORD` | PgBouncer apps | Written to `userlist.txt` at container start |
| `DBPOOL_AUTH_PASSWORD` | PgBouncer auth | Written to `userlist.txt` at container start |
| `REDIS_URL` | Redis | Includes password in URL |
| `MEMORYCACHE_PASSWORD` | Redis ACL | Default user password |
| `REDIS_ADMIN_PASSWORD` | Redis ACL | Admin user password |
| `REDIS_EXPORTER_PASSWORD` | Redis exporter | Prometheus exporter password |
| `S3_ACCESS_KEY` | MinIO/S3 | Also MinIO root user |
| `S3_SECRET_KEY` | MinIO/S3 | Also MinIO root password |
| `IAM_ADMIN_PASSWORD` | Keycloak | Bootstrap admin password |
| `IAM_CLIENT_SECRET` | Keycloak | API client secret |
| `IAM_DB_PASSWORD` | Keycloak | KC database password |
| `CREDENTIAL_MASTER_KEY` | Runtime | AES key for credential encryption (>= 32 chars) |
| `RENDERER_INTERNAL_TOKEN` | Renderer | X-Renderer-Token header secret |
| `GATEWAY_DASHBOARD_HTPASSWD` | Traefik | `user:bcrypt_hash` for dashboard auth |
| `KC_SMTP_USERNAME` / `KC_SMTP_PASSWORD` | Keycloak SMTP | Email provider credentials |
| `ATHYPER_SUPER__IAM_SECRET__*` | Runtime | SUPERSTAR env var pattern for kernel config secrets |
| `INFISICAL_ENCRYPTION_KEY` | Infisical (B3.1) | 32 hex chars — bootstraps Infisical's own per-workspace data-key derivation. Distinct from `CREDENTIAL_MASTER_KEY`. |
| `INFISICAL_AUTH_SECRET` | Infisical (B3.1) | ≥32 chars — signs Infisical's own session JWTs. |
| `TELEMETRY_ADMIN_USER` | Grafana | `GF_SECURITY_ADMIN_USER`. Canonical name — do NOT alias to `GRAFANA_ADMIN_USER`. |
| `TELEMETRY_ADMIN_PASSWORD` | Grafana | `GF_SECURITY_ADMIN_PASSWORD`. Canonical name — do NOT alias to `GRAFANA_ADMIN_PASSWORD`. Empty value locks ops out of the Loki/Tempo/Prom dashboards mid-incident. |

## Track B3 — Infisical (Platform Secret Manager)

athyper's chosen self-hosted secret manager. Track B3 ships in four slices;
**only B3.1 is implemented today**.

### Scope map

| Slice | Ships | Status |
|-------|-------|--------|
| B3.1 | Compose service + env + `security-infisical` profile + Traefik route + `infisical` Postgres DB | **Implemented** |
| B3.2 | `config.ts` loader fetches platform secrets from Infisical before Zod parse; `athyper/platform/*` path convention; SDK integration | 🚫 **BLOCKED** — see B3.2 gating section |
| B3.3 | Migrate tenant-scoped secrets (webhook signing, endpoint auth, notification providers) behind `CredentialEncryptionService`; `athyper/tenant/{id}/*` | Not started |
| B3.4 | Rotation runbook + `CREDENTIAL_MASTER_KEY` rotation utility | Not started |

### B3.3 migration constraint (design note)

Existing encrypted rows must continue to decrypt during transition, while
new writes can move to the new key-resolution path. Concretely,
`CredentialEncryptionService` needs a dual-read path during cutover: try
decryption with the Infisical-sourced key first; fall back to the legacy
env-var key if that fails. New encryptions always use the
Infisical-sourced key. Once all rows have been re-encrypted (either by a
B3.4 sweep job or natural rotation), the fallback path is removed. This
is the same pattern key rotation uses in general, and it connects
directly to B3.4's re-encryption batch: the phased fallback and the
rotation sweep are two sides of the same design.

### B3.1 operational contract

- **Activation**: opt-in via `security-infisical` profile. `up.sh core` does
  NOT start Infisical. Use `up.sh core,security-infisical` (or the equivalent
  compose `--profile` flag) to bring it up.
- **State**: Postgres DB `infisical` (seeded by
  `stack/config/db/local/init-databases.sh`) + Redis DB index 2 on the
  existing `memorycache` service. No container volume is mounted — Infisical
  is stateless. Back up via the existing pg_dump runbook; the `infisical`
  database name is listed alongside `glitchtip` and `healthchecks`.
- **Public route**: `https://${INFISICAL_HOST}` behind Traefik with the
  stack's standard TLS options. No dashboard-auth middleware — Infisical
  enforces its own email/password + SSO auth.
- **Bootstrap**: first-boot admin signup happens via the Infisical UI. No
  secrets are seeded by IaC in B3.1.
- **App integration**: NONE in B3.1. `config.ts` still reads from `.env`.
  `CREDENTIAL_MASTER_KEY` still comes from env. Storing secrets in Infisical
  today is advisory/human-reference-only until B3.2 wires the SDK.

### B3.1 bootstrap secrets

Infisical has its own key-management bootstrap, distinct from the athyper
`CREDENTIAL_MASTER_KEY`:

| Variable | Purpose | Generation |
|----------|---------|------------|
| `INFISICAL_ENCRYPTION_KEY` | 32 hex chars (128-bit). Derives per-workspace data keys. | `openssl rand -hex 16` |
| `INFISICAL_AUTH_SECRET` | ≥32 chars. Signs Infisical's own session JWTs. | `openssl rand -base64 32` |

Both are required by `validate-env.sh` in non-local environments regardless
of whether the `security-infisical` profile is active — so ops cannot later
enable the profile with placeholder keys.

### B3.2 gating questions

> **Status: BLOCKED.** Do not open PRs against `bootstrap.ts` or `config.ts`
> until all five questions below are answered by Ops/Security and the
> answers are recorded in this doc. These need Ops/Security input —
> engineering can't answer them alone. Wiring the SDK without a CI/CD
> injection story produces a half-integrated secret manager that gets
> bypassed in practice.

1. Where do production secrets live today? (CI env vars, K8s secrets, .env on disk?)
2. Who manages them? (DevOps, developers, security team?)
3. Current rotation practice? (none, ad-hoc, scheduled?)
4. How does CI/CD inject secrets at deploy? (this is the real integration surface)
5. Do developers need Infisical running locally? (Recommendation: no — keep
   `.env` with `athyperadmin-*` defaults. Infisical is staging/prod only.)

## Alternative Considered: HashiCorp Vault

### Integration Pattern

```
                       +-------------+
                       |   Vault     |
                       | KV v2 store |
                       +------+------+
                              |
              +---------------+---------------+
              |                               |
     +--------v--------+            +--------v--------+
     | vault agent      |            | CI/CD pipeline  |
     | (sidecar/init)   |            | (GitHub Actions) |
     +---------+--------+            +--------+--------+
               |                              |
      writes .env file               injects env vars
               |                              |
     +---------v---------+          +---------v---------+
     | docker compose up  |          | docker compose up  |
     | (reads .env)       |          | (reads env vars)   |
     +--------------------+          +--------------------+
```

### Vault KV Layout

```
secret/athyper/
  staging/
    db/          -> DB_ADMIN_PASSWORD, DATABASE_URL, ...
    redis/       -> MEMORYCACHE_PASSWORD, REDIS_URL, ...
    iam/         -> IAM_ADMIN_PASSWORD, IAM_CLIENT_SECRET, ...
    s3/          -> S3_ACCESS_KEY, S3_SECRET_KEY
    gateway/     -> GATEWAY_DASHBOARD_HTPASSWD
    runtime/     -> CREDENTIAL_MASTER_KEY, RENDERER_INTERNAL_TOKEN
    smtp/        -> KC_SMTP_USERNAME, KC_SMTP_PASSWORD
    telemetry/   -> TELEMETRY_ADMIN_USER, TELEMETRY_ADMIN_PASSWORD
  production/
    db/          -> (same structure, different values)
    redis/
    iam/
    s3/
    gateway/
    runtime/
    smtp/
    telemetry/
```

### Vault Agent Template (staging example)

```hcl
template {
  source      = "/etc/vault-agent/templates/athyper.env.tpl"
  destination = "/etc/athyper/stack/env/.env"
  perms       = "0600"
  command     = "docker compose --project-directory /etc/athyper/stack/compose restart"
}
```

Template file (`athyper.env.tpl`):
```
{{- with secret "secret/athyper/staging/db" }}
DB_ADMIN_PASSWORD={{ .Data.data.admin_password }}
DATABASE_URL={{ .Data.data.url }}
DATABASE_ADMIN_URL={{ .Data.data.admin_url }}
DBPOOL_APPS_PASSWORD={{ .Data.data.pool_apps_password }}
DBPOOL_AUTH_PASSWORD={{ .Data.data.pool_auth_password }}
{{- end }}
```

## Alternative: AWS Secrets Manager

### Integration Pattern

Use `aws secretsmanager get-secret-value` in a deployment script to populate `.env` before `docker compose up`.

### Secret Layout

```
athyper/staging/db       -> JSON: { "admin_password": "...", "url": "...", ... }
athyper/staging/redis    -> JSON: { "password": "...", "url": "...", ... }
athyper/staging/iam      -> JSON: { "admin_password": "...", "client_secret": "...", ... }
athyper/staging/s3       -> JSON: { "access_key": "...", "secret_key": "..." }
athyper/staging/runtime  -> JSON: { "credential_master_key": "...", "renderer_token": "..." }
athyper/staging/gateway  -> JSON: { "dashboard_htpasswd": "..." }
athyper/staging/telemetry -> JSON: { "admin_user": "...", "admin_password": "..." }
```

### Fetch Script (example)

```bash
#!/usr/bin/env bash
# stack/scripts/setup/fetch-secrets.sh
# Fetches secrets from AWS Secrets Manager and writes .env
set -euo pipefail

ENV="${1:?Usage: fetch-secrets.sh <staging|production>}"
PREFIX="athyper/$ENV"

fetch() { aws secretsmanager get-secret-value --secret-id "$1" --query SecretString --output text; }

DB=$(fetch "$PREFIX/db")
REDIS=$(fetch "$PREFIX/redis")
IAM=$(fetch "$PREFIX/iam")
S3=$(fetch "$PREFIX/s3")
RUNTIME=$(fetch "$PREFIX/runtime")
GW=$(fetch "$PREFIX/gateway")

# Write secrets into the .env file (append to template)
cat >> "$STACK_DIR/env/.env" <<EOF
DB_ADMIN_PASSWORD=$(echo "$DB" | jq -r .admin_password)
DATABASE_URL=$(echo "$DB" | jq -r .url)
DATABASE_ADMIN_URL=$(echo "$DB" | jq -r .admin_url)
DBPOOL_APPS_PASSWORD=$(echo "$DB" | jq -r .pool_apps_password)
DBPOOL_AUTH_PASSWORD=$(echo "$DB" | jq -r .pool_auth_password)
REDIS_URL=$(echo "$REDIS" | jq -r .url)
MEMORYCACHE_PASSWORD=$(echo "$REDIS" | jq -r .password)
REDIS_ADMIN_PASSWORD=$(echo "$REDIS" | jq -r .admin_password)
REDIS_EXPORTER_PASSWORD=$(echo "$REDIS" | jq -r .exporter_password)
IAM_ADMIN_PASSWORD=$(echo "$IAM" | jq -r .admin_password)
IAM_CLIENT_SECRET=$(echo "$IAM" | jq -r .client_secret)
IAM_DB_PASSWORD=$(echo "$IAM" | jq -r .db_password)
S3_ACCESS_KEY=$(echo "$S3" | jq -r .access_key)
S3_SECRET_KEY=$(echo "$S3" | jq -r .secret_key)
CREDENTIAL_MASTER_KEY=$(echo "$RUNTIME" | jq -r .credential_master_key)
RENDERER_INTERNAL_TOKEN=$(echo "$RUNTIME" | jq -r .renderer_token)
GATEWAY_DASHBOARD_HTPASSWD=$(echo "$GW" | jq -r .dashboard_htpasswd)
TELEMETRY_ADMIN_USER=$(echo "$(fetch "$PREFIX/telemetry")" | jq -r .admin_user)
TELEMETRY_ADMIN_PASSWORD=$(echo "$(fetch "$PREFIX/telemetry")" | jq -r .admin_password)
EOF

echo "Secrets injected into .env for $ENV"
```

## Cutover: GRAFANA_ADMIN_PASSWORD → TELEMETRY_ADMIN_PASSWORD

**Action required before the next staging/production deploy.**

`staging.env.example` and `production.env.example` previously aliased
`TELEMETRY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}`. The alias has been
removed — both files now expect the canonical name `TELEMETRY_ADMIN_PASSWORD`
to be injected directly. `validate-env.sh` / `validate-env.bat` now `require_var`
this name in non-local environments and will refuse `up.sh` if it's missing
or unresolved.

**Why the rename:** the indirection silently resolved to an empty Grafana
admin password whenever the secret manager was missing the legacy name —
locking ops out of the Loki/Tempo/Prometheus dashboards exactly when they
were needed (mid-incident).

**What you must do per environment** (staging, then production):

1. **Rename the secret** in the secret store, preserving the value.
   - **AWS Secrets Manager** — add the new key alongside the old in the
     `athyper/<env>/telemetry` secret JSON (create the secret if absent):
     ```bash
     aws secretsmanager put-secret-value \
       --secret-id "athyper/staging/telemetry" \
       --secret-string '{"admin_user":"...","admin_password":"<existing GRAFANA_ADMIN_PASSWORD value>"}'
     ```
     Then update the fetch script (already done in this doc's example) so
     the `.env` write uses `TELEMETRY_ADMIN_*`.
   - **HashiCorp Vault** — write the new path; old path can be deleted in
     the same rotation window:
     ```bash
     vault kv put secret/athyper/staging/telemetry \
       admin_user="..." admin_password="<existing GRAFANA_ADMIN_PASSWORD value>"
     ```
     Then update the Vault Agent template to render
     `TELEMETRY_ADMIN_USER` / `TELEMETRY_ADMIN_PASSWORD` (not `GRAFANA_*`).
   - **Infisical** — under the env's project, rename the secret key
     `GRAFANA_ADMIN_PASSWORD` → `TELEMETRY_ADMIN_PASSWORD`, and add
     `TELEMETRY_ADMIN_USER` if missing.
   - **GitHub Actions / CI repo secrets** — add a new repo secret
     `TELEMETRY_ADMIN_PASSWORD` with the same value as the old
     `GRAFANA_ADMIN_PASSWORD` secret. Update the workflow that writes
     `.env` to reference the new name. Delete the old secret after the
     first successful deploy.
2. **Run the validator** before the deploy: `./stack/scripts/setup/validate-env.sh`
   should print `OK` for the `Non-local secrets` block. If it prints
   `FAIL  TELEMETRY_ADMIN_PASSWORD = ${TELEMETRY_ADMIN_PASSWORD}`, the
   secret store rename hasn't propagated yet — do not proceed with `up.sh`.
3. **Verify post-deploy** by logging into Grafana at `https://${TELEMETRY_HOST}`
   with the new credentials. If login fails, the container is still holding
   the old admin password in `/var/lib/grafana/grafana.db` — restart with
   `GF_SECURITY_ADMIN_PASSWORD__FILE` not set so Grafana picks up the new
   value, or use `grafana-cli admin reset-admin-password` inside the container.

The old secret can be deleted from the secret store after the first
successful deploy on each environment confirms the new path works.

## Rotation Playbook

### Password Rotation Checklist

1. Generate new credential value
2. Update secret store (Vault / AWS SM)
3. Re-run secret fetch or Vault agent template render
4. Run `validate-env.sh` to verify consistency
5. Restart affected services: `docker compose restart <service>`
6. Verify health checks pass

### Bcrypt Hash Rotation (Traefik Dashboard)

```bash
# Generate new htpasswd (escape $ as $$ for Docker Compose)
htpasswd -nbB admin "$(openssl rand -base64 24)" | sed 's/\$/\$\$/g'
# Update GATEWAY_DASHBOARD_HTPASSWD in secret store and .env
```

### CREDENTIAL_MASTER_KEY Rotation

```bash
openssl rand -base64 48
# WARNING: rotating this key invalidates all encrypted credentials in the database.
# Run the re-encryption migration after updating the key.
```

## Validation

The `validate-env.sh` script (called automatically by `up.sh`) checks:
- All required secrets are set and not `${...}` placeholders
- `CREDENTIAL_MASTER_KEY` is >= 32 characters
- No `athyperadmin` dev passwords in staging/production
- Kernel config hostname parity with `.env`

Run standalone: `./stack/scripts/setup/validate-env.sh`
