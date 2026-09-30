# Entitlement administration API review — 2026-09-07

> Local-development baseline update: the 16 scripts listed in [SQL DDL consolidation](sql-ddl-consolidation.md) have been folded into `server/db/ddl/` and removed from the migration manifests. Use the canonical DDL for a fresh local database. Migration commands and migration-path test results below describe the earlier implementation and are historical, not current setup instructions.

Scope: plans/modules catalog reads, tenant override saving, and override expiration under `/api/control-admin/entitlements`.

## Fixed behavior

- Plan and module list routes now declare array response bodies. Dedicated override response schemas are enforced in HTTP tests.
- Overrides must target exactly one module or limit. Limit overrides require a nonnegative safe integer from 0 through 9,007,199,254,740,991; module overrides cannot carry a limit value.
- The requested plan must exist and be effective at the override start. Module targets must exist in the module catalog; a module exception may grant a catalog module outside the base plan. Limit targets must be own keys of the plan's limits map, excluding inherited object properties.
- Reasons must be nonblank and are trimmed before persistence. Effective dates must parse and an optional end must be later than the start. Malformed optional values and unknown fields are rejected.
- Save and expire require expected versions at HTTP and service boundaries. Zero creates a new override; updates and expiration require the current positive version. Missing/foreign rows and stale writes are rejected before mutation.
- HTTP clients cannot supply tenant identity, persisted status/version, or a second override id. The route id and verified context determine persistence coordinates. Repositories returning rows from another tenant or id are rejected.
- Expired overrides cannot be reactivated through save. Repeating expiration with the current expired version is a no-op; an obsolete version still conflicts.
- Successful updates invalidate old and new plan cache keys when retargeted; expiration invalidates the affected plan. Failed persistence does not invalidate cache.
- Known validation, permission, missing-resource, version/lifecycle, and unavailable-repository failures produce 400/403/404/409/503 responses. Known commit-time version/lifecycle conflicts retain 409. Unknown persistence errors remain generic 500 responses.

## Request examples

Create a limit exception with `PUT /entitlements/overrides/{id}`:

```json
{
  "expectedVersion": 0,
  "override": {
    "planCode": "base",
    "limitCode": "users",
    "limitValue": 20,
    "reason": "Temporary capacity",
    "effectiveFrom": "2026-09-01T00:00:00Z",
    "effectiveUntil": "2026-10-01T00:00:00Z"
  }
}
```

For a module exception, replace `limitCode` and `limitValue` with `moduleCode`. Expiration POST bodies contain `expectedVersion` with the current positive version. Identifiers/codes are bounded at 128 characters, reasons at 2,000, and timestamp strings at 64. Request envelopes reject unknown fields.

## Database adapter and registration

`KyselyEntitlementRepository` is registered from the host's exact Studio, Neon, and Mesh database handles. An explicitly injected entitlement repository still takes precedence. Missing planes never fall back to another database. Health checks verify the database plane, required schema, outbox access, and entitlement audit contract. Other control-admin dependencies, cache invalidation, guarantees, and route flags remain required by the host.

- Plans come from `control.subscription_plan`, active included module assignments, and active `dimension_code = '*'` usage limits. Optional add-ons are not represented as included modules. `NULL` plan limits remain unlimited. `listModules` returns active catalog codes, including modules outside a plan.
- Plan `entitlement_version` and `entitlement_effective_from` identify the catalog revision. `snapshot.subscription_plan_entitlement` captures the composition, including dimension-specific limits, on every plan/assignment/module/metric/limit change. Snapshots are immutable; their effective ends are derived from the next revision. `getPlan(code, at)` and transactional override validation read the actual effective snapshot. The migration captures the known current revision; it does not fabricate revisions from before recorded history. Global commercial snapshots have their own table in the snapshot schema because the generic entity-snapshot contract requires a tenant owner that global plans do not have.
- Usage exceptions resolve `limitCode` through `control.usage_metric_catalog` and persist a plan-associated, tenant-scoped row in `control.tenant_usage_limit_override`. The API exposes fallback (`*`) limits; dimension-specific administration remains outside this contract.
- Module exceptions persist in `control.tenant_module_entitlement_override`, granting the catalog module for that tenant and period without modifying shared plan assignments.
- Save and expire execute in serializable database transactions with local tenant/principal context, advisory ID locks, version predicates, lifecycle validation, and tenant-scoped SQL. Database triggers advance override versions for other writers too. Serialization/deadlock conflicts return 409; clients must reread and retry deliberately.
- Active periods cannot overlap for the same tenant and metric/dimension or tenant and module, across plans. Adjacent half-open periods are allowed. Database exclusion violations return `CONTROL_ADMIN_ENTITLEMENT_OVERLAP` (409).
- Target kind and target code are immutable, matching existing usage-table guards. Expire and create a new UUID to change the target. Plan association, reason, value, and effective window may be updated with the current version. PostgreSQL identifiers for overrides, tenants, and actors must be UUIDs.
- Expiration marks the row `deprecated` (API `expired`), increments its version, and records the actor. Effective exceptions end at the earlier of now or their existing end; future exceptions retain their original window but become inactive immediately. Retrying at the current expired version creates no additional evidence.
- Both the before/after audit event through `audit.append_event` and the `control.entitlements` outbox event are appended inside the override transaction. The event includes actor, plane, audit-event ID, before/after values, and old/new plan cache-invalidation keys. Audit or outbox failure rolls back creation, updates, and expiration. The service continues to invalidate the cache after commit; the outbox provides durable change evidence.

