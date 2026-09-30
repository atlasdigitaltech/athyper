# Meta Entity Activity — implementation plan

Status: Delivery A/B/C reusable implementation and local validation complete. Compatible DEV services restarted. Country release 9 remains active on all three planes; the Timeline successor draft and exact policy candidate are prepared, awaiting authenticated proposal, independent MFA approval and signed publication. Live acceptance remains pending.
Date: 2026-09-28. First enrollment: the existing Country shared-reference product.

Delivery A implementation checkpoint: [source changes, verification and remaining provider boundaries](entity-activity-delivery-a.md). The comparison foundation is implemented; live acceptance and Delivery B/C remain separate.

Delivery B is in progress: [B1/B2 APIs, B3 consistent manual capture, B4 reusable collection UI and onboarding acceptance](entity-activity-delivery-b.md). UI fixtures and Country source-metadata regressions pass. Optional/independent capture contracts are now implemented; concrete provider/entity onboarding and live acceptance remain pending.

Delivery C: [Timeline, audit filters and validation](entity-activity-delivery-c.md). [Country publication handoff](../../reports/activity-delivery-publication-20260928.md).

## Agreed product scope

Record navigation ends with **Comments → Attachments → Activity**. Activity uses the existing docked/full workspace interaction, with **Audit log → Versions → Saved snapshots** inside it. Unsupported or unauthorized views are hidden. A navigation click initially opens full view; switching side/full preserves filters, selection, and scroll. Comparison expands to full view. Compact screens use full view, with one record panel open at a time and URL/back navigation preserved.

Generic Revisions, Evidence, Requests, restore, and audit exports are outside this build. Record information stays in the footer for current metadata and collapsed, authorized technical details. History data is lazy-loaded separately from the record aggregate.

Share panel infrastructure and reusable Activity components. Do not route Activity through Comments or Attachments services. No entity-specific implementation filenames, folders, routes, handlers, or renderer branches. Country-specific configuration belongs only in its existing metadata product directory; all new implementation and test modules use generic feature names.

## Product separation and navigation — agreed UX direction

Keep **Activity & History separate from Collaboration and the global Activity Center**. These are distinct product responsibilities even when they reuse presentation components.

| Area | Contains | Scope and purpose |
|---|---|---|
| **Activity Center** | Notifications, Inbox | Across records: “What needs my attention?” |
| **Collaboration** | Comments, Attachments | Current record: “What are we discussing and sharing?” |
| **Activity & History** | Timeline, Audit log, Versions*, Saved snapshots | Current record: “What happened, and what changed?” |

*Versions is visible only when an authoritative history provider is available and the viewer is authorized.*

- Keep record navigation simple: **Overview → Comments → Files → Activity**. Files is the current UI label for Attachments. These logical groupings do not introduce another navigation level.
- Use **Activity** for the short navigation label and **Activity & History** for its workspace heading in the upcoming UX implementation.
- Reuse the existing side/full panel framework across Comments, Files and Activity. Shared panel infrastructure does not place Activity inside the Comments or Attachments feature or service.
- Keep reusable record Activity components in the entity runtime; keep global notifications/inbox in the shell Activity Center. Global items may deep-link into an authorized record Activity view without duplicating history storage or UI logic.
- Drive available views and actions through the published Meta Entity Activity profile, qualified providers and current authorization. Country currently exposes Audit log and manual Saved snapshots. Delivery C now implements Timeline; Country’s pending successor enables its event binding; Versions remains hidden for Country.

## Review findings that change the initial enrollment

Country is stored in `shared.country`, with no tenant field and no record-version field. Its published reference operations are read-only. Enabling history must not introduce Country edit permissions, writable reference fields, or a made-up version counter.

Initial Country behavior:

- Audit log: authorized direct-record events from declared identities. Empty history is valid; no audit events are fabricated from created/updated timestamps.
- Saved snapshots: manual, tenant-scoped captures of the authorized shared record. Capture changes snapshot storage, never shared Country data. Source record version is absent and displayed as unavailable.
- Versions: unavailable until an authoritative provider exists. Snapshot capture numbers are never presented as record versions.
- Automatic capture: off for this read-only product. Future governed reference updates need an explicit owning write path and capture policy; frontend activity navigation cannot enable one.

Platform-scoped audit rows (`tenant_id IS NULL`) must not be mixed into a tenant feed by changing a predicate to `tenant_id = current OR tenant_id IS NULL`. A future platform-history projection requires explicit authorization and safe field projection. Initial tenant reads remain tenant/plane scoped. Multiple tenants may independently capture the same shared reference record without seeing each other's saved snapshots.

