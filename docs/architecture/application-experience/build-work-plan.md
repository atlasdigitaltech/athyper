# Shared Application Experience — Build Work Plan

| Field | Value |
| --- | --- |
| Plan version | 1.0.0 |
| Date | 2026-09-17 |
| Scope | Repository cleanup and incremental implementation for Neon, Mesh and Studio |
| Status | Planned; documentation prepared, implementation waves not executed |
| Design authority | [System Design](system-design.md) |
| Accountable owner | Frontend platform owner — named assignee pending |
| Delivery model | Small reversible PRs, route cohorts, preserved business behavior |

## 1. Outcome and limits

Consolidate existing UI foundations into the agreed application/root/shell/workspace architecture. Keep three independently deployable apps, reuse generic entity rendering, and remove duplication only after replacement is verified. Preserve live routes, data contracts, authorization, protected-value handling and domain workflows.

This is not a full repository rewrite. Server contract/cache work is included only where needed for shared UI and independent deployment readiness. No backend service split, runtime microfrontend, database cleanup, data migration, or production deployment is implicitly authorized by this plan. Such work needs its own concrete scope and applicable release controls.

The workspace contained pre-existing local changes in Studio, shared UI, form/list runtime, shell styles and other packages during preparation. They are not disposable cleanup. Before implementation, record ownership and coordinate or use isolated checkouts. Do not reset, overwrite, mass-format or delete unrelated work.

## 2. Baseline and evidence discipline

Existing architecture, ownership inventories, boundary policies and OpenAPI workflows are inputs, not obstacles to replace. Preserve [system architecture](../system-architecture-overview.md), [entity form framework](../entity-form-framework.md), [package ownership](../package-ownership-matrix.md), and [server contract ownership](../../../server/packages/contracts/README.md).

For each PR record: scope, before/after behavior, affected consumers, relevant checks, known limitations, rollout/rollback impact. Do not report a test as passed merely because its file or script exists.

Durable execution evidence belongs under the repository's approved governance report locations when required; otherwise use CI/release artifacts and Git history. Do not put generated screenshots, inventories or completion dumps in the new architecture folder.

## 3. Workstreams and accountable roles

| Workstream | Accountable role | Review/support |
| --- | --- | --- |
| Root, chrome, page workspace | Frontend platform | Three plane owners, accessibility |
| Domain adapters and migration parity | Respective plane/domain owner | Frontend platform, domain authorization |
| Public wire contracts | API contract owner | Backend services, frontend consumers |
| Dependency enforcement | Repository/tooling owner | Platform and server architecture |
| Session/context isolation | IAM owner | Frontend and backend owners |
| Server caching and replicas | Deployment owner + frontend platform | IAM, backend cache owners |
| Cohort rollout and rollback | Release owner | Plane owners, support/operations |

Assign actual people/teams before scheduling dependent work. Role names are not evidence of acceptance or availability.

## 4. Inventory and disposition model

Wave 0 creates an inventory with these fields:

```text
Path/package/route
Current owner and runtime plane
Public exports and inbound consumers
Current behavior and data/authorization dependencies
Disposition: retain / extract / adapt / deprecate / remove
Target location
Required compatibility adapter
Existing local-work dependency
Verification evidence
Rollout cohort and rollback path
```

Removal requires evidence of no runtime, build, test, route, asset, deployment or documented supported consumer. A missing text match alone is insufficient: inspect dynamic registries, workspace manifests, package exports, generated routes and container packaging.

Generated ownership matrices are updated through their generator and corresponding governance data. Do not hand-edit generated inventory files as independent authorities.

## 5. Dependency map and gates

```text
W0 Baseline, ownership and decision register
 ├── W1 Dependency enforcement and public-contract authority
 ├── W2 Application root and startup
 └── W3 Shell extraction and coordination [after W2 interfaces stabilize]
       └── W4 Generic PageWorkspace and state contracts
             └── W5 Business Partner pilot cohorts
                   └── W6 Second entity + Mesh reuse proof
                         └── W8 Broad adoption and legacy removal

W7 Knowledge/preferences enhancements can follow stable W3/W4 primitives.
W9 Deployment portability/cache/replica readiness follows W0 and runs alongside
UI work; its gates must pass before any replica-dependent release.
W10 Final acceptance follows applicable W1–W9 completion.
```

