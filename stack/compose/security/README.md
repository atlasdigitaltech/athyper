# Security Profiles

Two independent services live under `stack/compose/security/`, each with
its own profile. They are separated intentionally — activation is opt-in
per service.

## `security` — ClamAV (core-path)

File: `athyper-clamav.yml`

- Profile: `security` (runs with `core`)
- Purpose: on-access virus scan for every uploaded file before it reaches
  object storage. `CLAMD_ON_UNAVAILABLE=fail-closed` in non-local
  environments — if ClamAV is unreachable, uploads return 503 rather
  than bypassing scanning. See F2 in the April 2026 infra review.

## `security-infisical` — Infisical platform secret manager (Track B3.1)

File: `athyper-infisical.yml`

- Profile: `security-infisical` (opt-in, NOT included in `core`)
- Purpose: self-hosted secret manager that will eventually hold
  `CREDENTIAL_MASTER_KEY`, DB URLs, Redis URL, IAM client secret,
  Meilisearch master, S3 keys, Gotenberg timeouts — everything that
  lives as `${VAR}` placeholders in `staging.env.example` and
  `production.env.example` today.

### B3.1 is infra only

Infisical is standing up behind Traefik but **no application code reads
from it yet**. `config.ts` continues to read from `.env`. Storing
secrets in Infisical today is advisory / human-reference only.

The app-integration work is split across three further slices, none of
which are started:

| Slice | Scope |
|-------|-------|
| B3.2 | `config.ts` fetches platform secrets from Infisical before Zod parse; path convention `athyper/platform/*` |
| B3.3 | Migrate tenant-scoped secrets (webhook signing, endpoint auth, notification providers) behind `CredentialEncryptionService`; path convention `athyper/tenant/{id}/*`. Dual-read fallback during cutover. |
| B3.4 | Rotation runbook + `CREDENTIAL_MASTER_KEY` rotation utility + re-encryption sweep |

### Why separated from ClamAV

ClamAV's profile (`security`) is core-path — disabling it is a security
regression. Infisical's profile (`security-infisical`) is opt-in —
until B3.2 lands, the service has no runtime consumer, so shipping it
on the core path would waste capacity in every environment.

### Activation

```bash
# Local dev — bring up Infisical alongside the usual core stack
bash stack/scripts/stack-profile/up.sh security-infisical

# Prefer the wrapper so env files, compose files, and overrides are resolved consistently.
```

First-boot signup happens via the Infisical UI at
`https://${INFISICAL_HOST}`. No secrets are seeded by IaC in B3.1.

### State, backup, rotation

- State lives in the `infisical` Postgres database (seeded by
  `stack/config/db/local/init-databases.sh`) + Redis DB index 2 on the
  existing `memorycache`. No container volume.
- Backups flow through the same pg_dump runbook as `glitchtip` and
  `healthchecks` — add `infisical` to the database list.
- Rotation of `INFISICAL_ENCRYPTION_KEY` / `INFISICAL_AUTH_SECRET` is
  covered by Infisical's own operational docs — see
  `stack/docs/secrets-management.md` Track B3 section for the athyper
  bootstrap-secret inventory.

### B3.2 gating questions

B3.2 should not start until the following are answered:

1. Where do production secrets live today? (CI env vars / K8s secrets / .env on disk?)
2. Who manages them? (DevOps / developers / security team?)
3. Current rotation practice? (none / ad-hoc / scheduled?)
4. How does CI/CD inject secrets at deploy? (this is the real integration surface)
5. Do developers need Infisical running locally? (Recommendation: no — keep `.env` with `athyperadmin-*` defaults. Infisical is staging/prod only.)
