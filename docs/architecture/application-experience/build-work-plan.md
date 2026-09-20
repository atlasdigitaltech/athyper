# Shared Application Experience — Local Build Plan and Completion Record

## Scope

This record covers completed local cleanup and the remaining Business Partner shared-experience work for Neon, Mesh, and Studio. Frontend and backend are developed together in one repository and one local environment. It does not prescribe production rollout, release cohorts, multi-instance deployment, or document change-control work.

**Current execution checklist:** [Detailed local implementation phases](#detailed-local-implementation-phases).
That checklist supersedes earlier rollout/fallback and production-readiness gate
wording for this local cutover. Earlier completed work remains historical evidence;
the compiled-entity migration phases below are all planned until executed.

Component and behavior rules remain defined in the accompanying [System Design](system-design.md).

**Accepted follow-on workstream (2026-09-21):** [Metadata-controlled comments and attachments](entity-comments-and-attachments-build-plan.md). The user selected a shared drawer/content view with typed MetaEntity capabilities, shared service ownership and publication-time validation. Revision 3 uses comprehensive implementation, direct schema evolution, focused regressions and one final local acceptance pass. CA-00–CA-10 retain the detailed code/schema work while removing migration compatibility and production-readiness ceremony. Basic Phase 7 completion below does not imply completion of this newly accepted scope.

## Working rules retained

- Reuse one shared `Main` / `PageWorkspace` and shared page-kind runtimes. Do not copy Business Partner layouts for new entities.
- Keep routes thin. Put cross-entity behavior in platform packages and domain-specific behavior in registered providers or plane packages.
- Keep one main landmark, one page `h1`, and one primary page scroll surface.
- Do not add entity-specific branches to generic layout components.
- Client-side visibility does not replace server authorization or context isolation.
- Preserve visible keyboard focus, labels for icon-only controls, and focus restoration for modal surfaces.
- Remove code only after checking route, export, registry, asset, style, package, and build consumers.

## Completion status

| Task                                                  | Status                                    | Result                                                                                                                                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Inspect current implementation                     | Complete                                  | Located Business Partner collection, detail/360, intake, Studio composition, shared shell, page-frame, navigation, boundary, and CSS implementations.                                                                  |
| 2. Consolidate application foundation and shell       | Complete                                  | Shared startup/fatal adapters, global chrome, overlay coordination, preferences, Recent/Favorites, and footer registration were consolidated for current consumers.                                                    |
| 3. Introduce `PageWorkspace`                          | Complete                                  | Shared page header, navigation, status, body-boundary, content, overview, and action slots are available without changing established header or navigation owners.                                                     |
| 4. Establish reusable runtime contracts               | Complete                                  | Current page/resource/section/panel boundary conventions and generic resolver paths are wired for the existing runtime families.                                                                                       |
| 5. Complete Business Partner shared-experience wiring | Complete for the available local fixtures | Business Partner remains a governed case-runtime entity and now uses the shared shell/PageWorkspace, boundary, footer, and provenance conventions. Mesh browser verification awaits a refreshed authenticated session. |
| 6. Prove entity reuse                                 | Complete                                  | Currency is a real metadata-driven, read-only Neon collection/detail entity using the generic resolver, with no Currency-specific Neon page component or provider.                                                     |
| 7. Optional utility work                              | Deferred                                  | Knowledge/documents and other product utilities have no current consumer-driven requirement.                                                                                                                           |
| 8. Dependency-safe cleanup                            | Complete for the current scope            | Verified obsolete code was removed; remaining shared aliases, CSS, exports, and dependencies have live consumers.                                                                                                      |

## Delivered architecture

- Application foundation uses shared providers, bootstrap/loading handling, and fatal-error recovery boundaries.
- `PlatformShell` provides the global app bar, sidebar, footer, skip link, and coordinated overlay host.
- `PageWorkspace` composes page header, optional navigation, status region, resource/render boundaries, page layouts, and optional action bar.
- Page and section boundaries distinguish loading, request failure, forbidden, not found, empty, and ready states at the appropriate scope.
- Sticky offsets are centralized in shared shell/workspace styles.
- Business Partner keeps deliberately specialized content: case lifecycle and authorization, record 360, intake workflow, role and company extensions, navigation/focus/history behavior, and Studio draft/editor behavior.
- Currency proves the generic path: descriptor-selected collection and detail rendering, read-only access, generic list/detail routes, standard loading/empty/denied states, and page-footer behavior.

## Currency reference implementation

Currency is the first deliberately small generic entity proof:

- Data target: `shared.currency`.
- Read-only descriptor and permission: `neon.reference.currency.read`.
- Collection fields: code, name, symbol, numeric code, minor units, and active status.
- Detail fields: the same fields, read-only.
- No Currency intake, workflow, review, 360 panel, custom provider, plane package, or Currency-specific Neon page component.
- Canonical Neon routes use the public module slug:
  - `/mdg/organization-reference/currencies`
  - `/mdg/organization-reference/currencies/:id`

The internal `org` catalog code is not a public route alias.

## Verified cleanup

The cleanup audit removed the obsolete Business Partner `RolesScopeSection` renderer and its dead role-scope dispatch branch. The live roles-and-scope experience is provided by `RolesWorkspace`; supplier and customer company sections retain their active renderers.

No other shell/page-frame removal is currently safe. `BusinessPartnerPageFrame`, `WorkforcePageFrame`, `PlanePageFrame`, `platform-surface-kit`, shared workspace exports, and sticky CSS all have live route, package, or rendering consumers. They remain in place intentionally.

## Business Partner completion gate

Business Partner is not a Currency-style reference entity and must not be migrated to the flat page-kind descriptor runtime. Its permanent case runtime owns lifecycle transitions, governed operations, workflow authorization, and Studio's specialized composition editor.

Before Purchase Order begins, complete and verify the following for the existing Business Partner case-runtime surfaces:

- Use the shared outer page composition for the Neon collection, record/360, intake, request-list, and request-detail experiences wherever it has a real header, navigation, status, body, action, or footer slot.
- Preserve each route's existing header owner, navigation controller, deep-link parameters, Back/Forward behavior, passive-scroll selection, explicit focus behavior, authorized intake entry, and one primary scroll root.
- Keep record-level lifecycle, permission, governed-operation, role/company, 360, request, activity, comments, attachment, and relationship logic in the Business Partner case-runtime providers.
- Complete shared resource/render boundaries and stale/refresh status behavior where a Business Partner surface still owns equivalent local state.
- Register accurate record/request provenance through the shared footer for all applicable Business Partner detail and aggregate surfaces.
- Verify the corresponding Studio composition and Mesh Business Partner views retain their existing draft, unsaved-change, context, and network-account behavior while using shared frame conventions.
- Exercise an authenticated walkthrough of collection, record tabs, intake, requests, and Studio after each adopted surface; validate denied, loading, error/retry, empty, and context-change behavior where applicable.

Business Partner can use generic application descriptors, overview, collection/task lists and intake presentation while its case runtime retains domain authority. Currency proves shared infrastructure reuse, not completion of Business Partner. The detailed ownership contract is in System Design §14.0.1.

### Remaining build sequence — Business Partner first

The following items are planned, not new implementation claims. Complete them in order, preserving already working shared consumers.

1. **Map descriptors and establish the baseline.** Complete. The source-verified map below covers the current route families. Existing overview/manage/requests route files already call `NeonEntityApplicationSection`; retain those thin adapters.

| Route family                                               | Entry and presentation owner                                                                                       | Descriptor / authorized operation                                                                           | Scope, navigation and footer owner                                                                                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview `/mdg/business-partner`                           | Thin route → `NeonEntityApplicationSection("overview")` → `EntityOverviewRuntime`                                  | Published `business_partner` application entry `overview`; `neon.relationship.business_partner.read`        | Application descriptor owns tab navigation and breadcrumb binding; shared application header owns the collection header; overview sources remain authorized backend data.                       |
| Manage `/mdg/business-partner/manage?vid=system`           | Thin route → `NeonEntityApplicationSection("manage")` → `EntityListRuntime`                                        | Published `entity_list` for `business_partner`; `neon.relationship.business_partner.read`                   | Shared list runtime owns query/view/density; Neon context plus future Business Partner scope adapter owns permitted organization/role coordinates; collection header remains application-owned. |
| Requests `/mdg/business-partner/requests?density=compact`  | Thin route → `NeonEntityApplicationSection("review")` → `EntityListRuntime`                                        | Published `task_list` for `business_partner_request`; `neon.relationship.entity_case.read`                  | Request view namespace stays separate from the partner list. The published workflow key is `supplier_onboarding`; operating-organization context is required by the request descriptor.         |
| New request `/mdg/business-partner/new`                    | `AuthorizedNewBusinessPartnerRequest` → `BusinessPartnerRequestEntry` → shared `EntityIntake` / `EntityIntakeForm` | `neon.relationship.entity_case.create`; published request form plus Business Partner intake surfaces        | Task-header registration owns title, Cancel and draft state. Workflow steps and Details section navigation remain independent. `loadPublishedForm` supplies initial descriptor retry.           |
| Request detail `/mdg/business-partner/requests/:requestId` | Thin route → `BusinessPartnerRequestDetail` → `RequestDetailSurface` / `PageWorkspace`                             | Governed case view and case actions; request data includes provenance                                       | `useDeepLinkedTabState` owns Overview/Details/Review/Activity history. `useRecordFooterSources(view.provenance)` owns request provenance.                                                       |
| Record / 360 `/mdg/business-partner/:recordId`             | Thin route → `BusinessPartnerRecord` → feature-selected 360 shell or aggregate detail                              | `neon.business_partner.view_360` determines the specialized 360 surface; aggregate reader supplies fallback | Record components own record header/section controller. `useRecordFooterSources(aggregate.provenance)` owns successful aggregate provenance.                                                    |

Published application navigation comes from `server/db/scripts/provisioning/publish-development-list-experience.ts`: `overview`, `manage`, and `review` all belong to one `business_partner` application with base path `/mdg/business-partner`. The overview and manage permission is `neon.relationship.business_partner.read`; review uses `neon.relationship.entity_case.read`; new request is separately authorized by `neon.relationship.entity_case.create`.

Authenticated baseline verified on 2026-09-18 with the refreshed Neon session: overview, manage with `vid=system`, requests with compact density, request detail `3a452faf-d2ca-44d0-a583-8ddcfb9a3110`, and record/360 `01a09f6c-ed2c-76b0-8aa9-e333eb385c0e` each returned HTTP 200, one expected `h1`, and no access-denied surface. The production journey checks now follow the shared role-selection / duplicate-check entry step before asserting published Supplier or Customer intake fields: 2 passed; Workforce and external-invitation checks were skipped because their required capability/fixture was not configured. 2. **Complete application workspace composition.** Complete. `ManagementWorkspace` composes its existing collection/record owner handoff inside `PageWorkspace` and exposes shared status, toolbar, body, action and action-outcome slots. The body slot preserves existing list/overview ownership; list refresh/action messages remain in `EntityListRuntime`, where they belong. Studio Business Partner Bank Directory uses the shared status slot for its publication-sync indicator. The Business Partner overview, Manage, and Review & Approval adapters require no further outer slots: `EntityOverviewRuntime` owns dashboard data and actions; `EntityListRuntime` owns search, saved views, refresh, and table actions; the published application descriptor owns the collection-header New request action. Moving those controls outward would duplicate ownership. Focused ownership coverage, PageWorkspace browser coverage, shell/list typechecks, Studio Business Partner tests, and individual authenticated Supplier and Customer intake checks pass. A rapid combined browser run received an HTTP 429 from the protected experience bootstrap before the customer route rendered; retrying after the local throttle recovered passed, so this is recorded as bootstrap throttling rather than a route failure. Do not move list-table controls or saved-view state into the outer workspace. Preserve `EntityPageLayout` collection/record ownership and task-header registration. Keep request descriptors and saved-view namespaces distinct from record lists. 3. **Extract domain scope adapters.** Complete. The Neon list package now selects a registered `business_partner` scope adapter rather than branching on Business Partner identity, role, and eligibility inside generic application/list orchestration. The common adapter retains organization/company directory state for ordinary entities; the Business Partner adapter owns `role` URL parsing, Supplier/Customer validation, compatible organization/company eligibility, and the complete eligibility coordinate. Known work-context resolvers are registered by identifier. Unknown required resolvers render unavailable and do not create an unscoped selector or query. Focused adapter and list-runtime tests plus both package typechecks pass. 4. **Complete intake integration.** Complete. `EntityIntake` and `EntityIntakeForm` remain the common workflow and form owners; the existing Supplier and Customer submission adapters remain authoritative. Metadata-driven Supplier fields already register validation through `DataValidationProvider`, giving the shared summary, inline errors, per-section issue counts, reveal-and-focus links, and independent workflow/section navigation. The custom Customer sales-scope fields now register through the same `useDataValidation` contract, so a blocked review shows field-specific summary and inline errors instead of a late generic submit error. Validation-summary links are shared 24px touch targets. Existing intake-runtime coverage verifies review without mutation, retained input on Back, single final submission, draft resume, and Cancel dirty protection; retry/submission coverage verifies save and recovery. The authenticated Neon Customer route verifies role selection, published form entry, validation summary, link focus, and the surface accessibility contract. Save, submit, and approval remain distinct. 5. **Complete request-detail integration.** Complete. `BusinessPartnerRequestDetail` retains its existing `PageWorkspace`, `PageNavigation`, `useDeepLinkedTabState`, governed-command runner, and provenance footer registration. Overview, Request details, Review, and Activity remain persistent tab panels addressed by their existing hash links; legacy Case/Validation/Workflow/Evidence/Result hashes still normalize to Review. `RequestLifecycle` is the compact shared progress surface above the tabs. The full Supplier onboarding journey, including its authorized actions, concurrent-command protection, refresh/recovery, readiness, documents, and activity content, now belongs in Review and is hidden in the other persistent tabs. Backend request status continues to distinguish approved-awaiting-completion, applied/completed, and failed outcomes; no client-side lifecycle inference was added. Authenticated Neon coverage verified Overview, Review, and Details hash navigation plus the shared-progress/journey placement. 6. **Verify Business Partner completion.** Complete for the available local fixtures. The authenticated Neon walkthrough covers the supplied overview, `manage?vid=system`, compact request-list, intake, request detail, and record/360 routes. Existing application/list coverage retains density, filters, search, saved-view namespaces, Favorites, denied scope behavior, context replacement, and footer ownership. The authenticated 360 suite passed canonical deep links, Back/Forward, passive section selection, explicit focused selection, historical scope, superseded-request aborts, restricted-value exclusion, keyboard behavior, 200% reflow, and RTL. Supplier and Customer intake and request-detail checks passed. Studio Business Partner typecheck and its 78-test suite passed, including draft, unsaved-edit, focus, undo, and publication behavior. Mesh Business Partner typecheck passed. Mesh browser verification remains blocked: `tests/e2e/.auth/mesh-athyper.json` no longer establishes an authenticated Mesh tenant session; no session, permission, or network-account data was changed to bypass that check. Re-run `tests/e2e/mesh-review` after refreshing a valid Mesh session to verify the existing acting-account/network-workspace coverage. The optional sensitive-reveal and performance 360 cases were skipped because their dedicated fixtures/configuration were not supplied. 7. **Close cleanup against the new wiring.** Complete. Route, export, registry, style, manifest, and test-consumer searches found no removable Business Partner or shared-workspace module. `BusinessPartnerPageFrame`, the shared workspace exports, scope adapters, validation API, lifecycle surface, journey workspace, sticky CSS, and package dependencies all have live consumers. The obsolete role-scope renderer and dispatch branch were already removed in Task 8; no further manifest update is required. Removed the redundant persistent-aside fragment left by the Review journey move. Route-level evidence now completes Task 5 for the available local fixtures. Reopen Task 8 only if a later replacement proves an active artifact unused.

The intake and request-detail screenshots are review evidence; the affected Neon routes also have the authenticated browser evidence recorded above. Approved plus Completion Not Started is not by itself a defect; verify authoritative lifecycle state. Current source confirms `loadPublishedForm` supplies intake-flow retry, compact request progress remains shared above navigation, and the Supplier process belongs in Review. The generic Playwright global setup deliberately clears stored sessions when neither credentials nor explicit reuse are supplied. After refreshing `tests/e2e/.auth/neon.json`, run protected Neon checks with `PLAYWRIGHT_REUSE_AUTH_STATE=neon` and `PLAYWRIGHT_PRODUCTION_MATRIX=1`; this validates the interactive session rather than overwriting it. Do not run the generic production configuration without one of those authentication modes.

## Validation evidence

These checks certify the completed local increments described above, subject to the listed fixture and session limitations.

- Business Partner package typecheck passed.
- Business Partner test suite passed: 47 files and 229 tests.
- Intake integration: form-detail and Business Partner typechecks passed; authenticated Neon Customer onboarding passed with required-field summary, inline errors, summary-link focus, and the WCAG surface contract.
- Request-detail integration: Business Partner typecheck and authenticated Neon Supplier request-detail navigation passed for Overview, Review, and Details hashes, shared progress, and Review-only journey visibility.
- Business Partner completion verification: authenticated Neon 360 and intake/request checks passed (5 passed, 4 fixture/configuration skips); Studio Business Partner typecheck and 78-test suite passed; Mesh Business Partner typecheck passed. Mesh browser review is pending a refreshed authenticated Mesh session.
- Cleanup audit: live-consumer searches found no additional safe deletion; Business Partner typecheck, request-workspace coverage, and `git diff --check` passed after the final fragment removal.
- Platform shell and Neon Workforce typechecks passed.
- Neon production build passed.
- Currency descriptor provisioning test passed.
- Database migration-layout verification passed.
- Neon inventory authorization and platform-catalog checks passed.
- Foundation browser coverage passed: 6 PageWorkspace and Business Partner 360 tests.
- Authenticated local browser walkthrough verified the Currency collection (`Currencies`) and AED detail (`AED`) routes.
- `git diff --check` passed after the cleanup.

## Deferred work

- Build Knowledge/documents, utility panels, or another global utility only when there is a concrete product requirement.
- Promote a new wrapper, provider, or page-kind capability only when a second real consumer demonstrates a shared need.
- Revisit Studio configuration/editor generalization when a second authoring entity tests the current Business Partner-oriented composition pattern.
- Add deployment portability, independently deployed contract compatibility, cache coordination, replicas, and rollout controls when the application moves beyond local development.

## Next build

Business Partner and Currency now provide the local reuse baseline. Refresh the Mesh authenticated session before treating its browser verification as complete; then begin the next entity only when it has a concrete descriptor and authorized read/write contract. Purchase Order remains the next governed-entity candidate.

## Business Partner compiled-artifact adoption plan

Status: planned; source-reviewed, not implemented or runtime-benchmarked. This extends
the shared-presentation baseline above; previous completion entries do not establish
support for the split-artifact prototype. Reference routes are
`/mdg/organization-reference/currencies?density=compact` and
`/mdg/business-partner/manage?vid=system`. The browser retrieval tool could not open
these local URLs during this planning review; authenticated browser parity is an
implementation gate.

### Authority and boundaries

Follow System Design §14.0, §14.0.1 and Appendix A together. Business Partner keeps
governed case execution, lifecycle, evidence and materialization. Currency remains a
flat reference entity. Both use shared application/list/workspace presentation.
The goal is generic orchestration with registered domain providers, not routing BP
through Currency's unrestricted CRUD path. `genericWriteEnabled: false` remains
enforced by the server. The runtime must read operation metadata for read admission
as well as commands; loading an action contract never executes that action.

Use `entity-policy-examples/New_Entity/` as the proposed content contract: Core,
Operation, surface Presentation, section Presentation, Flow, and their release
envelope. Resolve shared field/operation profiles once per immutable artifact set.
The examples remain review inputs until real parsers, compiler output, provider
registrations and admission tests support them. Do not copy their JSON directly into
an active release or infer support from a successful draft validator.

### Runtime ownership and cache model

1. The existing publication compiler produces the split IR at publication/explicit
   preview time. No compile-on-page-open, refresh, navigation, or cache miss.
2. The existing verified artifact loader and metadata service resolve a pinned
   release and index artifact references by key. Resolve only the requested
   dependency subset. Publication dependency closure does not mean eager fetching.
3. Extend the existing distributed descriptor cache for immutable fragments and
   resolved profiles. Redis is an acceleration layer; use verified authoritative
   artifacts on cache miss/outage, with request deduplication and bounded recovery.
   Never retry a missing fragment by silently switching to the latest release.
4. Host page planning in the existing experience service and metadata reader. The
   existing BP service supplies registered scope, applicability, section and command
   adapters. The shared runtime must contain no `entityCode === business_partner`
   dispatch branch. Retain domain code where domain semantics are necessary.
5. Expose safe presentation/field/action summaries to the browser. SQL bindings,
   protected-value sources, policy internals and full operation IR remain server-side.

Immutable raw-artifact keys include plane, effective tenant publication/preview
scope, release/hash and artifact key. Tenant-effective artifacts cannot be shared
under an entity-only key. Keep authorization decisions and record data outside this
cache, as the current distributed descriptor cache already specifies.

Authorized UI/query-cache keys include tenant, principal/access fingerprint,
authorization epoch, context generation, pinned release, record identity, section,
filters/sort/cursor and locale when localized values are returned. BP record version
alone is not a child-data revision: comments, attachments and role data can change
independently. Use resource revisions/invalidation events plus bounded freshness.
Session/context/access changes cancel in-flight requests and discard late responses.
Unknown counts stay unknown; do not count every collection to populate tab badges.

### UI intent and work budget

These are target acceptance budgets, not measured performance claims. A resource
query budget counts data reads separately from required identity/authorization work.

| Intent                          | Compiled metadata needed                               | Data/service work                                                                | Forbidden side effects                                             |
| ------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Open Manage                     | Core, list presentation, read-admission/action summary | One bounded list query; counts only if requested                                 | No child collection hydration, allocation or draft creation        |
| Open BP360                      | Core, detail shell, initial section, read admission    | One header/applicability resource; merge same-row Overview fields when permitted | No full 360 aggregation or per-tab count fan-out                   |
| Open a deep-linked section      | Same shell plus target section/child Core subset       | Header plus that section; skip default Overview data when unnecessary            | No intermediate tab loads                                          |
| Scroll/switch to section        | Cached section descriptor and required child subset    | One section request; bounded provider queries/independent result states          | No unrelated section refresh                                       |
| Revisit a fresh section         | Cache hit                                              | Zero section network calls                                                       | No automatic command calls                                         |
| Open comments/attachments       | Capability descriptor and owner authorization          | Lazy list request with pagination                                                | No create/upload/reservation/reveal                                |
| Click New / Request change      | Authorized operation and selected Flow                 | Explicit start/resume governed draft                                             | No BP numbering allocation on render                               |
| Materialize an approved request | Operation, lifecycle/validation/numbering bindings     | Revalidate controls and allocate within the materialization transaction          | No client-side sequence increment                                  |
| Execute reveal                  | Matching protected field + reveal operation            | Explicit assurance/purpose/audited command                                       | No prefetch, retry replay into cache, or plaintext in normal reads |

Use one bootstrap response for authorized shell metadata and initial data, including
only metadata missing from the browser's hash inventory when useful. SSR hydration
must suppress duplicate bootstrap. The runtime can fetch independent immutable
fragments concurrently on cold cache. The browser must not do a metadata → metadata
→ data waterfall. Do not assume a warm cache implies zero authorization queries.

Start with at most two independent section requests in flight; tune using evidence.
Batch near-simultaneous visible-section requests only when it reduces overhead, with
per-section denial/error/empty/ready results and pagination. The initial shell must
not wait for all batched sections. Sensitive sections and commands are explicit
activation only. A capability being enabled is never an instruction to fetch it.

### Control-table reader and side-effect rules

| Concern                                                    | Resolution rule                                                                                 | Authority                                                       |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Field validation                                           | Static rules from pinned Core/Flow; dynamic checks on explicit validate/submit                  | Registered server validator and DB constraints                  |
| Lifecycle                                                  | Cached immutable definition; current state and transition eligibility at command time           | Existing governed case/workflow service                         |
| Numbering                                                  | Cached immutable policy definition where valid; resolve current applicability during allocation | `control.numbering_policy`, DB counter and allocation receipt   |
| Qualifications/blocks/company and organization assignments | Read only for requested scope/action; apply effective date and current access                   | Current control/master records; never assumed immutable with IR |
| Comments/attachments                                       | Owner-scoped service permission and current content revision                                    | Existing collaboration/attachment service                       |

Numbering definition resolution and sequence allocation are different operations.
Reuse `allocateWithinTransaction` and the persisted allocation-ID receipt. Bind a
stable allocation ID to the governed request's numbering purpose; retries of the
same materialization return the same receipt. Rollback covers the record, allocation
and audit as supported by the transaction coordinator. If an earlier draft reference
is needed, allocate once on an explicit create-draft command with its own identity;
never reserve it in a React effect. Redis must not become the sequence authority.

Full browser refresh may legitimately read the page again. The strict invariant is
zero numbering allocations and zero comment/attachment mutations on reads, renders,
refreshes, tab changes and prefetch. Soft navigation additionally reuses fresh data.
Upload reservations and comment creation require explicit idempotent commands;
transport retries must reuse the original command key. Do not auto-retry reveals.

### Appendix A component mapping

| Existing component                       | Required adoption behavior                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| ApplicationProviders / query hydration   | Share caches; no duplicate SSR/client bootstrap                                       |
| ApplicationBootstrapGate / PlatformShell | Identity/context only; no entity-specific fetch fan-out                               |
| PageWorkspace                            | Own page identity, cancellation/reset, navigation, status and action slots            |
| PageHeader / BreadcrumbBar               | Reuse one authorized header projection; no separate name reads                        |
| PageNavigation / SectionNavigation       | Preserve stable anchors, history, drafts and focus; manual activation for slow panels |
| PageResourceBoundary                     | Handle failure of required bootstrap resource only                                    |
| PageSection / SectionBoundary            | Lazy independent requests and retries; maintain scroll geometry                       |
| OverviewPanel                            | Reuse authorized resources; don't duplicate section queries                           |
| PageActionBar                            | Explicit commands only; disable actions when prerequisites fail                       |
| PageInformationProvider                  | Publish actual resource revisions/freshness; clear on identity/access change          |

Layout, scroll/switch mode and responsive behavior remain explicitly configured.
Do not infer layout from row counts or secretly replace scroll navigation with tabs.

### Implementation phases

1. **Baseline and contract gate.** Capture authenticated Currency/BP network traces,
   provider query counts and current side effects. Run prototype structural checks;
   strengthen recursive child bindings, protected fields, profile resolution,
   section authorization and unresolved-provider checks before production use.
   Define artifact dependency versus runtime load policy using existing properties;
   publish no new top-level artifact type. Confirm every requested field/provider
   exists in current DDL/registry, including role applicability; do not reuse the
   earlier illustrative employee/BP join without verification.
2. **Compiler and reader slice.** Extend existing publication contracts/compiler,
   loader, projection and metadata cache for the five content types. Preserve
   atomic release pins and verified fallback. Implement header + Overview + Contacts
   as the first vertical slice; verify cold/warm behavior before expanding sections.
3. **Shared page/list orchestration.** Evolve experience, descriptor-client and query
   packages; reuse application/list/form-detail primitives. Move BP-specific scope
   rules behind registered adapters. Deliver one bootstrap and independently loaded
   sections without moving governed commands onto generic record CRUD endpoints.
4. **Commands and control readers.** Bind Flow/Operation IR to existing request,
   lifecycle, policy, numbering, collaboration and attachment services. Verify
   numbering/idempotency before enabling writes. Add invalidation by affected
   resource, not blanket whole-page refetches. Read decisions remain server-enforced.
5. **Complete section adoption.** Migrate roles/scope, company profiles, banking/tax,
   qualifications/certifications, governance, activity and capabilities one by one.
   Keep specialized domain renderers registered where generic fields are insufficient.
   Preserve all permission, effective-date and disclosure rules during migration.
6. **Parity and cleanup.** Run authenticated route, accessibility, context and retry
   checks; compare traces with baseline. Remove obsolete full-aggregate readers and
   duplicate metadata calls only after locating every consumer. Purchase Order
   starts after BP satisfies these gates, per the existing plan.

### Existing-file change inventory

Paths below are repository-relative and existed at planning time. These are planned
edit targets, not a statement that every file must change. Co-located tests are
extended when the owning behavior changes. Reuse existing package boundaries and
entry points; introduce a helper file only when a cohesive extraction makes an
existing large module clearer. Avoid new parallel runtimes or packages.

| Existing files                                                                                                                                                                                                                                                                                                               | Planned responsibility                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `apps/neon/lib/entity-application-layout.tsx`; `apps/neon/lib/entity-application-route.tsx`                                                                                                                                                                                                                                  | Thin route/application integration and hydration handoff                                                   |
| `apps/neon/app/(shell)/mdg/business-partner/layout.tsx`; `manage/page.tsx`; `page.tsx`; `[recordId]/page.tsx`; `new/page.tsx`; `requests/page.tsx`; `requests/[requestId]/page.tsx` (last six relative to the BP route directory)                                                                                            | Preserve URLs; pass entity/surface/record identity to existing package adapters                            |
| `packages/planes/neon/list-view/src/index.tsx`                                                                                                                                                                                                                                                                               | Shared Neon application/list entry; replace BP identity branches with registered scope adapter             |
| `packages/platform/entity/runtime/list-view/src/index.tsx`; `state.ts`; `data-operations.tsx`; `scope-control.tsx` (same directory)                                                                                                                                                                                          | Descriptor-selected list queries, scoped cache and context/filter synchronization                          |
| `packages/platform/entity/runtime/form-detail/src/record-360-panel.tsx`; `section-navigation.tsx`; `section-workspace.tsx`; `intake.tsx` (same directory)                                                                                                                                                                    | Shared section lifecycle, navigation, boundaries, draft preservation                                       |
| `packages/platform/entity/runtime/descriptor-client/src/index.ts`                                                                                                                                                                                                                                                            | Typed bootstrap/section calls and action summaries; maintain governed-write distinction                    |
| `packages/platform/foundation/query/src/core.ts`; `index.tsx`                                                                                                                                                                                                                                                                | Resource identity, in-flight deduplication, hydration, invalidation and cancellation                       |
| `packages/contracts/platform/entity-runtime/src/record-360-panel.ts`; `record-presentation.ts`; `related-presentation.ts`; `intake.ts` (same directory)                                                                                                                                                                      | Extend existing typed surface/action/provider contracts rather than duplicating schemas                    |
| `packages/planes/neon/business-partner/src/360/business-partner-360.tsx`; `panel-definition.ts`; `section-registry.ts`; `business-partner-360-client.ts`; `business-partner-360-section-client.ts`; `use-audited-reveal.ts` (same directory)                                                                                 | BP provider adapter, demand-driven calls, specialization and reveal controls                               |
| `packages/planes/neon/business-partner/src/request-entry.tsx`; `request-workspace.tsx`; `request-form-descriptor.ts`; `intake-submit.ts`; `request-attachment-field.tsx` (same directory)                                                                                                                                    | Flow/operation consumption, explicit idempotent requests and upload actions                                |
| `server/packages/contracts/publication/src/artifact.ts`; `projection.ts` (same directory)                                                                                                                                                                                                                                    | Versioned split-artifact envelope and persisted projections                                                |
| `server/packages/services/publication/src/business-partner-definition-compiler.ts`; `document-collection-compiler.ts`; `publication-artifact-loader.ts`; `publication-artifact-store.ts`; `publication-orchestrator.ts`; `kysely-local-projection-repository.ts`; `business-partner-definition-consumer.ts` (same directory) | Reuse publication pipeline; extract shared artifact emission/resolution, retain BP authoring semantics     |
| `server/packages/platform/metadata/src/descriptor-parser.ts`; `metadata-service.ts`; `runtime-descriptor-repository.ts`; `distributed-descriptor-cache.ts`; `invalidation.ts` (same directory)                                                                                                                               | Typed pinned reader, per-artifact cache, profiles and activation invalidation                              |
| `server/packages/adapters/cache-redis/src/redis-cache-adapter.ts`; `invalidation-generation.ts`                                                                                                                                                                                                                              | Existing Redis adapter/generation integration; change only if reader requires it                           |
| `server/packages/platform/experience/src/contracts.ts`; `ports.ts`; `service.ts`; `routes.ts`; `neon-action-policy-registry.ts` (same directory)                                                                                                                                                                             | Generic page planning/section orchestration and authorized API admission                                   |
| `server/packages/adapters/experience-postgres/src/index.ts`                                                                                                                                                                                                                                                                  | Bounded list/header queries, SQL-pushed filtering/sorting and registered scope resolution                  |
| `server/packages/services/master-data/src/business-partner-360-service.ts`; `business-partner-360-routes.ts`; `kysely-business-partner-360-repository.ts`; `kysely-business-partner-360-role-sections.ts`; `business-partner-360-policy.ts`; `business-partner-request-service.ts` (same directory)                          | Convert full summary orchestration into provider requests; preserve BP policy and governed materialization |
| `server/packages/services/numbering/src/numbering-service.ts`; `kysely-numbering-repository.ts`                                                                                                                                                                                                                              | Allocation only at command stage, stable receipt replay and policy-reader integration                      |
| `server/packages/platform/collaboration/src/collaboration-service.ts`; `collaboration-routes.ts`                                                                                                                                                                                                                             | Owner-authorized comment reads/commands; idempotency and targeted invalidation                             |
| `server/packages/services/attachments/src/attachment-routes.ts`; `attachment-lifecycle.ts`; `kysely-attachment-repository.ts`                                                                                                                                                                                                | Lazy reads, explicit upload lifecycle and owner/resource invalidation                                      |
| `docs/architecture/application-experience/entity-policy-examples/New_Entity/README.md`; `CONTRACT.md`; `validate.py`; `verify_live_schema.py`; existing `business_partner/`, child and `platform/` JSON artifacts                                                                                                            | Keep reviewed prototype, schemas, hashes and evidence consistent with implementation                       |

`apps/neon` remains route/layout/bootstrap composition. `apps/studio` continues to
host the existing authoring UI; compiler changes live in server packages. Mesh is
not migrated by this slice. Shared renderers belong in `packages/platform/entity`,
Neon business behavior in `packages/planes/neon`, server orchestration in existing
platform/services packages and SQL in existing adapters/repositories. Retain current
kebab-case filenames and `*-service`, `*-routes`, `kysely-*-repository` conventions.
Generic names are for extracted cross-entity code only; domain-specific files keep
their domain names. No mass renaming or duplicate `smart-aggregator` folder.

### Acceptance evidence required

- Cold and warm Manage/BP360, direct section link, scroll, tab return, browser Back,
  refresh and context switch: network trace proves only demanded resources load.
- Mount/remount, concurrent tabs and ordinary refresh: numbering allocation count,
  comment count and attachment reservation count remain unchanged.
- Replayed/concurrent materialization: one committed allocation and business result
  per stable command identity; failures do not leave a partially applied record.
- Two visible sections share immutable metadata resolution; repeated subscriber
  requests deduplicate; one failed section leaves header and other sections usable.
- Revoked access, different principals and contexts never share record payloads;
  late responses are discarded; child mutations refresh their own resources.
- Redis outage/corrupt entry falls back to verified artifacts without compiling;
  concurrent activation cannot mix artifact versions in an open request/draft.
- No SQL issued merely because a relation or capability is declared; no N+1 role
  queries, no queries for hidden tab counts and no plaintext reveal prefetch.
- Appendix A geometry/focus/scroll/dirty-state checks pass on compact, mobile and
  desktop layouts. Currency remains functional through its existing reference path.
- Profile resolution and release admission are tested independently of unsigned
  draft review validation. Existing source/live-schema differences are reported;
  benchmarks must use realistic tenant volumes rather than tiny seed fixtures.

Recommended first implementation checkpoint: pinned artifact reader plus the BP360
header/Overview/Contacts slice with cache and side-effect assertions. This proves
the runtime path before migrating every BP section or changing another entity.

## Generic entity route and folder structure

Status: proposed implementation structure, based on inspected existing files. This
refines the inventory above. It does not change System Design §14.0: shared entity
presentation dispatches to the appropriate governed or reference execution adapter.
Business Partner supplies business functions, not a private compiled-artifact reader.

### Public URL and internal route

Preserve `/mdg/business-partner/manage` and rewrite internally to
`/app/entity/business_partner/manage`. Use the optional catch-all
`[[...segments]]`, rather than `[...segments]`, so the default entity application
route is supported without a duplicate index page. `(shell)` is a route group and
does not appear in the URL. The second `app` below is an actual internal URL segment.

```text
apps/neon/
├── proxy.ts                                      existing: one rewrite integration
├── lib/
│   ├── catalog-routes.ts                         existing: public route catalog
│   ├── entity-application-route.tsx              existing: thin surface dispatcher
│   └── entity-application-layout.tsx             existing: application context bridge
└── app/(shell)/
    ├── layout.tsx                               existing: sole shared shell owner
    ├── app/entity/[entityCode]/
    │   └── [[...segments]]/page.tsx              NEW: one internal entity entry
    └── [workspaceSlug]/[moduleSlug]/
        └── [[...segments]]/page.tsx              existing: module/catalog fallback
```

The new page resolves a validated route intent, then delegates to existing package
components. It contains no SQL, artifact fetching loops, business validation,
section switch keyed by entity name, or comment/attachment/numbering effects.
Initially use the existing layout bridge rather than introducing another nested
entity layout. The shell and application provider must each mount once.

| Public path                                 | Internal path                                      | Route intent                 |
| ------------------------------------------- | -------------------------------------------------- | ---------------------------- |
| `/mdg/business-partner`                     | `/app/entity/business_partner`                     | Default application overview |
| `/mdg/business-partner/manage`              | `/app/entity/business_partner/manage`              | Partner collection           |
| `/mdg/business-partner/:recordId`           | `/app/entity/business_partner/records/:recordId`   | Partner detail               |
| `/mdg/business-partner/new`                 | `/app/entity/business_partner/new`                 | Start published intake flow  |
| `/mdg/business-partner/requests`            | `/app/entity/business_partner/requests`            | Governed request collection  |
| `/mdg/business-partner/requests/:requestId` | `/app/entity/business_partner/requests/:requestId` | Governed request detail      |
| `/mdg/organization-reference/currencies`    | `/app/entity/currency/manage`                      | Reference collection         |

`entityCode` here identifies the application owner. The compiled application surface
selects `business_partner_request` as its request-list/flow target; the client cannot
override that target. Keep public links, canonical URLs, breadcrumbs, favorites and
history in public coordinates. Do not generate links from internal route segments.

Extend `apps/neon/proxy.ts` and its existing destination-header integration; do not
create another middleware or a competing rewrite list in `next.config.ts`. Resolve
rewrites from the existing route catalog using a lightweight pure resolver. Public
path matching runs before entity-page filesystem selection so dedicated legacy
routes cannot shadow an adopted mapping. Validate this ordering with Next routing
tests before switching any path.

Match reserved named routes before record patterns, use explicit record-ID
validation, and retain density, saved-view, filter and pagination query parameters.
URL fragments remain client navigation state: proxy logic must not depend on them.
The proxy overwrites any internal destination headers; client-provided headers are
not authority. Perform actual entity/surface authorization in the server reader.
Direct `/app/entity/...` visits must resolve to a known public mapping and canonical
public destination or return not found; they must never bypass entitlements. Avoid
rewrite loops, including RSC/prefetch requests. No metadata/Redis/DB access in proxy.

### Shared package ownership and names

All directories below already exist. Extend them instead of creating an
`entity-aggregator`, `business-partner-runtime` or second descriptor-client package.

| Directory                                                 | Existing file anchors and target ownership                                                                                                                            |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/platform/navigation/`                 | Existing catalog-route contract/resolver: typed application owner, surface, resource ID and canonical public path; reverse mapping for links                          |
| `packages/contracts/platform/entity-runtime/src/`         | `record-presentation.ts`, `record-360-panel.ts`, `related-presentation.ts`, `intake.ts`: serializable surface/provider/operation references and runtime route intent  |
| `packages/platform/entity/runtime/descriptor-client/src/` | `index.ts`: shared compiled-surface/bootstrap/section client; all entity metadata reads enter here                                                                    |
| `packages/platform/entity/runtime/list-view/src/`         | `index.tsx`, `state.ts`, `data-operations.tsx`: generic application overview, lists, saved views, filters and list loading                                            |
| `packages/platform/entity/runtime/form-detail/src/`       | `record-360-panel.tsx`, `section-workspace.tsx`, `section-navigation.tsx`, `intake.tsx`: generic detail/section/flow composition and demand-driven resource lifecycle |
| `packages/platform/foundation/query/src/`                 | `core.ts`, `index.tsx`: cache hydration, deduplication, cancellation and resource invalidation                                                                        |
| `packages/planes/neon/list-view/src/`                     | `index.tsx`, `scope-adapters.tsx`: Neon context and registered scope adapters; no private BP metadata reader                                                          |
| `packages/planes/neon/business-partner/src/`              | Bank verification, role eligibility, governed requests and other BP business interactions; specialized UI only where domain behavior needs it                         |

Generic field/collection rendering comes from metadata. A descriptor capability
references a registered domain function when declarative reading is insufficient.
That registry is shared runtime infrastructure; it does not require a monolithic
BP provider that fetches every section. Unknown required functions fail closed.

### Server package ownership and names

| Directory                                                                                     | Existing file anchors and target ownership                                                                                                                  |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/packages/contracts/metadata/src/`                                                     | `descriptors.ts`, `ports.ts`: typed pinned compiled-model reader and fragment coordinates                                                                   |
| `server/packages/contracts/publication/src/`                                                  | `artifact.ts`, `projection.ts`: artifact family, hashes and release set                                                                                     |
| `server/packages/services/publication/src/`                                                   | Existing compiler, loader, store and orchestrator: compile at publication, verify and activate consistently; BP authoring rules remain domain-specific      |
| `server/packages/platform/metadata/src/`                                                      | `metadata-service.ts`, `descriptor-parser.ts`, `runtime-descriptor-repository.ts`, `distributed-descriptor-cache.ts`: sole generic compiled-model read path |
| `server/packages/platform/experience/src/`                                                    | `contracts.ts`, `ports.ts`, `service.ts`, `routes.ts`: page plan, bootstrap, bounded section orchestration and authorized action summaries                  |
| `server/packages/adapters/experience-postgres/src/`                                           | `index.ts`: parameterized declared projections and relation queries; allowlisted columns/operators and tenant-safe joins                                    |
| `server/packages/services/master-data/src/`                                                   | Existing BP request, eligibility, verification, protection and materialization services; business functions called through registered contracts             |
| `server/packages/services/numbering/src/`                                                     | Existing transactional allocation and replay receipts; never invoked by page reads                                                                          |
| `server/packages/platform/collaboration/src/` and `server/packages/services/attachments/src/` | Existing owner-scoped content reads and explicit commands; no BP-owned duplicate service                                                                    |

If extraction is needed, use responsibility names such as `section-query-plan.ts`
inside the existing experience package or `artifact-resolution.ts` inside metadata.
These are conditional helper names, not permission to scaffold empty files or add
new packages. Keep `index.ts` as an export/composition entry when extracting a
substantial implementation. Continue existing kebab-case and `*.test.ts(x)` naming.

### Other apps

Neon is the first implementation. Reuse shared package contracts in Mesh and Studio,
with their existing plane registries and `proxy.ts`/`lib`/shell layout conventions.
Do not copy Neon route catalogs, BP permissions, governed operations or data scopes.
Studio authoring remains in its existing editor routes; entity runtime preview is
explicitly labeled and cannot invoke Neon writes. Mesh exchange keeps its separate
domain execution contract. Do not create unused `/app/entity` routes in those apps
until a concrete compatible surface requires them.

### Cleanup and migration sequence

1. Extend the existing route catalog/resolver and add routing tests for public and
   internal coordinates, aliases, named-path precedence and query preservation.
2. Deliver the shared pinned artifact reader and first read-only header/section
   slice described above; no new BP-specific descriptor API is introduced.
3. Add the single internal page and Neon proxy rewrite integration. Route Manage
   through it first. Keep rollout selection at the route catalog boundary, without
   maintaining two authoritative metadata readers.
4. Move detail, section loading, request lists and intake to compiled intents in
   order. Governed writes remain on registered business commands. Preserve redirect
   aliases and historical bookmarks rather than deleting paths blindly.
5. Retire `packages/planes/neon/business-partner/src/360/panel-definition.ts`,
   `section-registry.ts` and metadata-fetch responsibilities of
   `business-partner-360-client.ts` / `business-partner-360-section-client.ts` after
   consumer searches prove their replacement. Retain any domain commands until
   their callers use the registered service; do not delete by filename alone.
6. Remove migrated BP `page.tsx` route wrappers and its application `layout.tsx`
   only after the shared entry supplies the same layout, authorization, loading,
   error and navigation behavior. The generic catalog page keeps module behavior;
   its entity branch delegates to the same dispatcher until all public entity
   mappings use the rewrite path. Remove duplicated rendering dispatch last.
7. Retire server BP full-summary orchestration once no consumers remain. Preserve
   its domain masking, owner linkage and policy rules in generic query validation
   or explicit business functions before deleting old methods/endpoints.

Acceptance: no BP section metadata reads under entity-specific Next route files;
no BP entity-name branch in the shared reader; adding a supported section requires
compiled metadata only; one shell, one main, one h1 and one primary scroll root;
public URL/history/density/view state survive navigation; RSC, hydration, refresh
and prefetch never duplicate commands; cold/warm request budgets and permissions
match the compiled-artifact plan. Measure parity before removing old consumers.

## Runtime module and API consolidation blueprint

Status: design recommendation; names and API shapes below are implementation targets,
not currently registered endpoints. Use a small set of shared modules in existing
packages. Appendix A components are reused, not regenerated as another component
library. Introduce files only as working extractions with migrated callers and tests.

### Module structure and ownership

| Path                                                                           | Action                                              | Responsibility                                                                        |
| ------------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `apps/neon/proxy.ts`                                                           | Extend existing                                     | Catalog-driven internal rewrite; preserve request-destination handling                |
| `apps/neon/lib/catalog-routes.ts`                                              | Extend existing                                     | Public URL catalog; no record or artifact queries                                     |
| `apps/neon/lib/entity-application-route.tsx`                                   | Refactor existing                                   | Dispatch validated surface intent to shared runtime                                   |
| `apps/neon/lib/entity-application-layout.tsx`                                  | Refactor existing                                   | One application-provider bridge inside existing shell                                 |
| `apps/neon/app/(shell)/app/entity/[entityCode]/[[...segments]]/page.tsx`       | Add                                                 | Single thin entity route; public/internal coordinate validation                       |
| `packages/platform/shell/shell/src/page-workspace.tsx`                         | Reuse                                               | Existing Appendix A composition; no entity-specific metadata reader                   |
| `packages/contracts/platform/entity-runtime/src/runtime-resource.ts`           | Add if no equivalent existing contract              | Typed bootstrap, section result, revision and invalidation wire contracts             |
| `packages/platform/entity/runtime/descriptor-client/src/index.ts`              | Refactor existing                                   | Public client exports and compatibility delegates                                     |
| `packages/platform/entity/runtime/descriptor-client/src/runtime-client.ts`     | Extract from existing client                        | Typed shared read/command operations; no entity-specific endpoint construction        |
| `packages/platform/entity/runtime/form-detail/src/record-360-panel.tsx`        | Refactor existing                                   | Descriptor-selected detail surface using shared workspace/section components          |
| `packages/platform/entity/runtime/form-detail/src/section-workspace.tsx`       | Refactor existing                                   | Section state, independent boundaries and demand-driven resources                     |
| `packages/platform/entity/runtime/form-detail/src/use-section-resource.ts`     | Extract when wiring real callers                    | Cache subscription, cancellation, visibility/activation and retry; no domain rules    |
| `packages/platform/entity/runtime/list-view/src/index.tsx`                     | Refactor existing                                   | Application/list presentation driven by the same pinned metadata                      |
| `packages/planes/neon/list-view/src/scope-adapters.tsx`                        | Extend existing                                     | Registered Neon scope behavior selected by validated capability                       |
| `server/packages/platform/metadata/src/metadata-service.ts`                    | Refactor existing                                   | Shared authoritative compiled-model reader                                            |
| `server/packages/platform/metadata/src/artifact-resolution.ts`                 | Extract from reader/consumer                        | Resolve fragments/profiles within one pinned release; no domain execution             |
| `server/packages/platform/metadata/src/distributed-descriptor-cache.ts`        | Extend existing                                     | Immutable fragment caching through existing Redis adapter                             |
| `server/packages/platform/experience/src/entity-runtime-routes.ts`             | Extract and register through existing routes        | Entity bootstrap, section and operation transport; authenticated context              |
| `server/packages/platform/experience/src/entity-runtime-contracts.ts`          | Add working schemas                                 | Validate wire input/output against shared resource contract                           |
| `server/packages/platform/experience/src/entity-page-planner.ts`               | Extract from experience/BP orchestration            | Authorized surface/resource plan; pure planning separated from resource reads         |
| `server/packages/platform/experience/src/entity-section-service.ts`            | Extract from section orchestration                  | Execute bounded requested resources; no eager collection fan-out                      |
| `server/packages/platform/experience/src/entity-operation-dispatcher.ts`       | Extract existing dispatch plumbing                  | Validate operation binding and delegate to registered business service                |
| `server/packages/platform/experience/src/ports.ts`                             | Extend existing                                     | Provider ports; keep platform independent of master-data service implementations      |
| `server/packages/adapters/experience-postgres/src/section-query-repository.ts` | Extract from adapter when required                  | Safe parameterized declarative collection/field queries                               |
| `server/packages/services/master-data/src/`                                    | Retain business functions; retire old orchestration | Governed requests, materialization, bank verification, eligibility and protected data |

File additions in this table supersede the earlier blanket preference for changing
only existing files: they are bounded extractions inside established packages, not
parallel runtime stacks. Check existing equivalent modules before creating them.
The server composition root registers domain functions through the experience ports;
the platform package must not import BP service internals to dispatch by entity code.
Compiler, lifecycle, numbering, policy, collaboration and attachment services retain
their existing package ownership and are not duplicated in these modules.

### API URL contract

Preserve the existing application/session endpoint
`GET /api/platform/experience/bootstrap`. It is distinct from an entity-page bootstrap.
The active compiled-reader transport family is `/api/entity-runtime`; it uses explicit
record paths and `surface`, avoiding a second versioned base path. Existing legacy BP
360 routes are removed only after their callers migrate to these generic routes.

| Active or planned method                                                                 | Purpose                                                                              |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /api/entity-runtime/:entityCode/records/:recordId/bootstrap?surface=...`            | Active: authorized surface projection, release pin, header and admitted section plan |
| `GET /api/entity-runtime/:entityCode/records/:recordId/sections/:sectionKey?surface=...` | Active: one independently authorized section resource                                |
| `GET /api/entity-runtime/:entityCode/records?surface=...&cursor=...`                     | Planned bounded list pages/filter changes                                            |
| `POST /api/entity-runtime/:entityCode/records/:recordId/sections:batch`                  | Optional bounded read batch; explicitly read-only, never command-capable             |
| `POST /api/entity-runtime/:entityCode/operations/:operationKey`                          | Planned explicit create/start-flow command with validated target coordinates         |
| `POST /api/entity-runtime/:entityCode/records/:recordId/operations/:operationKey`        | Planned explicit record command such as request-change or reveal                     |

All calls derive tenant/principal/plane from verified request context, not arbitrary
payload fields. Resource requests carry the admitted release pin/context generation;
commands additionally carry concurrency and idempotency coordinates as applicable.
An old release pin never bypasses current authorization or current operational blocks.
The server rejects unregistered operations and section keys, invalid cursors and
client-selected storage/handler targets. GET, HEAD and prefetch paths do not mutate.

Generic mutation transport is a dispatcher, not generic CRUD authorization. BP
commands still execute the governed request/materialization services. A shared API
does not permit BP create/patch when its Core disables generic writes. Do not add
universal `/compile`, `/next-number`, raw-table or arbitrary-query browser endpoints.
Existing comment/attachment APIs remain capability service endpoints; metadata binds
their service keys rather than proxying every file upload through an entity route.

Bootstrap returns one safe runtime model containing `releaseId`, `surfaceKey`,
record/resource revisions, header, navigation, admitted section plans, action
summaries and initial resource results. Section reads return their own revision,
field presentation, data, pagination and state; one failure is independently
retryable. Server-only storage and policy internals never enter this wire model.
Use the existing problem-response conventions for transport failures. Sensitive
reads/reveals use no-store; no shared HTTP caching of authorized page responses.

### Appendix A contract-to-runtime mapping

| Component                | Compiled selection                                     | Logic location                                       |
| ------------------------ | ------------------------------------------------------ | ---------------------------------------------------- |
| ApplicationBootstrapGate | Application/plane references only                      | Existing application bootstrap; no per-entity loader |
| PageWorkspace            | Surface/context/resource identity                      | Shared surface adapter and query lifecycle           |
| PageHeader               | Title/code/status field references                     | Shared header fed from bootstrap resource            |
| PageNavigation           | Kind, public destinations and action/flow references   | Shared navigation plus public route resolver         |
| PageLayout               | Supported layout enum                                  | Existing shell/layout components                     |
| SectionNavigation        | Stable section references and explicit mode            | Existing section-navigation component                |
| PageSection              | Fields/child collections, resource key and load policy | Shared section workspace/resource hook               |
| OverviewPanel            | Optional summary resource references                   | Same resource cache; no duplicate query owner        |
| PageActionBar            | Operation keys, placement and prerequisites            | Shared actions plus operation dispatcher             |
| PageInformationProvider  | Provenance/resource revision references                | Existing page-information registration and cleanup   |

Compile only these selections; accessibility, focus management, error boundaries,
request cancellation and responsive geometry remain reusable code guarantees. A
missing optional slot is omitted; an unsupported required renderer/binding blocks
the relevant surface. Every visible label follows `labelKey`/`defaultText`.

### Cleanup gates and delivery order

1. **Contract before folders:** executable artifact/wire schemas and semantic checks;
   map every BP field, section, action and protected value to an existing registry
   function or validated declarative query. Correct prototype gaps before admitting it.
2. **Reader before routes:** extract pinned metadata resolution, cache and profile
   preparation. Existing BP consumers delegate to that reader first, avoiding two
   compiler/reader implementations during route migration.
3. **Read-only vertical slice:** one generic entity route, bootstrap, header/Overview
   and Contacts; preserve old URLs through rewrites. Compare permission, rendering,
   network and SQL behavior with the existing application.
4. **Complete shared reads:** Manage and all BP sections; retain domain-specific
   queries only for demonstrable semantics. Add batching after request traces justify
   it. No eager data reads simply because a relation is published.
5. **Wire explicit commands:** flows, lifecycle, numbering, comments/attachments and
   reveal. Validate stable receipts, atomic materialization and independent resource
   invalidation. Numbering allocations stay zero during all page navigation tests.
6. **Retire duplicate code:** inventory route/import/export/API consumers, migrate
   them, then remove BP panel definitions, private section readers, full-aggregate
   orchestration and migrated Next pages/layouts. Preserve aliases and a testable
   fallback until parity is demonstrated. Do not delete BP business services.
7. **Finish the boundary:** a supported BP field/section change needs only publication;
   a new business behavior adds a registered domain function, never a private entity
   reader. Currency remains the flat-reference regression proof. Apply the proven
   package contracts to concrete Mesh/Studio runtime surfaces separately.

Per-stage evidence includes schema/compiler fixtures, negative admission tests,
authenticated public/internal route checks, cold/warm request and SQL traces,
keyboard/deep-link/dirty-state checks and zero read-triggered side effects. Rewrites
must preserve authentication and request-destination semantics. Record existing
behavior before removing code; a smaller file count alone is not success.

## Detailed local implementation phases

This is the authoritative execution checklist for the current local migration.
Every phase is **planned**, not implemented by this document edit. Use the existing
System Design §14.0/§14.0.1 and Appendix A, the compiled prototype in `New_Entity/`,
and the folder/API blueprints above together. Where this checklist differs from an
earlier migration gate, this checklist governs local execution.

### Local working agreement

- Make a direct local cutover in coherent slices. Delete replaced code in the same
  slice after callers move and a focused check passes. Do not maintain parallel
  authoritative readers, dual execution, feature-flag cohorts or compatibility APIs
  merely to support development.
- Preserve useful public URLs, bookmarks and route aliases through the route catalog.
  This does not require keeping the old Next page implementations or backend APIs.
- No production signatures, multi-instance benchmarks, Mesh sign-off, comprehensive
  deployment exercise or performance dashboard is required to complete a local phase.
  Keep existing authorization, tenant isolation, masking and governed-write safeguards.
- A local preview may use an explicit development-only admission path. It still
  validates schema, hashes, dependencies and actual required registrations. Do not
  weaken production admission or treat unimplemented handlers as working.
- Do not reset the tenant database just to reorganize application code. If storage
  changes become necessary, identify the exact objects/data and run a targeted local
  migration. Schema/catalog evidence must reflect the resulting schema.
- Keep one short completion note per phase: changed/deleted paths, check run, result
  and known limitation. No separate evidence registry or approval ceremony.
- The minimal check is affected-package type checking/build plus one focused behavior
  check. Add a negative/retry test where authorization, persistence or side effects
  change. Avoid repeatedly rerunning unrelated suites.
- The implementation starts in Neon. Other apps reuse proven contracts when needed;
  do not scaffold unused runtime folders in Mesh or Studio.

### Fixed naming and API conventions

Public page paths remain catalog-owned. The internal page target is
`apps/neon/app/(shell)/app/entity/[entityCode]/[[...segments]]/page.tsx`.
Use kebab-case file names, existing package import aliases, `*.test.ts(x)` beside the
owning package's established test layout and `kysely-*-repository.ts` for repositories
where that package uses Kysely. Do not rename files for appearance alone.

The proposed entity API base is `/api/platform/entity-runtime/v2`. The complete URL
shapes below form one transport contract; do not implement a second BP-specific
version alongside it. Existing global bootstrap and capability services retain their
own endpoints. API version, artifact schema version and release identity are separate.

| Method and path under the base                                          | Inputs                                                                                            | Output / behavior                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `GET /entities/:entityCode/bootstrap`                                   | Validated `surfaceKey`; optional `recordId`, section intent, view, density and bounded list query | Admitted release pin, safe surface model, header/action summaries and initial resources |
| `GET /entities/:entityCode/records`                                     | Surface, admitted release, filters, sort, cursor and limit                                        | Authorized projected rows and next cursor; no child expansion by default                |
| `GET /entities/:entityCode/records/:recordId/sections/:sectionKey`      | Admitted release, section-specific filters/cursor/limit                                           | Safe section presentation when needed, authorized data, revision and pagination         |
| `POST /entities/:entityCode/records/:recordId/sections:batch`           | Bounded requested section keys and validated per-section read inputs                              | Optional later optimization; independent section outcomes, no command execution         |
| `POST /entities/:entityCode/operations/:operationKey`                   | Operation input, release identity, stable idempotency key when mutating                           | Explicit start/create operation; returns command receipt and actual target identity     |
| `POST /entities/:entityCode/records/:recordId/operations/:operationKey` | Operation input, admitted release, applicable expected version and idempotency key                | Registered domain command; receipt, resulting versions and affected resources           |

Use existing authentication/request-context and problem-response infrastructure.
Tenant, principal and plane are derived from verified context. Query parameters
cannot nominate a table, SQL expression, permission or handler. Missing/deactivated
release pins, stale versions, validation failures and access failures have distinct
machine codes and appropriate existing HTTP conventions. Unknown IDs remain subject
to the existing disclosure policy. An internal rewrite never grants authorization.
Browsers receive safe runtime projections, not raw Core storage bindings or secrets.

The entity API may dispatch a published platform-service operation, but it must not
duplicate comment/file storage or create a second upload protocol. Reuse their
current service contracts. GET, render, prefetch and metadata resolution are read-only.

### Phase 0 — Establish the replacement inventory

**Outcome:** know exactly what will be shared, retained or deleted before changing
behavior. This phase is a short source inventory and local baseline, not a redesign.

Work:

- [x] Trace Manage, detail/360, intake, request list/detail, comments and attachments
      from the Next route through the frontend client to the server handler/repository.
- [x] Identify which active metadata is published versus generated in a provider,
      hardcoded in a panel definition or overridden by a local preview.
- [x] Record current public aliases, dynamic route matches, query-state ownership,
      shell/application provider mounts and hidden section fetches.
- [x] Tag each affected file `reuse`, `modify`, `extract`, `delete` or `retain-domain`.
      In mixed files, identify functions to move rather than deleting the whole module.
- [x] Locate import/export, route registration and test consumers of planned deletions.
- [ ] Capture one BP Manage/detail browser network trace. Local authentication was not
      available to this source-review session, so this remains browser verification work,
      not a reason to delay the inventory.

Primary files: `apps/neon/lib/entity-application-route.tsx`,
`apps/neon/lib/entity-application-layout.tsx`, BP route files, Neon list-view
`index.tsx`/`scope-adapters.tsx`, BP `src/360/` clients/registry, publication definition
consumer, metadata reader, BP 360 service/routes/repository. Paths are expanded in the
existing-file inventory above.

API action: enumerate actual registered URLs and callers, including browser-client
base-path transformations; do not assume an example URL matches current registration.
No new endpoint in this phase. No deletion or runtime behavior change required.

**Minimal exit check:** a replacement map exists in this plan/completion note for
each active BP read path, with retained business rules identified.

#### Phase 0 completion note — source inventory, 2026-09-19

This is a source-level map only. No browser trace was captured and no runtime code,
API registration, generated artifact, seed data or database object was changed.

##### Current route and provider ownership

| Public URL / route family                                                                                | Current Next entry and provider mount                                                                                                                                               | Current reader or command owner                                                                     | Phase action                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/mdg/business-partner`, `/manage`, `/partners`, `/business-partners`                                    | `apps/neon/app/(shell)/mdg/business-partner/{page,manage/page,partners/page,business-partners/page}.tsx`; the layout mounts `EntityApplicationLayout`, then `NeonEntityApplication` | Shared application descriptor/list runtime; BP-only scope is added by `BusinessPartnerScopeAdapter` | `reuse` shared layout/list; `extract` BP scope rules into a registered domain adapter; `delete` the route alias pages after the catalog rewrite owns their redirects                           |
| `/mdg/business-partner/:recordId`                                                                        | `[recordId]/page.tsx` renders `BusinessPartnerRecord`                                                                                                                               | Feature-gated `BusinessPartner360Shell`, with fallback `BusinessPartnerAggregateDetail`             | `modify` route to the generic entity route; `delete` both BP presentation shells after their metadata/runtime replacements work; `retain-domain` all registered BP reads and governed commands |
| Record subroutes: `/supplier`, `/customer`, `/banking`, `/bank-verification`, `/roles/new`, `/scope/new` | Corresponding `[recordId]/*/page.tsx` files directly render BP components                                                                                                           | Commercial controls, bank verification, role extension and scoped configuration                     | `modify` as operation/surface destinations; `retain-domain` the specialist operations and handlers; only remove a route wrapper after the generic route can dispatch the registered operation  |
| `/mdg/business-partner/new`, `/customer/new`, `/requests/new`                                            | Route wrappers render `AuthorizedNewBusinessPartnerRequest` or `BusinessPartnerRequestEntry`; `requests/new` redirects to `new`                                                     | Existing Entity Intake plus BP request case client                                                  | `modify` to generic flow routing; `retain-domain` request/case materialization; `delete` duplicated alias wrapper after route catalog migration                                                |
| `/mdg/business-partner/requests`, `/requests/:requestId`, `/edit`                                        | Requests list uses `NeonEntityApplicationSection`; detail/edit render BP request components                                                                                         | Governed BP request/case client and `BusinessPartnerRequestService`                                 | `modify` read surfaces to compiled Flow/Operation metadata; `retain-domain` case lifecycle, validation, workflow, evidence and materialization                                                 |
| `/mdg/business-partner/mesh-proposals` and public supplier application                                   | Direct BP components                                                                                                                                                                | Mesh proposal/profile and applicant services                                                        | `retain-domain`; outside the first generic record-reader cutover                                                                                                                               |

The existing top-level layout is currently one application provider mount:
`BusinessPartnerLayout` → `EntityApplicationLayout(entityCode)` →
`NeonEntityApplication` → `NeonScopeAdapter`. It is reusable infrastructure. The
BP-specific branch in `packages/planes/neon/list-view/src/scope-adapters.tsx` owns
`role`, `eligibleOperation`, and the company/operating-organization compatibility
rule. That branch must become a registry-resolved BP scope adapter, never a branch
inside the generic entity orchestrator.

##### Actual registered read and metadata paths

| Current HTTP path                                                                                            | Browser client / caller                                                                                    | Server registration and data owner                                                                                      | Replacement decision                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing generic entity application/list/record descriptor and list endpoints                                | `NeonEntityApplication`, `BusinessPartnerRequestEntry`, `RequestWorkspaceDetails`, `PartnerReferenceField` | Existing descriptor/list platform services                                                                              | `reuse`; the new bootstrap/section reader must use the same request context and descriptor admission model                                                                    |
| `GET /api/neon/business-partner-definitions/active-descriptors`                                              | No active product UI caller found in this inventory                                                        | `LocalBusinessPartnerDefinitionConsumer` via `registerLocalBusinessPartnerDefinitionRoutes`                             | `delete` when all consumers use split-artifact release resolution; retain the consumer's admission rules until the replacement is proven                                      |
| `GET /api/neon/business-partner-definitions/active-request-form`                                             | `packages/planes/neon/business-partner/src/client.ts`                                                      | Same local consumer; it overlays `local-definition-preview` for request flow/schema resolution                          | `extract` preview/admission behavior into the generic metadata reader; `delete` this BP-only transport route only after New and Edit use the pinned Flow artifact             |
| `GET /api/neon/business-partners/:id/360/summary`                                                            | `BusinessPartner360Shell` through `business-partner-360-client.ts`                                         | `registerBusinessPartner360Routes` → `BusinessPartner360Service` → `KyselyBusinessPartner360Repository`                 | `delete` as a BP-specific aggregate endpoint after generic bootstrap supplies the same safe header, applicability, section/action summary and revision data                   |
| `GET /api/neon/business-partners/:id/360/:section`                                                           | Six BP 360 clients and section components                                                                  | Same route registration/service/repository plus section, role/company, commercial, explainability and network providers | `extract` each provider behind a registered section reader; `delete` this catch-all BP transport endpoint only as each compiled section maps to a supported registered reader |
| `POST /api/neon/business-partners/:id/360/comments`                                                          | `ResourceSection`                                                                                          | BP 360 route delegates to the collaboration service                                                                     | `delete` this wrapper after the generic runtime calls the existing collaboration capability API; `retain-domain` neither comment storage nor its authorization inside BP 360  |
| `POST /api/neon/business-partners/:id/360/identifiers-tax/reveal` and `/banking/reveal`                      | Section/commercial clients and `use-audited-reveal`                                                        | BP 360 route/service, protected-value resolver and audit policy                                                         | `retain-domain` reveal authorization, purpose, expiry and audit; `modify` only the operation reference and client dispatch; no generic read/prefetch replacement              |
| `GET /api/neon/business-partner-cases` and legacy `/business-partner-requests`, `/:id`, `/:id/view`          | BP `client.ts`, request list/detail/edit surfaces                                                          | `registerBusinessPartnerRequestRoutes` → `BusinessPartnerRequestService`                                                | `retain-domain`; generic entity runtime dispatches a registered case reader/operation, never substitutes flat CRUD                                                            |
| `GET /api/neon/business-partners/:id`                                                                        | Legacy `BusinessPartnerAggregateDetail` fallback                                                           | Request routes delegate to `legacyAggregate` / request service                                                          | `delete` with the feature-gated legacy aggregate detail after generic bootstrap is live                                                                                       |
| Eligibility, supplier activation, qualification, preference, customer designation/credit/lifecycle endpoints | BP commercial controls and dedicated pages                                                                 | `business-partner-eligibility-routes.ts` and BP eligibility service                                                     | `retain-domain`; expose as registered action/read capability only where the compiled contract refers to it                                                                    |
| `/api/attachments/*`                                                                                         | Request attachment control and BP commercial download control                                              | Existing attachment service                                                                                             | `retain-domain`; generic runtime references it as a lazy capability and must not proxy uploads/downloads through entity runtime                                               |

`server/apps/platform-host/src/composition/register-services.ts` is the confirmed
mount point for both the local definition routes and BP 360 routes. A replacement
must change that composition registration in the same slice as its final caller;
removing a route module alone would leave a stale registrar/import.

##### Presentation, metadata and query-state inventory

| Item                                                                 | Current source of truth                                                                                                                        | Classification and required treatment                                                                                                                                               |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application/list navigation, list surface and generic intake surface | Published generic entity descriptors consumed by `EntityApplicationSection`, `EntityListRuntime` and Entity Intake                             | `reuse`; enrich the shared contract rather than create a second BP descriptor reader                                                                                                |
| Onboarding request form/schema/workflow                              | Active BP publication consumed by `LocalBusinessPartnerDefinitionConsumer`; it can overlay a local preview                                     | `extract`; compilation and admission become split-artifact metadata behavior. Preview must still validate release/hash/handler registrations.                                       |
| 360 tab/section/sidebar layout                                       | `src/360/panel-definition.ts` contains `BUSINESS_PARTNER_360_PANEL`; `realignPartnerPanel` mutates older layouts at runtime                    | `delete` after the compiled detail shell contains the migration-complete layout. Do not copy `realignPartnerPanel` into generic runtime; republish/fail obsolete layouts.           |
| Section labels and section-provider registration                     | `src/360/section-registry.ts` and `section-providers.ts`                                                                                       | `extract`; labels/presentation move to Presentation artifacts and provider checks to the server registration validator. Confirmed `governance` label is **Governance & ownership**. |
| Summary header/section applicability, role lens and context state    | 360 summary endpoint; browser reads `section`, `tab`, `roleLens`, `operatingOrganizationId`, `companyCodeId`, `legalEntityId`, `asOf` from URL | `modify`; generic PageWorkspace owns query parsing, history, cancellation and cache key. Domain provider resolves applicability with the authoritative context.                     |
| Section resource state                                               | Each BP component owns an effect, `AbortController`, cursor and retry state                                                                    | `extract`; use generic section-resource ownership and independent boundaries. Preserve per-section cursor/retry and never turn a section switch into full aggregation.              |
| Comments and attachments                                             | `ResourceSection` fetches only when that rendered section is active; comments can mutate from the same component                               | `extract`; generic lazy capability section uses the existing capability services. Keep mutation explicit and idempotent.                                                            |
| Protected reveal values                                              | Dedicated clients, purpose claims and audited reveal hook                                                                                      | `retain-domain`; only an explicit registered Operation can invoke this. It stays uncached and absent from normal metadata/data responses.                                           |

The 360 shell initially fetches only `summary`. It renders one selected section and
that section's component issues its own request. This is already mostly lazy, but
the implementation is fragmented across `business-partner-360-*-client.ts` files,
individual `useEffect`s, and a hardcoded component switch. The generic runtime must
preserve the lazy behavior while centralizing resource identity, cancellation,
revision and boundary handling. It must also remove the legacy feature-gated
aggregate fallback, which does a parallel aggregate plus eligibility read.

##### File disposition and downstream consumers

| Files / functions                                                                                                                                                                                   | Tag                           | Phase 1+ disposition                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/neon/lib/entity-application-route.tsx`, `entity-application-layout.tsx`, `apps/neon/lib/catalog-routes.ts`, `apps/neon/proxy.ts`                                                              | `modify`                      | Retain as the catalog/rewrite/application shell; add generic entity internal target without a BP page-specific provider.                                                                                                        |
| `apps/neon/app/(shell)/mdg/business-partner/**`                                                                                                                                                     | `modify` / eventual `delete`  | Preserve public aliases through catalog rewrite. Replace page wrappers progressively; remove alias and wrapper files when the generic route covers their public destination.                                                    |
| `packages/planes/neon/list-view/src/index.tsx`                                                                                                                                                      | `reuse` / `modify`            | Keep shared list runtime and workspace context control; consume the registered scope policy rather than BP source imports.                                                                                                      |
| `packages/planes/neon/list-view/src/scope-adapters.tsx`                                                                                                                                             | `extract`                     | Move `BusinessPartnerScopeAdapter`, `businessPartnerRoleFromDirectoryQuery` and `businessPartnerScopeCoordinate` to the Neon BP domain registration boundary; retain common adapter in shared list package.                     |
| `packages/planes/neon/business-partner/src/360/{business-partner-360.tsx,panel-definition.ts,section-registry.ts,section-providers.ts,business-partner-360-context.tsx}`                            | `delete` / `extract`          | Delete hardcoded shell/panel/registry/context after generic runtime owns them. Extract only BP-specific renderer/operation provider registrations that do not fit a standard field/collection renderer.                         |
| `packages/planes/neon/business-partner/src/360/*-client.ts` and `components/{common-section,related-section,resource-section,role-company-sections,network-section,explainability-sections}.tsx`    | `delete` / `extract`          | Replace transport clients and generic-shaped renderers with shared section resources. Retain/registry-wrap specialized banking, role/company and governed-action renderers until their compiled bindings are supported.         |
| `packages/planes/neon/business-partner/src/{request-entry.tsx,request-workspace.tsx,request-form-descriptor.ts,intake-submit.ts,client.ts}`                                                         | `retain-domain` / `modify`    | Keep BP case payload, validation, materialization and workflow semantics. Replace only BP-only descriptor/request-form loading with the shared pinned artifact reader.                                                          |
| `server/packages/services/publication/src/{business-partner-definition-consumer.ts,business-partner-definition-consumer-routes.ts,local-definition-preview.ts}`                                     | `extract` / eventual `delete` | Preserve verified active/preview admission and request-flow resolution; generalize it into the metadata/release reader, then remove BP-only transport/consumer code.                                                            |
| `server/packages/platform/metadata/src/{metadata-service.ts,runtime-descriptor-repository.ts,distributed-descriptor-cache.ts}`                                                                      | `reuse` / `modify`            | Extend existing verified reader/cache; retain its rule that immutable descriptors are cached while current authorization and record data are not.                                                                               |
| `server/packages/services/master-data/src/business-partner-360-*.ts`, `kysely-business-partner-360-*.ts`, `business-partner-360-routes.ts`                                                          | `extract` / eventual `delete` | Rehome reusable registered readers behind the entity runtime section/operation registry, then delete BP 360 aggregation/route wrappers. Keep SQL/domain policy code where it supplies a real BP section or protected operation. |
| `server/packages/services/master-data/src/{business-partner-request-*,business-partner-eligibility-*,kysely-business-partner-case-*,business-partner-invitation-*}` and plane BP bank/Mesh services | `retain-domain`               | Governed case, lifecycle, policy, effective-date eligibility, protected bank and Mesh semantics remain registered BP business functions.                                                                                        |
| `server/apps/platform-host/src/composition/register-services.ts`                                                                                                                                    | `modify`                      | Replace BP-only definition/360 registrars only after their shared registrations and all callers are live.                                                                                                                       |

Tests are colocated extensively under `packages/planes/neon/business-partner/src/**`
and `server/packages/services/{master-data,publication}/src/__tests__`. Before each
deletion, search imports/exports and update the tests that exercise the replacement;
the relevant currently named suites include BP 360 client/panel/section-provider
tests, business-partner-definition tests, and business-partner-360 production
integration tests. Existing request, eligibility, banking, Mesh, attachment and
numbering tests are domain coverage to retain, not presentation code to delete.

**Phase 0 result:** source inventory complete. The browser network trace remains
pending local authentication. Phase 1 may start because the required replacement
map and retained business-rule boundary are now explicit.

### Phase 1 — Make the compiled contract executable

**Outcome:** one typed contract interprets the existing five artifact types and the
release envelope, with no schema invented separately inside BP UI or server readers.

Work:

- [x] Extend existing publication/metadata contracts with discriminated split-artifact
      schemas. Reject unknown normative properties and unsupported required variants.
- [x] Define surface/resource wire schemas in the entity runtime contract package;
      share runtime-neutral types without importing server-only bindings into browser code.
- [x] Define explicit layout/navigation, resource identity, load policy, owner linkage,
      pagination, lookup references, applicability and action references.
- [x] Distinguish release integrity dependencies from the subset needed for a page
      intent. Shared profile resolution uses documented precedence and cannot relax security.
- [x] Define typed computed/aggregate fields separately from stored columns; computed
      properties cannot pretend to be DB columns. Declare queryable/sortable behavior
      only when the server has a supported SQL/handler implementation.
- [x] Check BP supplier/customer fields, contacts/channel schema, section labels,
      child bindings, related-owner joins, sensitive fields and actual read permissions.
- [x] Validate recursive child collections, duplicate keys, relation coverage, source
      usage, profile cycles, operation references, masking/reveal pairs and required
      registration. Parent-authorized embedded sections need a resolvable parent binding,
      not an unrestricted string escape from permission checks.
- [x] Keep shared UI guarantees in components. The JSON selects supported layout,
      navigation and resource behavior; it does not redefine focus/error-boundary code.
- [x] List unsupported prototype properties as explicit follow-up or fail them when
      required. Do not add empty speculative properties for future entities.

Files to modify: `server/packages/contracts/publication/src/artifact.ts`,
`projection.ts`; `server/packages/contracts/metadata/src/descriptors.ts`, `ports.ts`;
`packages/contracts/platform/entity-runtime/src/record-presentation.ts`,
`record-360-panel.ts`, `related-presentation.ts`, `intake.ts`.
Add `runtime-resource.ts` in that existing contract package only if no equivalent
contract can be extended. Update `New_Entity/CONTRACT.md`, `README.md`, `validate.py`,
`verify_live_schema.py` and affected JSON fixtures/hashes.

API action: specify and validate bootstrap/resource/command shapes, without registering
non-working routes. Existing BP APIs remain in use until their replacements execute.
Cleanup: remove duplicate draft property definitions and stale claims of supported
handlers; retain historical source coverage as review evidence, not runtime payload.

**Minimal exit check:** valid BP fixtures parse; one bad child binding and one
missing required handler are rejected. Existing affected contract consumers type-check.

**Local development validation:** use the active local Neon development container for
storage-catalog verification. The supported local targets are source mode and
container mode; validate the same change in the selected development mode, then
deploy it to QA for the next test round. Do not create disposable database instances
for this plan.

#### Phase 1 completion note — executable draft contract, 2026-09-19

Implemented the contract layer only; no entity runtime route, compiler output,
publication activation or existing BP API was changed.

- `server-contract-publication` now carries a prepared split-artifact projection and
  parses the five v2 draft artifact kinds and the release envelope. It rejects unknown normative top-level properties, unsupported
  schemas/types, bad release membership, absent dependencies, absent required
  handler/renderer/resolver/evaluator registrations, and invalid direct or nested
  child field bindings.
- `contract-platform-entity-runtime` now owns a browser-safe bootstrap/resource
  schema: release pin, immutable artifact hashes, page resource identity/state,
  revision/cursor and advisory action state. Server-only Core bindings, policy input,
  protected values and executable handler configuration cannot appear in it.
- `server-contract-metadata` now represents compiled release references, page intent,
  computed/aggregate field origin and registered query support. The bootstrap reader
  port is optional until the Phase 5 reader/API implementation registers it.
- The BP draft remains unsigned review content. Its existing validator continues to
  validate all 93 artifacts, relation/source coverage, policy/masking/reveal rules,
  registry evidence and cross-artifact references. A regression test now proves a
  missing handler registration fails. The contract documentation states the current
  boundary and intentionally unsupported runtime behavior.

Checks passed: publication contract typecheck; publication split-artifact tests
(real BP Core/Operation/surface/section fixtures plus negative registry/child-binding
cases); metadata contract typecheck; entity-runtime contract typecheck; `validate.py`;
and 35 Python validator mutation tests. `verify_live_schema.py` was not run because
this phase did not alter storage bindings and needs a configured Neon catalog URL.

### Phase 2 — Generate artifacts through the existing compiler

**Outcome:** runtime examples can be produced from an authoring input through the
compiler, rather than requiring hand-maintained deployment JSON.

Work:

- [x] Extend current compiler entry points to emit Core, Operation, surface, section
      and selected Flow artifacts plus the release envelope.
- [x] Extract common compilation rules from BP-specific emission. Retain BP authoring
      validation for actual BP semantics; do not turn its business checks into generic flags.
- [x] Canonicalize and hash content; validate dependency closure, references and
      supported renderer/handler contracts before storing the artifact set.
- [x] Preserve the existing authority/target projection architecture. The compiler is
      pure: it cannot activate or replace a usable set. Activation remains with the
      publication orchestrator after the v2 persistence/reader path is introduced.
- [x] Generate fixtures deterministically and update prototype coverage. Do not embed
      source test cases, provenance catalogs or unused fields into runtime Core.
- [x] Keep development preview explicit and scoped. Normal reads never compile.

Files changed: publication package `compiled-entity-artifact-compiler.ts`,
`business-partner-definition-compiler.ts`, and their focused tests. The existing
`document-collection-compiler.ts` was renamed to
`compiled-entity-collection-compiler.ts`; its API export remains stable. The generic
compiler deliberately stops before `publication-artifact-loader.ts`,
`publication-artifact-store.ts`, `publication-orchestrator.ts`, and
`kysely-local-projection-repository.ts`: those files now persist a v2 payload through
the generic `compiled_entity_runtime` branch. It is a separate immutable projection,
never a v1-envelope translation.

API action: reuse the existing authoring/publication/preview APIs; add no browser
`/compile` endpoint. Cleanup: remove superseded manual emission branches once the
same input is generated correctly. Never remove the source fixtures needed for parity.

**Completion note (local, 2026-09-19):**
`compileCompiledEntityArtifacts` produces an immutable, sorted release set from
hash-free authoring input, then parses and validates the entire graph before returning
anything. The BP adapter first performs its existing governed-request checks and then
delegates only hashing, graph and registry checks to that compiler. A complete rebuild
of the 93 Business Partner review artifacts is deterministic, and a missing dependency
is rejected. The compiler uses the injected production canonicalizer; the checked-in
Python review hashes are intentionally not asserted by the TypeScript test until one
cross-language canonical JSON implementation is adopted.

**Published local-DEV output (2026-09-20):**
`publish-development-compiled-entity-runtime.ts` is one generic publisher with
entity code, authoring root and approved definition-release coordinates as inputs.
For Business Partner it validates the published governed-request definition first,
then calls the generic split-artifact compiler. It published, signed, staged,
verified and activated source release `285449b5-bf92-5802-b59a-1f0b859e16f5` under
`metadata.compiled_entity.business_partner`. The active Neon payload
`01a0ba8c-d27c-7674-afd6-97e9584362e3` contains 93 artifacts and a `published`
compiled release. The outer local-DEV signature is deliberately
`development-local-sha256`; the approved Studio definition source retains its
Ed25519 signature. This script contains no Business Partner reader, UI or handler.

**Minimal exit check:** compiling the same BP input yields the same artifact hashes;
a broken required reference is rejected; the compiler returns one complete immutable
set and the signed local-DEV publication activates as one pinned payload.

### Phase 3 — Install the shared pinned reader and cache

**Outcome:** all migrated BP metadata reads go through the shared metadata package.

Work:

- [x] Resolve effective entity/release coordinates once per request and build an
      artifact-key index. Fetch only fragments required by the surface/section/operation.
- [x] Resolve field and operation profiles once per input hash set and validate the
      resolved result. Arrays/overrides follow the contract; never erase required policy.
- [x] Extend existing Redis cache support; coalesce concurrent loads and use verified
      repository/store fallback on cache outage/corruption. No compile-on-miss path.
- [ ] Separate immutable raw IR from authorized browser projections and record data.
      Include effective tenant/plane/preview scope in artifact resolution and principal,
      access epoch, context and locale in relevant data/projection keys.
- [x] Keep admitted release pins stable across independent fragment reads. A missing
      fragment does not trigger a silent switch to the latest release.
- [ ] Refactor `business-partner-definition-consumer.ts` callers to use the shared
      reader. Any BP request-schema interpretation that remains is a business adapter,
      not a second artifact loader or cache.

Files: metadata package `metadata-service.ts`, `descriptor-parser.ts`,
`runtime-descriptor-repository.ts`, `distributed-descriptor-cache.ts`, `invalidation.ts`;
extract `artifact-resolution.ts` as working reader code; update publication consumer
and existing cache adapter integration only as needed.

API action: internal reader port only; the frontend never reads Redis directly.
Cleanup: delete old private loading/cache functions and their dead exports after
callers move. Preserve current authorization/preview pin handling.

**Implementation note (local, 2026-09-19):** the shared reader is now implemented
in `server/packages/platform/metadata/src/artifact-resolution.ts` and
`compiled-entity-reader.ts`. It holds one admitted release pin per request intent,
indexes its immutable manifest, coalesces release/artifact loads, reads Core plus only
the selected surface/section/flow, and resolves only the named defaults profile. The
new Redis adapter in `distributed-descriptor-cache.ts` caches raw release/artifact IR
by tenant, plane, preview scope, release hash and artifact hash. It never caches a
principal-specific browser projection. Cache failure/corruption falls back to the
verified source; no path compiles on demand.

The local authority projection persists the active v2 payload through the generic
`compiled_entity_runtime` path. Neon request-schema and workflow callers now use the
BP domain adapter over the shared pinned reader; their former per-transaction v1
projection loading is removed. The unused active-definition compatibility routes were
deleted with their export. BP360 layout and Mesh profile publication retain their
separate domain readers until their Phase 5 surface/plane migrations. The shared
reader remains free of BP-specific loaders or caches.

**Minimal exit check:** repeated reads reuse a fragment, Redis failure still resolves
verified content, and one request cannot combine two release sets.

### Phase 4 — Cut over routing and shared application composition

**Outcome:** the public BP URL opens the shared entry point with one shell and one
application provider; no metadata or section data is read by a BP Next page.

Work:

- [x] Extend the existing navigation catalog with typed public-to-internal mappings
      and reverse mapping for links. Keep `new`, `manage`, `requests` and other named
      destinations ahead of record patterns; validate dynamic identifiers.
- [x] Add the single optional catch-all entity page. Refactor the existing route and
      layout bridges to accept a validated application/surface/record intent.
- [x] Extend `apps/neon/proxy.ts` for catalog rewrites, preserving its destination
      header behavior. No DB/metadata reads in the proxy and no duplicate rewrite list.
- [x] Preserve `vid`, density, filters, query strings, section fragments, history and
      canonical public links. Handle direct internal URLs consistently and authorize
      their resolved public intent; prevent redirect/rewrite loops.
- [x] Keep one `<main>`, `PageWorkspace`, page heading and primary scroll surface.
      Use existing shell boundaries, application navigation and footer ownership.
- [x] Route Manage first. Migrate detail/intake/request URLs only when the corresponding
      surface has a working adapter; do not route them into a placeholder.
- [ ] Let the existing generic catalog page retain module/home behavior. Remove its
      duplicate entity rendering branch as those mappings move to the shared dispatcher.

Files: `apps/neon/proxy.ts`, `lib/catalog-routes.ts`,
`lib/entity-application-route.tsx`, `lib/entity-application-layout.tsx`, existing
generic catalog page; add only the new internal page. Extend existing navigation
contract/resolver and Neon list/application adapter. Shell components are reused.

API action: public route change is an internal rewrite, not an API redirect. During
this phase use working shared adapters; entity bootstrap transport is delivered next.
Cleanup: remove migrated BP route wrappers/layouts in the same slice once no route
depends on their composition; preserve their URL behavior through catalog mappings.

**Implementation note (local, 2026-09-19):** Business Partner Manage is the first
catalog mapping. `/mdg/business-partner/manage` internally rewrites to
`/app/entity/business_partner/manage`; it does not redirect, so the browser address,
history, `vid`, density, filters and repeated query parameters remain unchanged. The
new shared optional catch-all page resolves only catalog-authorized internal routes,
uses the existing `NeonRouteEntitlement`, and passes the public canonical path to the
existing shared application provider and route component. Direct internal access is
resolved back to that canonical destination header. The proxy has no metadata or
database access and never rewrites an internal path again.

The old BP Manage page wrapper was removed. BP detail, intake and request pages are
unchanged because their compiled-surface adapters do not exist yet. Currency remains
on its existing generic catalog route. The generic catalog page still owns all
unmigrated entity paths; its duplicate entity branch is deferred until the shared
dispatcher supports those active adapters.

**Minimal exit check:** BP Manage and Currency render through their intended paths;
refresh/Back retain query state; no duplicate shell/provider or rewrite loop.

### Phase 5 — Deliver generic bootstrap and demand-driven reads

**Outcome:** Manage and BP360 read from the compiled surface/resource contract through
one shared client/server path. This is the main replacement for BP hardcoded readers.

Work:

- [x] Implement `entity-page-planner.ts` inside the experience package. It resolves
      the admitted surface, fields, applicability dependencies and section/action plans.
- [ ] Implement the list route from the API table. The generic bootstrap and individual
      section routes are registered and active; add a batch endpoint only when two real
      callers benefit from coalescing.
- [x] Refactor descriptor-client `index.ts`; extract `runtime-client.ts` for the
      common bootstrap/section request-response operations and release/resource identities.
- [ ] Build a safe query plan from allowlisted projections, typed filters and relation
      bindings. Enforce tenant and owner linkage in every child query. Parameterize
      values and validate identifiers; no client SQL/table/handler selection.
- [x] Start with header + Overview + Contacts. Merge overlapping BP-row projections
      when safe; do not fetch header fields separately for breadcrumbs and title. The
      browser migration remains the next vertical slice.
- [ ] Migrate remaining sections: roles/company scope; addresses; classifications;
      qualifications/certifications; masked bank/tax/identifiers; governance; activity.
      Contact channel and composite projections need typed, verified owner mappings.
- [ ] Retain specialized business reads only where declarative semantics are
      insufficient, through registered ports. Do not hide the former full aggregator
      behind a single generic provider key.
- [x] Implement the resource hook/section workspace: explicit initial/visible/active
      loading, fresh-cache reuse, in-flight deduplication, cancel on identity changes,
      independent retry and suppression of stale responses.
- [ ] Supply authorized section availability without disclosing restricted existence.
      Keep counts unknown until requested/available; no global collection count fan-out.
- [x] Load selected deep-link content without loading intermediate sections. Preserve
      scroll geometry, keyboard heading focus and draft state per Appendix A.
- [x] Define child-resource revision/invalidation independently of BP version. Role,
      comment or attachment changes need not update the BP row to invalidate correctly.

Files: experience `contracts.ts`, `ports.ts`, `service.ts`, `routes.ts`; extract
`entity-runtime-contracts.ts`, `entity-runtime-routes.ts`, `entity-page-planner.ts`,
`entity-section-service.ts`. Extend experience-postgres `index.ts`; extract
`section-query-repository.ts` only with migrated callers. Update shared descriptor
client, query core, list-view, form-detail `record-360-panel.tsx`,
`section-workspace.tsx`, `section-navigation.tsx`; extract `use-section-resource.ts`.

Existing BP code: migrate metadata/dispatch responsibilities from
`src/360/panel-definition.ts`, `section-registry.ts`, `business-partner-360.tsx`,
`business-partner-360-client.ts`, `business-partner-360-section-client.ts` and server
`business-partner-360-service.ts`, `business-partner-360-routes.ts`,
`kysely-business-partner-360-repository.ts`. Before deleting mixed modules, retain
or move `business-partner-provider-projection.ts` field protection and
`business-partner-record-header.ts` domain semantics that remain necessary.

Cleanup: remove each replaced BP read endpoint/client/section switch after all local
callers migrate. Do not keep compatibility GETs unless a currently used caller is
identified. Retain business query functions behind ports; remove aggregate orchestration.

**Implementation note (local, 2026-09-19):** the initial generic planner is in
`server/packages/platform/experience/src/entity-page-planner.ts`. It accepts an
already admitted Core/surface pair and the server-authorized permission set, produces
one header field projection, and exposes only permitted sections. Overview loads
initially, an addressed deep-link section loads actively, and remaining admitted
sections are visible-load candidates. It has no record query, client-selected table,
or client-selected handler path. This is intentionally the first component: the
verified v2 release source and server resource routes remain required before BP360 can
be migrated from its current v1 readers.

**Verified-source progress (local, 2026-09-19):**
`createRuntimeMetaCompiledEntityReleaseSource` now reads activated
`runtime_meta.applied_release_payload` values with artifact kind
`compiled_entity_runtime`. It retrieves the release envelope using tenant, plane,
entity and optional release pin coordinates, then retrieves a single artifact by the
same release hash and manifest key. The pinned reader re-validates both values before
use. The v2 payload is signed and active in local DEV. The next change is registering the
generic bootstrap/section service and routes against this admitted source, then
migrating actual BP callers.

**Bootstrap and section-route progress (local, 2026-09-19):**
`entity-section-service.ts`, `entity-runtime-contracts.ts`, and
`entity-runtime-routes.ts` provide the generic record bootstrap and individual
section boundary. Bootstrap resolves an admitted Core/surface pair and reads header
fields once through an allowlisted repository port. Section reads rebuild the admitted
plan, omit denied sections before an artifact/data read, and dispatch only the
`registered_service` handler declared by the section artifact. There is no batch
endpoint and no generic fallback aggregator. Routes are opt-in until the composition
registers a real header repository, handler registry, and active v2 publication source.
The service test proves a denied Contacts section never invokes its reader or handler.

**Activated-route and browser-workspace slice (local, 2026-09-20):** The generic
bootstrap and individual-section routes are registered in platform-host after the
active v2 release is admitted. Their header repository and registered-section registry
are composed with the existing BP domain service for `neon.bp.section.overview.v1` and
`neon.bp.section.contacts.v1` only. The adapter returns one header projection from the
protected BP core header and delegates each admitted section independently; it does not
query tables directly or invoke the old aggregate endpoint. `businessPartner360.header`
reuses the record admission/core-resolution path but deliberately avoids fragment,
completeness, presentation and activity reads; its focused service test proves no
fragment reader is called. `businessPartner360.overview` now provides a separate,
bounded row projection for the Overview section, including only the Core fields bound
by that section; it also has no fragment, completeness, activity or section-count
query. The composition now
registers the independent existing domain handlers for identity, Contacts, Addresses,
identifiers/tax, role/company scope, commercial controls, requests, activity,
business activity and governance/network through that generic boundary. Attachments,
comments and workforce remain deferred to their dedicated collaboration/workforce
adapters. The existing descriptor client now owns `runtime-client.ts`, and the existing form-detail package owns the
shared `use-section-resource.ts` and `EntityRuntimeWorkspace`: cache keys include the
caller-supplied principal/authorization-epoch/workspace-context/locale scope; reads
are deduplicated, cancelled on identity change, pin-checked against bootstrap, retried
per section and explicitly invalidated after a child mutation. An addressed deep-link
loads only its selected section plus mandatory initial sections. The BP record wrapper
now mounts `EntityRuntimeWorkspace` at the existing public record URL. It reads and
writes the `section` deep-link query state without re-bootstrapping on Back/Forward,
and renders `platform.fields.v1` and `platform.related-collection.v1` from the
server-authorized renderer projection. The section response contains renderer key,
bound field/child-collection keys and localized labels only; it excludes physical
bindings, handler keys and policy evaluator inputs. The next vertical slice replaces
or registers specialized renderers and collaboration/workforce handlers, then deletes
the remaining v1 aggregate reader and BP360 UI orchestration.

**BP consumer migration progress (local, 2026-09-19):**
`business-partner-definition-consumer.ts` now consumes the shared
`EntityDefinitionSource<T>` interface from `entity-definition-source.ts`. Its legacy
`LocalProjectionRepository.findActiveBusinessPartnerDefinition` path remains the
default adapter, preserving active request/workflow behavior. A v2-backed source will
replace that adapter after Core/Operation/Flow artifacts contain the required BP
request schema and workflow semantics and the first `compiled_entity_runtime` release
has been activated. This avoids translating a v1 bundle into an incomplete v2 model at
read time.

**Publication and projection update (local, 2026-09-19):** the publication
contract now accepts `compiled_entity_runtime` as a generic artifact kind and
persists it through the existing immutable payload projection. The runtime host
constructs the shared `PinnedCompiledEntityReader` from that verified source and
the existing Redis adapter. Raw IR cache identities contain tenant, plane,
preview and release coordinates only. The separate browser-projection identity
contains principal, authorization epoch, business-context and locale. Its output
contains only authorized presentation fields/sections, never storage bindings,
policy inputs or handler configuration.

The checked-in `New_Entity/business_partner` files remain authoring-review input:
their artifacts are `draft_for_review` and their release is `unsigned_review_only`.
The publisher compiles them into a separate immutable published payload only after it
validates the approved Studio definition source, including BP's governed
request/workflow semantics. The active v1 BP definition consumer remains until its
callers are migrated to the shared reader.

**BP definition source completed (local, 2026-09-19):** Studio release
`cf773137-0b77-48ca-89ca-3d3c24c67933` for
`studio.business_partner.definition.storage.v6.1e15e619-7ec4-4d87-89ad-e53505d023b9`
is now `published`. Its immutable, Ed25519-signed definition artifact is
`2a25e20d-260a-434d-b35b-7a36cbf3b16a` and remains linked to definition revision
`56f671d9-8ac8-44ae-9ec3-4bcb9e160590`. The source contains the 19 request schemas
and the customer, supplier, workforce, and governance workflow definitions needed
by the v2 operation/flow compilation. This completes the source-release gate only;
it does not make the separate draft v2 artifact set activatable.

**Minimal exit check:** open Manage and a record, then two sections; only requested
resources load, returning to a fresh section causes no duplicate fetch, and a denied
section cannot return data through either individual or batch requests. Check one
section error leaves the header and another section usable.

### Phase 6 — Wire operations, flows and control-table decisions

**Outcome:** published actions use a shared dispatcher but execute the same governed
BP functions. Navigation cannot allocate a number or create a request.

**Implementation progress (local, 2026-09-20, active compiled release 6):**
`entity-operation-dispatcher.ts` resolves the pinned Operation artifact, admits only
declared operation keys, checks current permission, expected record version,
idempotency declaration, target, context and declared input schema, then dispatches
only a registered domain handler. The generic POST route and BFF allow-list are
registered. There is no generic Business Partner create, patch or materialize path.

BP registrations call the existing governed request service for `request_change`, role
extension, operating-organization assignment, company configuration, request submit
and materialization. The compiled detail surface exposes the authorized flow actions;
navigation alone does not create a request. The request-detail submit and materialize
buttons, and the post-draft intake submit helper, use the shared operation client with
`If-Match` and an idempotency key. The legacy BP submit/materialize browser transport
has been removed. Draft save, validation, decisions, evidence and specialized request
forms remain governed domain behavior.

The active release returns changed-resource receipts. The request workspace invalidates
only the returned BP header/action summary and declared section resources. Numbering
remains inside materialization and is never allocated from navigation, metadata reads or
section refreshes. Flow/intake presentation is projected from the pinned artifacts into
the existing request workspace compatibility shape.

Work:

- [x] Resolve operation keys against the pinned entity contract; verify target,
      current permission, context, expected version and declared input schema.
- [x] Implement the two operation routes. Extract `entity-operation-dispatcher.ts`
      behind experience ports; register actual domain services at the composition root.
- [x] Route request-change, role extension, scope/company configuration, submit and
      materialization to existing BP services; no generic BP record create/patch bypass.
- [x] Bind selected Flow artifacts to shared intake/request workspace presentation.
      Keep role-dependent capture, evidence and decision rules in validated contracts
      plus registered domain functions. Save/resume uses persisted draft identity.
- [x] Resolve immutable validation/lifecycle definitions from IR while evaluating
      current qualifications, blocks, assignment validity and authority at command time.
- [x] Reuse `allocateWithinTransaction`, the stable allocation identity and persisted
      receipt. Allocate BP numbering at materialization; a separate request number, if
      required, belongs to explicit request creation. Never allocate from an effect.
- [x] Keep reveal explicit, current-authorized, purpose-bound and uncached. Do not
      automatically retry a consumed single-use reveal request or store plaintext in
      general section caches/history.
- [x] Return actual changed resources and versions; invalidate their readers and
      affected action summaries without refreshing every section.

Files: experience dispatcher/routes/ports and current composition registrations;
BP `business-partner-request-service.ts`, eligibility/verification functions,
frontend `request-entry.tsx`, `request-workspace.tsx`, `request-form-descriptor.ts`,
`intake-submit.ts`, `src/360/use-audited-reveal.ts`; existing numbering service/repository
and current lifecycle/policy integrations. Do not create a new lifecycle engine.

Cleanup: remove duplicated UI metadata fetch and action dispatch inside BP files;
retain business forms/controls that represent specialized behavior. Replace tests
of removed transport details with shared dispatcher plus retained business tests.

**Minimal exit check:** create/resume one local governed request and replay its write
with the same key; no duplicate result/allocation. Refresh and switch tabs without
changing numbering counters. A stale version or denied command is rejected.

**Remaining acceptance check:** run the governed local DEV journey with seeded
requester, approver and materializer sessions: create or resume a request, replay the
same idempotency key, submit and materialize it, then verify stale-version and denied
command responses. This needs the three-role fixture/session configuration; it is not a
reason to retain the removed browser submit/materialize transports.

### Phase 7 — Make collaboration resources independently lazy

**Outcome:** comments, attachments and activity use their own resource lifetime and
existing platform services without repeated creation or full-page refreshes.

**Implementation progress (local, 2026-09-20):** the shared entity section reader
now resolves a published `dataBinding.serviceKey` through composition, in addition to
registered domain handler keys. `platform.comments.v1` and `platform.attachments.v1`
therefore load only when their compiled section becomes active; generic owner-scoped
readers use the compiled entity code and record identity and are never fetched as part
of bootstrap. The shared section endpoint accepts only a bounded page limit and a
validated cursor; later pages append to the active resource without refreshing the
header or unrelated sections.
The browser resource cache remains keyed by principal, authorization epoch, context,
locale, entity, record, surface and section. Comment creation, edit and deletion, and
attachment stage, upload and finalization are explicit controls in the generic compiled
renderer; a successful command invalidates only that active section. Download creates a
short-lived authorized URL only after the user clicks it. No signed URL or file bytes
is stored in the runtime metadata cache.

The retained `request-attachment-field.tsx` continues to serve governed request
evidence capture only. It is not used by the Business Partner detail capability
sections. Own-comment edit/delete actions are visible only to the comment author and
return visible errors without losing the current list. A failed attachment stage,
upload, or finalize retains its file and attachment identity; retry stages that same
identity for a fresh signed upload URL and reuses the original reservation. The
Activity section now declares a typed pull-event resource with an explicit owner and
cursor pagination rather than an event-stream mount. The local multi-actor UI
acceptance check is the only remaining Phase 7 work.

Work:

- [x] Bind published capability service keys to existing authorized platform clients.
      Keep owner identity and scope explicit; entering a section only reads its resource.
- [x] Load lists only when visible/activated; reuse fresh cache and paginate normally.
      Opening a page with those sections hidden sends no collaboration query.
- [x] Comment create/edit/delete and upload/reservation/finalization require explicit
      commands with existing service permissions and retry semantics.
- [x] Resolve download URLs only for requested permitted files. Avoid placing signed
      URLs, attachment bytes or sensitive comments in shared metadata caches.
- [x] Use comment/attachment revisions or targeted invalidation; do not depend only
      on the BP record version. Refresh only affected capability resources after a command.
- [x] Keep activity a typed event resource; do not substitute identity fields or use
      event-stream mounting to trigger business commands.

Files: existing entity content/workflow UI adapters and descriptor-selected sections;
`server/packages/platform/collaboration/src/collaboration-service.ts`,
`collaboration-routes.ts`; attachments `attachment-routes.ts`,
`attachment-lifecycle.ts`, `kysely-attachment-repository.ts`; BP
`request-attachment-field.tsx` only for retained request/evidence integration.

API action: reuse the current collaboration and attachment URLs, document their
service-key bindings and callers; no BP-specific clones and no unnecessary new API.
Cleanup: delete duplicate BP comment/file wrappers that only fetch metadata or mirror
platform list/render behavior; retain required evidence/business ownership rules.

**Minimal exit check:** open/revisit both tabs, add one comment and upload one small
file; refresh creates no extra comment/upload reservation, and only the changed
resource refreshes. Verify an unauthorized owner cannot read it.

### Phase 8 — Remove superseded code and close the local migration

**Outcome:** one shared compiled-reader/orchestration path, with BP containing business
functions rather than a private entity runtime.

Work:

- [ ] Search all imports, package exports, runtime registrations, API clients, route
      aliases and tests for each remaining old BP reader/dispatcher endpoint.
- [ ] Delete superseded files/methods/exports and registrations; remove test fixtures
      used only by the deleted implementation, keeping business-rule regression cases.
- [ ] Delete migrated Next BP page/layout implementations after public URL resolution
      and specialized destination coverage are confirmed. Do not delete valid destinations
      merely because they were absent from the first route table.
- [ ] Reduce BP 360 components to any retained specialized business controls; standard
      fields, collections, tabs and headers use shared components and compiled bindings.
- [ ] Remove obsolete dependencies/styles only after actual consumers disappear.
      Do not mass-rename retained domain files or remove unrelated local changes.
- [ ] Reconcile prototype JSON, generated output, README, CONTRACT and this plan.
      Mark supported versus deferred capabilities honestly; don't mark proposed handlers
      implemented simply because their names occur in JSON.
- [ ] Record the final active public/API routes, retained BP business functions,
      deleted files and one focused check result. Mark phases complete only when done.

API action: unregister replaced BP metadata/section APIs when no local callers remain;
keep domain commands/capability APIs that are still the registered implementation.
No long-lived compatibility layer or production deprecation schedule is required.

**Minimal exit check:** affected builds/type checks pass; BP Manage → detail → section
→ request and Currency list/detail smoke checks work; no broken imports/registrations;
one refresh/context-switch check confirms no read-triggered mutation or stale-context
data. A new supported section can be published without adding a BP reader/dispatcher.

### Local phase status record

| Phase           | Status                                      | Record when completed                                                                                                                                                                                                                                                          |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 Inventory     | Planned                                     | Actual caller/replacement map                                                                                                                                                                                                                                                  |
| 1 Contract      | Complete                                    | Parser/check result and remaining unsupported properties                                                                                                                                                                                                                       |
| 2 Compiler      | Complete                                    | Signed, published and active local-DEV BP v2 payload (93 artifacts)                                                                                                                                                                                                            |
| 3 Reader        | Planned                                     | Shared callers, cache/fallback check and deleted private loader                                                                                                                                                                                                                |
| 4 Routing       | Planned                                     | Working mappings and removed route wrappers                                                                                                                                                                                                                                    |
| 5 Reads         | In progress                                 | BP detail uses generic bootstrap/workspace and compiled field/collection rendering; specialized renderers, collaboration/workforce and v1 retirement remain                                                                                                                    |
| 6 Commands      | Implementation complete; acceptance pending | Active compiled release 7; generic dispatcher, governed registrations, Flow projection and targeted invalidation are in place. Run the seeded requester/approver/materializer local-DEV journey.                                                                               |
| 7 Collaboration | Implementation complete; acceptance pending | Published platform service-key resolution, generic owner-scoped reads, lazy paginated Comments/Attachments resources, stable attachment retry, visible comment command errors, and a typed pull-event Activity resource are wired. Run the local multi-actor acceptance check. |
| 8 Cleanup       | Planned                                     | Deleted paths, retained domain functions and final smoke result                                                                                                                                                                                                                |

Start with Phase 0 and Phase 1. Do not scaffold all proposed modules first: create
each extraction when its phase introduces real callers. A phase can span small edits,
but should end with one working path and the corresponding obsolete code removed.

## Accepted follow-on — Metadata-controlled comments and attachments

**Decision:** accepted 2026-09-21. **Implementation:** planned. **Design:** [Entity comments and attachments](entity-comments-and-attachments-design.md). **Execution checklist:** [CA-00–CA-10 build plan](entity-comments-and-attachments-build-plan.md).

This work follows the basic Phase 7 capability integration. Keep existing working record navigation, registered domain admission and explicit platform service endpoints; do not create Business Partner-specific comment/file storage or another entity API family. The follow-on plan governs the new typed policy, state, history and management behavior. In particular, upload retry must query uncertain finalization outcome before restaging; preserving an ID alone is not a complete retry algorithm.

| Workstream                            | Required result                                                                                                                                   | Status  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Definition control — CA-00/CA-01      | Typed Core capabilities, attachment/comment policy bindings, strict schemas, registered handlers/permissions and immutable published dependencies | Planned |
| Direct schema updates — CA-02         | Canonical DDL/seeds, shared revision history and one report/moderation path; fresh local installation; obsolete source definitions removed        | Planned |
| Service enforcement — CA-03/CA-04     | Parent/audience/policy admission, immutable versions, outcome-aware retries, quotas and real retention/recovery scheduling                        | Planned |
| Shared resource contracts — CA-05     | Scoped counts/lists/history/status, child revisions and direct API policy parity                                                                  | Planned |
| Shared experience — CA-06/CA-07/CA-08 | Coordinated drawer/content/Summary surfaces, rich comments and document management driven by metadata                                             | Planned |
| Local integration — CA-09/CA-10       | Real preview/extraction/search, one final BP journey, a small second-entity reuse check and focused cleanup                                       | Planned |

Start with a short CA-00 source/consumer map and CA-01 contract decisions. Update canonical DDL, seeds, contracts and consumers together, verifying a fresh disposable local database. No historical-row migration, compatibility bridge, dual writer or staged rollout is needed before staging exists. The current local database/storage remains intact unless its reset is explicitly authorized. Keep UI metadata, operation rules and storage/service authority distinct. Metadata can restrict service capabilities; it cannot disable scanning, parent authorization, isolation or legal holds. Optional AI, new notification providers and multipart upload are outside the required initial integration.

Each work package closes when implementation and affected typechecks/focused regressions pass and the relevant local check works; record changes, checks and remaining limitations briefly. Run one integrated local acceptance pass at CA-10, rerunning affected steps only when fixes require it. Do not repeat full suites or produce per-phase evidence dossiers, load certification or production readiness sign-off. Update this entry separately from historical Phase 7 acceptance. This documentation revision performs no application implementation, database reset or Docker reconfiguration.
