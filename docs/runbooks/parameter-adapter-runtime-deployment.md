# Parameter adapter and first runtime consumer

> Local-development baseline update: the 16 scripts listed in [SQL DDL consolidation](sql-ddl-consolidation.md) have been folded into `server/db/ddl/` and removed from the migration manifests. Use the canonical DDL for a fresh local database. Migration commands and migration-path test results below describe the earlier implementation and are historical, not current setup instructions.

The host now supplies `KyselyParameterRepository` for each configured exact-plane database. `WAVE0_CONTROL_ADMIN_PARAMETERS_ENABLED=true` enables the four parameter routes and the experience density consumer independently of unrelated control-administration providers. The flag defaults to false. Local development has now been migrated and enabled; see the deployment record below. QA and staging were not changed.

## Write and read guarantees

Writes use a serializable transaction, verified tenant/actor context, and tenant-owned row locks. Updates include tenant ID, row ID, expected version and active status in the final predicate. Missing or foreign IDs return 404; stale versions, serialization failures, deadlocks and conflicting creates return 409. Exclusion violations return 409 `PARAMETER_OVERLAP`. No conflict path silently retries with a newer version. Expired rows cannot be reactivated, and adjacent `[from, until)` periods remain valid.

The definition is locked through `control.lock_parameter_definition(uuid)`, a narrowly scoped SECURITY DEFINER function with a fixed search path. It grants no catalog update privilege and excludes sensitive definitions. All administration reads also exclude sensitive definitions. Units are catalog metadata: the adapter does not convert values or change their declared type.

Override changes, metadata-only audit evidence and durable outbox events commit together. Values are omitted from audit/outbox payloads. Actor-validation, audit or outbox failure rolls back the override change. Database triggers own row versions and definition revisions.

After a 409, clients must refetch `GET /api/control-admin/parameters/{code}/effective` and present the current value for review. This response includes `overrideId` when an override is selected, `overrideVersion` (zero for the default) and an opaque `configurationRevision`. It describes the currently effective row; it does not supply an editor/history endpoint for a future scheduled row. Do not automatically resubmit a user's edit with the refreshed version.

## Runtime behavior

The real experience bootstrap service consumes `experience.profile.default_density`, seeded as a non-sensitive enum with values `comfortable` and `compact`, default `comfortable`, and reload mode `next_request`. The tenant default supplies density when the principal has no explicit density preference; an explicit preference wins.

Each bootstrap reads the definition and effective override in one fresh database snapshot before consulting its bootstrap cache. The opaque revision token contributes to the cache key without being parsed. Independent host caches therefore observe definition-only changes, successful override writes, expiration and scheduled start/end boundaries at the next request. The consumer does not rely on a cached token or delivery of an outbox notification. Cache TTL is an upper bound, not permission to bypass this freshness read.

This binding supports `next_request` only. Changing its mode to `immediate`, `next_login`, `restart` or `external_provider` fails closed with 503 instead of hot-applying a setting with different lifecycle semantics. This release does not implement notification delivery, login-pinned configuration, startup-pinned configuration or provider acknowledgement for other consumers. Keep those consumers disabled until their respective mechanisms and acceptance tests exist.

## Coordinated deployment

1. Select the deployment instance and immutable application artifact. Rehearse against a staging copy of that instance, retaining migration output and backup/restore evidence. The disposable PostgreSQL tests below are not a staging-data rehearsal.
2. Run `server/db/scripts/tests/integration/parameter-validation-preflight.sql` against every database in the selected instance using the deployment migration role and `ON_ERROR_STOP=1`. Follow [validation preflight](parameter-sql-validation-alignment.md). Resolve reported incompatible definitions and overrides explicitly, then repeat. Do not silently convert data.
3. Use the instance migration runner and each plane's manifest, retaining its ledger/receipts. Apply `20260912_parameter_validation_alignment.sql`, then `20260913_parameter_versions.sql`, then `20260914_parameter_runtime.sql` and `20260915_parameter_runtime_validation_grants.sql`, along with any earlier pending manifest dependencies. Do not enable the application flag before schema success on every served plane.
4. Migration 14 installs the audit contract, safe definition-lock helper and experience definition. It preserves an existing definition with that code and rejects an incompatible consumer contract rather than overwriting it. Fresh-install manifests include the corresponding DDL and seed.
5. Deploy the application artifact with `WAVE0_CONTROL_ADMIN_PARAMETERS_ENABLED=true`. Verify each configured plane's parameter repository health and existing authenticated experience bootstrap. Reads require `control.catalog.read`; writes require `control.tenant_override.manage`. The internal density consumer does not grant administration access.
6. Run the acceptance sequence below through two separate hosts. Retain results before expanding rollout. On application rollback, disable the flag and retain the additive schema and audit evidence; do not erase rows to undo the deployment.

