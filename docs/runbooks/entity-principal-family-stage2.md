# Stage 2 — Principal family analysis and execution plan

## Decision and evidence — 2026-10-01

Stage 1 is functionally complete on the project owner's reported manual acceptance across Neon, Studio and Mesh, including Atlas. See [the acceptance record](entity-reference-baseline.md#stage-acceptance--2026-10-01). Stage 2 is **in analysis, not qualified complete**.

This review inspected canonical DDL, deployed DEV catalog definitions in all three databases, source Entity products, owner enforcement, identity resolution and the Notification Preference owning service. The live inspection used read-only transactions and queried schema catalogs, not user profile contents. It changed no database schema, grants, publication heads or business records.

Private receipt: `~/.athyper/instances/dev/evidence/principal-stage2-20261001/ddl-inventory.json`. Its capture time is embedded. The accompanying `inventory.cjs` reruns from the repository root against the explicitly identified DEV database container and does not print credentials. This receipt proves catalog state, not browser authorization or write behavior.

Existing [Principal onboarding evidence](../reports/principal-onboarding-20260929/README.md) reports all three initial entities published in all three planes. Its [database receipts](../reports/principal-onboarding-20260929/dev-database-verification.jsonl) record rolled-back self/admin/cross-owner/cross-tenant/version checks. [Authorization recovery](../reports/principal-authorization-recovery-20260930.md) subsequently repaired shared published-owner admission. Rebaseline current active release hashes before amendments; historical receipts do not prove today's full browser or Atlas qualification.

## DDL ownership model

The canonical source is [common identity DDL](../../server/db/ddl/common/master/03_platform_tables.sql). These are tenant-local identity records in each plane database, not one global profile shared implicitly across planes. A matching UUID, login name or upstream subject alone does not authorize crossing a plane or tenant.

| Table | Ownership and cardinality | Existing Entity coverage | Stage 2 treatment |
| --- | --- | --- | --- |
| `master.principal` | Tenant-local actor; unique `(tenant_id, code)`; supports human and nonhuman principal types | Standard list/read; owner is `id` | Keep generic Entity read-only. Provisioning, suspension, bindings and authorization changes stay with their owning IAM commands. |
| `master.principal_profile` | Optional one-to-one `(tenant_id, principal_id)` | List/read/create/patch; optimistic `record_version` | Core writable pilot: names and avatar, server-owned parent and audit fields. Do not merge employee attributes into it. |
| `master.principal_notification_preference` | Many per principal; unique `(tenant_id, principal_id, event_code, channel)` | List/read/create/patch; optimistic version; owning-service mutation policy | Core writable pilot after lifecycle-domain correction; preserve validation and outbox invalidation. |
| `master.principal_ui_profile` | Optional one-to-one principal; nullable Locale/Language/Timezone references | No source Entity product found in this review | Best next eligible dependent. Add through the shared framework after concurrency and owner authorization are specified. |
| `master.principal_ui_preference` | Registered small overrides; unique `(tenant_id, principal_id, preference_code, surface_code)` with NULLS NOT DISTINCT | No source Entity product found | Defer generic editing until registered key/value validation and owning-service integration are qualified. |
| `master.principal_identity_binding` | Many provider bindings; unique `(tenant_id, provider_code, realm_key, subject_id)` | Not included in the three published products | Consider a restricted read model only if needed. Do not expose provider attributes, subject identifiers or provisioning controls as ordinary editable profile fields. |

All six deployed tables have forced RLS. Their columns, constraints and `athyperapp` table grants are identical across the three DEV databases in this inventory. Profile, UI Profile, UI Preference and Notification Preference have composite tenant/principal foreign keys with `ON DELETE CASCADE`; Identity Binding uses `RESTRICT`. These FK policies do **not** authorize principal deletion through Entity UI.

Principal has `auth_epoch`, distinct from dependent `record_version`: the former invalidates authentication/authorization context; the latter detects competing record edits. Do not substitute one for the other. Principal `external_ref` is business correlation, not the IAM subject. Profile intentionally excludes IAM shadows, ERP/employee data and UI defaults.

UI Profile already references `shared.locale(code)`, `shared.language(code)` and `shared.timezone(code)`. NULL means inheritance; absence of an override is not a missing mandatory value. This is the natural reuse of Stage 1 authorized lookup metadata. Neither UI Profile nor UI Preference currently has `record_version` in the deployed inventory: writable onboarding needs a deliberate concurrency contract, not a copied optimistic descriptor pointing to a nonexistent column.

UI Preference caps its JSON value at 8 KiB and explicitly excludes saved views, layouts, recents, history and documents. Existing Saved View, Bookmark and Surface Arrangement owners should remain authoritative; do not sweep every principal-related table into unrestricted CRUD.

## What differs by plane

| Concern | Neon | Studio | Mesh |
| --- | --- | --- | --- |
| Core identity tables and keys | Shared common model | Same | Same |
| Entity owner administration | Shared descriptor-scoped adapter and transaction marker | Same | Same |
| Additional identity RLS | HR administration policies on Principal/Profile/Binding/UI Profile | No corresponding HR policies in this inventory | No corresponding HR policies in this inventory |
| Surrounding domain | Employee/person records are separate; Employee has an optional Principal link | TrustIAM provisioning/governance has separate tables and workflows | Network-account context governs network resources separately from principal ownership |
| Generic row-audit trigger on these six tables | Present | Absent in this deployed inventory | Present |
| Application permission scope | Exact Neon tenant/principal and current permissions | Exact Studio tenant/principal and current permissions; publication roles are separate | Exact Mesh tenant/principal and current permissions; network access does not grant profile administration |

The three canonical `26_entity_owner_access.sql` files are byte-identical. Live trigger definitions otherwise match for the inspected six tables; Neon and Mesh additionally have `trg_zz_audit_row_change` on each. **This does not establish that Studio has no audit trail.** Trace the owning-service/event audit path and either demonstrate equivalent evidence or repair the Entity-related gap before promising profile history or snapshot comparisons across all planes.

Neon's [HR RLS extension](../../server/db/ddl/planes/neon/master/25_hr_stage2_user_rls.sql) is permissive alongside other policies. The shared Records [owner adapter](../../server/packages/services/records/src/record-owner-access.ts) already adds a mandatory self predicate for nonadministrators, independently of caller filters. Keep and test that defense; do not remove existing HR applications to make the new Entity path work.

[Identity resolution](../../server/packages/platform/iam/src/kysely-identity-context-resolver.ts) resolves active application projections and provider bindings in an exact-plane transaction before loading permissions. The selected legal entity/business context is an input to server verification, not a grant to read every principal. Do not introduce a new business-context selection just for Atlas.

## Confirmed gaps and priority

