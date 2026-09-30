# Country DEV inventory — 2026-09-26

Refreshed at approximately `2026-09-26T11:32:24Z`. This closes pending activity 2
(inventory), not publication or manual acceptance. User-provided authenticated Neon
`/home` screenshot separately closes activity 1 for Neon; it does not verify Studio
or Mesh home behavior.

## Method and limits

- Read-only PostgreSQL transactions on `athyper-dev-db-1`, databases
  `athyper_studio`, `athyper_neon`, `athyper_mesh`.
- Queries ran as the database superuser to obtain complete inventory, **not** to
  demonstrate application authorization or RLS enforcement for an ordinary caller.
- Inspected source graph, preparation script, capability JSON, authoring guard,
  generic routes, parent admission and selected non-secret API configuration.
- Ran offline preparation independently for all three planes; no signing,
  publishing, grants, migrations, container restart or database writes.
- No full package tests/typechecks or authenticated Country API acceptance were
  run for this inventory. Prior test results are not fresh inventory evidence.

## Live inventory

| Item | Studio | Neon | Mesh |
| --- | --- | --- | --- |
| Physical table | `shared.country` | `shared.country` | `shared.country` |
| Rows / unique IDs / unique ISO codes | 247 / 247 / 247 | 247 / 247 / 247 | 247 / 247 / 247 |
| Active rows (`status=active`, `is_active=true`) | 247 | 247 | 247 |
| Null code/name rows | 0 | 0 | 0 |
| Country runtime contracts (`entity_code=country`) | 0 | 0 | 0 |
| Country applied releases / activation heads (key contains country) | 0 / 0 | 0 / 0 | 0 / 0 |
| `common.platform.reference.view` permission | Absent | Absent | Absent |
| Nine declared `common.collaboration.*` permissions | Absent | Absent | Absent |
| Role-permission grants for these common permissions | 0 | 0 | 0 |
| Group-role assignment joins to those grants | 0 | 0 | 0 |
| Reference/common/release-approver role code candidates | 0 | 0 | 0 |
| Comment, attachment, attachment-link, comment-draft tables | Present | Present | Present |

All four tenant codes (`athyper`, `cirrusatlantic`, `system`, `technostat`) are
active in each plane. Absence of common permission rows means no role/group chain
can currently grant those exact permission IDs; this is not an evaluation of
every principal, entitlement, explicit deny or administrative bypass. Existing
unrelated roles/groups must not be replaced. Treat the `system` tenant separately
when designing actual principal assignments.

Studio authoring: **0 Country entities, 0 Country change sets, 0 runtime profiles
targeting `shared.country`, 0 Country-key publication releases.** Metadata is authored
in Studio; Neon/Mesh are deployment targets, not additional authoring databases.

Neon's `neon.hr.policy.country.write` permission is an unrelated HR policy permission,
not Country reference-app authority. It must not be reused or widened.

## Important data/identity finding

All 247 ISO codes occur in all three databases. Reference values match after
excluding UUID and audit fields (comparison digest
`170ef7a349508246a6d530eb08e3b3f0`, MD5 for inventory comparison, not trust evidence).
**Every one of the 247 countries has a different UUID in each plane.**

Example, Malaysia (`MY`):

| Plane | Local record ID |
| --- | --- |
| Studio | `01a0d433-1353-744d-bb00-5abf1fde94a2` |
| Neon | `01a0d433-8079-7f29-aae5-f9f5386e4e6f` |
| Mesh | `01a0d433-d850-7eed-bbdb-6205d12059c8` |

Do not reseed/rekey these tables to make the app work. Resolve record links and
shared-parent admission within the current plane. Any future cross-plane navigation
needs an explicit ISO-code-to-local-ID resolution; do not forward the source UUID.
Comments/attachments remain tenant-local and plane-local over that plane's parent.

All three tables have primary-key/unique-code constraints, validation constraints,
enabled and forced RLS. Existing policies are `open_read` (PUBLIC SELECT, true) and
`seed_write` (postgres ALL, true). The reference permission is therefore an
application authorization gate, not a permission enforced by these open-read
country policies. These policy observations do not certify application-role access.

## Existing artifacts mentioning country are not Country publication

Broad JSON searches found 28 Studio compilation records mentioning country:
24 compiled BP collection artifacts and four native `master_business_partner`
artifacts. Neon has four published `master.business_partner` contracts and 24
applied-release payloads mentioning country. None establishes a standalone Country
release or activation head. Mesh had no publication/runtime payload mentions.
Retain these historical records; this inventory does not authorize their deletion.