## Permissions and global profile

Preserve the requested service permission identifiers and map them explicitly to the repository's four-part `{product}.{domain}.{entity}.{operation}` catalog convention. The common product namespace follows the existing cross-entity capability pattern:

| Action | Canonical permission | Existing service identifier | Additional admission |
| --- | --- | --- | --- |
| Query audit events | `common.audit.event.query` | `audit.event.query` | Published capability, parent record access, permitted event and field projection |
| Read committed version headers, when supported | `common.audit.event.query` | `audit.event.query` | Authoritative version provider, parent access; snapshot payload requires snapshot-read access too |
| List/read/compare snapshots | `common.records.snapshot.read` | `records.snapshot.read` | Parent access and authorization for each requested snapshot and field |
| Manually capture | `common.records.snapshot.capture` | `records.snapshot.capture` | Enabled capture action, parent access, authorized capture projection |

No entity-prefixed permissions or wildcard namespace exceptions are needed for initial enrollment. The catalog currently rejects the three-part service identifiers; the exact common tuples and their service-authorizer mapping must be registered and qualified through the existing permission catalog and publication workflow before runtime activation. Register only these explicit mappings, never a general prefix-stripping alias. Their existence in a service route is not proof of deployed catalog registration. No role grant is implied by a profile, UI visibility, or source configuration. If an entity requires stricter access, bind additional declared entity policy rather than replacing a capture permission with a read permission.

Global source profile: **`platform.activity.standard`, version 1**, using the existing versioned capability-profile envelope and locked file-resolver convention. This is the shared default, not a Country-owned profile. The source is pinned and hashed into the eventual publication. Runtime readers do not reread mutable profile files.

Entity source selects the exact profile version and optionally supplies permitted overrides. No overrides means all generic defaults. Initial default: Audit log and Saved snapshots, Audit log first, manual capture enabled, automatic capture disabled, standard retention. Version-history enablement is explicit and requires a provider.

Override rules permit only declared view subsets/default view, disabling manual capture, and reviewed retention choices. Permission codes, service/handler identities, parent admission, tenant/plane scope, and sensitive-field access cannot be overridden through profile values. Enabling automatic capture or Versions needs a reviewed successor profile with supporting providers, not an unrestricted boolean. Source policy resolution alone does not activate a capability.

## Creation policies and runtime wiring

Keep presentation, recording, and access policy separate. Hiding a view does not disable required recording. Automatic capture does not depend on the editor having manual-capture or history-browsing permission.

Published Meta Entity configuration eventually resolves into:

1. Capability declaration: enabled, service/owner, lazy loading, excluded from aggregate data.
2. Profile reference and governed overrides: effective presentation and capture defaults.
3. Operation bindings: exact permission/handler tuples and idempotency requirements.
4. Provider/capture bindings: record identity mapping, history coverage, declared projection, and owning mutation integration.
5. Immutable policy artifacts and dependencies: profile hash, plane, release identity, supported runtime version.

Audit is created by operation/security/domain services. Successful record versions are created by the owning mutation service. Snapshots are created by the capture service, either explicitly or through a configured write hook. Reads, failed validation, denied operations, and command retries do not create committed versions. A snapshot capture may itself emit one audit event, but that event must not recursively trigger another capture.

Required history/capture is written with the business transaction. A capture failure rolls back a mutation when the published policy requires it. Optional asynchronous capture must retain exact committed state or an immutable version reference in the transaction; a later read of the live row is insufficient. Failure/denial audit uses its established independent recording path when the business transaction rolls back.

For automatic capture, payload coverage is a declared server projection, independent of the editing user's field visibility. Returned history is filtered using the viewing user's current access. For initial manual capture, preserve the existing authorized read projection and record its coverage. Do not claim complete aggregate backup.

Resolve logical audit entity codes and snapshot storage types through published metadata. Generic audit writes currently use logical entity code; snapshots use schema-qualified storage identity. Do not infer ownership through a shared correlation ID or expose arbitrary browser-selected relations.

## Delivery sequence