1. **Notification Preference lifecycle mismatch — blocking write qualification.** Both canonical and deployed `status` use `shared.ref_status_d`, allowing `active/deprecated`. Its Entity metadata offers `active/inactive`, and [the notification service](../../server/packages/platform/notifications/src/kysely-notification-preferences.ts) writes `inactive`, including the hidden preference-version sentinel. Those writes conflict with the live domain. Recommended direction: use the existing operational `shared.active_inactive_d` for this table, with a table-local migration, reviewed handling of any existing deprecated rows, generated-column dependencies and fresh-install DDL alignment. Do not alter `ref_status_d` globally; that would break the accepted reference baseline. Inventory affected data before finalizing migration semantics. No migration was executed during this analysis.
2. **Restricted-field qualification is not established by classification.** Profile fields are classified PII, but current source authorization field policies are `plain`. Preserve existing legitimate self/admin access; identify concrete field policies and personas to test, then prove hidden/masked values cannot appear through list/detail, sorting/filtering, reference labels, exports, Atlas discovery, citations, comments or snapshots. Do not label all profile data masked merely because it is PII.
3. **UI Profile is eligible but not ready for writable onboarding.** Add published owner policy, concurrency, immutable parent/tenant enforcement, authorized reference bindings and inheritance-aware input behavior. The existing Entity administrator RLS extension covers Principal/Profile/Notification Preference, not automatically this new dependent.
4. **Second-family Atlas requires explicit publication and data-class decisions.** No AI capability declaration was found in the three source Entity products inspected. Country's AI eligibility does not implicitly enroll Principal. Profile PII must not be relabeled internal to fit an allowed model/data class. First qualify permitted Principal summaries and owner-scoped relationship discovery; admit profile fields only under the applicable provider/data-class policy.
5. **Revocation and audit need current end-to-end evidence.** The [context refresher](../../server/packages/platform/iam/src/kysely-context-refresh.ts) checks active principal and matching epoch and reloads permissions. Verify its use at actual Entity/Atlas boundaries, including cached conversations and delayed tools. The implementation alone is not proof that every browser/inference path is protected.

Notification Preference is more than a table editor: the existing mutation policy validates channel capability and consent, serializes owner updates, excludes the internal `platform.preferences.version` row and writes an invalidation event in the caller's transaction. Push checks the current plane's subscription; email/SMS/WhatsApp need verified contact channels, and WhatsApp needs consent. Preserve these rules, nullable inheritance and real delivery capability per plane. A failed channel qualification must not become an apparently successful preference save.

## Execution batches and integration points

1. **Rebaseline and repair the existing three-entity pilot.** Capture current release hashes and effective descriptors for each plane, verify existing self/admin personas and service owners, correct Notification Preference domain consistency, and resolve the audit evidence difference. Retain Principal read-only; keep Profile and Notification Preference create/patch parent-scoped. Reuse the existing Overview/Profile/Notifications navigation.
2. **Qualify writes and restricted access.** Use Principal's standard record-scoped dependent lists/forms. Parent selection supplies a locked server scope; body/query overrides cannot change tenant or owner. Test profile create/edit, duplicate profile, missing profile, optional display-name fallback, preference create/edit, inheritance, unsupported channels, stale versions, idempotent retry and failed-save rollback/outbox behavior.
3. **Add UI Profile as the first additional dependent.** Reuse Stage 1 Locale/Language/Timezone lookups and reference previews. Define concurrency and administrator behavior, then publish through the existing maker/checker flow. Add UI Preference only once registry-aware validation is available; keep Identity Binding administration with IAM.
4. **Publish and qualify the second Atlas family.** Question and page context → eligible published metadata → authorized owner/record/relationship resolution → existing Entity operations → labeled answer with citations. Ordinary authenticated sessions suffice for admitted read questions; no additional Atlas MFA gate. Any separately protected administrative action retains its own existing policy. Begin with read-only Atlas capabilities; do not turn on AI writes as an incidental effect of browser-write onboarding.
5. **Close per-plane release evidence.** Review the exact change, run relevant checks, publish pinned metadata successors where needed, deploy reproducibly, and capture browser/Atlas acceptance for all three planes. Stage 2 closes only after the matrix below passes, not after a single administrator page loads.

Expected change owners: source products under `metadata/products/shared/entities/principal*`; common/plane DDL and a targeted migration for confirmed Entity dependencies; shared Records owner/concurrency/relationship enforcement; the notification owning-service adapter; standard Entity forms/detail/lookup components if a shared gap is demonstrated. No bespoke user application, raw AI SQL access or parallel API stack.

## Required acceptance matrix

| Scenario | Required outcome in Neon, Studio and Mesh |
| --- | --- |
| Self user A vs user B | A can access admitted own records; B's list/count/detail/child routes remain inaccessible without explicit administration permission. |
| Administrator | Both ordinary Entity operation permission and current owner-administration permission are required. Actor audit remains the administrator, not an impersonated owner. |
| Parent/tenant/plane tampering | Locked parent is revalidated; submitted owner changes, cross-tenant IDs and another plane's context do not broaden access. |
| Version and retry | Stale patch conflicts; repeated idempotency key does not duplicate records or invalidation side effects; failure rolls back atomically. |
| Notification semantics | Active/inactive lifecycle agrees across DDL/service/metadata; NULL inheritance survives; invalid channel/contact/consent rejected; internal sentinel excluded. |
| Restricted fields | Plain/masked/denied outcomes agree across UI, export, lookup, Atlas and any admitted history; no unauthorized counts or labels disclose another user's data. |
| Revocation | Remove a permission, disable membership/binding or suspend actor, then retry with an existing session/thread. New reads and pending tools must reauthorize; already-delivered data cannot be retroactively erased. |
| Context changes | Tenant/plane or Mesh network-context change clears inappropriate UI/Atlas context and rechecks access; no cached cross-context response. |
| Atlas | “Show my profile,” an authorized user's profile, preference rules and eligible locale relationships use metadata and citations. Unauthorized named-user lookup returns no existence detail. Ambiguity requests clarification. |
| History and comments | Only enable questions about changes/comments when corresponding Entity sources, retention and field/record policies are published and qualified. Do not fabricate unavailable historical data. |
| Plane-specific regressions | Neon HR policy cannot bypass Entity self scope; Studio audit evidence is demonstrated; Mesh network membership cannot substitute for principal administration. |

## Status boundary

Completed in this analysis: Stage 1 acceptance recorded; source and deployed catalog comparison; six-table family classification; confirmed Notification Preference domain conflict; identified concurrency, disclosure, audit and Atlas qualification work; ordered execution plan.

Not completed here: fixes, schema migration, new UI Profile onboarding, new publication, fresh write/browser/revocation/Atlas qualification, or frozen release/remote-CI evidence. Existing checks retain their dates and do not become new passes through this plan.


## Implementation checkpoint — 2026-10-01