Independent workstreams may run separately, but shared files and public APIs require ownership coordination. Do not broaden tests repeatedly after relevant checks pass without a new failure or concern.

## 6. Execution waves

### W0 — Capture the baseline and close ownership decisions

**Deliverables**

- Identify active app routes, shell adapters, domain-local layouts and duplicate state markup.
- Record existing screenshots/behavior for Business Partner detail, new request, Studio model and representative Mesh pages.
- Capture route/query parameters, section/tab behavior, authorization states, mutation semantics and unsaved-change behavior.
- Inventory assets, CSS imports, public package exports and deployment dependencies.
- Identify existing local changes and their owners.
- Assign accountable owners to D-01 through D-06 in the design.
- Select measurable viewport fixtures, failure injections, rollout mechanism and evidence location.

**Exit gate**: agreed disposition inventory; baseline checks and known failures recorded; no unexplained deletion/move candidates; D-06 ownership assigned.

**Rollback**: none; read-only inventory and documentation.

### W1 — Enforce dependency and wire-contract boundaries

**Deliverables**

- Map every dependency rule to existing policy tooling; identify coverage gaps.
- Extend existing checkers before introducing another toolchain.
- Cover relative/aliased imports, package dependencies, re-exports, supported dynamic imports and browser/server entry points.
- Add negative fixtures proving app-to-app, platform-to-plane, cross-plane-internal and contract-to-implementation violations are rejected.
- Inventory canonical public request/response/error/descriptor schemas and their owners.
- Preserve server-internal ports separately; remove only verified manually duplicated wire definitions through compatible mappings.
- Extend existing OpenAPI/schema-generation drift checks and serialized-response validation.
- Retain supported consumer fixtures/artifacts and test them against the candidate backend.
- Define compatibility window, error/enum/unknown-field behavior and retirement process (D-03).
- Ensure relevant checks are required for affected PRs and releases; verify triggers, not only script existence.

**Exit gate**: all architectural rules mapped; negative tests fail for intended violations; valid imports pass; supported frontend/backend compatibility matrix documented and exercised before independent release.

**Rollback**: retain prior exports/adapters until consumers migrate; never remove a supported public shape as a cleanup convenience.

### W2 — Consolidate ApplicationRoot and startup

**Target**: existing `packages/platform/shell/app-foundation`, with thin app adapters.

**Deliverables**

- Extract compositional ApplicationRoot, provider arrangement, startup state gate and shared fallbacks.
- Keep server-resolved bootstrap and avoid duplicate client fetching.
- Split provider mounting around resolved dependencies as necessary.
- Establish provider-independent fatal and framework root fallbacks.
- Keep root HTML, framework metadata, route integration and public/protected layout distinctions in apps.
- Resolve D-01 deadlines/retry/cancellation behavior; optional services cannot block startup.
- Validate context/cache reset on session changes and sign-out.

**Checks**: loading, success, timeout, retry, auth-required, access denial, provider render failure, framework root failure, optional-service outage; verify no bootstrap loop and no previous-context content exposure.

**Exit gate**: all three apps use shared behavior via adapters; no new dependency cycle; fallback works without providers.

**Rollback**: app composition can select previous startup adapter; preserve session/bootstrap interfaces.

### W3 — Extract and standardize PlatformShell

**Target**: existing platform shell and plane shell packages.

**Deliverables**

- Extract app bar, sidebar, footer and skip-link modules while preserving public exports.
- Group shell inputs into identity, context, navigation, services and footer contracts with transitional compatibility where needed.
- Use typed plane identifiers rather than display-name comparisons.
- Implement shared transient/docked overlay controller and Atlas transitions from design section 6.
- Replace incomplete mobile modal behavior with shared accessible primitives.
- Standardize global action overflow priorities and local service states.
- Separate explicit saved sidebar/Atlas preferences from temporary viewport adaptation.
- Consolidate translation strings, context labels, icons and long-name treatment.
- Keep quick-access ownership in one scoped store.
- Extend record-footer registration safely to page-context summaries; move detail presentation to page ownership.
- Populate About Athyper from actual release metadata.

