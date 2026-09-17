# Shared Application Experience — System Design

| Field | Value |
| --- | --- |
| Contract version | 1.0.1 |
| Date | 2026-09-17 |
| Scope | Neon, Mesh, Studio; application startup, shell, pages, shared services, package boundaries, deployment |
| Status | Agreed architectural baseline; implementation and operational readiness are not certified |
| Accountable owner | Frontend platform owner — named assignee pending |
| Required reviewers | Plane owners, accessibility reviewer, API contract owner, IAM owner, deployment/release owner |
| Companion | [Build Work Plan](build-work-plan.md) |

## 1. Purpose and authority

Provide one reusable experience across three independently deployable applications. Business Partner is the first migration consumer, not the owner of generic layout behavior. Share pages and feature implementations as well as chrome; app route files remain thin framework adapters.

This document defines the target, not a claim that every component exists. The detailed tree in Appendix A records the agreed component inventory. The decision rules in the main document resolve ambiguities in that tree and take precedence over its shorthand. Tree branches describing states are alternatives; configuration and behavior nodes are specifications, not literal DOM nodes.

Existing domain, security, and lifecycle authorities remain in force:

- [System architecture overview](../system-architecture-overview.md).
- [Package ownership matrix](../package-ownership-matrix.md) and its generator/governance configuration.
- [Entity form framework](../entity-form-framework.md).
- [Shared contract ownership](../../../packages/contracts/README.md).
- [Server contract ownership](../../../server/packages/contracts/README.md).
- [Business Partner authority](../business-partner/README.md).

Do not use this cleanup to change domain authorization, publication authority, or production data. Runtime configuration and metadata never replace backend authorization.

## 2. Current foundations and target changes

Source inspection identified the following foundations; it did not certify deployed behavior or execute their test suites.

| Existing location | Target treatment |
| --- | --- |
| `apps/{neon,mesh,studio}` | Retain independent Next.js deployment units and route trees |
| `packages/platform/shell/app-foundation` | Consolidate root, providers, bootstrap integration and fallbacks |
| `packages/platform/shell/shell` | Extract shared chrome, workspace, footer context and overlay coordination |
| `packages/platform/entity/runtime/form-detail` | Reuse section navigation, scroll behavior, record/form adapters |
| `packages/platform/entity/runtime/list-view` | Adopt shared workspace and toolbar conventions |
| `packages/planes/*/shell` | Thin plane branding, context, capability and navigation adapters |
| `EntityPageLayout` | Preserve collection-versus-record chrome ownership |
| `EntityRecord360Panel` and its descriptor | Adapt compatibly to generic composition; replace closed provider assumptions through validated registration |
| `RecordFooterSource` / `useRecordFooterSources` | Evolve into structured page-owned footer information |
| `packages/platform/shell/content-hub` | Placeholder to develop into Knowledge integration; not a completed workspace |
| `server/apps/platform-host` | Retain backend deployment boundary unless separate service requirements justify a split |

Relevant policy scripts and OpenAPI workflows already exist. Their presence is not proof of complete coverage; the work plan requires rule-to-check mapping and negative fixtures.

## 3. Architectural invariants

1. One application root, one ready shell, and one main landmark per application tree.
2. Shell remains available during ordinary page/resource failures.
3. One primary page scroll surface; side scrolling is allowed only where needed for reachability.
4. Layout and state presentation belong to shared components, domain behavior to registered providers.
5. Authentication, tenant/account scope and authorization are enforced server-side.
6. Unknown, loading, empty, denied, failed and stale are different states.
7. Application version, metadata release, record revision and Studio draft revision are distinct.
8. Record updated, source observed and page refreshed are three distinct timestamp meanings.
9. No generic component branches on Business Partner identity to decide layout behavior.
10. No app imports another app; plane implementations do not import another plane's internals.
11. No arbitrary scripts or CSS in entity/page metadata.
12. Initial loading must not expose content from a previous tenant, account or resource.

## 4. Application startup and recovery

The application render boundary wraps the provider tree. Bootstrap loading and request failures are explicit states; React render boundaries are not request/event-handler error handling.

Provider order follows actual dependencies. Minimal providers may mount before bootstrap; context-dependent providers mount only after their dependencies resolve. `ApplicationRoot` accepts ready content by composition and does not import a particular plane shell.

Startup states: loading, authentication required, application access denied, startup error, ready. Only required bootstrap dependencies block entry. Notifications, Knowledge and Atlas cannot block opening an otherwise usable application.

App fallbacks share branding, safe text, accessible status and recovery actions. Fatal fallback and framework root fallback cannot depend on the providers they replace. A framework root fallback is outside the failed tree. Framework server failures and ancestor-layout failures require their own Next.js adapters; do not assume a route `error.tsx` catches its parent layout.

Timeouts are bounded. Exact required-request deadline, retry policy and slow-start threshold are pending decisions D-01. There is no fabricated percentage progress or automatic reload loop.

## 5. Global shell

### 5.1 App bar and overflow

The bar contains navigation/plane identity, business context, then global actions. Context retains enough identity for users to know where actions execute; full truncated names remain accessible.

Use this shared compact-priority order, based on available width rather than device names:

1. Navigation and active business context remain reachable and identifiable.
2. Retain direct Search access where feasible.
3. Retain Inbox next.
4. Notifications and Atlas move into labeled overflow as space decreases.
5. Knowledge moves into overflow before those actions.
6. Preferences, Help and About remain grouped in Utilities.

All overflow controls retain labels and authorized states/badges. Hide unsupported capabilities rather than advertising missing providers. Unknown or failed counts never default semantically to zero. Primary ordering is the same across planes.

Context switching checks unsaved work, displays progress, resolves an authorized context, resets/partitions scoped state and opens an allowed destination. On failure, keep the prior context coherent. Do not optimistically show new context identity above old-context data.

### 5.2 Sidebar, quick access and preferences

Desktop sidebar has expanded/collapsed modes; mobile uses a modal drawer with the same navigation model. Only the visible representation is focusable. Canonical route ownership determines the active workspace. Prefer distinct workspace icons over repeated generic settings icons.

Persist explicit user choices, not temporary viewport adaptations. Scope preferences explicitly and tolerate storage failure. Favorites and Recent have one shared store and primary sidebar entry points. Knowledge and Search may show filtered views of those entries.

Favorites are explicit and reorderable. Recent tracks successful destination openings, deduplicated by stable resource identity, not every filter/tab/scroll change. Clear Recent does not clear Favorites. Recheck access before displaying sensitive labels and on open. Prefer durable cross-device storage with a local fallback/cache, scoped to plane/user/tenant and applicable business context.

Appearance supports System/Light/Dark, with System default, and Comfortable/Compact density. Apply initial theme before visible rendering; follow OS changes only in System mode. Tokens cover all surfaces, including charts, fallbacks and overlays. Density cannot remove readable text, visible focus or usable interaction targets. Respect reduced motion.

### 5.3 Footer and version information

Global footer stays in normal document flow: bottom of a short page, after content on a long page. It owns legal/application information, not mutation actions.

An optional `PageContextSummary` consumes structured authorized information from the active page: identity, source, revision, precisely labeled timestamp and Details. The page owns the detailed provenance panel. Clear registration on page/context/access changes and unmount; stale cleanup must not erase a newer owner's registration. Section-specific metadata must identify its section. Small layouts may collapse to a Record information control.

Critical draft/revision context remains in the page header/version selector; save state remains in the action bar even if the footer repeats context.

About Athyper displays deployed frontend release, plane, appropriate environment, optional build/support details, matching release notes and approved copyable diagnostics. Populate from build/deployment metadata, not a manually copied package version. Do not expose credentials, personal data or record content.

## 6. Overlay and Atlas state machines

`ShellOverlayHost` coordinates surfaces, not their business services. Popovers are anchored/nonmodal; modal dialogs/drawers contain focus and make background inert; docked panels keep page and panel usable.

Model two coordinated channels:

```text
ShellSurfaceController
├── TransientSurface: None | Search | Activity | QuickAccess | Knowledge | ... | Atlas
└── AtlasDock: Closed | Docked

AtlasPresentation: Closed | Transient | Docked | Expanded
```

