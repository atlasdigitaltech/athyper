# Country DEV checkpoint — 2026-09-26

Later confirmation: the user supplied an authenticated Neon `/home` screenshot
without the previous bootstrap-error banner. Home confirmation is complete for
Neon, not a Country acceptance result. The historical inventory below is superseded
by the [refreshed read-only inventory](country-inventory-20260926.md).

## Deployed change

The Neon home request `GET /api/platform/experience/surfaces/neon.home`
failed because `master.principal_surface_arrangement` did not exist. The
experience PostgreSQL adapter uses that table for personal layout read/write/delete.
`principal_ui_preference` explicitly excludes layouts and is not a substitute.

Applied **only** `server/db/ddl/common/master/22_principal_surface_arrangement.sql`
to `athyper_neon` in `athyper-dev-db-1`, using one PostgreSQL transaction with
`ON_ERROR_STOP`. No existing table, release, grant, or user data was deleted.
This creates a principal/tenant/plane-isolated table with forced RLS, revision-bound
payload validation, actor audit constraints, and table CRUD privileges for
`athyperapp`. It does not grant application permissions.

Fresh-install manifests for all three planes include the same canonical source.
Studio and Mesh DEV have **not** received this table. Do not replay an entire
fresh-install manifest on any populated database. The source deliberately has no
`IF NOT EXISTS`: a pre-existing object requires inspection, not silent acceptance.

## Fresh checks

- Eight PostgreSQL checks passed first against candidate DDL in a rolled-back DEV
  transaction, then again against the installed table with all test writes rolled
  back. These cover owner read/update/delete, cross-tenant and cross-principal
  invisibility, invalid plane, mismatched revision and malformed payload rejection.
- Reproduce: `node server/db/scripts/tests/integration/surface-arrangement-dev.mjs`.
- Platform experience tests: **124 passed / 10 files**.
- Platform experience and experience-postgres adapter source typechecks both pass.
- Country offline Neon preparation succeeds: **22 fields**, unsigned candidate.
- No authenticated browser request was replayed by this agent; user confirmation
  of the home banner is pending. No login credentials or session cookies copied.

## Country live inventory

| Item | Studio | Neon | Mesh |
| --- | --- | --- | --- |
| `shared.country` rows | 247 | 247 | 247 |
| `common.platform.reference.view` catalog rows | 0 | 0 | 0 |
| Same permission in `authz.permission` | 0 | 0 | 0 |
| Applied releases with Country publication key | 0 | 0 | 0 |

Existing implementation: `server/db/scripts/provisioning/country-graph.ts` and
`prepare-country-runtime.ts`. The generic shared-reference builder and native
runtime projection already produce a read-only candidate. This is not evidence of
approved Studio authoring, signing, activation, role grants, or callable runtime
providers on the live deployment. See `country-entity-app.md` for the existing
publication-source and compiled-plane compatibility gaps.
Studio's live `metadata.entity` table is empty (0 total, 0 Country rows).

## Publication and collaboration gates

Country is **not published**, and comments/attachments are **not enabled**.
No direct activation, approval impersonation, runtime fallback or permission bypass
was used. No worker/scheduler was started by this change.

Before activation:

1. Assign the DEV tenant/role receiving reference access and the authorized Studio
   reviewer. Select grants for collaboration actions separately from reference read.
2. Complete system-reference authoring and the signed publication source, retaining
   approved-snapshot/hash correspondence and the deployment's artifact-kind policy.
3. Review/apply the targeted permission/schema changes and actual grants through
   the existing administrative path; source catalog declarations are not live grants.
4. Publish comments/attachments as generic capability declarations plus operation
   bindings. Keep Country data immutable. Existing `entity-capability-policy.ts`
   requires release coordinates, parent authorization, explicit action permission,
   comment audience checks and attachment constraints. These must also work for a
   global reference parent while collaboration records remain tenant-local.
5. Verify the publication pipeline and handlers, then activate through the approved
   signed path. Verify rollback using a real prior approved release, not fabricated
   history. A first publication has no previous Country release to roll back to.

## Manual handover

**Ready now:** refresh Neon `/home` while signed in. Confirm the error banner is
gone and the surface request returns 200. Exercise Personalize/save/reset and reload;
confirm another principal does not inherit the arrangement. Report any new request
failure rather than treating login success as proof of every API dependency.

**Not ready yet:** Country acceptance. After approved activation, test
`/app/entity/country/manage` and a UUID detail route, sort/paging stability, denied
access without the reference grant, wrong-plane/context requests, and release
rollback. For comments/attachments, test independent write denial, tenant and
audience isolation, upload constraints, authorized download, and denied foreign
tenant document access. Do not count missing bindings or unavailable routes as
successful authorized functionality.
