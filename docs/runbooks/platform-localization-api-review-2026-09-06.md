# Platform localization API review — 2026-09-06

Reviewed GET/PUT `/api/platform/localization/policies/{planeKey}` and PATCH `/api/platform/profile/locale`, including route validation and response enforcement, service authorization and locale resolution, exact-plane repository selection, PostgreSQL constraints/RLS declarations, cache invalidation, and API-client/BFF contracts.

## Findings and fixes

| Priority | Finding | Fix |
| --- | --- | --- |
| P1 | PUT resets and upserts the same activation rows in one data-modifying CTE. Repeating a policy write raises PostgreSQL `ON CONFLICT DO UPDATE command cannot affect row a second time`. Switching defaults also requires respecting partial unique indexes. | Separate reset and upsert statements inside one transaction. Lock the tenant profile through its upsert to serialize concurrent replacements. Reuse the host transaction when supplied. |
| P1 | Tenant policy PUT overwrites `control.ui_locale_catalog`, which has no tenant key. One tenant's review changes affect every other tenant's effective policy, while invalidation targets the initiating tenant. | Persist review choices in the existing `master.tenant_profile.locale_catalog_governance` field and overlay them when reading that tenant. Shared catalog rows remain baseline definitions. |
| P2 | GET omits 400/503, PUT omits 503, and PATCH omits 403/503 response declarations. Runtime response enforcement converts these service errors into 500s. | Declare error responses on all three endpoints and enumerate the policy route's plane parameter. |
| P2 | PATCH writes a principal preference before bootstrap validates identity admission. A rejected request can therefore leave a persisted change. Localization methods also omit the snapshot-binding guard used by bootstrap. | Check snapshot coordinates in all three service operations and validate current identity, tenant, membership, binding, and auth epoch before PATCH persistence. |
| P2 | An enabled inherited English locale wins over a newly selected tenant default, so users without a personal preference do not receive the tenant default. | Prefer the policy default when there is no principal preference; retain regional formatting when the inherited locale already matches that default. Enabled personal choices still win. |
| P2 | PATCH accepts regional locale tags but stores only the catalog code, losing region-specific formatting (for example, `fr-FR` becomes `fr`). | Validate against the enabled catalog but persist the canonical requested locale. |
| P2 | An explicitly supplied governance list that lacks a locale silently qualifies that locale if it appears in `enabledLocales`. | Fail closed for missing non-English evidence in explicit governance. Preserve compatibility for legacy records without governance and the emergency English fallback. |
| P2 | Context-not-ready bootstrap revisions omit the profile, so changing a locale can leave the revision unchanged. | Include the effective profile in both context-not-ready revision branches. |

Policy reads now obtain catalog governance and activations in one PostgreSQL statement, preventing mixed snapshots across a concurrent replacement.

## Validation

- Experience package: 42 tests passed, including authorization rejection before writes, policy/default resolution, regional preferences, missing evidence, revision changes, cache refresh, and HTTP problem responses with response enforcement enabled.
- Isolated PostgreSQL 16.13: four regression tests passed using the repository's actual catalog/activation table definitions and partial unique indexes. Covered repeated replacement, default changes in both directions, tenant isolation, rollback, concurrent updates, and an existing transaction runner.
- Ran those PostgreSQL tests against the original adapter: three failed with the double-update PostgreSQL error. The corrected adapter passed all four.
- Both affected package TypeScript builds passed.
- Scoped `git diff --check` passed.

The PostgreSQL regression file is `server/packages/adapters/experience-postgres/src/localization.postgres.test.ts`. To run it, set `ATHYPER_LOCALIZATION_TEST_DATABASE_URL` to an **empty disposable PostgreSQL database**, then run `pnpm --filter @athyper/server-adapter-experience-postgres test`. It creates fixture schemas and uses actual repository DDL for the activation constraints. The test database must not be a development or production application database.

## Limits and operational notes

The supplied development Swagger URL was inaccessible from the browser tool. No authenticated requests were issued to the deployed API. The existing all-plane database/RLS suite was not enabled; the new PostgreSQL tests validate SQL behavior and tenant predicates on an isolated instance, not deployed credentials or all-plane RLS integration.

No schema migration is required. Existing tenant governance stored by previous PUT calls is now honored. This change does not reconstruct shared catalog values previously overwritten by tenant writes; the correct shared baseline should be checked against approved catalog qualification records during deployment.

## Follow-up review of the current implementation

The second review retained the earlier fixes and found four additional defects:

| Priority | Finding | Fix and regression evidence |
| --- | --- | --- |
| P1 | An in-flight bootstrap can read the old preference, finish after PATCH invalidates the cache, and cache the old locale again. | Memory-cache invalidation increments a generation. Bootstrap captures that generation before reading; cache insertion atomically rejects results from an older generation. A deterministic paused-bootstrap test reproduced English returning after a successful Arabic selection in the previous implementation. |
| P2 | PATCH validates a policy in one transaction and writes the preference in another. A concurrent PUT can disable the selected locale in between. | Pass the validated policy revision to persistence. Serialize PUT/PATCH with a tenant-scoped transaction advisory lock and recheck the revision before writing. Return the documented 409 `EXPERIENCE_LOCALE_POLICY_CHANGED` if it changed. PostgreSQL regression verifies that the old preference is preserved after a concurrent disable and that a fresh selection succeeds. |
| P2 | PUT selects activation rows from the physical catalog without checking that all requested locales exist there. Incomplete plane provisioning silently drops requested locales while returning success. | Lock/check the requested catalog rows before mutation. Missing catalog entries return 503 `EXPERIENCE_EXACT_PLANE_CATALOG_UNAVAILABLE`; regression verifies that the existing policy is untouched. |
| P2 | JSON governance containing a string such as `"false"` is treated as a truthy passed review gate, enabling an unqualified locale and potentially violating the response schema. | Normalize persisted review gates using strict boolean checks. Regression reproduced the incorrect activation in the previous implementation and now verifies exclusion. |

The advisory lock is deliberate: application roles have SELECT-only access to `master.tenant`, so a tenant-row `FOR UPDATE` lock would fail under real runtime grants. The key includes the canonical tenant ID; PostgreSQL scopes the lock to the physical database. Existing tenant-profile row locking remains in place for policy replacement. No additional runtime grants or schema changes are needed.

Follow-up validation: **45 experience tests and seven isolated PostgreSQL tests passed (52 total)**. Both affected package builds passed. PostgreSQL coverage now includes the PATCH/PUT race, incomplete catalogs, and a restricted runtime role with tenant RLS, in addition to the earlier replacement tests. The cache-race and incorrectly typed evidence regressions were also run against the previous service and both failed as expected.

The supplied GitHub source URL returned 404 from the browser tool; review used the local source. Tests use an isolated database and representative runtime grants/RLS; the deployed API and full all-plane RLS suite remain unverified. Cache generation protection applies to the configured in-process memory cache; it does not add distributed invalidation between API replicas. Custom cache implementations must honor the optional generation contract to obtain the same in-flight protection.

## All-plane development RLS qualification — completed

The localization-specific all-plane RLS gap is now closed for the development databases. The dedicated suite passed **18 tests: six each against `athyper_studio`, `athyper_neon`, and `athyper_mesh`**, executing repository operations as the real `athyperapp` role. It verified:

- Exact database name and `app.database_plane`, plus a runtime role without superuser or BYPASSRLS privileges.
- Enabled, forced, active RLS on tenant, tenant profile, tenant locale activation, and principal UI profile tables.
- Reading and replacing policy, changing defaults, and persisting a regional principal locale.
- Cross-tenant read isolation and rejection of direct cross-tenant activation writes.
- Cross-principal read/write isolation within the same tenant.
- Read isolation and write rejection when tenant/principal context settings are absent.

Tests discover existing active fixtures (two tenants, with two principals in one tenant) and perform all writes inside transactions that are deliberately rolled back. They do not seed or commit changes to development data. Connection credentials were supplied in process memory and were not written to the repository or report.

### Repeatable command

Supply all six environment variables using your normal secret-management mechanism:

```text
ATHYPER_STUDIO_TEST_DATABASE_URL
ATHYPER_STUDIO_TEST_DATABASE_ROLE=athyperapp
ATHYPER_NEON_TEST_DATABASE_URL
ATHYPER_NEON_TEST_DATABASE_ROLE=athyperapp
ATHYPER_MESH_TEST_DATABASE_URL
ATHYPER_MESH_TEST_DATABASE_ROLE=athyperapp
```

The connection identity must be authorized to inspect fixtures and `SET ROLE` to the specified runtime role. Assertions and mutations execute after switching to that non-bypass role. Each database must have the real schema, RLS policies, grants, plane setting, and the active fixtures described above.

```sh
pnpm --filter @athyper/server-adapter-experience-postgres test:localization-rls
```

The command fails if any plane URL/role is missing. It forces database tests on and runs only the localization all-plane suite, avoiding unrelated or destructive fixture suites. The test file is also discoverable by the existing `test:service-postgres` PostgreSQL qualification harness when that broader environment is provisioned.

This result supersedes the earlier “all-plane RLS unverified” limitation **for localization on the local development databases**. The agreed acceptance scope is local Studio, Neon, and Mesh; QA and production are not required or outstanding for this task. These database checks cover localization RLS, not every platform service or authenticated HTTPS/BFF routing.

Final local verification rerun: **18/18 all-plane localization RLS tests passed with no skips**, **45/45 experience service/route tests passed**, and both affected package TypeScript builds passed. The RLS suite used the actual local `athyperapp` role and rolled back all test writes. Local localization RLS validation is complete.
