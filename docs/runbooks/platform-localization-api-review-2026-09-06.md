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