| Step | Deliverable | Completion gate |
| --- | --- | --- |
| 1 — source foundation (completed locally) | Shared profile, closed effective-policy validator, exact permission/action vocabulary, generic offline candidate preparation, existing Country metadata enrollment source | Defaults/overrides isolated; unsupported history/capture combinations rejected; Country remains read-only; no runtime activation implied |
| 2 — publication integration (completed locally) | Extend Meta Entity capability kind, authoring DDL/repository, Core/Operation parsing, profile artifacts, compiler, registries and runtime descriptor | All three planes qualify immutable dependencies and exact permissions; older releases continue to parse; Activity cannot activate without runtime providers |
| 3 — authorized Activity APIs (completed) | Authorized audit queries; snapshot listing, read, compare and manual capture through generic Activity services/routes and providers | Verified locally: tenant/plane/parent/field authorization, cursor binding, compatible comparison, no-store responses, idempotent manual capture and coverage |
| 4 — reusable UI (completed locally) | Activity navigation after attachments, shared side/full panel, audit/version/snapshot views, comparison, capture feedback, localization and footer integration | URL/back, focus, responsive layout, selection preservation, identity reset and access-denied behavior |
| 5 — authoritative Versions/automatic capture (adapters completed) | Immutable root ledger, transactional create/patch/lifecycle hook, reusable recorded-root profile, authorized Versions API/UI and declared-coverage automatic snapshots | Verified rollback, no-op/replay, tenant/plane isolation and provider qualification; aggregate/domain/delete recording adapters verified; deployment-specific owning registrations required; Country remains read-only |
| 6 — Country publication and acceptance | Prepare successor from current signed head; deploy compatible code; governed permission enrollment and signed publication; per-plane receipts | Authenticated API/browser checks, tenant isolation, permission revocation, no reference mutation, and rollback/withdrawal checks |

Steps 1–4 now provide source authoring, publication, authorized APIs/providers and reusable UI. The initial generic root-record provider in step 5 is now implemented. Aggregate/domain/delete adapters and deployed publication/acceptance in step 6 remain pending.

**Phase 3 completed — 2026-09-28:** authorized audit queries and snapshot listing/read/compare/manual capture are implemented and verified locally. Completion covers the API/provider build and its validation; deployment, governed grants, signed publication and live Country acceptance remain tracked under Phase 6.

### Foundation checkpoint — deliverables 1 and 2

- **Meta Entity authoring:** `activity` is a recognized capability kind in the graph and Studio DDL. Existing repository member serialization stores its profile selection, reviewed profile snapshot, and permitted overrides. Activity requires profile-based authoring. Country's existing `activity.json` now enters the normal offline reference graph; no entity-specific implementation was added.
- **Profile publication:** compilation emits an owner-bound `activityBinding` and a same-plane, hash-pinned `capability_profile` dependency. Core/Operation parsing, graph dependencies, compiler registries, and cold/cached runtime readers validate this binding. Existing Comments/Attachments suites continue to pass. Readers without Activity support reject these new normative fields; deployment must precede activation.
- **Permission registration:** canonical DDL and additive migrations register the three exact common permissions in Studio, Neon, and Mesh with exact tenant scope. Studio also gets the capability-kind migration. Catalog tooling validates their UUIDs, risk tiers, and scopes. No role grants are included.
- **Runtime bindings:** the reusable Activity policy resolves admitted releases, checks tenant/principal/plane/entity coordinates and parent access, then authorizes exact actions. Capture requires an idempotency key. The service authorizer adapter translates only the three reviewed aliases. These foundations now admit the Activity HTTP routes implemented in deliverable 3.
- **Publication qualification:** the host registers Activity functions when its authorized record reader is installed. Publication requires actual section/action functions, the live canonical permission definitions, RLS-enabled snapshot/audit persistence, and the security-definer capture function with execute privilege. Compiler registry vocabulary alone cannot satisfy this gate. Versions and automatic capture require the qualified recording provider described in Phase 5; the reference profile remains unchanged.
- **Successor preparation:** `amend-successor-capabilities.ts` updates only requested capability members and preserves the predecessor's other graph branches. The existing development successor command accepts `--capability-product=<directory>` for the generic path; its collaboration-only flag remains restricted. Draft preparation never supplies approval or activation evidence.

Offline candidate inspection:

```sh
pnpm exec tsx server/db/scripts/provisioning/prepare-entity-activity.ts \
  --product=metadata/products/shared/entities/country --plane=neon
```

Studio and Mesh are also supported. The output includes the canonical `authoringMember`, inherited global defaults, exact required permissions, and remaining activation gates. It stays `unpublished_activity_candidate` with `activationReady: false`. Country remains read-only, with manual tenant-local snapshots and no committed version history.