- Applied `20261001_principal_family_editing.sql` to DEV Studio, Neon and Mesh after rehearsing all three in rolled-back transactions. Notification Preference now uses operational `active/inactive`; legacy `deprecated` is mapped to the equivalent non-active state. The status trigger is preserved and the generated `is_active` column restored. Reference entity domains are unchanged. UI Profile receives `record_version`, owner-administrator policies and the shared optimistic-version trigger. Exact UI Profile read/edit capabilities are catalogued; no blanket identity administration is granted by the migration.
- Added the standard `principal_ui_profile` table product: self/admin owner policy, create/patch, immutable parent/audit/version fields, bounded week-start, appearance/density enum labels, and authorized Locale/Language/Timezone references. Added its record-scoped section/tab to the Principal source presentation. Both are draft changes awaiting governed publication.
- Added shared searchable reference form controls and server-side reference-selection validation. Published target keys remain immutable; source foreign keys can now be edited. Missing authorized reference resolution fails closed. Source/target authorization still governs labels and selected values.
- Hardened patch ownership independently of permissive RLS: the stored owner is rechecked before mutation. Revoked administrator authority is also checked before idempotent replay. This supplements, rather than replaces, operation permissions, field policies and tenant isolation.
- UI Profile edits use the existing settings owner's tenant-locked locale policy. A reference being present does not bypass UI locale/language qualification. Generic editing does not enable an unqualified UI translation.
- Rolled-back DEV checks passed for all three editable dependents across all three planes: self creation/editing, other-owner denial, administrator editing, stale versions and removal of the transaction's administrator marker. This is not a claim of live IAM revocation qualification.
- Live Neon browser Profile and Notification Preference create/edit journeys passed, including server-derived parent/tenant, idempotent retry, stale version and protected-field rejection. Notification Preference was additionally exercised with `Inactive`. Disposable fixtures were cleaned up and normal audit retained.
- Shared reference editor browser tests passed for authorized label/code selection and context-change cache removal. Source publication and owner-authorizer tests include UI Profile across the three planes. DB package typechecking passed; the historical legacy-typecheck blocker did not recur in this checkpoint.

Private evidence remains under `~/.athyper/instances/dev/evidence/principal-stage2-20261001/`; live browser receipts are under the DEV `artifacts/principal-write-journey/` and `artifacts/notification-write-journey/` directories. `ui-profile-policy-candidate.json` and `principal-policy-candidate.json` pin the proposed UI Profile publication and dependent Principal navigation successor. Execute UI Profile before the Principal successor, because publication qualifies active relationship dependencies.

Still open: independent publication enrollment/activation, live UI Profile browser editing, Studio/Mesh refreshed test-state capture, nonadministrator and actual IAM-revocation browser journeys, Principal-family Atlas/privacy qualification, and reviewed-commit/remote-CI release closure. These are not marked complete by the schema or component checks.

### Publication enrollment checkpoint — 2026-10-01

The authenticated maker recorded UI Profile proposal `7cea8e04-fcd3-4be7-a668-8be4cd2397e8` and Principal successor proposal `61f0db82-c0c0-4a6b-bd78-0820da455fbc`. Both are pending independent checker approval; neither receipt establishes runtime activation.

Principal initially failed enrollment because successor source qualification used the reference-only target compiler. Successor enrollment and execution now use the existing `compileSystemEntityTarget` metadata dispatch, retaining reference validation for reference products and identity/table validation for table products. The source/predecessor hashes, target enrollment, operation permissions and maker/checker gates remain enforced. The Principal candidate was repinned to the corrected compiler before successful proposal submission. Focused source/workflow regression checks passed (24 tests), including Principal target qualification and failure before submission; authoring package typechecking passed.

The control API was restarted to load this change. The publication execution host must also load the corrected source before execution. Apply UI Profile first, verify all three active targets, then execute the Principal navigation successor.

### UI Profile activation checkpoint — 2026-10-01 08:22 UTC

Independent owner verification activated both recorded policies. UI Profile release `3a7d19c2-f07a-4b6d-9359-a61887db593e` (release 1) is now active in Studio, Neon and Mesh; exact activation receipts are in `ui-profile-active-heads.json`. Existing source-owned self and DEV full-admin capability recipes were applied across all three databases (`access-applied.json`).

Activation exposed a missing `platform.experience.ui_profile.v1` entry in the compiled runtime handler registry. The installed mutation implementation and target qualification were already present. Added the registry entry, passed 22 focused host tests and host typechecking, and retried only the failed compilation job for the unchanged, approved first release. No source approval or payload was changed. DEV worker/scheduler had been stopped by an earlier missing-module startup failure; both were restored. All three targets activated at approximately 08:21:56 UTC.

Principal has not been executed: the registry correction changed the pinned compiler identity. Archived its previous candidate/proposal/approval receipts and prepared `dev.principal.ui-profile.20261001.registry-v2` against compiler hash `773a2af27c434a6b69d72db5a1a543961a563aa239e9751780fae752dae4a348`. Fresh maker/checker enrollment is required for that exact candidate. Its source hashes, fields and permissions remain unchanged.

Neon's saved test session remains authenticated; Studio and Mesh still return anonymous. UI Profile browser editing through the Principal tab remains pending the Principal successor. Stage 2 is still open for the previously listed browser, revocation, Atlas/privacy and release-evidence gates.

### Principal enrollment recovery — 2026-10-01

Corrected policy `2143e4f1-8499-43f4-a038-9cebb5ea6541` received independent approval, but execution failed before release creation: `fn_system_entity_authority` correctly rejected two active enrollments on the same change set. Activated policy records cannot be retired through the present immutable policy model. No policy record or protection trigger was changed.

Using the existing draft lifecycle, maintenance abandoned only unreleased draft `3dcc0156-2aae-432b-b152-7d2b78574541`, guarded by its entity, creator, status and lock version. Its graph and both immutable policy histories remain retained. Those policies cannot publish the abandoned draft. Prepared fresh successor draft `43ecdb3d-e592-4002-9021-63291cf99b61`, with the same intended Principal UI Profile presentation, through the existing trusted preparation operation. Draft replay and stale-predecessor checks passed. Candidate `dev.principal.ui-profile.20261001.isolated-v3` retains compiler hash `773a2af27c434a6b69d72db5a1a543961a563aa239e9751780fae752dae4a348`; it requires its own maker/checker enrollment. Principal release 1 remains active; no successor release has been created.

### Principal release 2 and Neon UI Profile journey — 2026-10-01

Isolated policy `5b8d85a4-70fe-4f5c-9485-8cc96e57ee0e` was independently approved and executed successfully. Principal release 2 (`1a1015f9-a725-4641-b734-8353756cedd5`) is active in Studio, Neon and Mesh. Exact receipts are in `principal-active-heads.json`. The UI Profile tab now uses its published parent-scoped relationship.

Neon live UI Profile create/edit qualification passed with authorized `en-GB` lookup selection, immutable server-derived parent/tenant, create idempotency replay, optimistic versioning, stale-version rejection and protected/invalid field rejection. No failed HTTP requests occurred; disposable records were cleaned up. Receipt: `~/.athyper/instances/dev/artifacts/ui-profile-write-journey/2026-10-01T08-38-07.399Z-2880120/summary.json`. The first attempt stopped at an incorrect browser-test searchbox selector; the control uses a combobox. Updated that selector and selected the enabled English locale without changing tenant locale policy.

Studio and Mesh saved browser sessions still return anonymous; normal saved-session refresh was requested. Stage 2 remains open for those live journeys, nonadministrator self-service and actual IAM revocation, Principal-family Atlas/privacy qualification, and reviewed-commit/remote-CI release evidence. Publication activation is now complete for this UI Profile/Principal increment.

### Shared editing expansion — implementation in progress