Only one transient shell surface is active. Docked Atlas may coexist. Expanded Atlas occupies the transient channel and records its previous presentation. There is one conversation/session instance across presentation transitions, not independent copies.

| Event | Required transition |
| --- | --- |
| Open Atlas | Use saved supported preference; otherwise supported transient presentation |
| Dock | Transfer presentation to dock and clear transient Atlas |
| Expand | Record prior mode; occupy expanded surface; preserve conversation |
| Minimize | Restore recorded mode if available; otherwise supported compact presentation |
| Close | Dismiss presentation, preserve conversation; do not implicitly delete history |
| Open another transient | Replace transient/expanded Atlas; leave docked Atlas where permitted |
| Open modal | Block interaction with page and dock; restore appropriate focus on dismissal |
| Insufficient width | Adapt dock presentation without overwriting desktop preference |
| Context change | Invalidate obsolete context, cancel/ignore stale work, recheck access |

Escape dismisses the topmost dismissible surface. Ordinary dismissal returns focus to the opener; successful navigation transfers focus to the destination. Keep frame/title/Close outside the feature error boundary. Reset failed feature state when switching surface identity. Request errors have explicit local resource states. Page-owned dialogs reuse primitives/coordination but are not global feature registrations.

## 7. Main and page composition

`PlatformShell` owns `<main id="main-content" tabIndex={-1}>`. A page render boundary contains breadcrumbs and the entire workspace. The body render boundary isolates content failures while preserving safe header/navigation. `PageResourceBoundary` handles explicit loading/request/error/access states. Dependent mutations must become unavailable if required resources or the body render fail, even though the action bar is outside the body boundary.

### 7.1 Layout decision ownership

The page definition explicitly selects layout and navigation mode. The page/domain owner proposes the choice, the frontend platform reviewer checks it against these criteria. Responsive adaptation changes geometry, not task semantics.

| Definition | Selection criterion |
| --- | --- |
| `content` | Default; section navigation provides no useful orientation |
| `sections-content` | Multiple meaningful continuous sections or distinct workspace views |
| `sections-content-overview` | Section-oriented page plus supplementary context useful throughout the task |
| Section `scroll` mode | Users read/edit sections in one continuous document |
| Section `switch` mode | Separate tools or workspace views selected explicitly |

Do not infer layout from fluctuating row counts or entity size. No section navigation field is needed for a content-only page. If a required optional provider is unavailable, omit its empty rail and expand content according to the shared adaptation rules.

### 7.2 Page behavior

- Breadcrumbs derive from registered routes and safe resolved identity, not raw URL segments. Ancestors link; current item is non-link current-page text. Intermediate ancestors collapse accessibly on narrow layouts.
- One page h1. Header title wraps; badges and actions share consistent placement. Large header scrolls naturally away. Never hide/move a focused control through collapse behavior.
- Tabs, route links and workflow steps use different semantics. Slow-loading tabs use manual activation. Workflow navigation respects validation and permitted transitions.
- Status region retains authorized data during refresh, exposes persistent refresh errors, and avoids duplicate announcements/toasts. Access revocation removes data rather than preserving it as stale.
- Content toolbar owns search, filters, views and selection actions. Page action bar owns task mutations/navigation.
- Independent section boundaries preserve neighboring content. Do not create a boundary per field/decorative card.
- Empty collection is a ready page with an empty state; missing record is NotFound. Denied or failed data is never empty.
- Overview uses shared authorized data/cache and local failure handling. Essential fields/actions must remain reachable without relying solely on the overview.
- Page dialogs stay page-owned. Footer provenance stays page-owned through a structured provider.

### 7.3 Scroll, focus and navigation

Keep a single primary scroll surface; select the exact existing scroll root in D-02 before migration. Header scrolls away; breadcrumbs/tabs and side panels stick where usable space permits. Tokens/measurements determine offsets; no per-route hard-coded offsets. The center grid track uses `minmax(0, 1fr)`. Atlas docking reduces actual available width. Narrow/zoomed views reduce sticky chrome, use a section selector and accessible overview disclosure/drawer. Never mount duplicate forms for responsive layouts.

Clicking a scroll section navigates and focuses its heading. Passive observation changes selection without moving focus and replaces URL state rather than flooding history. Explicit navigation supports Back/Forward. Restore deep links after data is available, recalculate on layout changes, handle the final short section, and resolve unavailable destinations safely.

Page identity includes plane, business context, resource and page kind. Identity changes reset relevant boundaries; ordinary refresh does not remount forms. Protect unsaved changes across applicable route, step, tab and context changes.

### 7.4 Resource and action states

Resource states: loading, ready (with refreshing/refresh-error attributes), empty where meaningful, request error, forbidden, not found. Render failure is separately caught. Initial skeletons match geometry, hide decorative content from assistive technology and expose one loading status with aria-busy.

Mutation states: idle, running, failed, succeeded. Preserve input on failure, prevent duplicate/conflicting submissions, connect field errors with an accessible summary, and provide conflict review. Do not replay mutations automatically unless the operation explicitly guarantees safe replay. Sticky action bars reserve space and do not cover fields.

## 8. Knowledge and global services

Knowledge is a full sidebar workspace with optional global quick access, not a Utilities setting. It contains Overview, Wiki, Documents and shared-store Favorites. Wiki owns authored knowledge; Documents owns files/generated artifacts; record attachments retain record linkage. One document identity is reused across these entry points.

Quick panel shows search, explicitly related content, filtered recent/favorites and Open workspace. Complex authoring/upload/browsing uses the full workspace. Build read-only authorized browsing/search/preview first; expose authoring only where backend support exists.

Global Search federates supported authorized providers for pages, records, Wiki and Documents; do not bypass the dedicated content ACL endpoint by directly querying a mixed index. Protect snippets, titles, counts, recents and previews as well as downloads. Notifications inform; Inbox contains actionable work. Avoid presenting duplicate unrelated tasks for the same underlying item.

Atlas displays its current record/business scope, cites accessible sources/revisions and requires explicit authorized execution for publishing or changing content.

## 9. Package and application structure

Keep one monorepo, three thin deployable apps and shared packages compiled into each artifact. Shared packages are not remote runtime services. App-to-app separation does not require microfrontends or backend service splitting.

```text
apps/{neon,mesh,studio}/
├── app/
│   ├── layout.tsx                 # HTML, metadata, initial locale/theme
│   ├── providers.tsx              # thin framework composition
│   ├── loading.tsx
│   ├── error.tsx                  # where applicable
│   ├── global-error.tsx           # minimal root fallback adapter
│   ├── not-found.tsx
│   ├── (public)/                  # only applicable public routes
│   ├── (shell)/
│   │   ├── layout.tsx             # protected bootstrap + plane shell
│   │   ├── loading.tsx
│   │   ├── error.tsx
│   │   ├── not-found.tsx
│   │   └── .../page.tsx           # thin route → reusable feature adapter
│   ├── api/                       # thin auth/BFF adapters
│   ├── livez/route.ts
│   └── readyz/route.ts
├── lib/                           # configuration/bootstrap/server env adapters
├── public/
├── instrumentation.ts
├── proxy.ts
├── next.config.ts
└── package.json

packages/platform/shell/
├── app-foundation/src/            # root, providers, startup, fallbacks
└── shell/src/
    ├── chrome/                    # app bar, sidebar, footer, skip link
    ├── navigation/                # breadcrumbs, routes, workspace navigation
    ├── context/
    ├── overlays/
    ├── preferences/
    ├── information/
    └── page/                      # workspace/layout/state components

packages/platform/entity/runtime/ # generic entity list/form/detail rendering
packages/platform/entity/authoring/
packages/planes/{neon,mesh,studio}/ # context/navigation/specialized providers
packages/contracts/               # public browser-safe schemas/contracts
server/packages/contracts/        # internal ports/envelopes
server/apps/platform-host/        # existing backend deployment unit
```

Keep public exports compatible while extracting internal files. Do not create a package per component or force identical unused routes across apps. Page providers may be entity-specific while page geometry remains shared.