## Acceptance and evidence

On a test tenant without an explicit density preference, create an effective override and obtain its version. Submit two different updates with that same version through authenticated API clients. Exactly one must succeed; the other must return 409. Refetch the current value/version and verify both hosts' next bootstrap reports the winner. Expire it and verify the definition default returns. Repeat with a definition-only default change and scheduled start/end boundaries without intervening writes. Verify an explicit user preference still wins.

Also exercise missing/foreign IDs, wrong actors, stale expiration, expired-row reactivation, overlap/adjacency, and injected audit/outbox failures. Confirm failed transactions leave neither a partial override nor partial evidence.

Implementation verification:

- Candidate image `athyper/runtime-server:parameter-runtime-20260907` built successfully; its filesystem contains all three parameter migrations and the forward-migration runner. Image manifest: `sha256:d574a062fe9937679e5353b221b8f0b48a17389875e338a2035695e28d8e2bba`. This local candidate includes the current workspace's other pending changes and has not been deployed.
- PostgreSQL 16: 37 cases passed for each fresh-install and migrated path on Studio, Neon and Mesh (222 executions, including 42 parameter cases and existing entitlement/feature regression coverage).
- Parameter cases call actual HTTP parameter routes and the actual experience bootstrap service against PostgreSQL. Two separate in-memory bootstrap caches simulate separate consumers. Authentication context and unrelated experience repositories are test fixtures; this is not a deployed two-host/browser test.
- Coverage includes competing writers, effective response versions, scheduled boundaries, definition-only changes, terminal expiration, tenant isolation, sensitive-definition exclusion and audit/outbox rollback.
- Control-admin unit suite: 649 passed. Experience: 51 passed. Host configuration: 34 passed. Control-admin source/test and host TypeScript checks passed.

The shared PostgreSQL suite retains its original entitlement environment-variable names. Use a separate empty disposable database for every run, never a deployment database:

```sh
ATHYPER_ENTITLEMENT_DB_TESTS=true \
ATHYPER_ENTITLEMENT_TEST_DATABASE_URL="$DISPOSABLE_PARAMETER_DATABASE_URL" \
ATHYPER_ENTITLEMENT_TEST_PLANE=neon \
ATHYPER_ENTITLEMENT_TEST_MIGRATION=true \
pnpm --filter @athyper/server-platform-control-admin exec vitest run src/kysely-entitlement-repository.postgres.test.ts
```

Repeat for `studio` and `mesh`; omit the migration variable for fresh-install coverage. Local-development deployment is recorded below. Staging rehearsal and authenticated two-host acceptance remain required before broader rollout.


## Local-development deployment record

Deployment was authorized for local development. Backup `20260906T193935Z` was restored into isolated PostgreSQL, where all three plane manifests passed. The live parameter validation preflight reported no incompatible rows on Studio, Neon or Mesh. The forward runner then applied the manifests, including parameter migrations 12–15, and retained checksums in each database's migration ledger.

Live runtime-role acceptance exposed a pre-existing restricted EXECUTE ACL on `control.parameter_value_matches_definition`. Migration 15 grants only the pure validator and recursive JSON helper to `athyperapp` and `athyperadmin`, with PUBLIC execution revoked. Fresh-install grants match. The PostgreSQL suite now explicitly recreates restricted ACLs before the grant migration; all 222 executions passed again.

The parameter candidate image is `athyper/runtime-server@sha256:f320c4233d664843e673537bf7c4ebe865fc889715ef0996f7349eabc22b6c87`. A concurrent local-verification deployment subsequently installed `athyper/runtime-server:local-verification-20260907-r2` (digest `sha256:1c9cbbf94283ad4ffe368f1fb304333e21eeedcc1ebc7ce328e89c2250046a03`), retaining the parameter override and flag. Acceptance ran against that combined image. API, worker and scheduler were healthy, `/readyz` returned 200 with all three parameter repositories healthy, and the unauthenticated parameter route returned 401.

Using the deployed runtime database role and actual experience PostgreSQL repository/bootstrap, a temporary local demo-tenant override changed density to compact; one competing write succeeded and the other returned 409. The next cached bootstrap reflected the winning value. Expiration restored the default. The override had a 60-second safety limit and was explicitly expired; audit/outbox evidence remains. These were internal service calls, not authenticated HTTP requests. Browser login and authenticated two-host acceptance remain unverified.

Evidence and the exact preserved Compose chain are in `/home/chandravel_natarajan/.athyper/instances/dev/deployments/parameter-runtime-20260907/deployment-receipt.json` and adjacent logs. Use the observed combined Compose chain when operating this instance; do not replace its other deployment overrides with the older standalone parameter candidate chain.