The owner authorized generic form completion, policy evaluation, registered section components, Address onboarding and reuse for Employee/Business Partner with Atlas qualification. This larger increment is not ready for manual handover.

Initial shared changes omit non-writable create inputs, project authorized published detail sections as a backward-compatible form grouping fallback, render grouped responsive fields, guard duplicate submissions and retain idempotency keys for unchanged uncertain retries. Records tests passed (24), submission-identity regression passed, and Records/form-runtime typechecks passed. Explicit form authoring, inline validation feedback, full conditional policy evaluation, component registration and Address/Employee/Business Partner publication remain open.

Two business-policy decisions were requested before dependent Address implementation: Employee self-edit versus HR-only editing, and copy-on-edit versus separately authorized shared-address updates. Existing Principal permissions do not implicitly grant Employee address-write access. Existing MDG Address draft presentation and intake contracts were found and will be evaluated for reuse rather than creating a parallel application.

### Accepted workforce-linked Principal direction — 2026-10-01

The owner clarified that linked Principal personal-profile data must derive from Employee/workforce, while an explicitly unlinked Principal remains directly editable. Neon employee self-service permits editing the user's own eligible personal fields; authorized HR administrators can maintain records within their assigned tenant/company scope. Copy behavior is entity-specific and must not broadly duplicate personal data.

Existing DDL distinguishes `master.person` (canonical person identity), `master.employee` (internal workforce role), `master.employment`/`master.work_assignment` (employment facts), and `master.external_worker` (independent external workforce role). Employee has an optional tenant-bound Principal link; external_worker has a Person link but no equivalent direct Principal binding in the inspected definition. A person can hold both roles. Do not infer bindings from name/email or turn external workers into employees to obtain self-service access. Current DEV Neon inventory has zero employee/external-worker rows, so synthetic linked and external-person fixtures are required for runtime qualification.

Ownership decisions:
- Derive linked personal identity fields from the governed Person/workforce source. Do not use legacy employee compatibility columns as a new independent personal-data master.
- Keep authentication/security on Principal/IAM and notification/UI preferences on their existing Principal entities.
- Resolve source ownership server-side. `local` must mean positively confirmed unlinked, not an empty/denied workforce query. Suspended/revoked employment, unresolved identity, stale projection, unavailable Neon or denied source access never enables local fallback.
- Self-service is field/operation specific. HR administration does not waive tenant/company scope, validation, immutable fields, lifecycle, auditing or concurrency.
- Cross-plane display/edit must use a qualified authorized source contract; Studio/Mesh do not receive unrestricted Neon database access.
- Address links and address content remain separate. Copy is denied unless explicitly enabled for that Entity operation; no automatic duplication of personal addresses across owners. Shared-address edits require an explicit affected-owner policy.

Implementation checkpoint: added optional published owner `sourceAuthority` resolver key, a transaction-bound Records local-write guard, and a publication gate that rejects missing resolver registration. The guard runs before command replay and rechecks the stored patch owner. Linked/unavailable/mismatched/unversioned evidence denies local writes. Sixteen focused Records tests plus one host publication test passed; Records and host typechecks passed. This is framework infrastructure only: no source resolver is registered in host composition, no Principal metadata declares it, and no linked workforce behavior is yet deployed. Source resolution/read projection, race-safe link lifecycle, Employee/external-person onboarding, policy/UI integration and three-plane/Atlas qualification remain required before manual handover.

### Wave 2A form and browser checkpoint — 2026-10-01

Scope remains Principal, Principal Profile, Notification Preference and UI Profile. Workforce onboarding is deferred to Wave 2B, but verified source ownership is a Wave 2A release requirement.

Implemented a versioned `formPresentation` contract with separate create/edit sections, exhaustive ordered input membership, bounded help text and submit labels. Authoring compilation, native runtime projection, stored descriptor parsing, authorized Records projection and the shared form renderer carry it end to end. Profile, Notification Preference and UI Profile source products now declare their layouts; all nine plane/product compilations pass. These new source declarations are not yet published.

Shared forms now show safe inline validation against admitted writable field keys, preserve drafts after errors, identify optimistic version conflicts, and require confirmation before reloading/discarding. Cancel and Back use the existing departure state and cannot abandon a running submission. Unchanged uncertain retries retain their idempotency key; successful saves track the returned version for subsequent editing. No server error message or unknown/protected field is rendered as field feedback.

All three planes passed administrator UI Profile browser create/edit checks at 10:11 UTC. Studio/Mesh Profile and all three Notification Preference journeys passed at 10:13 UTC. Neon Profile initially failed with `command_execution_timeline_chk`; the shared command store now explicitly gives receipt/start the same transaction timestamp and bounds completion by the stored start. Its regression test passes. Neon Profile reran successfully at 10:15 UTC. These are administrator checks against existing active releases, not proof of the new unpublished form declarations, ordinary self access, or workforce source ownership.

`catl.finance` was selected by the owner as the ordinary-user persona. Read-only DEV inventory confirms active Principal `d04198ac-53cf-5e94-969f-b6f75f176fa2` in Neon only; Studio/Mesh have no Principal with that code. Normal capture tooling admits this exact DEV Neon actor and rejects QA/other-plane/isolated capture. No grants or memberships were changed by that tooling update. Ordinary-user qualification awaits its saved authenticated session.

#### Manual QA matrix — preparation only; handover pending

Run each applicable case in Neon, Studio and Mesh against the frozen published release. Record plane, actor, release/descriptor hash, timestamp, request correlation and outcome without retaining passwords, cookies or sensitive field values.

| Case | Actor and action | Required outcome | Current evidence |
| --- | --- | --- | --- |
| Navigation | Administrator opens Principal and each dependent tab | Stable parent identity and consistent tab/section navigation | Existing three-plane browser journeys |
| Create presentation | Set up Profile/Preferences; add Notification Preference | Ordered published groups/help/actions; no tenant, parent, ID, version or audit inputs | Source/compiler/runtime tests; new declarations unpublished |
| Self editing | Ordinary user edits own eligible fields in all three dependents | Commit through Entity operations; immutable owner/tenant; authorized reference options | Pending live ordinary session |
| Administrator editing | Authorized administrator edits another user within tenant/plane scope | Same validation/concurrency rules; audit actor distinct from owner | Three-plane existing-release browser passes |
| Other-user denial | Ordinary user changes URL, parent scope, ID or mutation body to another user | Denial without target values, labels or protected-field disclosure | Server tests; live ordinary case pending |
| Restricted fields | Attempt protected/system/permission-restricted fields via UI and direct request | Inputs suppressed or read-only; forged write rejected | Three-plane administrator requests and server tests |
| Validation | Invalid required, enum, reference, range and length values | Safe inline errors; draft retained; no commit | Server/unit tests; full browser error checks pending |
| Inheritance | Preferences absent or explicitly cleared | Explain actual effective value/source; no invented default; authorized previews | Pending effective-value projection and live checks |
| Conflict | Two sessions edit same version | Second write rejected; draft retained; confirmed reload/review | Server/browser rejection passes; recovery UI qualification pending |
| Uncertain retry | Drop response after commit; retry unchanged input | Same key and receipt; one write/audit outcome | Submission identity tests and live API replay; fault-injected UI check pending |
| Revocation | Revoke exact self/edit grant through governed IAM while session remains open | New write and old idempotent replay denied; no stale labels/options | Pending actual committed IAM revocation |
| Source ownership | Confirmed unlinked, linked and unresolved fixtures | Local edit only for positively confirmed unlinked; linked source-managed; unresolved fails closed | Guard tests only; resolver/metadata integration pending |
| Atlas summary | Ordinary authenticated user asks about permitted Principal-family data | Authorized fields only, correct entity/record citations, no elevated Atlas session | Pending published AI capabilities and browser qualification |
| Atlas comparison | Ask for supported historical comparison | Authorized snapshot sources/citations; explicit unavailability when unsupported | Pending source admission and qualification |
| Release | Reproduce deployment including publication workload; verify required remote checks | Reviewed commit, immutable publication pins, CI checks and deployment receipts | Open |

