# Shared Application Experience — Local Build Plan and Completion Record

## Scope

This record covers completed local cleanup and the remaining Business Partner shared-experience work for Neon, Mesh, and Studio. Frontend and backend are developed together in one repository and one local environment. It does not prescribe production rollout, release cohorts, multi-instance deployment, or document change-control work.

Component and behavior rules remain defined in the accompanying [System Design](system-design.md).

## Working rules retained

- Reuse one shared `Main` / `PageWorkspace` and shared page-kind runtimes. Do not copy Business Partner layouts for new entities.
- Keep routes thin. Put cross-entity behavior in platform packages and domain-specific behavior in registered providers or plane packages.
- Keep one main landmark, one page `h1`, and one primary page scroll surface.
- Do not add entity-specific branches to generic layout components.
- Client-side visibility does not replace server authorization or context isolation.
- Preserve visible keyboard focus, labels for icon-only controls, and focus restoration for modal surfaces.
- Remove code only after checking route, export, registry, asset, style, package, and build consumers.

## Completion status

| Task | Status | Result |
| --- | --- | --- |
| 1. Inspect current implementation | Complete | Located Business Partner collection, detail/360, intake, Studio composition, shared shell, page-frame, navigation, boundary, and CSS implementations. |
| 2. Consolidate application foundation and shell | Complete | Shared startup/fatal adapters, global chrome, overlay coordination, preferences, Recent/Favorites, and footer registration were consolidated for current consumers. |
| 3. Introduce `PageWorkspace` | Complete | Shared page header, navigation, status, body-boundary, content, overview, and action slots are available without changing established header or navigation owners. |
| 4. Establish reusable runtime contracts | Complete | Current page/resource/section/panel boundary conventions and generic resolver paths are wired for the existing runtime families. |
| 5. Complete Business Partner shared-experience wiring | Complete for the available local fixtures | Business Partner remains a governed case-runtime entity and now uses the shared shell/PageWorkspace, boundary, footer, and provenance conventions. Mesh browser verification awaits a refreshed authenticated session. |
| 6. Prove entity reuse | Complete | Currency is a real metadata-driven, read-only Neon collection/detail entity using the generic resolver, with no Currency-specific Neon page component or provider. |
| 7. Optional utility work | Deferred | Knowledge/documents and other product utilities have no current consumer-driven requirement. |
| 8. Dependency-safe cleanup | Complete for the current scope | Verified obsolete code was removed; remaining shared aliases, CSS, exports, and dependencies have live consumers. |

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

| Route family | Entry and presentation owner | Descriptor / authorized operation | Scope, navigation and footer owner |
| --- | --- | --- | --- |
| Overview `/mdg/business-partner` | Thin route → `NeonEntityApplicationSection("overview")` → `EntityOverviewRuntime` | Published `business_partner` application entry `overview`; `neon.relationship.business_partner.read` | Application descriptor owns tab navigation and breadcrumb binding; shared application header owns the collection header; overview sources remain authorized backend data. |
| Manage `/mdg/business-partner/manage?vid=system` | Thin route → `NeonEntityApplicationSection("manage")` → `EntityListRuntime` | Published `entity_list` for `business_partner`; `neon.relationship.business_partner.read` | Shared list runtime owns query/view/density; Neon context plus future Business Partner scope adapter owns permitted organization/role coordinates; collection header remains application-owned. |
| Requests `/mdg/business-partner/requests?density=compact` | Thin route → `NeonEntityApplicationSection("review")` → `EntityListRuntime` | Published `task_list` for `business_partner_request`; `neon.relationship.entity_case.read` | Request view namespace stays separate from the partner list. The published workflow key is `supplier_onboarding`; operating-organization context is required by the request descriptor. |
| New request `/mdg/business-partner/new` | `AuthorizedNewBusinessPartnerRequest` → `BusinessPartnerRequestEntry` → shared `EntityIntake` / `EntityIntakeForm` | `neon.relationship.entity_case.create`; published request form plus Business Partner intake surfaces | Task-header registration owns title, Cancel and draft state. Workflow steps and Details section navigation remain independent. `loadPublishedForm` supplies initial descriptor retry. |
| Request detail `/mdg/business-partner/requests/:requestId` | Thin route → `BusinessPartnerRequestDetail` → `RequestDetailSurface` / `PageWorkspace` | Governed case view and case actions; request data includes provenance | `useDeepLinkedTabState` owns Overview/Details/Review/Activity history. `useRecordFooterSources(view.provenance)` owns request provenance. |
| Record / 360 `/mdg/business-partner/:recordId` | Thin route → `BusinessPartnerRecord` → feature-selected 360 shell or aggregate detail | `neon.business_partner.view_360` determines the specialized 360 surface; aggregate reader supplies fallback | Record components own record header/section controller. `useRecordFooterSources(aggregate.provenance)` owns successful aggregate provenance. |

Published application navigation comes from `server/db/scripts/provisioning/publish-development-list-experience.ts`: `overview`, `manage`, and `review` all belong to one `business_partner` application with base path `/mdg/business-partner`. The overview and manage permission is `neon.relationship.business_partner.read`; review uses `neon.relationship.entity_case.read`; new request is separately authorized by `neon.relationship.entity_case.create`.