**Checks**: three-plane navigation parity; mobile modal focus; Escape/restore; one transient surface; Atlas dock/expand/resize transitions without duplicate session mounts; unavailable service badges; safe context switching; footer registration cleanup; long labels/RTL.

**Exit gate**: shared chrome renders across planes, business destinations unchanged, no page CSS controls shell geometry, no duplicate preference stores.

**Rollback**: retain compatible plane adapters and avoid switching layout implementation mid-edit.

### W4 — Build the generic PageWorkspace

**Target**: generic page geometry in platform shell; entity behavior remains in runtime/providers.

**Deliverables**

- PageWorkspace, BreadcrumbBar integration inside Main, header/navigation/status/body/action slots.
- Three layout variants with explicit layout and section mode fields.
- PageToolbar and structured PageInformation provider/details integration.
- Page/body render boundaries plus resource state handling.
- Section/panel boundaries for independent resources; policy-driven restricted states.
- Retain existing EntityPageLayout record-versus-collection ownership behavior.
- Reuse current section navigation and scroll logic; unify offsets, history and focus behavior.
- Define D-02 scroll root and numeric tokens/thresholds; verify container width with Atlas docked.
- Connect body failure/access state to dependent action availability.
- Preserve input and action state independently of refresh/loading state.
- Add URL restoration, invalid-section fallback and unsaved-change integration.

**Checks**: all column variants; empty/list/no-match states; short final section; dynamic section expansion; explicit versus passive navigation; Back/Forward/deep links; sticky overlap; loading geometry; error isolation; forbidden identity handling; failed-save input preservation.

**Exit gate**: usable shared fixtures for every state/layout; one main and page h1; no duplicated responsive form; no Business Partner layout branch in generic code.

**Rollback**: new primitives remain additive until route cohorts adopt them.

### W5 — Migrate Business Partner pilot experiences

Use separate route cohorts, not one large feature rewrite:

1. Neon Business Partner detail/360.
2. Neon new request intake.
3. Studio Business Partner model workspace.

**Deliverables**

- Adapt existing descriptors/providers rather than copying business logic into PageWorkspace.
- Preserve query keys, tabs/sections, role visibility, protected values, reference lookups and command behavior.
- Preserve Studio draft/version/publication rules and current local editor improvements.
- Introduce a versioned page-composition adapter without immediately removing the old descriptor parser.
- Select old/new presentation once per route load using controlled rollout configuration where behavior materially changes.
- Do not mount both versions; avoid duplicate data requests and submissions.

**Checks**: compare each pilot to baseline; test permitted and denied users; read/edit/submit where authorized in isolated fixtures; loading/error/empty; unsaved departure; overlay integration and footer context.

**Exit gate per cohort**: D-05 rollout/rollback settings resolved, parity evidence accepted, no unresolved access or task-blocking regression.

**Rollback**: route-level old implementation remains available during agreed window; no incompatible data/schema changes coupled to presentation rollout.

### W6 — Prove generic reuse outside the pilot

**Deliverables**

- Select a second entity with materially different sections/providers.
- Select a representative Mesh page using network-account context.
- Demonstrate metadata-selected layout and provider registration without shell forks.
- Test account switching, denied providers, independent panel failures and shared quick access.
- Confirm operational published descriptor versus Studio draft-preview selection.

**Exit gate**: second entity and Mesh render through shared contracts without entity-specific layout conditions; all three plane adapters compile and behave correctly.

**Rollback**: cohort-specific adapter rollback; shared packages retain compatibility with remaining old routes.

### W7 — Complete shared utilities and Knowledge integration

**Deliverables**