Wave 2A is not complete and is not handed over as a release-ready manual QA build. Remaining gates are the workforce resolver/read state, effective preference defaults, governed ordinary-user/revocation checks, Atlas qualification, fresh governed publication of form metadata and frozen release evidence.

Additional runtime hardening: form metadata/loading is now keyed by session identity, permission set and experience revision. Inputs are withheld until values are initialized for that same access scope; late save responses from a previous scope cannot invoke navigation or publish status. This closes a stale-form disclosure boundary independently of server authorization. The latest Neon UI Profile browser receipt (`2026-10-01T10-22-31.288Z-220634/summary.json`) verifies dirty Cancel dismissal preserves the draft and the normal create/edit/replay/protected-field sequence still passes. Form runtime typechecking passes. The command timeline regression also bounds completion by stored start; no database constraint was weakened.

### Business-only edit and lazy single-record setup — 2026-10-01

Owner manual QA confirmed ordinary-user Profile creation/save, then identified technical fields reappearing on edit. Shared form fallback now omits non-writable inputs in both create and edit; explicit published form layouts remain exhaustive and may separately declare permitted read-only business fields. Profile and Preferences source layouts contain business inputs only. Editing submits changed fields only. Form grids use two columns on wide screens and one column on narrow screens.

Published single-record relationships can now declare bounded empty-state text, setup/edit labels and `creation: on_save`. This is accepted only for `zero_or_one`; metadata cannot request automatic placeholder creation. Principal's Profile declares “Profile has not been set up” / “Set up profile” / “Edit profile”. UI Profile declares its inherited-default state and “Customize preferences” / “Edit preferences”. Opening a tab or setup form performs reads only.

The published form contract can declare meaningful create fields. Records rejects empty setup before entering the mutation transaction; omitted, null and whitespace-only values do not count. Explicit false/zero preferences do count. No protected field names or database constraint details are exposed by this validation. Same-table unique violations become a safe `RECORD_ALREADY_EXISTS` conflict after transaction rollback. The related-section reload path requests draft-discard confirmation and reloads the existing child, without silently overwriting it.

Focused Records/form checks passed (35 Records tests, six presentation/error tests); authoring presentation/product tests passed (18), and Records/form/authoring typechecks passed. Live Neon Profile receipt `2026-10-01T11-07-16.589Z-471940/summary.json` confirms business-only editing, draft-preserving cancel, parent-scoped create/edit, idempotent replay and protected/stale rejection. Fixture cleanup passed. This receipt uses existing active publications, so it does not qualify new empty-state labels or meaningful-field metadata yet.

Four isolated successor drafts and compiler-pinned policy candidates are saved privately under `~/.athyper/instances/dev/evidence/principal-form-setup-20261001/`: Principal `e9485ad0-eb95-4a12-a2b2-591877b3688f`, Profile `fe4dde82-cd41-40d7-b178-e7a20f549454`, Notification Preference `06dab78f-d7ef-472b-8f02-2f9dd432a958`, UI Profile `6e5331de-b959-44de-8d20-c908d25e5530`. All remain drafts pending existing independent maker/checker enrollment. Apply dependent form successors before the Principal navigation successor; validate new active heads and browser behavior afterward. Old ambiguous enrollments are not reused.

The UI Profile empty-state explanation does not yet show an authorized effective-value/source preview. Workforce linked/unresolved source resolution is still unregistered; guard infrastructure alone is not deployed source ownership. These remain explicit Wave 2A gates, along with live ordinary-user/revocation, Atlas and release evidence. This checkpoint does not claim complete manual QA handover.

### Published editing increment — 2026-10-01, 11:54 UTC

Independent maker/checker approval completed for the four pinned successors. Active heads were verified in Neon, Studio and Mesh: Principal release 3 (`5f1d62f4-d41d-4687-8e40-2579d84a65eb`), Profile release 2 (`36193db0-63d2-4677-a047-a9bd1c4dff6c`), Notification Preference release 2 (`0f1a668f-3af1-49af-ab76-98fbe75035a7`), and UI Profile release 2 (`4b2bd5ea-062a-4e2f-8148-c117b10a878b`). Exact approvals, executions and active-head receipts are stored in the private `principal-form-setup-20261001` evidence directory above.

All nine administrator browser journeys now have passing receipts against these publications. Profile/Preferences checks include opening setup without a database insert, empty-save rejection, duplicate-setup conflict, business-only editing, draft-preserving cancellation, create/update, idempotent replay and stale/protected write rejection. Disposable fixture cleanup succeeded. Neon receipts begin `2026-10-01T11-48-19`; Studio Profile/Notifications use that same run, with Preferences rerun `2026-10-01T11-52-38.707Z-729987`; Mesh Profile/Notifications use `2026-10-01T11-52-38`, with Preferences rerun `2026-10-01T11-53-32.071Z-736341`. Keep initial failed receipts: Studio Preferences initially returned 403 during replay; Mesh Preferences initially timed out opening edit. Isolated reruns passed without code changes; their intermittent causes are not established.

The business-only edit/lazy-setup increment is available for manual regression testing. In Neon, sign in as `catl.finance` and open `/app/entity/principal/d04198ac-53cf-5e94-969f-b6f75f176fa2?section=profile&tab=profile`. Check Profile edit contains only business fields; cancel retains no unintended write; Preferences setup does not insert a placeholder; empty setup cannot save; meaningful values save and subsequently edit; other users remain inaccessible. Do not delete an existing personal profile merely to test the empty state—use an authorized test account without a child record.

This is a limited editing handover, not completion of Wave 2A. Effective-value/source previews, workforce source resolution, automated ordinary-user/actual revocation qualification, Principal-family Atlas qualification and reviewed release/remote CI evidence remain open.

### Wave 2A ordinary-user qualification — 2026-10-01, 13:03 UTC

The refreshed Neon `catl.finance` capture is authenticated at baseline assurance and verified against the expected Principal and CATL tenant. No elevated Atlas session or permission grants were added.