## 10. Contract ownership and dependency enforcement

The two contract trees have different responsibilities, not a requirement for manual mirroring. Each public wire request/response/descriptor has one canonical schema owner. Backend models/ports cross that boundary through explicit mappings. Generate secondary representations when appropriate; validate actual serialized responses against the public contract.

Shared source compilation is insufficient for deployed version skew. Define a supported frontend/backend version window in D-03, test retained supported consumer contracts against candidate backends, and include errors, enums, optional fields, unknown fields and descriptor schema versions. Evolve additively first; remove/rename only through a documented migration and retirement process. Coordinate frontend rollback with backend compatibility.

| Family | Allowed direction | Forbidden direction |
| --- | --- | --- |
| Apps | Plane/platform packages | Other app internals |
| Plane implementations | Shared platform/contracts | Other plane internals |
| Platform implementations | Lower-level shared packages/contracts | Plane/app implementations |
| Browser-safe contracts | Approved schema utilities and lower-level contract primitives | React/Next, apps, platform/plane/server implementations |
| Server-internal contracts | Shared public contracts, lower-level server contracts, explicitly allowed foundation primitives | Service/app/database/framework implementations |

Contracts must remain acyclic. Separate browser/server entry points; do not export server secrets, storage clients or backend implementations through browser barrels. Apply existing governance classification and dependency budgets.

Existing policy scripts (`policy:plane-boundaries`, `policy:server-boundaries`, `policy:server-rebuild-boundaries`, `policy:content-ui-boundaries`, `policy:release-boundaries`) and OpenAPI workflows are starting points. Map every rule to a required CI check, cover aliases/relative imports/re-exports/dynamic imports/package edges, and prove rejection with negative fixtures. Add a graph tool only if existing enforcement cannot cover the rule. Exceptions require owner, rationale and removal condition.

## 11. Deployment and cache ownership

Deploy each plane as an independent immutable artifact. On one server, run three processes/containers behind a reverse proxy. On multiple servers, move the same artifacts behind configured hostnames/load balancers. Use an environment-specific plane URL registry; do not construct sibling hostnames in UI code.

Browser calls remain same-origin through the plane BFF. Validate server environment configuration and expose only an allowlisted public projection. Build-time public values cannot be assumed mutable after artifact promotion. Existing standalone output must be checked for monorepo tracing and static/public assets. Keep deployment IDs coherent across replicas of the same release and plan rolling-version skew handling.

Shared identity-provider SSO does not remove per-plane session/access checks or require broad parent-domain cookies. Documents use durable storage; app-process memory is not authoritative session/preference storage.

| Concern | Accountable role | Policy |
| --- | --- | --- |
| Authentication sessions | IAM | Existing Redis session store; revocation/expiry/refresh coordination |
| Browser query cache | Frontend platform | Context isolation and authorized invalidation |
| Next.js server cache | Frontend platform + deployment owner | Explicit cacheability and cross-replica coordination |
| Domain cache | Owning backend service | Domain freshness/invalidation semantics |
| Static assets | Deployment owner | Immutable versioned delivery |
| Documents/files | Content/storage owner | Durable storage and access enforcement |

Do not put generic Next.js cache functionality in `iam/session-store`. Redis may be shared operationally only with explicit namespace/access/capacity/eviction decisions; session and content cache policies differ. A deliberately uncached dynamic response is a valid initial policy. Before replicas, specify cache keys, authorization scope, TTL, invalidation propagation, outage behavior and deployment-version behavior. No authenticated response enters a shared cache without an explicit safe policy.