- Appearance System/Light/Dark using shared tokens; apply before visible render.
- Language/Region, Help and About use one implementation across Utilities/profile/footer entry points.
- Add density only after page/table spacing tokens are standardized.
- Read-only Knowledge workspace: Wiki/Documents browsing, authorized search, preview and record links.
- Shared Recent/Favorites filtered in Knowledge, not new independent stores.
- Global Knowledge quick panel and supported search provider categories.
- Keep attachments/content search authorization distinctions.
- Connect Atlas sources/context only through supported authorized services.

**Deferred unless separately implemented**: unsupported upload, authoring, review/publish and content mutation workflows. UI must not advertise them as complete.

**Exit gate**: access to titles/snippets/counts/previews enforced; no duplicate document identities; theme/density accessible; stored preference and recent-item scope correct.

### W8 — Broad adoption and safe repository cleanup

**Deliverables**

- Migrate remaining routes in recorded cohorts using the shared route adapter patterns.
- Move reusable route-local feature code into appropriate plane/runtime packages.
- Remove duplicate shell, spacing, state and overlay implementations after verified adoption.
- Remove dead exports/dependencies/styles only with consumer and packaging evidence.
- Consolidate obsolete stubs only after confirming workspace, generator, build and runtime references.
- Update imports, exports, manifests, workspace declarations, required transpilation/build config, asset copying and ownership inventory together.
- Retire rollout flags and old adapters after the rollback window and supported-consumer retirement gate.

**Exit gate**: disposition inventory complete; no orphaned exports/assets/route links; no unsupported manual contract copies; affected checks pass; rollback strategy is release-artifact rollback after source retirement.

**Constraint**: do not introduce mass renames, broad formatting or domain refactors into cleanup PRs. Preserve unrelated work and all required licenses/legal notices.

### W9 — Deployment portability, caching and replicas

Start policy/design work early; execute rollout only after defined gates.

**Deliverables**

- Build independent immutable Neon/Mesh/Studio artifacts with traced workspace dependencies and required static/public assets.
- Validate same-host three-process/container deployment behind proxy.
- Validate separate-host deployment with environment-specific URL registry.
- Promote the same artifact where supported; distinguish build-time and runtime/public configuration.
- Verify same-origin BFF requests, SSO flow and per-plane session validation.
- Close D-04: resource cache inventory, explicit uncached resources, adapter/storage ownership, key scopes, TTLs, invalidation, outage behavior and eviction/capacity decisions.
- Keep IAM session-store separate from Next.js cache implementation.
- Test two replicas using the same deployment version plus controlled old/new rolling versions.
- Verify shared sessions, revocation, refresh races, invalidation propagation, static-asset availability, failure behavior and telemetry.
- Confirm frontend rollback remains compatible with the deployed backend/descriptor versions.
- Retain platform-host unless an independently justified service split is approved.

**Exit gate**: actual artifact smoke tests, context isolation and multi-instance behavior pass; cache and operational ownership are explicit; no local filesystem/process dependency for durable sessions/documents/preferences.

### W10 — Acceptance and handover

- Run the agreed acceptance matrix against migrated routes and deployment artifacts.
- Confirm no unresolved task-blocking or access-isolation failures.
- Record implemented versus deferred capabilities; update design implementation status without rewriting agreed semantics silently.
- Publish rollout/rollback and support instructions through existing operational documentation conventions.
- Capture release version, supported backend/descriptor versions, applicable policy results and owner sign-off.
- Archive/retire superseded guidance through links and Git history rather than leaving competing specifications.

## 7. Rollout and rollback protocol

| Step | Required evidence/action |
| --- | --- |
| Prepare | Named cohort owner, affected route list, compatible artifact/flag fallback, D-05 thresholds/window |
| Verify | Baseline comparison, contract/authorization checks, browser fixtures, mutation safety |
| Enable | Stable server/config selection for a cohort; never client-controlled authorization |
| Observe | Error rates, task failures, failed submissions, navigation/focus regressions and performance against baseline |
| Expand | Owner accepts results within agreed measurable thresholds |
| Roll back | Disable affected cohort or restore compatible prior artifact; keep backend compatibility |
| Retire | Observation/rollback window complete, references removed, release rollback remains documented |