The ordinary-user Notification Preference browser journey passed against Principal release 3 and Notification Preference release 2: self create/edit, immutable server-derived ownership, business-only edit fields, draft-preserving cancellation, idempotent create replay, stale-version rejection and protected/invalid input rejection. Creating under `catl.admin` was denied before persistence; reading and patching a disposable preference owned by that Principal were denied with 403, and its stored value/version remained unchanged. Only uniquely marked test preferences were removed. Receipt: `~/.athyper/instances/dev/artifacts/notification-write-journey/2026-10-01T13-01-14.325Z-1197418/summary.json`. This proves denial with current grants, not actual revocation.

A separate read-only browser check opened and cancelled the ordinary user's Profile and UI Profile forms. Both contained business fields only; no record mutation was submitted. It did not alter the user's existing personal information or preferences. Receipt: `~/.athyper/instances/dev/artifacts/principal-self-form-read/2026-10-01T13-02-56.600Z-1208558/summary.json`.

Preserve the initial failed notification receipt `2026-10-01T12-56-17.271Z-1166863`: relay descriptor requests returned `502 RELAY_UPSTREAM_UNAVAILABLE` before a write. Later probes and browser runs passed. API logs showed a intervening process startup; a causal root diagnosis is not established. The unrelated `activity.inbox` descriptor returned 403 in the successful ordinary-user runs and is not counted as a Principal-family failure.

### Wave 2B implementation and draft checkpoint — 2026-10-01

The owner confirmed **explicit HR linkage of an existing Principal to Person/Employee, retaining its login**. Names and email are not linkage proof. No personal data is copied, no competing linked Profile is created, and no IAM/security table becomes generically editable.

DDL review identifies several constraints that must be resolved before writable onboarding:

- Person owns canonical personal details. Employee owns the internal workforce role; External Worker owns a separate workforce role. Employment/assignment facts remain outside personal Profile editing.
- Employee has tenant-bound Person and optional Principal foreign keys. Person uniqueness does not establish Principal uniqueness: competing Person sources must be rejected, rather than selecting the first matching Employee.
- External Worker has no direct Principal foreign key. Its linkage requires governed identity evidence; an absent Employee cannot prove an identity is unlinked.
- TrustIAM provisioning preserves Person identity, but the previously deployed local transport omits source plane/tenant coordinates. Cross-plane source ownership must retain and verify those coordinates; target tenant must not be substituted for source tenant.
- Profile saves and HR linkage must use the same transaction fence. An incomplete or RLS-filtered empty source query cannot certify an unlinked identity.
- A personal Address may have other owners. Self-service must update the governed owner use/materialization and cannot freely rewrite a shared Address row.
- Workforce tables without the framework's version and mutation guarantees remain read-only.

Implemented shared framework changes: table products can explicitly target Neon without manufacturing Studio/Mesh data targets; tenant-scoped read-only table publication is admitted only with read-only fields/operations and closed tenant authorization scopes; UUID reference metadata uses the existing validated key-reference contract. Storage, permission catalog, tenant scopes, foreign keys and dependency qualification still apply. The UUID metadata migration `20261001_entity_uuid_key_reference.sql` was applied to DEV Studio, with its ledger and receipt in the evidence directory below.

`createVerifiedProfileSourceResolver` now validates fenced, complete, owner/tenant-bound evidence and distinguishes confirmed unlinked, linked and unresolved/ambiguous states. It denies a competing local source and propagates authority outages. **This is tested resolver infrastructure, not a deployed authority reader.** There is no registered database reader, governed HR link operation or published Profile source binding yet.

The existing identity projection transport now carries `sourcePlane` and `sourceTenantId` from the authoritative TrustIAM row into the plane-local converge port and persisted identity-binding evidence, alongside Person, relationship, source reference and desired revision/hash. Invalid/missing source coordinates fail before a local transaction. Twelve focused identity saga/source-coordinate tests passed, including distinct source/application tenants; this preserves source coordinates without granting Person access or implementing the new HR link. It is a source implementation checkpoint, not a verified deployed linkage lifecycle.

The following Neon-only read candidates are compiled, validated and persisted as drafts. They have no write operations or newly granted permissions:

| Entity | Draft change set |
| --- | --- |
| Person | `7b8bbfab-24ee-4c72-98d2-2ab9a30fd982` |
| Employee | `3f0d61d0-45eb-4e12-9add-20a8511f456c` |
| External Worker | `5b863f1d-ae3d-4b0e-884d-40acc0f9fd33` |
| Address with registered section component | `ae88cd34-5d07-4885-862b-cc9bd6627d2c` |
| Person Address Use | `4bbfa46d-918d-4265-ba21-4cf740237ba1` |

Address declares `platform.address.fields.v1` with published role-to-field mappings. Shared form and detail runtimes render admitted fields through existing field controls; the component has no fetch or mutation authority. Authoring/runtime parsing rejects arbitrary renderers and undeclared dependencies, and authorization projection drops mappings containing denied fields. The publication registry includes the renderer. The earlier Address draft `398373e4-348b-4681-8c9e-441dda15be21` predates the component and remains preserved as historical evidence.

Focused verification passed: 15 Records source/component tests, 18 host publication tests, 12 workforce/plane authoring tests and six section/form presentation checks. Records, shared form runtime and host typechecks passed. Draft import reported zero validation issues and passing stored-graph contract tests. Private receipts: `~/.athyper/instances/dev/evidence/principal-wave2b-20261001/`.

Publication is **not requested** for these candidates, and no runtime activation is claimed. Person and its children form a dependency cycle: bootstrap Person without child sections, publish eligible dependent entities, then publish the standard Person successor with its relationships. Do not bypass the active-dependency gate. New workforce permissions must be installed and qualified through the governed catalog before publication.

Remaining Wave 2A gates: effective defaults/source previews, full Profile/Preferences ordinary-user write and denial coverage, actual revocation, linked/unresolved source behavior, Principal-family Atlas summaries/history/privacy and release evidence. Remaining Wave 2B gates: database authority/fencing and governed HR linkage; source-managed display and authorized cross-plane access; writable Person/workforce policy and concurrency contracts; governed Address ownership/materialization; publication, three-plane browser/Atlas qualification and release evidence. This checkpoint is not workforce manual-QA handover.

### Wave 2A/2B resumed checkpoint — 2026-10-02, 00:32 MYT

This checkpoint supersedes the earlier statement that no database authority reader or HR link handler exists. It does **not** mark either wave complete.

The Neon migration `20261001_principal_person_source_authority.sql` is applied and recorded in the migration ledger and Neon manifest. Its SHA-256 is `0be06079370482c8af7f1e12917680998cfea46d695dffcb843a0b466705ebe8`; preserve this applied migration. It adds the tenant-qualified Principal–Person link, complete bounded source enumeration, shared Principal-row transaction fences on explicit links, Employee and identity-binding writes, and a Profile database guard. Confirmed unlinked users retain local editing; linked or unresolved sources prevent competing local writes. Explicit linkage retains the existing login and does not copy Person data or grant IAM roles.

The shared Records service registers the Neon database reader and `identity.principal.link_person.v1` action handler. The handler derives company scope from active stored Employment, checks `neon.workforce.profile.write`, and passes an actor/tenant/target/revision-bound transaction gate to the link routine. Direct application-role link-table writes are denied. External engagements still require their own qualified scope implementation; an external worker is not inferred to be an employee. HR-only action ownership admission must also be qualified before publication; do not grant broad Principal administration to work around it.