Authenticated baseline verified on 2026-09-18 with the refreshed Neon session: overview, manage with `vid=system`, requests with compact density, request detail `3a452faf-d2ca-44d0-a583-8ddcfb9a3110`, and record/360 `01a09f6c-ed2c-76b0-8aa9-e333eb385c0e` each returned HTTP 200, one expected `h1`, and no access-denied surface. The production journey checks now follow the shared role-selection / duplicate-check entry step before asserting published Supplier or Customer intake fields: 2 passed; Workforce and external-invitation checks were skipped because their required capability/fixture was not configured.
2. **Complete application workspace composition.** Complete. `ManagementWorkspace` composes its existing collection/record owner handoff inside `PageWorkspace` and exposes shared status, toolbar, body, action and action-outcome slots. The body slot preserves existing list/overview ownership; list refresh/action messages remain in `EntityListRuntime`, where they belong. Studio Business Partner Bank Directory uses the shared status slot for its publication-sync indicator. The Business Partner overview, Manage, and Review & Approval adapters require no further outer slots: `EntityOverviewRuntime` owns dashboard data and actions; `EntityListRuntime` owns search, saved views, refresh, and table actions; the published application descriptor owns the collection-header New request action. Moving those controls outward would duplicate ownership. Focused ownership coverage, PageWorkspace browser coverage, shell/list typechecks, Studio Business Partner tests, and individual authenticated Supplier and Customer intake checks pass. A rapid combined browser run received an HTTP 429 from the protected experience bootstrap before the customer route rendered; retrying after the local throttle recovered passed, so this is recorded as bootstrap throttling rather than a route failure. Do not move list-table controls or saved-view state into the outer workspace. Preserve `EntityPageLayout` collection/record ownership and task-header registration. Keep request descriptors and saved-view namespaces distinct from record lists.
3. **Extract domain scope adapters.** Complete. The Neon list package now selects a registered `business_partner` scope adapter rather than branching on Business Partner identity, role, and eligibility inside generic application/list orchestration. The common adapter retains organization/company directory state for ordinary entities; the Business Partner adapter owns `role` URL parsing, Supplier/Customer validation, compatible organization/company eligibility, and the complete eligibility coordinate. Known work-context resolvers are registered by identifier. Unknown required resolvers render unavailable and do not create an unscoped selector or query. Focused adapter and list-runtime tests plus both package typechecks pass.
4. **Complete intake integration.** Complete. `EntityIntake` and `EntityIntakeForm` remain the common workflow and form owners; the existing Supplier and Customer submission adapters remain authoritative. Metadata-driven Supplier fields already register validation through `DataValidationProvider`, giving the shared summary, inline errors, per-section issue counts, reveal-and-focus links, and independent workflow/section navigation. The custom Customer sales-scope fields now register through the same `useDataValidation` contract, so a blocked review shows field-specific summary and inline errors instead of a late generic submit error. Validation-summary links are shared 24px touch targets. Existing intake-runtime coverage verifies review without mutation, retained input on Back, single final submission, draft resume, and Cancel dirty protection; retry/submission coverage verifies save and recovery. The authenticated Neon Customer route verifies role selection, published form entry, validation summary, link focus, and the surface accessibility contract. Save, submit, and approval remain distinct.
5. **Complete request-detail integration.** Complete. `BusinessPartnerRequestDetail` retains its existing `PageWorkspace`, `PageNavigation`, `useDeepLinkedTabState`, governed-command runner, and provenance footer registration. Overview, Request details, Review, and Activity remain persistent tab panels addressed by their existing hash links; legacy Case/Validation/Workflow/Evidence/Result hashes still normalize to Review. `RequestLifecycle` is the compact shared progress surface above the tabs. The full Supplier onboarding journey, including its authorized actions, concurrent-command protection, refresh/recovery, readiness, documents, and activity content, now belongs in Review and is hidden in the other persistent tabs. Backend request status continues to distinguish approved-awaiting-completion, applied/completed, and failed outcomes; no client-side lifecycle inference was added. Authenticated Neon coverage verified Overview, Review, and Details hash navigation plus the shared-progress/journey placement.
6. **Verify Business Partner completion.** Complete for the available local fixtures. The authenticated Neon walkthrough covers the supplied overview, `manage?vid=system`, compact request-list, intake, request detail, and record/360 routes. Existing application/list coverage retains density, filters, search, saved-view namespaces, Favorites, denied scope behavior, context replacement, and footer ownership. The authenticated 360 suite passed canonical deep links, Back/Forward, passive section selection, explicit focused selection, historical scope, superseded-request aborts, restricted-value exclusion, keyboard behavior, 200% reflow, and RTL. Supplier and Customer intake and request-detail checks passed. Studio Business Partner typecheck and its 78-test suite passed, including draft, unsaved-edit, focus, undo, and publication behavior. Mesh Business Partner typecheck passed. Mesh browser verification remains blocked: `tests/e2e/.auth/mesh-athyper.json` no longer establishes an authenticated Mesh tenant session; no session, permission, or network-account data was changed to bypass that check. Re-run `tests/e2e/mesh-review` after refreshing a valid Mesh session to verify the existing acting-account/network-workspace coverage. The optional sensitive-reveal and performance 360 cases were skipped because their dedicated fixtures/configuration were not supplied.
7. **Close cleanup against the new wiring.** Complete. Route, export, registry, style, manifest, and test-consumer searches found no removable Business Partner or shared-workspace module. `BusinessPartnerPageFrame`, the shared workspace exports, scope adapters, validation API, lifecycle surface, journey workspace, sticky CSS, and package dependencies all have live consumers. The obsolete role-scope renderer and dispatch branch were already removed in Task 8; no further manifest update is required. Removed the redundant persistent-aside fragment left by the Review journey move. Route-level evidence now completes Task 5 for the available local fixtures. Reopen Task 8 only if a later replacement proves an active artifact unused.

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
