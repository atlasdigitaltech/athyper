# Analytics Profile — Metabase (DEFERRED, hedge stage)

This profile is **pre-staged but not deployed**. The compose file exists so
that *if* demand surfaces and *if* the org-level decisions below are
resolved, enabling Metabase is a flip of a profile rather than a fresh
infra ticket.

It is intentionally:

- **OFF by default** — `analytics` is not in any environment's
  `STACK_PROFILE` set (core / render / monitoring / admin / search).
- **Disconnected** — no data source is wired. Admins point Metabase at
  the read replica via the in-app UI on first launch.
- **H2 app DB** — embedded file store, fine for the dormant hedge but
  unsuitable for production. See "Upgrading from H2" below.

## What this solves

- Self-service SQL for finance/ops power users (CFO drill-downs,
  reconciliation ad-hocs, close-troubleshooting).
- Complements the in-app `insights-analytics` module, which targets
  fixed dashboards rather than free-form exploration.

## What this does NOT solve

| Need | Use this instead |
|---|---|
| The BI / fixed-dashboard layer | `insights-analytics` (in-app) |
| Analyst-grade exploration | Superset (stronger, more ops cost) |
| Developer DB debugging | `pgweb` (admin profile, dev-only) |

## Before you enable this profile

The hedge ships with hard guardrails because the following are real
blockers, not nice-to-haves:

### 1. Read replica — non-negotiable

Metabase **must not** point at the primary database. Postgres uses MVCC,
so a `SELECT` does not acquire row-level locks that block writers — the
real risk is **resource contention**: long analytical scans across
partitioned tables (notably `log.audit_log`, which is partitioned
monthly and grows fast) saturate CPU, churn the shared-buffer cache and
evict hot OLTP pages, compete for I/O bandwidth, and hold MVCC
snapshots long enough to delay `VACUUM` and bloat tables.

There is one athyper-specific case where reads genuinely compete with
writes: `event.outbox` uses `FOR UPDATE SKIP LOCKED` for claim-cycle
processing. A naive Metabase query like
`SELECT * FROM event.outbox WHERE status = 'pending'` would acquire
`AccessShareLock` on the table (harmless against individual row locks)
but would contend with the outbox worker for planner/IO, degrading
claim-cycle latency. The replica solves this regardless of mechanism.

Required setup before enabling:

- A streaming-replicated, read-only Postgres replica reachable from the
  `internal` network as `db-replica` (or wired via
  `MB_METABASE_DATA_SOURCE_URL` documented at admin onboarding time).