Immediate stop/rollback triggers include cross-context data disclosure, authorization bypass, duplicate mutation execution, lost form input caused by migration, and inability to complete a critical task. Numeric error/performance thresholds and observation duration are D-05; do not invent acceptance results before measurement.

Feature flags are not mandatory for small behavior-preserving extractions. They are required where the cohort plan chooses parallel legacy/new presentation paths. Old and new packages may temporarily coexist in source, but only one active presentation mounts for a route instance. Old sessions/open browser tabs and rolling deployment behavior must be considered before removing compatibility.

## 8. Verification strategy and existing entry points

Choose checks based on touched behavior; do not run unrelated suites merely to accumulate counts.

| Area | Existing entry points / required additions |
| --- | --- |
| Type/build correctness | Affected workspace package typecheck/build scripts and app builds |
| Dependency boundaries | `pnpm policy:plane-boundaries`, `pnpm policy:server-boundaries`, `pnpm policy:server-rebuild-boundaries`, `pnpm policy:content-ui-boundaries` as applicable |
| Release policy | `pnpm policy:release-boundaries` under its approved execution profile |
| Public schemas | `pnpm openapi:check`, `pnpm openapi:bp360:check`, `pnpm test:openapi-policy` |
| Deployed schema | Existing deployed OpenAPI workflow, only against explicitly selected authorized environment |
| Shell/browser | Existing shared-shell and record-navigation browser suites; extend meaningful gaps |
| Domain regression | Existing Business Partner section/360/intake/workbench tests for migrated surfaces |
| Negative boundary tests | Forbidden imports/aliases/re-exports and browser/server leakage |
| Version skew | Supported old consumer fixtures against candidate backend and rollback target |
| Replicas | Two-instance context/session/cache behavior and rolling release tests |

Representative existing files include `tests/foundation-browser/shared-shell.spec.ts`, `tests/foundation-browser/shared-record-navigation.spec.ts`, `tests/foundation-browser/business-partner-360-panel.spec.ts`, and `tests/foundation-browser/business-partner-section-layout.spec.ts`. Confirm current test configuration and fixtures before executing them. Do not mistake this list for tests run during document preparation.

Required assertions include one main/h1, visible focus, no hidden focus targets, no layout overlap, keyboard modal lifecycle, preserved form values, correct URL history, authorized footer ownership, valid unknown counts, context isolation, and locally contained optional-service failures.

## 9. Decision and status tracking

| Work item | Current status | Blocking decision |
| --- | --- | --- |
| Architecture baseline and detailed skeleton | Documented | Full ratification awaits named owners and decision closure |
| W0 baseline inventory | Not started | D-06 |
| W1 contracts/enforcement | Not started | D-03 and coverage review |
| W2 startup | Not started | D-01 |
| W3 shell | Not started | Cohort-specific D-05 before release |
| W4 workspace | Not started | D-02 |
| W5 pilot routes | Not started | W1–W4, D-05 |
| W6 generic reuse | Not started | W5 foundations |
| W7 utilities/Knowledge | Not started | Supported services and stable primitives |
| W8 broad cleanup | Not started | W5/W6 evidence and rollback window |
| W9 deployment | Not started | D-03/D-04/D-05 |
| W10 acceptance | Not started | Applicable preceding exit gates |

Existing partial implementations are baseline assets, not completion of these work packages. Update statuses only with actual evidence.

## 10. Definition of done

- Three apps retain independent builds/deployments and thin route adapters.
- Shared root/shell/page state behavior is adopted by the scoped route inventory.
- Business behavior, authorization and domain authority are preserved.
- Layout/mode selection is explicit and validated.
- Atlas and all shell surfaces obey the shared interaction contract.
- Required contract/dependency checks are enforced and tested negatively.
- Supported deployed frontend/backend versions are verified.
- Same-host and separate-host artifacts are tested; replica rollout passes its cache/session gates.
- Duplicate implementations are removed only after verified replacement and rollback readiness.
- Named owners accept remaining intentional exceptions/deferred features.
- Design, work plan and canonical operational guidance match the delivered state.