## Migration and compatibility

`server/db/migrations/20260907_entitlement_repository.sql` is included in all three plane manifests. The fresh-install DDL has matching changes. Apply the migration through the existing migration runner before enabling these routes; it has not been applied to live databases by this change.

The baseline and adapter migration retain `bigint` and allow `limit_value >= 0`. Metrics currently measure `count` or `bytes`: zero means **no capacity permitted**; plan `NULL` alone means unlimited. HTTP requests and direct adapter writes reject fractions, negative values, nonfinite values, and numbers above `Number.MAX_SAFE_INTEGER`. Response schemas enforce the same integer bound. Database values outside the JSON safe-integer range produce an explicit error instead of a rounded response; plan limits are read as text before checked conversion. A string representation or fractional metric model would require a separate contract change.

`20260908_entitlement_integer_limits.sql`, also in all three manifests, corrects installations that applied the earlier numeric schema. It locks both limit tables and refuses fractional, negative, nonfinite, or out-of-bigint-range values before conversion. Operators must resolve such values explicitly and rerun the migration. Valid integers, zero, and unlimited plan NULLs are preserved; the migration never silently rounds a quota.

Legacy usage exceptions have no known original plan association. Their new `subscription_plan_id` remains `NULL`; they remain effective under existing usage evaluation and overlap constraints, but the API will not read or mutate them until a governed migration supplies their actual association. No shared-plan or tenant-subscription association is guessed. These legacy rows remain runtime metric exceptions for the assigned plan when that plan defines the metric. Subscription assignment is still managed separately.

## Runtime integration and cache coherence

`20260909_entitlement_runtime_snapshots.sql` installs immutable plan snapshots and the shared `control.effective_tenant_entitlement` resolver, with matching fresh-install DDL and all three plane manifests. Apply the migration before deploying this runtime code. It selects the tenant's actual assigned plan, the effective plan snapshot, and active exceptions whose half-open periods contain the evaluation time. API-managed exceptions apply only to their stored plan; exceptions never reassign the tenant or edit a shared plan.

- Limit precedence is tenant exact dimension, tenant fallback, plan exact dimension, then plan fallback. The administration API still targets fallback (`*`) limits; the runtime resolver preserves and supports existing dimension-specific data.
- Module exceptions add active catalog modules to the tenant's effective module set. `createKyselyPermissionResolver` uses this set when building entitlement requirements, while all IAM grant, deny, scope, MFA, and policy checks remain independent. The PostgreSQL experience adapter uses the same module set for workspace/module associations.
- `container.platform.entitlements` exposes `resolve(context, at?, dimensionCode?)` and `evaluate(context, request, at?, dimensionCode?)`. The exact-plane runtime performs a fresh database read for each decision, enforces safe-integer quotas and usage, and supports plan `NULL` as unlimited. Zero rejects capacity. This evaluates availability; it does not reserve usage or implement atomic metering.
- The resolver returns a revision derived from the selected plan, module set, limits, and active override versions. Experience bootstrap reads that revision before cache lookup. A remote host's commit, a scheduled start/end, or a subscription change therefore changes the cache key without relying on an event worker or TTL.
- Successful local administration changes also invoke the experience plan-invalidation hook after commit, then the injected entitlement cache invalidator. Before/after audit and durable outbox evidence remain in the write transaction. No database or cache result is acknowledged as successful after failed persistence.
- Historical plan queries are supported within captured history. Runtime resolution uses the tenant's current subscription assignment and current override lifecycle, so it is not a reconstruction of historical tenant-subscription or override state after later mutations.

## Validation

- Control-admin package: 431 service/HTTP/unit tests passed. The 20 opt-in PostgreSQL cases passed in each of six runs: Studio, Neon, and Mesh, each with fresh baseline DDL and the prior schema plus migration (120 database cases).
- Database tests run as the non-owner application role and use production table definitions, exclusion constraints, identity/version triggers, tenant RLS, and audit preparation/append functions. They cover OCC races, overlapping/adjacent periods, actor membership, tenant isolation, zero, safe-integer boundaries, rejected fractions/unsafe numbers, corrective migration rollback, immutable targets, catalog versions, live/future expiration, and rollback on audit/outbox failure during create/update/expire, including unchanged runtime decisions after rollback. Runtime cases exercise quota changes, module availability through real IAM and experience queries, tenant/plan isolation, dimensional precedence, scheduled boundaries, historical validation, and snapshot immutability.
- The migration tests verify that an existing legacy integer exception retains its value and unknown plan association.
- Control-admin, host, IAM, experience, experience-postgres, and runtime entitlements TypeScript checks passed. Experience tests: 46 passed, including cache refresh without local invalidation. IAM tests: 156 passed. Runtime entitlement tests: 2 passed. The prior control-admin contract suite remains unchanged.

To run the database suite, provision an empty disposable PostgreSQL 16 database and set `ATHYPER_ENTITLEMENT_DB_TESTS=true`, `ATHYPER_ENTITLEMENT_TEST_DATABASE_URL`, `ATHYPER_ENTITLEMENT_TEST_PLANE` (`studio`, `neon`, or `mesh`), and optionally `ATHYPER_ENTITLEMENT_TEST_MIGRATION=true`. Then run:

```sh
pnpm --filter @athyper/server-platform-control-admin exec vitest run src/kysely-entitlement-repository.postgres.test.ts
```

Each invocation needs a separate empty database. Without explicit opt-in, these database tests are skipped.