Validation performed:

| Suite | Result |
| --- | --- |
| Publication contracts | 211 passed |
| Publication service | 381 passed |
| Studio authoring, including generic successor preservation | 217 passed |
| Metadata runtime, including cold/cached Activity pins | 95 passed; 2 existing integration tests skipped |
| Experience runtime, including Activity admission and exact alias bridge | 162 passed |
| Host capability qualification | 27 passed |
| Activity preparation, catalog/scope validation, isolated PostgreSQL DDL | 9 passed |

The DDL test uses an explicitly selected local image (`ATHYPER_ACTIVITY_DDL_IMAGE`) and a disposable, network-isolated PostgreSQL 16 cluster. It executes canonical permission seeding and its migration repeatedly across all three plane settings, checks conflict rejection, and exercises the Studio capability migration without changing the dev database. It uses minimal prerequisite tables; it is not a complete installation rehearsal.

Publication contracts, publication service, Studio authoring, and metadata source/test typechecks pass; experience source typecheck passes. Whitespace validation passes. Broader repository checks retain these existing blockers:

- Host typecheck: the attachment fixture in `qualify-document-malware.ts` lacks `failInspection`.
- Database typecheck: cross-package `rootDir` diagnostics in the normal command; with workspace root supplied, 19 existing diagnostics remain in other scripts, including the pre-existing navigation assignment in successor preparation.
- Migration layout: the `20260926_compiled_runtime_publication_source.sql` manifest/inventory mismatch and unclassified `20260928_capability_profile_authoring.sql`. The new Activity migrations are inventoried with matching hashes.
- Metadata layout: missing relocation target `metadata/products/mdg/entities/business_partner_commodity_capability/core.json`.

### Current build checkpoint — deliverables 3 and 4

Implemented the generic authenticated Activity API, tenant/record-scoped snapshot repository, pinned shared-reference provider, and host registration. Added the authorized descriptor flag and reusable Activity workspace inside the existing side/full panel. Country remains configuration-only; no Country-specific component, route or provider was added.

UI refinement completed: token-based audit timeline and outcome badges, shared collaboration gutters, keyboard/RTL navigation, snapshot selection guidance and clear action, loading/empty feedback and dismissible details. English, Malay and Arabic labels use the existing catalog; current Record information remains in the shared footer.

The [API and UI implementation notes](entity-activity-api.md) document routes, payload version-2 coverage, current-field filtering, comparison compatibility, command replay, cursor lifetime, initial shared-reference admission, and deployment requirements. Remaining candidate gates now refer to deployed provider/catalog qualification and signed-release acceptance rather than unfinished API/UI source work.

Validation for this checkpoint:

| Check | Result |
| --- | --- |
| Experience service/routes/admission suite | 166 passed |
| Records suite | 313 passed; 4 opt-in database tests skipped in the ordinary run |
| Isolated Activity PostgreSQL test, explicitly enabled | Passed: real snapshot functions/triggers, immutable coverage, tenant isolation, concurrent replay, paging and rollback |
| Relevant host provider/publication/qualification suites | 47 passed |
| New Activity browser scenarios | 7 passed, including timeline/selection controls and compact Arabic/RTL |
| Existing detail-collaboration browser regression | 24 passed |
| Record footer browser regression | 2 passed |
| Existing descriptor contract tests | 10 passed |
| Offline Activity preparation | 5 passed |

Records source/test, experience source and focused Activity tests, focused host Activity tests, descriptor client and form-detail typechecks pass. The host-wide attachment-fixture diagnostic and broader layout/database blockers listed above remain unrelated and unresolved. The full-view comparison was also inspected visually in the browser fixture.

At the Phase 4 checkpoint, no live database migration, role grant, signed successor release, or Country activation had been performed. The next rollout deliverable is governed publication and authenticated live acceptance; The new root-record provider is separate from, and not a prerequisite to, the agreed Country audit/manual-snapshot scope.

### Phase 5 checkpoint — authoritative root history and automatic capture

Implemented `platform.records.history.v1`, the immutable `snapshot.record_version` ledger, same-transaction recording/capture hooks, locked `platform.activity.recorded-root` profile, publication/runtime qualification, and authorized Versions API/UI. The provider derives its projection from Meta Entity fields and is reusable across qualified tenant-owned root records. Manual and automatic snapshot envelopes can be compared under current field authorization when their contracts match.