Registered transactional Entity actions now support a domain authorization preflight before idempotency replay. The HR link handler uses it to recheck current company scope. A focused regression demonstrates that a revoked domain decision denies replay without rerunning the handler or appending audit/outbox effects. This is a service-level revocation check, **not** proof of actual DEV IAM grant revocation.

Publication admission checks the installed reader, privileged routine ownership, RLS-complete execution, all four write fences, absence of PUBLIC routine execution and absence of direct application link writes. Only Neon qualifies. Disabled or replication-only fences, a publicly callable reader, an RLS-incomplete reader and application INSERT privilege each fail admission in an isolated database. Compiler source fingerprints now include Records, so this qualification policy is covered by successor compiler pins.

The successor preparation tool accepts `--source-authority=<registered-key>`. It amends only the published owner-source binding, preserving fields, permissions, storage and operations. A Profile successor dry run passed graph compilation, idempotent preparation and stale-predecessor rejection, then rolled back. **No successor draft, approval or release was persisted.** The active Profile publication targets Studio, Neon and Mesh; the Neon-only reader is insufficient to activate its source-bound successor across that target set. Complete the other-plane authority contract before requesting that publication.

DEV source applications were restored after their existing containers had stopped. Infrastructure and application health recovered. Fresh normal Neon browser qualification passed:

| Actor / journey | Result and evidence |
| --- | --- |
| `catl.admin`, Profile | Lazy setup inserts nothing until save; parent-scoped create/edit; business-only edit fields; immutable ownership; idempotent replay; empty/duplicate setup and stale/invalid writes rejected. Fixtures cleaned. `~/.athyper/instances/dev/artifacts/principal-write-journey/2026-10-01T16-19-48.774Z-142506/summary.json` |
| `catl.finance`, Notification Preference | Self create/edit; other-parent create and other-record read/edit denied with no stored changes; business-only fields; retry, cancellation and stale/protected input checks passed. Fixtures cleaned. `~/.athyper/instances/dev/artifacts/notification-write-journey/2026-10-01T16-24-56.185Z-165755/summary.json` |

Retain the earlier failed receipts for stopped-API/expired-session attempts. The successful ordinary-user run also recorded an unrelated Activity Inbox descriptor 403; it is not evidence of Principal-family failure.

Private migration, installation, baseline and isolated concurrency receipts are under `~/.athyper/instances/dev/evidence/principal-link-20261002/`. Both Profile-save-first and HR-link-first races passed with observed database blocking; the link-first Profile attempt left no dummy row. RLS-hidden Employee evidence still resolved as linked. The isolated database was removed. Focused authoring, Records and host publication tests passed; authoring, Records and host typechecks passed for this checkpoint.

**Still open for 2A:** effective preference defaults, full ordinary-user Profile/UI Profile writes and denial, actual IAM revocation, source-managed/unresolved presentation, Principal-family Atlas and release evidence. **Still open for 2B:** published HR action and narrowly scoped admission, source-bound publication across supported planes, authorized Person/workforce writes, external-workforce scope, Address ownership/materialization, deployed source display, three-plane browser/Atlas qualification and release evidence. The five read-only workforce drafts remain unpublished. No workforce manual-QA completion is claimed.

### Domain ownership and release pin follow-up — 2026-10-02, 01:11 MYT

The approved `services/workforce` boundary is present: HR linkage and verified source rules live in `identity/`, the database reader in `adapters/`, and workforce installation qualification in `publication/`. Generic Records source/action interfaces and transaction controls remain in Records. Host composition registers the workforce implementations; no new Entity route or bespoke UI was introduced. Root `AGENTS.md` records this domain-ownership rule.

The publication compiler fingerprint now includes `@athyper/server-service-workforce`, covering domain qualification after the package move as well as the generic Records code. Fresh successor policy enrollment must pin the current compiler fingerprint; do not reuse an older pin to bypass review. The current fingerprint resolves successfully. Twenty-one workforce tests and nine host publication tests passed. Host and workforce typechecks passed. The installed DEV source qualification still admits Neon and rejects unsupported Studio/Mesh; this follow-up does not close cross-plane resolution or activate a new publication.

Principal-family Atlas qualification also needs an explicit published AI contract. The inspected Principal and Profile product definitions do not yet declare one, and Profile fields include PII classifications. Their authorization and data-class policy must be qualified before enabling responses; a normal authenticated session does not itself authorize personal-data disclosure.

### Source-managed read/display implementation — 2026-10-02, 01:33 MYT

The shared Entity list contract now carries an optional server-evaluated `sourceAuthority.state` (`local`, `linked`, `unavailable`). It contains no source coordinates, ownership revision or personal data. The parser rejects unknown states, coerced values and additional coordinate properties. Entities without a published source-authority binding retain their existing behavior.

For a source-bound Entity, the Records list executor derives its owner from a server-validated locked parent predicate or the server's self-owner policy, never client filters. It authorizes that owner before resolving source state. Linked/unavailable states withhold local rows and counts; an administrator's unscoped owner list requires an explicit authorized owner. Direct detail reads recheck source ownership and reject competing local data. Hidden ownership fields remain internal to this check and are not added to the response projection.

The standard related-single-record section renders a managed-source notice for linked identities and an unavailable/retry state for unresolved identities, with setup/edit controls absent in both states. It renders neither a dummy row nor stale local Profile details. This is shared runtime behavior selected by published source metadata, not a Principal-specific page. Canonical Person display and cross-plane source access still require independently authorized reads and remain open.

Seven focused source-read/contract tests passed, including withheld rows/counts, hidden owner fields, other-owner denial before resolution, client-filter isolation and strict DTO parsing. Records, Entity list contract, shared form/detail runtime and host typechecks passed. Twenty-one workforce tests also passed. A fresh Neon administrator Profile browser create/edit regression passed against the unchanged active release 2, with fixture cleanup: `~/.athyper/instances/dev/artifacts/principal-write-journey/2026-10-01T17-28-55.800Z-436256/summary.json`. This is an existing-publication regression, **not live qualification of the unpublished source-state behavior**.

The owner selected `catl.admin` and `catl.finance` for qualification. Use `catl.admin` as the intended HR actor and `catl.finance` as the ordinary-user actor; usernames do not grant rights. A read-only direct group-role inventory found no direct `neon.workforce.profile.write` grant for either account, and only a tenant/exact `neon.workforce.pii.read` row for `catl.admin`. This inventory does not evaluate inherited grants, denies or runtime context. Qualify current company-scoped HR authority through existing governed IAM operations before positive workforce writes or actual revocation; no grants were added here.

No new publication or activation occurred. Cross-plane authority, canonical source display, narrowly scoped HR action admission, workforce writes, actual IAM revocation, Atlas and release evidence remain open. Do not mark Wave 2A or 2B complete on these implementation tests.

### Cross-plane authority installation — 2026-10-02, 02:03 MYT

The forward migration `20261002_projected_profile_source_authority.sql` is applied and ledger-verified in DEV Studio and Mesh. Its SHA-256 is `3d4570e4f2d4eb9efe4ac6fce17288f9d6997643659c9dc953d95a22dc8779f9`; preserve this applied migration. Both manifests include it. Neon continues using its existing reader and migration. The Workforce database adapter selects the installed plane-specific routine and retains the selected owner's original source coordinates.