## Reusable source and concrete gaps

| Source/capability | Reuse | Still missing |
| --- | --- | --- |
| `server/db/scripts/provisioning/country-graph.ts` | 22-field read-only definition, columns, search fields, sections | Field declarations remain in TS; move declarations into validated metadata through a generic loader |
| `server/packages/planes/studio/meta-entity-authoring/src/authoring/graph-builder.ts` | Generic shared-reference factory | Trusted persisted system-reference product authoring; self-service registration intentionally only accepts tenant/overlay |
| `server/db/scripts/provisioning/prepare-country-runtime.ts` | Working offline graph/native/runtime projection | Registered persisted compilation source, approved-snapshot correspondence and applicable signed publication path |
| `metadata/products/shared/entities/country/capabilities.json` | Comments and attachment declarations, nine exact action permissions | Signed capability/operation bindings, parent qualification and full happy-path verification |
| Generic entity routes in all three apps | `/app/entity/country/manage` and `/app/entity/country/<local UUID>` | Activated descriptors, approved catalog/navigation and actual authorized access |
| `common-reference-permission.ts` and sibling capability validators | Keep reference fields read-only; separately validate collaboration actions | Deploy compatible IAM handling and catalog rows; do not loosen read-only invariant |
| Generic parent admission and capability policy | Existing fail-closed read/scope/permission/audience checks | Supply trusted generic parent-scope bindings from metadata; no entity-name branches |
| Existing document tables/services | Reuse tenant-local collaboration storage and services | Verify scan/storage/retention dependencies and tenant/audience/ownership isolation end-to-end |

`register-services.ts` supplies `dependencies.entityParentScopeBindings ?? []`.
Non-test host source search found only the dependency declaration and consumption,
not a production provider. An empty binding list denies parent admission. This is
safe but not completed Country comments/attachments.

`server/db/migrations/20260926_common_reference_permission.sql` and canonical
`server/db/ddl/common/authz/17_common_reference_permission.sql` already exist. The
live `authz.fn_stage_entity_operation_projection` on each plane does **not** contain
the common-reference code present in updated source, and the catalog row is absent.
Review/apply the targeted migration later; don't replay full fresh-install DDL.

Studio's `metadata.entity_capability` exists. The five newer governance binding
tables (change-case, context requirement, field reference, materialization binding
and mapping) do not. Those absences are source/live drift, **not a reason to make
read-only Country depend on unresolved change-case/preflight work**. Qualify only
the schema actually used by the Country authoring/compilation path.

## Fresh offline preparation

Executed `pnpm exec tsx server/db/scripts/provisioning/prepare-country-runtime.ts`
with each `--plane=studio|neon|mesh`. All three succeeded, returning
`unsigned_candidate`, 22 fields, `common.platform.reference.view` with tenant scope,
the nine capability permissions, and `requires_signed_split_artifacts`.

| Plane | Descriptor hash |
| --- | --- |
| Studio | `430c50b88335d28d215465610679aa014214adf9f730dee2bc412efa7d91f6af` |
| Neon | `31469d475d5bdf07cfebb07a8cb82fdbe5c534f6ffe8b8fdf589b183471f8205` |
| Mesh | `33a83cb44cb0690820d4fbcc11d0fe52e83317ffa38de7cfc8e0eb88f2f40a56` |

The inspected API has `ATHYPER_ENV=local`, publication API/authoring enabled,
`METADATA_COMPILED_ONLY_PLANES` unset (current config parser gives an empty list),
and trust-domain/manifest inputs unset. No compiled-only setting was disabled in
this inventory. Native preparation still does not activate collaboration; use the
required signed split-capability path. Provisioned DEV signing credentials are not
yet cut over into the API; reviewed production public pins remain external inputs.

## Next implementation boundary

1. Extract field declarations into metadata and use a generic validated loader.
2. Complete trusted persisted system-reference authoring/compilation-source wiring.
3. Qualify generic local-plane reads and shared-parent collaboration admission.
4. Separately review schema/catalog/assignment rollout and initial-publication
   authority; then use the signed pipeline after trust cutover prerequisites clear.

No new Country-specific service module, SQL branch or runtime handler is needed.
Country manual testing remains blocked until authorized happy paths actually work.