See [recording provider implementation and validation](entity-activity-recording.md) for exact operation coverage, no-op/replay semantics, migration inventory, tests and rollout gates. Country stays on its standard read-only profile. Aggregate and custom-domain recording now use explicit installed owning adapters; deletion has hard/soft tombstone support. Missing owning registrations still fail closed.

## Files and ownership

| Responsibility | Existing owner/location |
| --- | --- |
| Policy and permission contracts | `server/packages/contracts/publication/src/` |
| Shared profile source | `metadata/profiles/activity/` |
| Country enrollment data only | Existing `metadata/products/shared/entities/country/` |
| Locked profile loading and authoring validation | `server/packages/planes/studio/meta-entity-authoring/src/authoring/` |
| Generic offline preparation | `server/db/scripts/provisioning/` |
| Capability persistence | `server/db/ddl/planes/studio/metadata/` and additive migrations |
| Snapshot storage and functions | `server/db/ddl/common/snapshot/` |
| Record snapshots/capture integration | `server/packages/services/records/src/` |
| Activity admission/read projection | `server/packages/platform/experience/src/` with owning audit/snapshot services |
| Runtime registration | `server/apps/platform-host/src/composition/` |
| Reusable record UI | `packages/platform/entity/runtime/form-detail/src/` |
| Client contracts and localization | Existing entity-runtime/descriptor-client and platform i18n packages |

Extract or generalize the shared record-panel mechanics only where needed. Preserve Comments/Attachments behavior and avoid duplicating the existing shell, portal, URL-state, or resize implementation.

## Read and storage requirements

- Audit cursor uses a stable event timestamp/ID order and fixed upper bound; snapshot listing uses stable captured time/ID order. Bind cursors to record, tenant, plane and query filters.
- Filter values, counts and search results before response serialization. Do not return unauthorized rows for client filtering.
- Comparison authorizes both snapshots and checks record identity, contract compatibility, and coverage. Distinguish missing, null, withheld and uncaptured fields.
- Existing immutable snapshot identity/payload tables remain authoritative. Add coverage metadata compatibly; existing captures have unknown coverage rather than an invented manifest.
- Named bookmarks are optional later work; they must not mutate or delete immutable captured state.
- Initial audit lookup is direct-record only. Related-record providers need declared ownership and separate authorization.
- Snapshot payload state, current concurrency version, schema/release reference, and snapshot sequence remain distinct in all APIs and labels.

## Acceptance matrix

Contract tests cover shared defaults, exact profile pins, permitted override boundaries, unknown fields, source drift, immutable-source isolation, no permission replacement, and rejected unavailable providers. Use a second generic entity fixture to prove no Country-specific implementation dependency.

Publication tests cover all three planes, missing provider/handler/permission, incorrect profile hash/owner/plane, incompatible runtime readers, and unchanged reference read-only operations. A profile is not an authorization grant.

Service/database tests cover two tenants capturing the same shared record, cross-plane denial, field filtering in lists/details/compare, direct URL denial, cursor tampering, same-time paging, capture replay, missing source version, contract drift, and transaction failure semantics.

Browser checks cover Comments/Attachments regression, Activity order, inaccessible views, side/full preservation, compact screens, keyboard/focus, browser Back, comparison expansion, record/tenant/principal switching, and capture success/conflict/error.

Country acceptance must explicitly show Versions unavailable, no write operations introduced, tenant-private snapshots, and truthful empty audit history where applicable. Signed activation receipts and live acceptance are separate from unit tests and offline preparation. No claim of complete coverage or deployment is made from DDL or profile presence alone.

### Phase 6 rollout checkpoint — 2026-09-28

DEV Activity authoring, canonical permission registration and immutable history migrations are installed on their intended planes. API, worker and control API were restarted and are healthy. Country successor draft and exact policy candidate are saved against the live release 8 baseline. Publication is **not complete**: restricted platform-control authentication and independent policy activation remain required. No Country data change, role grant or writable entity enrollment occurred.

Use the [rollout report and manual test plan](../../reports/entity-activity-rollout-20260928.md) for exact files, remaining steps and the distinction between SQL/manual-snapshot tests and transactional automatic history tests.

### Phase 6 publication complete

Country release 9 is active on Studio, Neon and Mesh after authenticated proposal, separate MFA approval and workload execution. Shared browser relay Activity endpoints are now registered and tested (43 tests passed; relay typecheck passed). User application manual acceptance remains outstanding; see the [rollout receipts](../../reports/entity-activity-rollout-20260928.md).