- Statement timeout enforced on the replica role used by Metabase
  (recommendation: `SET statement_timeout = '5min'` in the replica
  role's default settings).
- Metabase's data-source role granted `CONNECT` on the replica only —
  no write grants anywhere.

### 1a. Least-privilege DB role — curated views, not raw tables

Even on a read replica, Metabase's DB role **must not** be given blanket
`SELECT` across all schemas. The athyper schema carries auth + security
surfaces that are out-of-bounds for an ad-hoc analytical user:

- `master.principal_identity_binding` — auth-provider subjects
- `control.mfa_config` — MFA method metadata
- `log.security_event_log` — IP addresses, device fingerprints, risk
  scores
- `event.webhook_subscription.signing_secret` — encrypted at rest, but
  still present as ciphertext
- `event.endpoint.config.auth` and `control.notification_provider` —
  tenant-scoped credentials

Required posture:

1. Provision a dedicated `analytics` schema on the replica. Populate it
   with views curated for finance/ops — for example, re-expose existing
   `master/07_views.sql` views (`v_contact_summary`, etc., which are
   already defined with `security_invoker = true, security_barrier = true`)
   and the `log.kpi_execution_log` "latest-value" surface via an
   `is_current`-filtered view.
2. Grant Metabase's DB role `USAGE` on the `analytics` schema and
   `SELECT` on only those views. **No grants** on `master.*`, `control.*`,
   `log.*`, `event.*`, or any schema holding raw rows.
3. Review the curated-view list alongside field-security registry entries
   — masks enforced server-side in the app are NOT enforced at the
   replica unless they are materialized into the views themselves.

This posture makes field-security + compliance a replica-side concern
instead of relying on Metabase UI-layer hiding, which is bypassed by any
SQL-native user.

### 2. Governance sign-off — also non-negotiable

Document and decide, *in writing*:

- **Account provisioning** — Who can create Metabase accounts? Tied
  to existing IAM groups? SSO via Keycloak (Metabase supports SAML/OIDC
  on the Pro/Enterprise tiers; the OSS image used here is
  username/password only — that may itself be a blocker).
- **Schema exposure** — Which DB schemas are visible? PII schemas
  (e.g. `master.user`, anything tagged in the field-security registry)
  must be excluded at the data-source level, not just hidden in the UI.
- **PII handling** — Field-security masks enforced server-side in the
  app are NOT enforced at the replica. Either strip PII columns at
  replica time, use Postgres column-level grants, or accept that
  Metabase users see unmasked data.
- **SOX / audit posture** — Query history, data-source credentials,
  and dashboard exports are all auditable surfaces. Confirm with the
  audit team whether Metabase activity must be replicated into
  `log.audit_event` (it will not be by default).

`stack/scripts/setup/validate-env.sh` enforces this gate: in
staging/production, the stack will refuse to start with the `analytics`
profile unless `METABASE_GOVERNANCE_APPROVED=approved` is set in the
environment file. This is a deliberate friction — flipping that flag
is the contract that says "the four bullets above have been answered."

### 3. Demand — confirm before enabling

If no finance/ops user has actually asked for Metabase, this is
infrastructure without a user, which is toil. The hedge exists *so
that* enablement is cheap when demand surfaces, not as a prompt to
enable speculatively.

## Upgrading from H2

H2 is fine for the dormant hedge and local exploration. Before any
non-local deploy:

1. Provision a Postgres database for Metabase's app data (separate from
   `athyper_dev1` — Metabase rewrites schema aggressively across version
   upgrades). Suggested name: `athyper_metabase`.
2. Run a one-time migration from H2 → Postgres using Metabase's built-in
   `load-from-h2` command:
   ```
   docker compose --profile analytics run --rm \
     -e MB_DB_TYPE=postgres \
     -e MB_DB_CONNECTION_URI=jdbc:postgresql://db:5432/athyper_metabase?user=...&password=... \
     metabase load-from-h2 /metabase-data/metabase.db
   ```
3. Set `MB_DB_TYPE=postgres` and `MB_DB_CONNECTION_URI=…` in the
   environment file, restart the service.
4. Back up the H2 file under `${ATHYPER_DATA}/metabase` before deleting.

## Enabling the profile (after the gates above are cleared)

```
# Local exploration:
./stack/scripts/stack/up.sh analytics

# Combined with core (e.g. once governance approves and demand exists):
STACK_PROFILE=core,analytics ./stack/scripts/stack/up.sh
```

Metabase boots in ~60–90 s on first launch (schema migrations on the H2
file). The in-app setup wizard is reachable at the host configured in
`METABASE_HOST`.

## Environment variables

See `stack/env/.env.example` (search `# --- Analytics profile ---`):

- `METABASE_HOST` — Traefik hostname
- `METABASE_MEMORY_LIMIT` — JVM container limit (default `1g`)
- `MB_JAVA_OPTS` — JVM heap/GC tuning (default `-Xmx768m -XX:+UseG1GC`)
- `MB_DB_TYPE` — `h2` (hedge stage) or `postgres` (production)
- `MB_DB_CONNECTION_URI` — JDBC URI when `MB_DB_TYPE=postgres`
- `METABASE_GOVERNANCE_APPROVED` — `approved` to clear the
  validate-env.sh gate in staging/production. Default `false`.
