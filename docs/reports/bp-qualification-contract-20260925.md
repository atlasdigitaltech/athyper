# BP qualification handler contract correction

## Inventory and scope

Read-only inventory of every activation head in the same local DEV databases on 2026-09-25:

- Neon: BP release 20 used separate Certificates and Restrictions bindings and a decision-only `neon.bp.section.qualifications-certificates.v1` binding.
- Studio and Mesh: no runtime activation heads.
- No claim is made about other instances or tenants outside these databases.

The archived 2026-09-21 qualification section contains both `qualifications` and `certifications` child collections. Its v1 contract remains supported, including the historical `partner_role` projection. Already-published decision-only v1 metadata also remains explicitly readable during cutover. New decision-only publication requires v2. Unknown or incompatible shapes fail before domain reads.

## Applied change

Command: `node tooling/scripts/local-dev/publish-partner-qualification-contract.mjs --apply` (dry-run passed first).

- Same DEV release 21: `f580ddb2-82a8-5020-966c-74c72a7ca83c`.
- Artifact hash: `b1097aee14bd2fd74bc2aa2824382d3ec1b03e125ebbe1161245801c613a6478`.
- Only the qualification section handler binding changed to `neon.bp.section.qualifications.v2`, plus its derived hash. All other 119 artifacts were preserved.
- Section key `qualifications-certificates`, navigation, Certificates, Restrictions, and permissions remain unchanged.
- No reset, data migration, reseed, grant, or historical handler retirement.

Certificate reads now use a named legacy-evidence adapter. The internal legacy service coordinate remains isolated there to preserve existing scope, field, and attachment authorization; it is not a new UI section binding.

## Verification

- 12 host provider/contract tests passed: separate current shapes, historical combined shape, transitional v1, pre-publication validation, missing/incompatible handlers, scoped certificate reads, and narrow overlay preservation.
- 26 planner/section-service tests passed, including independently permission-filtered Restrictions navigation.
- 2 classification projection tests passed; host typecheck passed.
- Signed-in CATL owner browser: Certificates, Qualifications, and Restrictions each returned HTTP 200. Certificates returned collections; decision views returned items. No page JavaScript errors.
- Live release 20/21 comparison confirmed only the intended section artifact changed.

Publication validation is installed in the scoped local DEV compiled-entity publication runner. Any additional publication entry point must enforce the same contract before these handlers are deployed through it.