References for implementation-time verification: [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [deployment ID](https://nextjs.org/docs/app/api-reference/config/next-config-js/deploymentId). Verify details against the installed version before changing deployment configuration.

## 12. Measurable acceptance and pending decisions

| ID | Decision/deliverable | Owner role (named assignee pending) | Closure gate |
| --- | --- | --- | --- |
| D-01 | Bootstrap deadline, slow-start threshold, retry policy and cancellation | Frontend platform + API | Before startup behavior migration |
| D-02 | Primary scroll root, token values, minimum center width, rail widths, collapse thresholds | Frontend platform + accessibility | Before workspace migration |
| D-03 | Public schema inventory, supported deployed consumer window and retirement policy | API contract + release + plane owners | Before independent-version release |
| D-04 | Per-resource server cache policy, adapter/storage, invalidation, outage ownership | Frontend platform + deployment + IAM/backend | Before cache-dependent replica rollout |
| D-05 | One-time rollout framework: selection mechanism, stable assignment, evidence requirements, rollback procedure and approval responsibilities | Release + plane owner | Framework agreed before the first production cohort; each cohort separately passes its readiness gate |
| D-06 | Named accountable owner/reviewers and verified enforcement coverage | Engineering/repository owner (interim sponsor) | Ownership recorded before W0 exits; enforcement coverage verified in W1; both required for full closure |

The existing engineering/repository owner acts as interim sponsor and initiates W0, assigning the named frontend platform owner and required reviewers. Baseline inventory may proceed while assignments are pending; W0 cannot exit until ownership is recorded. Assigning D-06 ownership does not close D-06: enforcement coverage must also be verified in W1.

Closing D-05 establishes the rollout framework; it does not authorize any production cohort. Each cohort must separately record its route list, named owner/operator, observation duration, numeric thresholds, compatible fallback and parity evidence, then satisfy the framework’s readiness approval before activation. Later cohorts do not reopen D-05 unless they change the framework.

D-02 must record numeric values with units and test fixtures, not only words such as “narrow.” Derive breakpoint choices from minimum usable content plus rails/gaps and validate at 200% zoom and with Atlas docked. Unknown count is a state, not a numeric threshold: pending/failed is unknown, successful 0 is zero, successful positive value is a count.

Minimum objective assertions: exactly one main and one page h1; no focusable hidden navigation; no obscured focused target/action/last field; no shell horizontal overflow in the approved viewport matrix; passive scroll never moves focus or pushes history; retry affects the failed scope; page failure disables dependent mutations; failed saves retain values; context transitions never show previous-scope data; active page alone owns footer metadata; modal dismissal restores valid focus.

## 13. Change control

The component structure and ownership principles are an accepted baseline subject to controlled amendments, not permanently frozen behavior. Full contract ratification remains pending named accountability and closure of D-01 through D-06. Implementation completeness and production readiness are not certified; decision closure is separate from implementation evidence. No named owners, numeric budgets, production status or test results are fabricated by this document.

Changes use a reviewed PR updating this document, the work plan where affected, and a short decision entry with rationale and compatibility impact. Editorial corrections increment patch; compatible optional extensions increment minor; breaking public behavior/schema/component changes increment major. A breaking change requires affected plane review, migration and rollback guidance; authorization/session changes require IAM/domain authorization review; focus/navigation changes require accessibility review; deployment/cache changes require deployment review.

Do not silently replace this canonical document with a new competing copy. Durable decisions stay under architecture. Execution evidence follows repository conventions in `governance/policy/reports/` when it must remain live, otherwise Git/release artifacts retain the history. Existing architecture guidance remains authoritative outside this document's scope.

### Revision record

- **1.0.1 (2026-09-17):** Clarified interim assignment authority, D-06 ownership versus enforcement closure, one-time D-05 versus recurring cohort readiness, and accepted-baseline status. No runtime architecture change.

## Appendix A. Detailed component and behavior inventory

The following agreed skeleton is preserved in full. Sections 5–6 clarify responsive action priorities and Atlas's separate transient/docked channels; section 7 defines layout selection; sections 10–13 add contract, cache, measurable acceptance and governance rules.

```text
ATHYPER SHARED APPLICATION EXPERIENCE — V1 DESIGN CONTRACT
│
├── Scope
│   ├── Neon
│   ├── Mesh
│   └── Studio
│
├── Architecture conventions
│   ├── State branches are alternatives, not simultaneous rendered children
│   ├── Optional slots render only when supported and applicable
│   ├── One ApplicationRoot per application
│   ├── One PlatformShell mounted through the Ready branch
│   ├── One Main landmark
│   ├── One primary page scroll surface
│   ├── Shared components own presentation and interaction behavior
│   ├── Plane adapters supply identity, context, navigation, and capabilities
│   ├── Page definitions select supported compositions
│   ├── Registered providers supply domain content and commands
│   └── Client-side visibility never replaces server authorization
│
├── FRAMEWORK ROOT
│   │
│   ├── Framework integration
│   │   ├── Server-side session resolution where applicable
│   │   ├── Server-side bootstrap loading where applicable
│   │   ├── Initial theme and locale resolution
│   │   ├── Initial preference hydration
│   │   ├── No duplicate client bootstrap request after server resolution
│   │   └── Framework loading/error routes delegate to shared presentation
│   │
│   ├── Normal render → ApplicationRoot
│   │   │
│   │   ├── ApplicationConfig
│   │   │   ├── Plane identifier: neon / mesh / studio
│   │   │   ├── Display name
│   │   │   ├── Approved brand assets
│   │   │   ├── Default locale
│   │   │   ├── Support destination [optional]
│   │   │   └── Existing plane bootstrap adapter
│   │   │
│   │   └── ApplicationErrorBoundary
│   │       │
│   │       ├── Normal render → ApplicationProviders
│   │       │   │
│   │       │   ├── Shared provider composition
│   │       │   │   ├── Theme and branding
│   │       │   │   ├── Localization and formatting
│   │       │   │   ├── Session
│   │       │   │   ├── API client and request context
│   │       │   │   ├── Query cache and hydration
│   │       │   │   ├── Authorization capabilities
│   │       │   │   ├── Preferences and personalization
│   │       │   │   └── Sanitized diagnostics
│   │       │   │
│   │       │   ├── Provider composition rules
│   │       │   │   ├── Ordering follows actual dependencies
│   │       │   │   ├── Providers requiring resolved context mount after resolution
│   │       │   │   ├── Plane-specific providers use the narrowest appropriate scope
│   │       │   │   ├── No copied provider trees in plane entry points
│   │       │   │   ├── No entity-specific logic in ApplicationRoot
│   │       │   │   └── Reset/partition state on logout and context changes
│   │       │   │
│   │       │   └── ApplicationBootstrapGate
│   │       │       │
│   │       │       ├── Loading → AppFallback.Loading
│   │       │       │   ├── Approved plane identity
│   │       │       │   ├── “Opening Neon / Mesh / Studio…”
│   │       │       │   ├── Single accessible progress announcement
│   │       │       │   ├── No fabricated percentage progress
│   │       │       │   └── Timeout transitions to recoverable startup error
│   │       │       │
│   │       │       ├── Authentication required → Sign-in flow
│   │       │       │   ├── Safe return destination
│   │       │       │   └── Existing authentication/session integration
│   │       │       │
│   │       │       ├── Application access denied → AppFallback.AccessDenied
│   │       │       │   ├── Clear access message
│   │       │       │   ├── Permitted navigation
│   │       │       │   └── Access-request destination [only when supported]
│   │       │       │
│   │       │       ├── Startup failure → AppFallback.StartupError
│   │       │       │   ├── Safe explanation
│   │       │       │   ├── Retry bootstrap
│   │       │       │   ├── Sign in [when applicable]
│   │       │       │   └── Opaque support reference [optional]
│   │       │       │
│   │       │       └── Ready → PlatformShell
│   │       │           │
│   │       │           ├── Shell configuration
│   │       │           │   ├── Plane identity
│   │       │           │   ├── Resolved business context
│   │       │           │   ├── Authorized navigation
│   │       │           │   ├── Available global services
│   │       │           │   └── Footer configuration
│   │       │           │
│   │       │           ├── SkipToContent
│   │       │           │   ├── First focusable control in the normal shell
│   │       │           │   ├── “Skip to main content”
│   │       │           │   ├── Visually hidden until focused
│   │       │           │   ├── Visible above fixed chrome when focused
│   │       │           │   ├── Target: #main-content
│   │       │           │   └── Focus destination remains unobscured
│   │       │           │
│   │       │           ├── GlobalAppBar
│   │       │           │   │
│   │       │           │   ├── NavigationToggle
│   │       │           │   │   ├── Desktop: expanded / collapsed sidebar
│   │       │           │   │   ├── Mobile: open navigation drawer
│   │       │           │   │   └── Accessible name, expanded state, target reference
│   │       │           │   │
│   │       │           │   ├── PlaneBrand
│   │       │           │   │   ├── Neon / Mesh / Studio identity
│   │       │           │   │   ├── Consistent brand sizing and placement
│   │       │           │   │   ├── Link to plane home
│   │       │           │   │   └── Plane switcher [when multiple planes are accessible]
│   │       │           │   │
│   │       │           │   ├── BusinessContextSelector
│   │       │           │   │   ├── Tenant identity
│   │       │           │   │   ├── Operating organization [when applicable]
│   │       │           │   │   ├── Network account / acting-for identity [Mesh]
│   │       │           │   │   ├── Full-name access for visually truncated names
│   │       │           │   │   ├── Active context remains identifiable on mobile
│   │       │           │   │   └── Context-switch lifecycle
│   │       │           │   │       ├── Select authorized destination
│   │       │           │   │       ├── Check unsaved changes
│   │       │           │   │       ├── Show switching state
│   │       │           │   │       ├── Resolve session/context
│   │       │           │   │       ├── Reset/refresh scoped state and caches
│   │       │           │   │       ├── Open an allowed destination
│   │       │           │   │       ├── Failure retains previous context with recovery
│   │       │           │   │       └── Never show old-context data under new identity
│   │       │           │   │
│   │       │           │   └── GlobalActions
│   │       │           │       │
│   │       │           │       ├── Search
│   │       │           │       │   ├── Opens SearchPanel
│   │       │           │       │   ├── Clear scope and keyboard access
│   │       │           │       │   └── Only advertises implemented search providers
│   │       │           │       │
│   │       │           │       ├── Knowledge [optional quick-access action]
│   │       │           │       │   ├── Opens KnowledgeQuickPanel
│   │       │           │       │   └── Moves to overflow on narrow screens
│   │       │           │       │
│   │       │           │       ├── Notifications
│   │       │           │       │   ├── Opens ActivityPanel → Notifications
│   │       │           │       │   └── Unread badge with distinct unknown/loading state
│   │       │           │       │
│   │       │           │       ├── Inbox
│   │       │           │       │   ├── Opens ActivityPanel → Inbox
│   │       │           │       │   └── Work-item badge with distinct unknown/loading state
│   │       │           │       │
│   │       │           │       ├── AI Agent Atlas
│   │       │           │       │   ├── Opens AtlasPanel
│   │       │           │       │   └── Visible active/open state
│   │       │           │       │
│   │       │           │       └── UtilitiesMenu
│   │       │           │           ├── Appearance
│   │       │           │           │   ├── Theme: System / Light / Dark
│   │       │           │           │   └── Density: Comfortable / Compact
│   │       │           │           ├── Language & Region
│   │       │           │           ├── Help & Keyboard Shortcuts
│   │       │           │           └── Application Information / About Athyper
│   │       │           │
│   │       │           ├── GlobalSidebar
│   │       │           │   │
│   │       │           │   ├── WorkspaceNavigation
│   │       │           │   │   ├── Home
│   │       │           │   │   ├── Authorized business workspaces
│   │       │           │   │   └── Knowledge → full KnowledgeWorkspace
│   │       │           │   │
│   │       │           │   ├── QuickAccess
│   │       │           │   │   ├── Favorites → QuickAccessPanel.Favorites
│   │       │           │   │   └── Recent → QuickAccessPanel.Recent
│   │       │           │   │
│   │       │           │   ├── UserProfileMenu
│   │       │           │   │   ├── Account identity
│   │       │           │   │   ├── Profile/account settings [supported destinations]
│   │       │           │   │   ├── Appearance → shared preferences component
│   │       │           │   │   ├── Language & Region → shared preferences component
│   │       │           │   │   └── Sign out
│   │       │           │   │
│   │       │           │   └── Sidebar behavior
│   │       │           │       ├── Expanded: icons and labels
│   │       │           │       ├── Collapsed: icons and hover/focus labels
│   │       │           │       ├── Mobile: shared navigation inside modal drawer
│   │       │           │       ├── Navigation scrolls when needed
│   │       │           │       ├── Quick access and profile remain reachable
│   │       │           │       ├── Distinct, meaningful workspace icons
│   │       │           │       ├── Active workspace follows canonical route ownership
│   │       │           │       ├── Persist explicit user collapse preference
│   │       │           │       ├── Responsive adaptation does not overwrite preference
│   │       │           │       ├── Preferences scoped explicitly by plane/user/context
│   │       │           │       └── Hidden desktop/mobile controls are not focusable
│   │       │           │
│   │       │           ├── Main [single landmark; id="main-content"; tabIndex=-1]
│   │       │           │   │
│   │       │           │   └── PageRenderBoundary
│   │       │           │       │
│   │       │           │       ├── Render failure → SafePageFallback
│   │       │           │       │   ├── Safe generic page identity
│   │       │           │       │   ├── Plain-language explanation
│   │       │           │       │   ├── Recovery / permitted navigation
│   │       │           │       │   ├── Support reference [optional]
│   │       │           │       │   └── Global shell remains available
│   │       │           │       │
│   │       │           │       └── Normal render
│   │       │           │           │
│   │       │           │           ├── BreadcrumbBar
│   │       │           │           │   ├── Registered route ancestors
│   │       │           │           │   ├── Resolved entity/record label
│   │       │           │           │   ├── Ancestors render as links
│   │       │           │           │   ├── Current page uses aria-current="page"
│   │       │           │           │   ├── Loading retains known safe ancestors
│   │       │           │           │   ├── No unauthorized record-title disclosure
│   │       │           │           │   ├── Long labels retain full accessible names
│   │       │           │           │   └── Narrow screens collapse intermediate ancestors
│   │       │           │           │
│   │       │           │           └── PageWorkspace
│   │       │           │               │
│   │       │           │               ├── Page identity and lifecycle
│   │       │           │               │   ├── Plane
│   │       │           │               │   ├── Tenant/business context
│   │       │           │               │   ├── Entity/resource identity
│   │       │           │               │   ├── Page kind
│   │       │           │               │   ├── Reset boundaries when identity changes
│   │       │           │               │   └── Preserve state during ordinary refresh
│   │       │           │               │
│   │       │           │               ├── PageInformationProvider [optional]
│   │       │           │               │   ├── Authorized structured metadata
│   │       │           │               │   ├── Record identity
│   │       │           │               │   ├── Record source(s)
│   │       │           │               │   ├── Record revision
│   │       │           │               │   ├── Record updated timestamp
│   │       │           │               │   ├── Source observed timestamp
│   │       │           │               │   ├── Page refreshed timestamp [distinct meaning]
│   │       │           │               │   ├── Publishes compact footer summary
│   │       │           │               │   ├── Opens page-owned information details
│   │       │           │               │   └── Clears ownership on departure/access change
│   │       │           │               │
│   │       │           │               ├── PageHeader
│   │       │           │               │   ├── Icon [optional]
│   │       │           │               │   ├── Title [single page-level h1]
│   │       │           │               │   ├── Description/reference [optional]
│   │       │           │               │   ├── Status/context badges [optional]
│   │       │           │               │   ├── Primary actions [optional]
│   │       │           │               │   ├── More actions [optional]
│   │       │           │               │   ├── Version selector [where operationally relevant]
│   │       │           │               │   ├── Safe unresolved-identity placeholder
│   │       │           │               │   ├── Long titles wrap without displacing actions
│   │       │           │               │   └── Large header scrolls naturally out of view
│   │       │           │               │
│   │       │           │               ├── PageNavigation [optional; explicit kind]
│   │       │           │               │   │
│   │       │           │               │   ├── Tabs
│   │       │           │               │   │   ├── Associated tab panels
│   │       │           │               │   │   ├── Accessible keyboard selection
│   │       │           │               │   │   └── Manual activation for slow-loading panels
│   │       │           │               │   │
│   │       │           │               │   ├── RouteLinks
│   │       │           │               │   │   ├── Real destination links
│   │       │           │               │   │   └── Current-route indication
│   │       │           │               │   │
│   │       │           │               │   ├── WorkflowSteps
│   │       │           │               │   │   ├── Current / completed / error states
│   │       │           │               │   │   └── Validation and permitted transitions
│   │       │           │               │   │
│   │       │           │               │   └── Shared navigation behavior
│   │       │           │               │       ├── Deep links and Back/Forward support
│   │       │           │               │       ├── Accessible overflow
│   │       │           │               │       ├── Preserve unsaved input
│   │       │           │               │       ├── Shared sticky offsets
│   │       │           │               │       └── Compact title/status slot [when needed]
│   │       │           │               │
│   │       │           │               ├── PageStatusRegion
│   │       │           │               │   ├── Normal → no visible status region
│   │       │           │               │   ├── Refreshing → subtle progress
│   │       │           │               │   ├── Refresh failed → persistent banner + Retry
│   │       │           │               │   ├── Stale data → explanation + meaningful timestamp
│   │       │           │               │   ├── Page-wide information/warning [when applicable]
│   │       │           │               │   ├── No repeated polling announcements
│   │       │           │               │   ├── No duplicate banner/toast for the same event
│   │       │           │               │   └── Revoked access removes affected content
│   │       │           │               │
│   │       │           │               ├── PageBodyRenderBoundary
│   │       │           │               │   │
│   │       │           │               │   ├── Render failure → PageError
│   │       │           │               │   │   ├── Safe message and recovery
│   │       │           │               │   │   └── Disable dependent mutation actions
│   │       │           │               │   │
│   │       │           │               │   └── PageResourceBoundary
│   │       │           │               │       │
│   │       │           │               │       ├── Initial loading → PageSkeleton
│   │       │           │               │       │   ├── Matches selected column layout
│   │       │           │               │       │   ├── Preserves expected geometry
│   │       │           │               │       │   ├── Decorative placeholders hidden from AT
│   │       │           │               │       │   ├── aria-busy + one loading message
│   │       │           │               │       │   └── Dependent actions unavailable
│   │       │           │               │       │
│   │       │           │               │       ├── Request failure → PageError
│   │       │           │               │       │   ├── Safe title and explanation
│   │       │           │               │       │   ├── Retry required page resource
│   │       │           │               │       │   ├── Back/permitted destination
│   │       │           │               │       │   └── Support reference [optional]
│   │       │           │               │       │
│   │       │           │               │       ├── Forbidden → AccessDenied
│   │       │           │               │       │   ├── Disclosure-policy-compliant message
│   │       │           │               │       │   └── Permitted navigation/access request
│   │       │           │               │       │
│   │       │           │               │       ├── Not found → NotFound
│   │       │           │               │       │   ├── Missing-resource message
│   │       │           │               │       │   └── Back to list/permitted destination
│   │       │           │               │       │
│   │       │           │               │       └── Ready → PageLayout
│   │       │           │               │           │
│   │       │           │               │           ├── Layout variant
│   │       │           │               │           │   ├── content
│   │       │           │               │           │   ├── sections-content
│   │       │           │               │           │   └── sections-content-overview
│   │       │           │               │           │
│   │       │           │               │           ├── SectionNavigation [optional]
│   │       │           │               │           │   ├── Stable section keys and labels
│   │       │           │               │           │   ├── Counts/status [when known and permitted]
│   │       │           │               │           │   ├── Scroll mode
│   │       │           │               │           │   │   ├── All sections share the page flow
│   │       │           │               │           │   │   ├── Click scrolls to heading and focuses it
│   │       │           │               │           │   │   ├── Passive scroll changes selection only
│   │       │           │               │           │   │   ├── Passive URL updates replace history
│   │       │           │               │           │   │   ├── Explicit navigation supports history
│   │       │           │               │           │   │   ├── Restore deep link after content loads
│   │       │           │               │           │   │   ├── Recalculate after layout/content changes
│   │       │           │               │           │   │   └── Handle short final sections correctly
│   │       │           │               │           │   ├── Switch mode
│   │       │           │               │           │   │   ├── Explicit workspace-view selection
│   │       │           │               │           │   │   └── Preserve applicable state between views
│   │       │           │               │           │   ├── Desktop → sticky left rail
│   │       │           │               │           │   ├── Narrow workspace → section selector
│   │       │           │               │           │   └── Unavailable deep link → safe destination
│   │       │           │               │           │
│   │       │           │               │           ├── Content
│   │       │           │               │           │   │
│   │       │           │               │           │   ├── PageToolbar [optional]
│   │       │           │               │           │   │   ├── Content search
│   │       │           │               │           │   │   ├── Filters
│   │       │           │               │           │   │   ├── View controls / saved views
│   │       │           │               │           │   │   ├── Selection/bulk actions
│   │       │           │               │           │   │   └── Expand content / focus mode [supported]
│   │       │           │               │           │   │
│   │       │           │               │           │   ├── Empty collection → EmptyState
│   │       │           │               │           │   │   ├── No records → permitted Create action
│   │       │           │               │           │   │   └── No matches → Clear filters
│   │       │           │               │           │   │
│   │       │           │               │           │   ├── PageSection [repeat as applicable]
│   │       │           │               │           │   │   ├── Stable identity/anchor
│   │       │           │               │           │   │   ├── Section heading
│   │       │           │               │           │   │   ├── Section actions [optional]
│   │       │           │               │           │   │   └── SectionBoundary [independent resources]
│   │       │           │               │           │   │       ├── Render boundary
│   │       │           │               │           │   │       └── Resource states
│   │       │           │               │           │   │           ├── Loading → SectionSkeleton
│   │       │           │               │           │   │           ├── Error → SectionError + Retry
│   │       │           │               │           │   │           ├── Empty → EmptyState
│   │       │           │               │           │   │           ├── Restricted → omit/policy state
│   │       │           │               │           │   │           └── Ready → SectionContent
│   │       │           │               │           │   │
│   │       │           │               │           │   └── PageInformationDetails [optional]
│   │       │           │               │           │       ├── Page-owned details panel
│   │       │           │               │           │       ├── Full provenance / multiple sources
│   │       │           │               │           │       ├── Revision details
│   │       │           │               │           │       ├── Clearly labeled timestamps
│   │       │           │               │           │       └── Permitted audit/history links
│   │       │           │               │           │
│   │       │           │               │           └── OverviewPanel [optional]
│   │       │           │               │               ├── Registered summary providers
│   │       │           │               │               ├── Shared authorized data/cache
│   │       │           │               │               ├── Desktop → sticky right panel
│   │       │           │               │               ├── Narrow workspace → disclosure/drawer
│   │       │           │               │               └── PanelBoundary
│   │       │           │               │                   ├── Render boundary
│   │       │           │               │                   └── Resource states
│   │       │           │               │                       ├── Loading → PanelSkeleton
│   │       │           │               │                       ├── Error → PanelError + Retry
│   │       │           │               │                       ├── Empty → omit/EmptyState
│   │       │           │               │                       ├── Restricted → omit/policy state
│   │       │           │               │                       └── Ready → OverviewContent
│   │       │           │               │                           └── Per-provider isolation when needed
│   │       │           │               │
│   │       │           │               ├── PageActionBar [optional]
│   │       │           │               │   ├── Available task actions
│   │       │           │               │   │   ├── Cancel / Back
│   │       │           │               │   │   ├── Save / Save draft
│   │       │           │               │   │   ├── Previous / Next
│   │       │           │               │   │   └── Submit / domain-specific command
│   │       │           │               │   ├── Action state
│   │       │           │               │   │   ├── Idle
│   │       │           │               │   │   ├── Running
│   │       │           │               │   │   ├── Failed
│   │       │           │               │   │   └── Succeeded
│   │       │           │               │   ├── Unsaved/saved status
│   │       │           │               │   ├── Accessible validation summary
│   │       │           │               │   ├── Field errors remain attached to fields
│   │       │           │               │   ├── Conflict → review latest version
│   │       │           │               │   ├── Preserve input after failed mutation
│   │       │           │               │   ├── Prevent duplicate/conflicting submissions
│   │       │           │               │   ├── No automatic mutation replay without safe contract
│   │       │           │               │   ├── Body failure disables dependent commands
│   │       │           │               │   └── Sticky bar reserves space beneath content
│   │       │           │               │
│   │       │           │               └── Page-owned dialogs [on demand]
│   │       │           │                   ├── Add/edit related information
│   │       │           │                   ├── Confirm consequential action
│   │       │           │                   ├── Review conflict
│   │       │           │                   ├── Page information details
│   │       │           │                   └── Shared primitives and overlay coordination
│   │       │           │
│   │       │           ├── GlobalFooter
│   │       │           │   │
│   │       │           │   ├── ApplicationInformation
│   │       │           │   │   ├── Configured legal identity/copyright
│   │       │           │   │   ├── Appropriate year policy
│   │       │           │   │   ├── Help/support links [optional]
│   │       │           │   │   ├── About Athyper → shared information surface
│   │       │           │   │   └── Environment/version label [optional, especially dev/test]
│   │       │           │   │
│   │       │           │   ├── PageContextSummary [optional]
│   │       │           │   │   ├── Record identity
│   │       │           │   │   ├── Source
│   │       │           │   │   ├── Record revision
│   │       │           │   │   ├── Precisely labeled timestamp
│   │       │           │   │   ├── Details → page-owned information panel
│   │       │           │   │   ├── Section-specific context labeled explicitly
│   │       │           │   │   ├── Narrow screens → Record information button
│   │       │           │   │   └── No active information → slot hidden
│   │       │           │   │
│   │       │           │   └── Footer behavior
│   │       │           │       ├── Bottom of short pages; after content on long pages
│   │       │           │       ├── Normal document flow by default
│   │       │           │       ├── No Save / Submit / Cancel controls
│   │       │           │       ├── Page publishes structured data, not custom footer markup
│   │       │           │       ├── Only active page owns the context slot
│   │       │           │       ├── Clear on navigation/context/access change or unmount
│   │       │           │       └── Critical revision/save state remains available in-page
│   │       │           │
│   │       │           └── ShellOverlayHost
│   │       │               │
│   │       │               ├── Shared overlay controller
│   │       │               │   ├── Registered typed surface requests
│   │       │               │   ├── One transient shell surface at a time
│   │       │               │   ├── Docked Atlas may coexist when space permits
│   │       │               │   ├── Modal blocks page and docked-panel interaction
│   │       │               │   ├── Escape closes topmost dismissible surface
│   │       │               │   ├── Dismissal restores opener focus
│   │       │               │   ├── Navigation transfers focus to destination
│   │       │               │   ├── Route/context transitions clean up transient state
│   │       │               │   └── Shared placement, sizing, backdrop, and layering
│   │       │               │
│   │       │               ├── Presentation modes
│   │       │               │   ├── Popover → anchored; page remains usable
│   │       │               │   ├── Modal dialog/drawer → focus contained; background inert
│   │       │               │   └── Docked panel → page and panel remain usable
│   │       │               │
│   │       │               └── SurfaceFrame [per active surface]
│   │       │                   ├── Accessible title
│   │       │                   ├── Close control outside feature error boundary
│   │       │                   └── OverlayBoundary
│   │       │                       ├── Render failure → SurfaceError
│   │       │                       │   ├── Safe message
│   │       │                       │   ├── Recovery
│   │       │                       │   └── Shell/page remain usable
│   │       │                       │
│   │       │                       └── Active registered surface
│   │       │                           │
│   │       │                           ├── MobileNavigation
│   │       │                           │   ├── Shared authorized sidebar model
│   │       │                           │   ├── Workspace navigation
│   │       │                           │   ├── Favorites / Recent
│   │       │                           │   ├── Profile controls
│   │       │                           │   └── Complete modal focus lifecycle
│   │       │                           │
│   │       │                           ├── ContextPicker
│   │       │                           │   ├── Authorized choices
│   │       │                           │   ├── Search/filter
│   │       │                           │   ├── Current selection
│   │       │                           │   ├── Loading / error / empty / ready
│   │       │                           │   └── Delegates context change to context adapter
│   │       │                           │
│   │       │                           ├── SearchPanel
│   │       │                           │   ├── Scope: All / Pages / Records / Wiki / Documents
│   │       │                           │   ├── Commands [only supported authorized commands]
│   │       │                           │   ├── Recent destinations before typing
│   │       │                           │   ├── Recent searches [supported]
│   │       │                           │   ├── Result type, title, location/context
│   │       │                           │   ├── Revision/update information when useful
│   │       │                           │   ├── Loading / error / no matches / results
│   │       │                           │   └── Federates authorized providers
│   │       │                           │
│   │       │                           ├── ActivityPanel
│   │       │                           │   ├── Notifications
│   │       │                           │   │   ├── Unread/read state
│   │       │                           │   │   ├── Mark read/unread
│   │       │                           │   │   ├── Meaningful grouping
│   │       │                           │   │   └── Relevant destination links
│   │       │                           │   ├── Inbox
│   │       │                           │   │   ├── Assigned actionable work
│   │       │                           │   │   ├── Priority and due dates
│   │       │                           │   │   ├── Filters
│   │       │                           │   │   └── Clear next action
│   │       │                           │   └── Independent loading/error/empty states
│   │       │                           │
│   │       │                           ├── QuickAccessPanel
│   │       │                           │   ├── Favorites / Recent tabs
│   │       │                           │   ├── Search within items
│   │       │                           │   ├── Filter: All / Pages / Records / Wiki / Documents
│   │       │                           │   ├── Item title, type, and distinguishing context
│   │       │                           │   ├── Favorites
│   │       │                           │   │   ├── Explicit save/remove
│   │       │                           │   │   └── User ordering
│   │       │                           │   ├── Recent
│   │       │                           │   │   ├── Successfully opened destinations
│   │       │                           │   │   ├── Newest first
│   │       │                           │   │   └── Clear recent history
│   │       │                           │   └── Shared quick-access store
│   │       │                           │       ├── User/plane/tenant/business-context scoping
│   │       │                           │       ├── Stable resource identity deduplication
│   │       │                           │       ├── No extra visit per scroll/filter/tab change
│   │       │                           │       ├── Authorization on display and open
│   │       │                           │       ├── Server-backed cross-device preference
│   │       │                           │       ├── Local fallback/cache where appropriate
│   │       │                           │       └── Separate from audit/activity history
│   │       │                           │
│   │       │                           ├── KnowledgeQuickPanel
│   │       │                           │   ├── Search Wiki & Documents
│   │       │                           │   ├── Relevant to current page
│   │       │                           │   │   ├── Explicitly associated Wiki articles
│   │       │                           │   │   └── Linked documents
│   │       │                           │   ├── Recent → filtered shared quick-access data
│   │       │                           │   ├── Favorites → filtered shared quick-access data
│   │       │                           │   └── Open full KnowledgeWorkspace
│   │       │                           │
│   │       │                           ├── AppearancePanel
│   │       │                           │   ├── Theme
│   │       │                           │   │   ├── System [default]
│   │       │                           │   │   ├── Light
│   │       │                           │   │   └── Dark
│   │       │                           │   ├── Density
│   │       │                           │   │   ├── Comfortable [default]
│   │       │                           │   │   └── Compact
│   │       │                           │   └── Shared preference behavior
│   │       │                           │       ├── Per-user persistence
│   │       │                           │       ├── Pre-sign-in local fallback
│   │       │                           │       ├── Initial theme applied before visible render
│   │       │                           │       ├── Follow OS changes only in System mode
│   │       │                           │       ├── Semantic tokens across all surfaces
│   │       │                           │       ├── Preserve branding, readability, focus, targets
│   │       │                           │       └── Respect reduced-motion preference
│   │       │                           │
│   │       │                           ├── LanguageRegionPanel
│   │       │                           │   ├── Supported UI language
│   │       │                           │   ├── Date/number formatting preferences [supported]
│   │       │                           │   └── Existing locale policy and persistence
│   │       │                           │
│   │       │                           ├── HelpPanel
│   │       │                           │   ├── Contextual application help
│   │       │                           │   ├── Documentation
│   │       │                           │   ├── Keyboard shortcuts
│   │       │                           │   └── Support
│   │       │                           │
│   │       │                           ├── ApplicationInformation
│   │       │                           │   ├── About Athyper
│   │       │                           │   ├── Plane: Neon / Mesh / Studio
│   │       │                           │   ├── Deployed frontend release version
│   │       │                           │   ├── Environment [appropriate deployment policy]
│   │       │                           │   ├── Expandable build/support details
│   │       │                           │   ├── Backend version [reliable and useful only]
│   │       │                           │   ├── Matching release notes [available only]
│   │       │                           │   ├── Legal/help links
│   │       │                           │   ├── Copy approved support information
│   │       │                           │   └── Build/deployment metadata; no manual plane copies
│   │       │                           │
│   │       │                           └── AtlasPanel
│   │       │                               ├── Conversation and history
│   │       │                               ├── Visible page/record/business-context scope
│   │       │                               ├── Dock / pin / expand / close
│   │       │                               ├── Authorized knowledge search and summaries
│   │       │                               ├── Source links and relevant revision references
│   │       │                               ├── Explicit authorized actions and clear outcomes
│   │       │                               ├── Invalidate obsolete context after context switch
│   │       │                               └── Local loading/error/recovery states
│   │       │
│   │       └── Unexpected render failure → AppFallback.FatalError
│   │           ├── Minimal provider-independent presentation
│   │           ├── Safe default styling/text
│   │           ├── Sanitized diagnostic reporting
│   │           ├── Opaque support reference
│   │           ├── Explicit Reload action
│   │           ├── Unsaved-work warning when relevant
│   │           └── No automatic reload loop
│   │
│   └── Framework root failure → MinimalRootFallback
│       ├── Outside the failed application tree
│       ├── Handles framework/server/root-level failures as appropriate
│       ├── No dependency on application providers
│       ├── Minimal recovery screen
│       └── Safe reload/navigation/support actions
│
├── KNOWLEDGE WORKSPACE [route content rendered inside Main → PageWorkspace]
│   │
│   ├── Navigation
│   │   ├── Overview
│   │   ├── Wiki
│   │   ├── Documents
│   │   └── Favorites [filtered shared quick-access store]
│   │
│   ├── Wiki
│   │   ├── Articles / procedures / policies
│   │   ├── WikiReader
│   │   ├── Editing [when supported and authorized]
│   │   ├── Version history
│   │   └── Review/publish workflow [when supported]
│   │
│   ├── Documents
│   │   ├── File/generated-artifact browsing
│   │   ├── DocumentPreview
│   │   ├── Upload [when supported and authorized]
│   │   ├── Download
│   │   └── Version history [when supported]
│   │
│   ├── Shared content components
│   │   ├── KnowledgeLauncher
│   │   ├── KnowledgeQuickPanel
│   │   ├── KnowledgeWorkspace
│   │   ├── KnowledgeSearchResults
│   │   ├── WikiReader
│   │   ├── DocumentPreview
│   │   ├── ContentVersionHistory
│   │   └── RelatedKnowledge
│   │
│   └── Content integration rules
│       ├── Same document identity across attachments, search, and Knowledge
│       ├── No duplicate file created merely for discoverability
│       ├── Record attachments retain record context and permissions
│       ├── Wiki/content search uses its ACL-aware provider
│       ├── Document search uses its authorized attachment provider
│       ├── UI federation does not bypass backend authorization boundaries
│       ├── Protect titles, snippets, previews, counts, favorites, and recents
│       ├── Recheck access when opening/downloading
│       ├── Complex browsing/editing/upload uses the full workspace
│       └── Read-only browsing/search/preview precedes unsupported authoring features
│
├── SHARED METADATA AND PROVIDER CONTRACT
│   │
│   ├── Application configuration
│   │   ├── Infrastructure-level typed configuration
│   │   ├── Independent of entity metadata availability
│   │   └── No arbitrary entity-controlled global chrome
│   │
│   ├── Entity metadata
│   │   └── Business fields, relationships, and domain model
│   │
│   ├── Page definition [separately versioned presentation metadata]
│   │   ├── Schema version
│   │   ├── Entity code
│   │   ├── Plane
│   │   ├── Page kind
│   │   ├── Supported layout variant
│   │   ├── Header bindings
│   │   ├── Navigation kind/items
│   │   ├── Section order and provider references
│   │   ├── Overview provider references
│   │   ├── Approved loading/empty-state variants
│   │   └── Registered recovery/action identifiers
│   │
│   ├── Page model
│   │   ├── Resolved identity/title
│   │   ├── Access decisions
│   │   ├── Resource states
│   │   ├── Authorized counts/status
│   │   └── Action availability
│   │
│   ├── Provider registry
│   │   ├── Validated provider names/options
│   │   ├── Domain-specific rendering
│   │   ├── Data access/integration
│   │   ├── Commands and mutation contracts
│   │   └── Capability/authorization integration
│   │
│   ├── Resolution
│   │   ├── Entity + page kind + plane + intended revision
│   │   ├── Validate page definition
│   │   ├── Resolve authorized providers/capabilities
│   │   └── Render shared PageWorkspace
│   │
│   └── Version and extension rules
│       ├── Operational pages use intended published metadata revision
│       ├── Studio draft preview follows an explicit draft path
│       ├── Compatible adapters preserve existing descriptors
│       ├── No arbitrary executable scripts or CSS in metadata
│       ├── No Business Partner conditionals in generic layout components
│       ├── Application version ≠ metadata release ≠ record revision ≠ draft revision
│       └── Cache keys include applicable tenant/business/revision context
│
├── SHARED BEHAVIOR CONTRACT
│   │
│   ├── Layout and scrolling
│   │   ├── Shell owns global chrome geometry
│   │   ├── Workspace owns internal page geometry
│   │   ├── One primary page scroll surface
│   │   ├── Header scrolls away naturally without repeated direction animations
│   │   ├── Breadcrumbs/navigation sticky where available space permits
│   │   ├── Side navigation/overview sticky on sufficiently wide layouts
│   │   ├── Side-panel scrolling only when required for reachability
│   │   ├── Center grid column uses minmax(0, 1fr)
│   │   ├── Shared column widths, gaps, offsets, and layer tokens
│   │   ├── Atlas docking changes available workspace width
│   │   ├── Narrow/zoomed views reduce sticky chrome when needed
│   │   ├── No duplicate desktop/mobile form instances
│   │   └── No focused control hidden or moved by header collapse
│   │
│   ├── Loading and refresh
│   │   ├── Initial loading uses layout-matched skeletons
│   │   ├── Refresh retains previously authorized data
│   │   ├── No previous-record/context content under a new identity
│   │   ├── Optional services/providers do not block required content
│   │   ├── Unknown/loading count differs from confirmed zero
│   │   ├── Bounded request timeout produces recovery state
│   │   └── Ordinary refresh preserves focus, input, and scroll
│   │
│   ├── Error and access handling
│   │   ├── Smallest useful failure scope
│   │   ├── Render boundaries handle descendant rendering failures
│   │   ├── Request/event/mutation failures handled explicitly
│   │   ├── Request retry refetches the failed resource
│   │   ├── Render recovery resets the failed boundary/state
│   │   ├── Safe title, explanation, recovery, optional support reference
│   │   ├── No stack traces, SQL, credentials, or raw backend responses
│   │   ├── Denied/failed results never become empty results
│   │   ├── Forbidden/not-found distinction follows disclosure policy
│   │   ├── Revocation removes inaccessible content and metadata
│   │   └── Full application fallback reserved for application/shell failure
│   │
│   ├── Navigation and persistence
│   │   ├── Deep links and browser Back/Forward
│   │   ├── Stable page/section/resource identities
│   │   ├── Explicit navigation versus passive observation
│   │   ├── Unsaved-change protection on applicable departures
│   │   ├── Shell remains mounted during ordinary page navigation
│   │   ├── State reset follows meaningful identity change
│   │   └── Storage unavailability handled gracefully
│   │
│   ├── Accessibility and localization
│   │   ├── One main landmark and functional skip link
│   │   ├── One page h1 and coherent section headings
│   │   ├── Correct tabs/links/steps semantics
│   │   ├── Visible keyboard focus
│   │   ├── Accessible names for icon-only controls
│   │   ├── Modal focus containment and restoration
│   │   ├── Docked panels remain nonmodal
│   │   ├── No color-only status communication
│   │   ├── Respect reduced motion
│   │   ├── Fully localized shell/fallback labels
│   │   ├── RTL and long-label support
│   │   └── Usability at narrow widths and 200% zoom
│   │
│   └── Plane-specific responsibilities
│       ├── Neon → operational records, requests, business actions
│       ├── Mesh → network accounts, collaboration, externally scoped content
│       └── Studio → composition, drafts, validation, versions, publication
│
└── IMPLEMENTATION AND ACCEPTANCE CONTRACT
    │
    ├── Existing foundations to evolve
    │   ├── PlatformShell and plane adapters
    │   ├── PageFrame / PageHeader
    │   ├── EntityPageLayout collection/record ownership
    │   ├── EntitySectionNavigation and scroll behavior
    │   ├── EntityRecord360Panel
    │   ├── Existing 360 descriptor through compatibility adapters
    │   ├── RecordFooterSource / useRecordFooterSources
    │   ├── Shared quick-access infrastructure
    │   └── Content-hub preparation and authorized content/document services
    │
    ├── Ownership
    │   ├── app-foundation → application startup/providers/fallbacks
    │   ├── platform-shell → shell and generic page geometry
    │   ├── entity runtime → metadata-driven entity rendering
    │   ├── plane packages → context and capability adapters
    │   ├── domain packages → specialized providers
    │   └── content-hub → shared Knowledge experience integration
    │
    ├── Migration sequence
    │   ├── Record shared contracts/tokens/scroll ownership
    │   ├── Extract shell components without changing behavior
    │   ├── Standardize overlay, focus, and preference behavior
    │   ├── Implement PageWorkspace and three layout variants
    │   ├── Implement shared state boundaries/status/action lifecycle
    │   ├── Migrate Business Partner detail
    │   ├── Migrate Business Partner new request
    │   ├── Migrate Studio model workspace
    │   ├── Introduce versioned generic page-definition adapters
    │   ├── Prove reuse with a second entity and a Mesh page
    │   ├── Roll out across remaining routes
    │   └── Remove duplicate layout/state markup and CSS
    │
    ├── Enforcement
    │   ├── All planes use shared application and shell entry points
    │   ├── Routes use PageWorkspace or documented application fallback
    │   ├── Data-driven surfaces use shared state components
    │   ├── No route-specific shell reconstruction
    │   ├── No arbitrary page-level shell CSS overrides
    │   └── No duplicated preference, favorites, or recent-history stores
    │
    └── Verification matrix
        ├── Startup success / timeout / retry / authentication / access denial
        ├── Provider failure and provider-independent fatal fallback
        ├── Framework root recovery
        ├── One-, two-, and three-column layouts across all planes
        ├── Loading / error / empty / forbidden / not found / ready
        ├── Partial section/panel/service failure
        ├── Refresh failure with retained authorized data
        ├── Failed saves preserve input
        ├── Body failure disables dependent mutation actions
        ├── Deep links / Back / Forward / final-section scroll tracking
        ├── Context switches and cache isolation
        ├── Footer information ownership and cleanup
        ├── Desktop / mobile / Atlas docked / expanded content
        ├── Keyboard / focus / screen-reader announcements
        ├── Long titles / long labels / RTL / 200% zoom
        ├── System / Light / Dark appearance
        ├── Comfortable / Compact density
        ├── Authorized search / Knowledge / favorites / recents
        └── Application, metadata, record, and draft versions clearly distinguished
```
