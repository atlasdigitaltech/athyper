# server/db review — current working tree, 2026-09-10

**Follow-up:** all seven findings are addressed in [the fix and verification report](server-db-current-fixes-20260910.md). The original findings below are retained as review evidence.

Seven actionable findings remain, including two reproduced tenant-isolation defects. This review includes the existing, uncommitted September 10 fixes; it does not repeat the seven issues already addressed in the earlier review. No implementation files or application databases were changed.

## 1. P1 — Document views bypass tenant RLS

**Locations:** [Neon views, lines 6–15](../../server/db/ddl/planes/neon/document/09_views.sql#L6), mirrored in [Studio](../../server/db/ddl/planes/studio/document/09_views.sql#L1) and [Mesh](../../server/db/ddl/planes/mesh/document/09_views.sql#L1). Application grants are in each plane's `document/11_grants.sql`, lines 9–12.

`document.active_attachment` and `document.active_comment` use the view owner's privileges. Neither specifies `security_invoker=true` nor filters by tenant. The supported foundation runner creates these views as PostgreSQL's administrative user, which bypasses the underlying tables' RLS. Granting `athyperapp` access to these views consequently exposes other tenants' rows.

**Reproduced on a fresh Neon foundation:** inserted a synthetic comment and attachment belonging to tenant A; restored normal triggers; switched to `athyperapp` and tenant B. Both base-table queries returned zero rows. The views returned A's full comment text and attachment file name/storage key. Fixture insertion bypassed FK/fixture triggers with replication mode; the reads used normal settings and the existing non-superuser application role. All fixture changes were rolled back.

**Fix:** use security-invoker views in all three planes, preserve underlying RLS, and provide an upgrade migration. Add a test that compares base-table and view visibility across tenants. This is a database privilege-boundary reproduction, not evidence of an independently reachable HTTP exploit.

## 2. P1 — Postable-account cache exposes every tenant to the application role

**Locations:** [materialized view definition](../../server/db/ddl/planes/neon/master/09_views.sql#L26), [application SELECT grant](../../server/db/ddl/planes/neon/master/11_grants.sql#L92).

`master.mv_company_postable_account` materializes account/company rows for all tenants and grants `athyperapp` direct SELECT. Materialized rows do not inherit the source tables' RLS. A caller can read another tenant's company code, account names, accounting configuration, and dimension identifiers regardless of the current tenant context.

**Reproduced:** created synthetic company, chart-assignment, and GL-account rows for tenant A, then refreshed the materialized view as its owner. Under `SET ROLE athyperapp` and tenant B, `SELECT count(*) FROM master.gl_account` returned zero while `SELECT tenant_id, company_code, account_name FROM master.mv_company_postable_account` returned A's account. Normal RLS was enabled for reads; synthetic fixture insertion bypassed FK/fixture triggers and the transaction was rolled back.

**Fix:** revoke direct application access to the cache and expose a tenant-filtered security-barrier view or a context-checked function. A normal security-invoker view over this materialized view alone would not add tenant isolation; the wrapper must filter tenant IDs explicitly. Add upgrade and cross-tenant tests.

## 3. P1 — Fresh foundations omit the saved-view defaults feature

**Locations:** [Neon foundation manifest](../../server/db/ddl/planes/neon/_manifest.txt#L218), [Studio manifest](../../server/db/ddl/planes/studio/_manifest.txt), [Mesh manifest](../../server/db/ddl/planes/mesh/_manifest.txt); omitted definition: [19_entity_saved_views.sql](../../server/db/ddl/common/master/19_entity_saved_views.sql#L2).

None of the three foundation manifests includes `common/master/19_entity_saved_views.sql`, directly or through a SQL include. Successful fresh provisioning therefore omits `master.saved_view_default`, the shared-manager update policy, and this file's permission seeds. The corresponding saved-view migrations are also absent from the forward-migration manifests.

This affects ordinary saved-view collection reads, not just setting a default: [the preferences service](../../server/packages/platform/preferences/src/index.ts#L96) calls `getSharedDefault` in its collection-read `Promise.all`, and [the repository](../../server/packages/platform/preferences/src/kysely-saved-view-repository.ts#L11) unconditionally queries the missing table.

**Reproduced:** built all three unmodified foundation manifests successfully. Fresh Neon returned NULL for `to_regclass('master.saved_view_default')`. A reachability scan of all three manifests and recursive `\\ir` includes confirmed the file is unreachable in every plane.

**Fix:** install the common saved-view DDL after its dependencies in each fresh manifest, register the upgrade migrations, and test the repository as the application role after provisioning. Finding 4 must also be fixed for that test to work.

## 4. P2 — Saved-view defaults grant privileges to the wrong role

**Locations:** [canonical DDL, lines 25–27](../../server/db/ddl/common/master/19_entity_saved_views.sql#L25), mirrored in [the migration](../../server/db/migrations/20260908_entity_saved_views.sql#L25).

The new table grants SELECT/INSERT/UPDATE only to `athyper_runtime`, conditional on that role existing. The foundation creates `athyperapp` as the application privilege role; it never creates `athyper_runtime`. Other saved-view tables grant access to `athyperapp`.

Thus manually installing the omitted DDL does not restore functionality: applications still cannot read or write shared defaults.

**Reproduced:** applied the canonical saved-view DDL to the isolated fresh Neon database. `has_table_privilege('athyperapp','master.saved_view_default',...)` returned false for SELECT, INSERT, and UPDATE. After `SET ROLE athyperapp`, SELECT failed with `permission denied for table saved_view_default`.

**Fix:** grant the intended privileges to the established application role in both fresh DDL and an upgrade. Test actual role privileges rather than only successful DDL execution.

## 5. P1 — Forward deployment silently skips the new repairs

**Locations:** [Mesh migration manifest](../../server/db/migrations/manifests/mesh.txt#L5), [Neon manifest](../../server/db/migrations/manifests/neon.txt#L4), [Studio manifest](../../server/db/migrations/manifests/studio.txt#L5).

The forward runner executes only names listed in these manifests ([runner, line 31](../../server/db/runtime/run-forward-migrations.sh#L31)). All stop at September 9. None includes the September 10 AI-call constraint, identity replay context, or Mesh command-hardening migration. September 8 saved-view migrations are absent everywhere, and the normalized supplier-preference migration is absent from Neon.

On a deployment with the previous definitions, the forward-migration service can report success while retaining the old behavior, including Mesh's previously demonstrated bank-token retrieval after relationship suspension. Shipping files in the image does not cause this runner to execute them. The earlier manual development execution does not register them for subsequent environment deployments.

**Evidence:** inspected all three manifests, the runner's manifest-only loop, and the deployment Compose entrypoint. The integration runner explicitly applies the repair files by name, so its successful upgrade tests do not check production manifest coverage.

**Fix:** register each migration for its applicable planes and dependency order. Add a deployment-manifest coverage gate alongside the direct migration tests. Preserve historical migration contents/checksums.

## 6. P2 — Supported shared-reference sync targets removed schema objects

**Location:** [sync-shared-to-mesh.ts, lines 173–185](../../server/db/scripts/operations/mesh/sync-shared-to-mesh.ts#L173); also [line 361](../../server/db/scripts/operations/mesh/sync-shared-to-mesh.ts#L361).

`db:operate:mesh:sync-shared` begins by querying `control.entity` for its metadata. Current Neon foundations do not contain this legacy table. The command's discovery and dry-run modes use the same query, so they fail too. Its later state management also depends on `mesh_control.reference_sync_state`, which is absent from the current canonical DDL.

**Reproduced:** executing the metadata lookup against the isolated fresh Neon database raised `relation "control.entity" does not exist`. Searched canonical DDL for both obsolete objects; neither is defined.

**Fix:** migrate the supported command to the current metadata/reference-publication model and its state store, or retire the package entrypoint if this sync workflow has been superseded. Replacing only the first table reference is insufficient.

## 7. P2 — Ledger repair silently scans a developer-specific Windows path

**Location:** [repair-tenant-ledger-hashes.ts, lines 87–88](../../server/db/scripts/operations/repair/repair-tenant-ledger-hashes.ts#L87).

The supported ledger-repair command hardcodes `D:/Products/athyper` instead of deriving the checkout root. In this Linux workspace it resolves to `/home/chandravel_natarajan/src/athyper/D:/Products/athyper/server/db/seed`, which does not exist. The default missing-file branch silently skips rows, then reports zero mismatches and `No repair needed.` even when the actual checkout contains the source files and requires repair. The same issue affects Windows checkouts at another location.

**Evidence:** evaluated the exact path expression in the current workspace and confirmed the resulting seed root is absent; traced the missing-file branch and zero-drift success path. The repair command itself was not run against an application database.

**Fix:** derive the root from `import.meta.url` or accept an explicit root. Fail early if the seed root is missing and report unresolved source files as incomplete verification.

## Verification and scope

- Inventory: 444 DDL-tree files, approximately 287,365 SQL lines; 11 dated migration files plus three migration manifests; 231 script-tree files; seven Prisma/tooling files; 60 seed and 285 seed-backup files. Counts exclude `node_modules`.
- Ran `pnpm --dir server/db test`: **145 passed, 0 failed**.
- Ran `pnpm --dir server/db run db:verify:ddl-model`: **passed**.
- Built **Studio, Neon, and Mesh** from their current, unmodified foundation manifests on isolated PostgreSQL 16.13, with receipt recording: **all passed**.
- Ran `test:integration:db-review --container=athyper-db-review-current` on that disposable installation: **all checks passed**, including prior repair behavior, migration parity/reapplication, legacy discovery retry, concurrent suspension, and three-plane table RLS catalog checks.
- Added focused database probes during review for cross-tenant document views, cross-tenant accounting cache access, saved-view table absence, incorrect table privileges, and obsolete sync metadata. No implementation/test files were modified.
- Checked manifest reachability, application-readable non-invoker views in Neon, the materialized-view inventory, and Neon application-schema SECURITY DEFINER search-path configuration. The search-path scan found no missing configurations. These structural checks do not prove every function's authorization semantics.
- Existing source changes and earlier review artifacts were preserved. Application/dev/QA databases were not modified. The disposable PostgreSQL container was removed after verification. Logs are under `/tmp/athyper-db-review-current-*.log`.

This is a broad, risk-based review with executable foundation and regression coverage. It is not a claim that every SQL line, generated Prisma model, historical backup, seed payload, or operational workflow received manual semantic review. Exhaustive historical upgrade baselines, full application endpoint exploitability, and all concurrency interleavings were not tested.
