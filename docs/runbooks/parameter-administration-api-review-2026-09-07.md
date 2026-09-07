# Parameter administration API review

> Local-development baseline update: the 16 scripts listed in [SQL DDL consolidation](sql-ddl-consolidation.md) have been folded into `server/db/ddl/` and removed from the migration manifests. Use the canonical DDL for a fresh local database. Migration commands and migration-path test results below describe the earlier implementation and are historical, not current setup instructions.

The four parameter routes now have strict request and response contracts and a dedicated typed-setting service. The host now supplies a concrete `KyselyParameterRepository` by default, while retaining repository injection.

## Implemented behavior

- `GET /parameters` returns a definition array with explicit value type, default, override permission, reload mode, cache TTL and status fields.
- `GET /parameters/{code}/effective` authorizes catalog reads, captures one evaluation instant, and passes that instant to the repository. It selects only an active override in the half-open interval `[effectiveFrom, effectiveUntil)` belonging to the exact tenant and definition. Inactive or malformed windows fall back to the default. Retired/missing definitions return 404.
- Explicit `null`, `false`, `0` and empty-string overrides retain their values; JSON null no longer falls back to the default. When the definition disallows tenant overrides, stored tenant values are not selected.
- Effective responses include the resolved value, source, reload mode and cache TTL. Invalid stored values or definition configuration return 503 rather than supplying an invalid setting.
- `PUT /parameters/{code}/value` requires `value`, `effectiveFrom` and a numeric safe-integer `expectedVersion`. Zero creates; a positive version also requires the existing value ID. The definition must be active and tenant-overridable. Tenant and actor come from verified context. Optional reasons must be nonblank, at most 2,000 characters, and are trimmed. Invalid optional fields are rejected rather than silently removed.
- `POST /parameters/values/{id}/expire` requires a positive safe-integer expected version and passes verified tenant/actor context to the repository.
- Successful writes invalidate parameter caches after the repository returns. Save invalidation targets the tenant and parameter code; expiration invalidates the tenant parameter namespace. Repository failures do not invalidate caches.

Read permission is `control.catalog.read`; writes require `control.tenant_override.manage`. The routes declare typed successful responses and 400/401/403/404/409/503 outcomes. No route flags were enabled. Repository availability remains exact-plane with no fallback.

## Value validation

| Type | Accepted values |
| --- | --- |
| boolean | Actual JSON booleans; strings are not coerced. |
| string | JSON strings, including empty strings unless restricted by allowed values. |
| integer | JavaScript safe integers, including zero and negative values when within configured bounds. |
| number | Finite numbers, including fractions, subject to configured bounds. |
| enum | String, number or boolean values explicitly present in a nonempty allowed-values list. |
| duration | Existing nonnegative ISO-style day/hour/minute/second subset, such as `P2DT3H4M5.5S` or `PT0S`. Calendar months/years and free-form durations are not supported. |
| json | JSON-compatible null, primitives, arrays and objects. Nonfinite numbers, undefined, functions, cycles, sparse arrays, special object types and nesting beyond 64 levels are rejected. |

Numeric minimum and maximum values are inclusive, finite, correctly ordered, and applicable only to numeric types. Allowed values use structural JSON comparison, ignoring object-key order while preserving array order and scalar types. No implicit string-to-number or string-to-boolean conversion occurs.

## Persistence and runtime limitations

`ParameterRepository.getValue` now accepts the captured evaluation instant. Implementations must select the active row effective at that instant, not simply the newest row: a future scheduled value must not hide an older currently effective value.

The concrete adapter implements tenant ownership, optimistic concurrency, overlap protection, terminal expiration, and transactional audit/outbox writes. Sensitive definitions are deliberately excluded from this administration surface. Units remain catalog metadata and do not cause implicit value conversion. See [adapter and runtime deployment](parameter-adapter-runtime-deployment.md) for PostgreSQL acceptance evidence and the supported consumer.

Returning `reloadMode` and `cacheTtlSeconds` is configuration metadata; these routes do not themselves restart processes, refresh external providers, or prove every runtime consumer honors each reload mode. Those behaviors require consumer integration.

## Verification

- 87 dedicated parameter service and HTTP cases passed.
- Full control-admin suite: 647 passed; opt-in database cases were skipped and are not parameter integration coverage.
- Control-admin source/test and host TypeScript checks passed; control-admin contract tests passed.

No live database or runtime settings were changed.

## SQL validation follow-up

SQL validation is now aligned through migration `20260912_parameter_validation_alignment.sql`, with a preflight report and an atomic migration audit. See [SQL validation alignment](parameter-sql-validation-alignment.md) for deployment and PostgreSQL evidence. Versioning and the first runtime binding are covered by the follow-up documents below.

## Database version follow-up

Override versions, definition revisions and effective-response configuration tokens are implemented. See [database versioning](parameter-database-versions.md) for migration, optimistic-write and cache-consumer contracts. The concrete adapter and first runtime binding are implemented; see [adapter and runtime deployment](parameter-adapter-runtime-deployment.md).
