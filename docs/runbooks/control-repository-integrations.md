# Bank, connector, lookup and rounding repositories

> Local-development baseline update: the 16 scripts listed in [SQL DDL consolidation](sql-ddl-consolidation.md) have been folded into `server/db/ddl/` and removed from the migration manifests. Use the canonical DDL for a fresh local database. Migration commands and migration-path test results below describe the earlier implementation and are historical, not current setup instructions.

The host now supplies concrete Kysely repositories for each configured plane through
`createKyselyControlRepositories`. A missing plane never falls back to another database.
Each transaction checks the physical database plane and installs verified tenant and
actor context. Existing route permissions and enablement flags remain authoritative.

## Persistence and runtime behavior

| Group | Mapping and guarantees |
| --- | --- |
| Bank validation | Uses `control.bank_account_validation_rule`, including native direction, identifier types and persisted test fixtures. Studio publication checks fixtures before writing, preserves identity, and requires the proposed next revision. Native applicability uniqueness is retained: one active rule per country/rail/direction/currency coordinate. |
| Connectors | Uses `connector_instance` and `integration_endpoint`. Draft writes preserve retained endpoint IDs and delivery settings; lifecycle updates affect both tables. Credentials remain references. A durable health-job table and leased worker perform GET probes through the existing HTTP transport and secret resolver. |
| Lookups | Uses native domains/values, separate global and tenant revision snapshots, and immutable desired-state receipts. Publications preserve tenant extensions. Native tenant-extension writes advance revision history. Retirement locks values and checks foreign-key references, cycle-domain references and the explicit reference ledger. |
| Rounding | Stores the full configured context list on the rule and publishes active dispatch rows to `rounding_context`. Retirement removes dispatch rows while retaining the configuration snapshot. The existing finance reader/resolver consumes these rows directly. Activated rule definitions remain immutable. |

Writes enforce aggregate versions and tenant ownership, and append audit evidence and
outbox events in the same database transaction. PostgreSQL overlap, uniqueness,
serialization and lock conflicts become HTTP 409; foreign or missing tenant records
return 404. Clients must reload and review conflicts rather than silently overwrite.

Repository reads are uncached. Durable outbox events expose downstream invalidation
coordinates; adding a cached consumer requires subscribing it or checking fresh revisions.
Document/JSON consumers must maintain `control.lookup_value_reference` transactionally;
arbitrary references hidden in JSON cannot be discovered automatically.

Bank native rules with unmodeled validation schemas, national-bank-code requirements or
nonstandard IBAN prefixes fail closed with `BANK_NATIVE_RULE_UNSUPPORTED`. This adapter
does not claim to interpret those additional native validation languages. Bank checks
do not verify account existence or ownership.

Verification filters active country/rail/currency/direction candidates in SQL before
mapping native checks. Unrelated or inactive unsupported rules do not block it.
Every applicable candidate remains fail-closed, without fallback on mapping errors.
Full catalog listing remains strict. This candidate-read fix is source-only pending
application deployment; it requires no schema migration.

## Deployment

1. Apply earlier migrations in the plane manifest, then
   `20260918_control_repository_integrations.sql`. Fresh installs include
   `common/control/14_admin_integrations.sql` before security-definer hardening.
   The migration backfills version 1, lookup history and rounding contexts without
   replacing existing actor/timestamp evidence.
2. Provision dedicated application writer connections inheriting `athyperapp` and
   `athyper_control_writer`. The migration creates the NOLOGIN writer role but does
   not grant it to general application logins. Supply these per-plane connections
   through `controlAdmin.writerDatabases`, or inject governed repository providers.
   Without explicit writer connections, the factory uses the existing plane database
   connections, which must have the required grants before enabling writes.
3. Deploy API, worker and scheduler code together. Default connector health checks
   require jobs in API/worker mode, scheduling in scheduler mode, and a secret store
   in worker mode. Startup checks the prerequisites for its own process mode. The scheduler polls each configured writer plane every
   15 seconds. Custom health-job bindings must supply their own executor.