Studio/Mesh enumerate protected TrustIAM projection evidence under a complete reader and Principal-row fence. Active, synced projection evidence must match the Principal's TrustIAM identity and include the original Neon tenant, Person identifier and projection version/hash. Missing, pending, inactive or malformed evidence remains unresolved. No username/email matching, tenant substitution, personal-data copying or source read permission is inferred from a link. This installs projected ownership support; it does not prove current canonical Person access or distributed source freshness.

Isolated Studio and Mesh qualification passed local setup, unresolved/linked transitions, hidden-binding completeness, original source tenant retention and prevention of competing Profile writes. Both Profile-first and projection-first races observed real database blocking. Projection-first setup left no Profile row. Publication admission rejected disabled/replication-only fences, PUBLIC routine execution and RLS-incomplete readers. The isolated databases were removed. Private receipts are `projected-source-concurrency.json` and `projected-source-installed.json` under `~/.athyper/instances/dev/evidence/principal-link-20261002/`.

Registered Entity actions now have an optional transaction-scoped `resolveAuthorizationResource` port. The Workforce implementation derives company scope from stored active Employment and verifies the exact published handler and permission before returning it. The shared action service independently checks the published permission with that resource, pins tenant/entity/record/action/descriptor coordinates itself, and rechecks domain authorization before receipt replay. It does not accept client company selectors as authority. This fixes the missing company resource in the outer action check; it does **not** widen the published tenant/owner authorization profile or bypass Principal RLS. Company-scoped HR-only target admission still needs a separately qualified contract. No IAM grants were added.

Verification passed: 28 Workforce tests, eight focused Records source/action tests, and Workforce, Records and host typechecks. Adapter tests cover all three routine selections, selected-owner retention, unsupported planes and missing evidence. Action tests cover independently denied published permission, revoked domain permission, replay ordering, immutable resource coordinates and incorrectly published link registrations.

A real Profile successor draft is persisted: change set `7e7dbd68-84a0-42ac-b886-2481ff683bd4`, request `7a3bd71e-1928-4d1a-8f0b-b64574e08daa`, contract hash `4e6ca752a7db5b4098df2784ff795e029501acd787c4122b6036bcd1edbe7ef2`. It changes only the owner source binding to `identity.profile-source.v1`; preparation verified idempotency and stale-predecessor denial. A three-plane successor policy candidate with current compiler pins is saved as `profile-source-policy-candidate.json`. The independent maker/checker publication workflow has not yet recorded or activated that proposal. Active Profile remains release 2 until execution succeeds.

Normal saved Neon `catl.admin` and `catl.finance` sessions were verified authenticated. Studio and Mesh saved sessions returned anonymous and refresh was requested for post-publication checks. Publication operator sessions were expired; a fresh maker sign-in was requested for the prepared exact successor, with checker sign-in to follow. These are distinct from ordinary Atlas authentication.

**Still open:** canonical Person summary through an independently authenticated/authorized source Entity read; governed cross-plane actor/context delegation and source freshness; published HR linkage and narrowly scoped target admission; actual `catl.admin` company grant qualification and IAM revocation; workforce writes, Address integration, Atlas privacy/citations, deployed browser checks and release evidence. No Wave 2A/2B completion or workforce manual-QA handover is claimed.

### Canonical summary and scoped HR implementation — 2026-10-02, 07:00 MYT

The verified source resolver now retains its canonical Entity coordinate internally. The shared list executor exposes a minimal canonical record reference only after an independent ordinary Entity read succeeds under the **unchanged** authenticated plane and tenant. It withholds competing local rows and never substitutes the source tenant or actor. Cross-plane/tenant sources continue to show the managed-source state until a separately governed source-context delegation is installed. A link is not a read grant.

The standard related-record runtime re-reads an admitted canonical reference through the existing detail API and renders the existing published field layout and authorized field values. Local setup/edit remains absent for linked identities. The list parser permits only a `linked` canonical reference with an Entity key and UUID; it rejects extra coordinates and references attached to local/unavailable states. Source reads denied by permissions, missing publication or unavailable adapters do not disclose a reference. Canonical Person live display still requires Person's publication/read policies; the existing Person draft is not activated.

The shared registered action service supports an optional bounded `readTarget` port, with mandatory current domain authorization. It rejects mismatched target identity and preserves optimistic-version, receipt, audit and outbox controls. The Workforce HR action uses a narrowly scoped security-definer reader returning only the pinned active Principal ID, under its actor/tenant/Employment/company/source-revision gate. It grants neither Principal field visibility nor generic IAM/profile edits. The forward Neon migration `20261002_principal_person_link_target.sql` is applied and independently installation-qualified, SHA-256 `987b280731392a01b17b7c0abc1d9e389329e2aa6aa8ed04e508984a2e5e8a26`; preserve this applied migration.

An installed, metadata-qualified registered-action authorization adapter now evaluates the published exact handler/permission with fresh IAM evidence. Company scope and IAM operation binding remain mandatory, and MFA/SoD/entitlement/deny controls are retained. The outer tenant authorizer admits this separate action boundary without granting tenant-wide owner administration. Host runtime adapters and the composition registry are now included in compiler source pins. The link handler is installed; its authoring/publication binding and live governed grant are **not** complete.

Isolated Neon database checks passed the bounded target reader with otherwise hidden Principal RLS. Missing gate, wrong actor, wrong company and wrong target were denied; generic Principal reads remained hidden after successful target admission. The prior Profile/link concurrency checks also passed, with fixture database cleanup. Private receipts: `hr-target-isolated.json` and `hr-target-installed.json` in the existing evidence directory.

Thirteen focused Records tests passed, including independent canonical read admission, cross-plane/tenant context refusal, strict reference parsing, target identity/version enforcement and domain replay revocation. Twenty-eight Workforce tests passed. Thirty-one focused host action/owner tests passed, including exact-company admission, publication/handler mismatch, missing bindings and deny/MFA/SoD controls. These service tests are not deployed grant-revocation evidence.

Read-only inventory through the **actual** DEV Kysely effective permission resolver found no `neon.workforce.profile.write` allow/evidence/scope for either `catl.admin` or `catl.finance`, and no Principal `link_person` operation binding. Receipt: `effective-hr-authority.json`. This includes effective authority resolution, unlike the earlier direct group-role inventory; it is still not an authenticated write journey. No grant was inserted or revoked. Positive HR and actual IAM revocation qualification require a governed company-scoped grant and published operation binding first. Do not use broad Principal administration or raw security-table writes as a workaround.

The existing Profile successor policy candidate has been refreshed with current source/runtime pins. Publication operator sessions are expired; a fresh maker sign-in was requested. No new proposal, checker approval, release or target activation is claimed for this checkpoint. Pending: registered-action authoring/publication qualification, governed HR grant, Person publication/self/HR read/write policies, cross-plane source delegation, actual revocation, normal-session browser/Atlas qualification and release evidence. Wave 2A and 2B remain open.