4. Enable the intended route groups only after database health checks and authenticated
   acceptance. Studio alone publishes bank rules; Neon alone writes rounding rules.
   Keep the existing network policy configured for connector probes.

The initial implementation did not change live databases or flags. The subsequent
local-development deployment is recorded below.

## Verification

The opt-in PostgreSQL suite uses complete plane DDL and a role inheriting the real
application/writer roles, with transaction-local tenant settings:

```bash
ATHYPER_CONTROL_REPO_DB_TESTS=true \
ATHYPER_CONTROL_REPO_PLANE=neon \
ATHYPER_CONTROL_REPO_DATABASE_URL=postgres://.../athyper_neon \
pnpm --filter @athyper/server-platform-control-admin exec vitest run src/control-repositories.postgres.test.ts
```

Use a disposable database: the suite creates tenants, actors, catalog definitions and
temporary failure-injection triggers. Repeat for Studio and Mesh. Coverage includes
OCC, foreign-tenant reads, lifecycle transitions, durable health processing, historical
lookup reads, publication replay, reference/retirement coordination, bank fixtures,
finance rounding consumption, and rollback on outbox failure.

Deployment acceptance still needs authenticated HTTP/browser checks and a real permitted
connector probe through the deployed worker/scheduler. The test transport is mocked;
its success is not evidence of remote connectivity.

Implementation verification completed on 2026-09-07: 754 unit tests passed;
PostgreSQL suites passed 9 applicable cases on Neon, 9 on Studio and 8 on Mesh.
A populated Neon clone, with the new integration schema removed, successfully applied
the migration and passed another 9 cases. Migration checks retained version-1 rounding
context backfills and 231 initial lookup snapshots. Package and host typechecks passed.
These are disposable-database results, not live deployment evidence.


## Local deployment completed, 2026-09-07

Development now exposes **29 operations**, up from four: parameters (4), features (4),
entitlements (4), lookups (4), rounding (4), bank validation (3) and connectors (6).
Authorization administration (5), cycle configuration (6) and runtime commands (4)
remain disabled pending their separate writer qualification, API signature-verifier
and executor prerequisites.

The three development databases were backed up and restored into an isolated PostgreSQL
instance. Every migration manifest passed there, then the same runner applied pending
migrations 16–18 to development and retained checksum receipts. The local
`athyper_runtime` login was granted the NOLOGIN `athyper_control_writer` role; it remains
subject to RLS and is neither superuser nor BYPASSRLS. This local grant does not provision
production writers.

The immutable deployed runtime image is
`sha256:8eafdf40913f014c78085d0482f889a15b29b8a8cfbcfd650d1634d39aff48fe`.
The existing persistent local profile pins this image and preserves the five control
route flags across API, worker and scheduler recreation. QA was not changed.

Deployment fixed two health-job wiring issues: each process now checks its own runtime
prerequisites instead of requiring both jobs and scheduling, and scheduled executions use
the existing system-principal UUID required by the job ledger.

Verification: API, worker, scheduler and Neon web healthy; readiness HTTP 200;
OpenAPI contains exactly 29 control-admin operations; seven catalog reads return 401
without authentication; connector-health polling succeeds on all three planes.
Deployed runtime-role reads return 14 bank rules on each plane and 225/48/21 lookup
domains on Neon/Studio/Mesh. No remote probe or authenticated mutation was performed.
An unrelated workflow SLA job logged a work-item actor foreign-key failure during
startup; it is outside this route rollout and is not counted as a passing workflow test.

Repeat the read-only checks with:

```bash
node tooling/scripts/verification/verify-local-control-admin.mjs
```

Evidence:
`~/.athyper/instances/dev/receipts/local-control-admin.json` and
`~/.athyper/instances/dev/deployments/control-admin-local-20260907/`.
The deployment folder includes database dumps, original image/profile configuration,
migration logs and the exact migration bundle. Profile/image rollback is available
without reversing the additive migrations. Authenticated browser and mutation acceptance
remain outstanding.
