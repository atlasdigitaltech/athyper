# Shared Application Experience — System Design

| Field | Value |
| --- | --- |
| Date | 2026-09-17 |
| Scope | Neon, Mesh, Studio; application startup, shell, pages, shared services, package boundaries, deployment |
| Status | Local development design; implementation progress is tracked in the build plan |
| Companion | [Build Work Plan](build-work-plan.md) |

## 1. Purpose and authority

Provide one reusable experience across three independently deployable applications. Business Partner is the first migration consumer, not the owner of generic layout behavior. Share pages and feature implementations as well as chrome; app route files remain thin framework adapters.

This document defines the target, not a claim that every component exists. The detailed tree in Appendix A records the agreed component inventory. The rules in the main document resolve ambiguities in that tree and take precedence over its shorthand. This is a local development effort; release governance and multi-instance infrastructure are future concerns, not build prerequisites. Tree branches describing states are alternatives; configuration and behavior nodes are specifications, not literal DOM nodes.

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
| `EntityApplicationLayout` (`apps/neon/lib`) | Thin route/entity adapter; retain entityCode integration |
| `EntityPageLayout` | Preserve collection-versus-record chrome ownership; not the entity detail runtime |
| `PageFrame` / `PageHeader` | Presentation primitives composed by PageWorkspace |
| `EntitySectionNavigation` and scroll hook | Shared navigation used by multiple page-kind runtimes |
| `EntityFormRuntime` | Starting implementation for create/edit orchestration |
| `EntityDetailRuntime` | Starting implementation for detail orchestration |
| Shared intake controllers/contracts/state functions | Starting implementation for step lifecycle and intake presentation |
| Business Partner Studio composition editor | Specialized content provider; not assumed to generalize across entities |
| `EntityRecord360Panel` and its descriptor | Adapt compatibly to generic composition; replace closed provider assumptions through validated registration |
| `RecordFooterSource` / `useRecordFooterSources` | Evolve into structured page-owned footer information |
| `packages/platform/shell/content-hub` | Placeholder to develop into Knowledge integration; not a completed workspace |
| `server/apps/platform-host` | Retain backend deployment boundary unless separate service requirements justify a split |

These components are complementary layers, not competing replacements. Adapt through compatible exports before renaming or retiring implementations; a second real consumer must prove reuse.

Relevant policy scripts and OpenAPI workflows already exist. Reuse the checks applicable to changed code; this local cleanup does not require a new enforcement program.

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

Reuse existing bounded API request timeouts and cancellation; expose a safe retry when required bootstrap loading fails. If an existing path has no timeout, add one shared configurable deadline while implementing startup, rather than a per-page setting. There is no fabricated percentage progress or automatic reload loop.

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

The page definition explicitly selects layout and navigation mode. Choose using the criteria below while implementing the page. Responsive adaptation changes geometry, not task semantics.

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

Keep the existing primary page scroll root and a single primary scroll surface; verify its actual overflow behavior while implementing the workspace. Header scrolls away; breadcrumbs/tabs and side panels stick where usable space permits. Tokens/measurements determine offsets; no per-route hard-coded offsets. The center grid track uses `minmax(0, 1fr)`. Atlas docking reduces actual available width. Narrow/zoomed views reduce sticky chrome, use a section selector and accessible overview disclosure/drawer. Never mount duplicate forms for responsive layouts.

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

Frontend and backend are developed together at the same local commit. Update public types, parsers and callers together, keep one canonical wire shape, and validate relevant serialized responses. Keep existing contract/OpenAPI checks. Do not build a supported historical consumer window or compatibility negotiation now; revisit version skew when releases become independent. Existing persisted definitions still require explicit migration or compatible parsing when their schema changes.

| Family | Allowed direction | Forbidden direction |
| --- | --- | --- |
| Apps | Plane/platform packages | Other app internals |
| Plane implementations | Shared platform/contracts | Other plane internals |
| Platform implementations | Lower-level shared packages/contracts | Plane/app implementations |
| Browser-safe contracts | Approved schema utilities and lower-level contract primitives | React/Next, apps, platform/plane/server implementations |
| Server-internal contracts | Shared public contracts, lower-level server contracts, explicitly allowed foundation primitives | Service/app/database/framework implementations |

Contracts must remain acyclic. Separate browser/server entry points; do not export server secrets, storage clients or backend implementations through browser barrels. Apply existing governance classification and dependency budgets.

Use existing boundary policies and OpenAPI checks when touching their scope. Do not add a second governance framework or exhaustive negative-fixture program for this local cleanup. Keep focused tests for meaningful new schema/authorization behavior and regressions.

## 11. Deployment direction — future work

Keep three independently buildable apps with shared compiled packages. They may later run as separate processes/containers on one server or on multiple servers. Keep configuration outside UI components, preserve existing BFF/session/storage integration, and do not introduce hard-coded plane hostnames or process-local authoritative data.

Replica/cache coordination, deployment manifests, old-client compatibility, rollout cohorts and production promotion testing are deferred until actually needed. Existing IAM Redis session storage is not a generic Next.js cache API. No new cache infrastructure is required by this local UI cleanup.

## 12. Practical local checks

Use a small set of checks while building: one main and h1, usable keyboard focus and icon labels, no overlapping sticky controls, a narrow-window check, normal task completion, local failure/retry and preserved form input. Check authorization/context isolation when changing those paths. Unknown count is a state, not a numeric threshold: pending/failed is unknown, successful 0 is zero.

Keep existing responsive, RTL and reduced-motion behavior; do not require an exhaustive new browser matrix for every extraction. Run affected typechecks and relevant tests, adding focused tests for actual failure modes. Use the flat task list in [Build Work Plan](build-work-plan.md).

## 13. Maintaining this document

Edit this document when implementation teaches us something. No owner-assignment ceremony, numbered pending-decision registry, document semver or PR-per-edit approval is required by this local plan. Git history records revisions. Keep the agreed component boundaries and domain authorization rules; clearly mark future features and never describe planned work as implemented.

## 14. Entity reuse and extension contract

### 14.0 Scope: three mechanisms, not one — updated after real publication investigation

This section originally framed the page-kind runtime as the eventual single mechanism for every entity, with Business Partner as its first migration consumer. Investigation into the actual publication pipeline (checking what is genuinely published in the live database, not just what the frontend contracts declare) found this needs correcting rather than pursued as originally written:

- **Neon already has a separate, real, working mechanism — the case runtime** — that governs Business Partner today: rich operation scope, lifecycle transitions, and authorization semantics that the page-kind descriptor contract does not model and was never going to reach parity with cheaply. Studio's composition editor authors for the case runtime only; there is no authoring path for the page-kind descriptor contract anywhere in the product today, only raw developer scripts.
- **Decision: the case runtime is the permanent mechanism for transactional/governed entities** (anything with lifecycle, workflow, or business transitions — Business Partner and any future entity of that shape). It is not a "legacy path pending migration." Section 14.1's framing of Business Partner as "the first consumer" of the page-kind runtime is superseded — Business Partner does not migrate onto it.
- **The page-kind runtime (sections 14.1–14.7 below) is scoped down to flat reference/configuration data only** — entities with no lifecycle, no relationships, no governance workflow (currency, country, unit-of-measure, and similar). For that narrow class, a script-authored publish (reviewed like any other change) is a proportionate, permanent authoring mechanism; building a Studio authoring UI to reach case-runtime parity is not warranted for data this simple.
- **Mesh document exchange is a third, separate mechanism, not yet designed.** It is cross-network, cross-tenant document/data flow — not a record CRUD experience — and forcing it into the page-kind vocabulary would repeat the same abstraction mismatch this section already avoided once for `EntityRecord360Panel`'s tab strip. Its design is deliberately deferred to its own future pass, not folded into this section's contract.

The remainder of section 14 describes the page-kind runtime under its corrected, narrower scope. Read every "future entity" reference below as "future flat reference/configuration entity," not as a universal replacement for the case runtime.

### 14.1 Architecture and ownership

Future reference/configuration entities (see 14.0 for scope) reuse Main, PageWorkspace and page-kind runtimes; this is not the mechanism for transactional/governed entities like Business Partner. Composition and registered providers replace inheritance trees and entity-specific branches in generic components.

```text
PlatformShell → Main → PageWorkspace
                        ├── Shared chrome, layout, states and action slots
                        └── PageKindRuntime
                            ├── CollectionRuntime
                            ├── DetailRuntime
                            ├── FormRuntime [create/edit]
                            ├── IntakeRuntime
                            ├── ReviewRuntime
                            └── ConfigurationRuntime
                                └── Registered content providers
                                    ├── Generic fields/relationships/collections/summaries
                                    ├── Specialized domain sections
                                    └── Custom content editor/workspace
```

These are responsibilities, not mandatory new package boundaries. Runtime content never renders a second Main or recreates page chrome.

| Responsibility | Owner |
| --- | --- |
| Header, columns, boundaries, toolbar/action slots and footer registration | Shared PageWorkspace |
| Page-kind lifecycle and interaction orchestration | Page-kind runtime |
| Fields, sections, navigation and supported composition | Validated entity page definition |
| Specialized rendering and domain integration | Registered provider |
| Permissions, persistence, validation authority and business transitions | Backend operation/service |

### 14.2 One page-kind selector

`pageKind` is the sole public selector: `collection`, `detail`, `create`, `edit`, `intake`, `review`, or `configuration`. A registered resolver maps these to the runtime above; create/edit share FormRuntime. There is no additional `template` field. Earlier illustrative definitions containing that field are superseded by this contract.

“Template” is descriptive terminology only. Specialized content uses validated provider references. If multiple runtime strategies become necessary, define their behavior explicitly here rather than adding an undocumented second selector.

### 14.3 Page-kind suggestions and explicit published choices

Both layout and section-mode columns below are authoring suggestions, not mandatory values or dynamic heuristics. Published definitions record selected layout and any section navigation explicitly. Overrides follow section 7.1 criteria and validator-supported combinations. Counts and entity size must not change the layout unexpectedly.

| Page kind | Suggested initial layout | Suggested initial section mode | Supported alternative and criterion |
| --- | --- | --- | --- |
| Collection | `content` | None | Use `sections-content` with `switch` for distinct persistent views, or `scroll` for meaningful continuous sections |
| Detail | `sections-content` if sectioned; otherwise `content` | `scroll` if sectioned; otherwise none | `switch` for distinct record workspaces; overview layout when persistent supplementary context is useful |
| Create/Edit | `sections-content` for long forms; otherwise `content` | `scroll` if sectioned; otherwise none | Task steps only for a defined workflow; specialized switch views require state preservation |
| Intake | `sections-content` within sectioned steps; otherwise `content` | `scroll` within a sectioned step; otherwise none | Step navigation is independent; distinct tools may use explicit `switch` if supported by the flow |
| Review | `sections-content` if sectioned; otherwise `content` | `scroll` for continuous evidence; otherwise none | `switch` for separate evidence/comparison/decision views; overview layout for useful case/version context |
| Configuration | `sections-content` for multiple workspace views; otherwise `content` | `switch` for distinct tools; otherwise none | `scroll` for a continuous configuration form; custom editor in selected content view |

Horizontal page navigation and left section navigation are independent axes. Intake may expose Identify → Details → Review steps while the Details step uses scroll navigation for identity, addresses and contacts. Responsive geometry changes never silently switch the interaction mode.

### 14.4 Extension levels

| Level | Entity supplies | Shared behavior retained |
| --- | --- | --- |
| 1 — Metadata configuration | Fields/groups, labels, bindings, sections and operation references | Full page-kind runtime and generic rendering |
| 2 — Existing provider composition | Arrangement of existing relationship, summary and collection providers | Full page-kind runtime |
| 3 — Specialized provider | Custom section, summary or domain action integration | Workspace and page-kind lifecycle |
| 4 — Custom content workspace | Specialized editor with explicit lifecycle adapter | Chrome, geometry, boundaries, dirty state, navigation and action conventions |

Use the smallest sufficient extension. Level 4 does not authorize a custom global shell, loading framework, footer or competing page action bar. Specialized content may have its own internal interactions. Promote a domain provider to shared only when another real consumer demonstrates compatible semantics.

### 14.5 Studio, intake and review

ConfigurationRuntime is a reusable wrapper for draft/revision context integration, view navigation, dirty/save integration, validation-result presentation and registered actions. Its content can be a supported generic metadata editor or a specialized composition editor. Per the 14.0 scope correction, the Business Partner Studio editor is specialized permanently, not pending migration — it authors for the case runtime, which this section's ConfigurationRuntime does not cover. Authoring services retain authority over draft creation, revisions, transitions and publication.

IntakeRuntime manages step/section navigation, validation presentation, dirty integration, progress and recovery. The domain adapter supplies the flow, validation integration, draft persistence, duplicate checks, submission operation and result interpretation. Submit references an authorized operation; it does not mean direct record creation. A result may create/advance a governed request.

ReviewRuntime presents the subject, evidence, differences and permitted decisions. It must not assume all entities support Approve/Reject or that approval immediately materializes a business record. Frontend validation never replaces backend checks.

### 14.6 Definition and provider contracts

Use a discriminated definition by pageKind. Intake requires a compatible flow reference; review requires subject/operation integration; configuration requires authoring-context integration. Collection/detail definitions do not carry irrelevant intake fields. Model a common envelope plus kind-specific fields rather than one bag of optional properties.

The following is illustrative target notation, not an implemented public schema. Choose the actual schema identifier/version in the shared contract while implementing it; this example does not change existing wire versions.

```ts
const assetDetailDefinition = {
  schemaVersion: 1, // illustrative; confirm against the implemented contract
  entityCode: "asset",
  pageKind: "detail",
  layout: "sections-content-overview",
  sectionNavigation: { mode: "scroll" },
  sections: [
    { key: "identity", provider: "entity.fields",
      options: { fieldGroup: "identity" } },
    { key: "ownership", provider: "entity.relationships",
      options: { relationship: "owners" } },
    { key: "maintenance", provider: "asset.maintenance-history", options: {} },
  ],
  overview: [
    { key: "summary", provider: "entity.summary",
      options: { fieldGroup: "summary" } },
  ],
};
```

Provider-specific configuration belongs under the provider-validated `options` object in this target example. Earlier illustrations with top-level `fieldGroup` or `relationship` are superseded, not alternative supported forms. This example refinement is not a claim of wire-level backward compatibility: if inventory finds an implemented consumer of the earlier shape, adapt or explicitly migrate that local consumer and add a focused compatibility check before adoption.

Each provider has a stable identifier, supported API version, supported page kinds/slots, validated options schema, required capabilities, rendering implementation and lifecycle adapter. Distinguish definition schema version, provider API compatibility and artifact release version. The public capability manifest contains serializable descriptions; the local runtime registry binds those descriptions to code. Metadata does not carry executable imports or functions.

Lifecycle integration covers resource identity, shared data/cache access, cancellation/stale-result rejection, validation, dirty state, authorized actions and cleanup. Do not duplicate record requests independently without coordination. No arbitrary executable script, module path, SQL or CSS is permitted in options.

### 14.7 Definition validation and provider availability scope

| Layer | Responsibility |
| --- | --- |
| Authoring feedback | Actionable diagnostics while editing; cannot substitute for publication enforcement |
| Publication enforcement | Reject invalid/incompatible definitions before activation |
| Runtime defense | Safely reject unsupported schemas/required providers and re-evaluate current context |

Validate page kind/schema, unique keys, field/group/relationship references, provider identifiers and option schemas, supported slots/kinds/layouts/navigation combinations, flow/operation references and required-versus-optional status. Publication verifies declared capabilities and references, not the future user's permission to execute them.

**Check availability at three practical scopes:**

1. **Current plane/runtime:** the current local Neon, Mesh or Studio registry must support required providers. Support in Studio's editor alone does not prove another plane can render a provider. Use the current build's registration data; do not implement artifact-manifest negotiation now.
2. **Tenant/business enablement:** check applicable tenant/account capabilities when resolving the definition and again when context changes.
3. **Request authorization:** enforce current resource/action permissions on the backend. Registration is not authorization evidence.

Unsupported required provider/version produces a safe unsupported-definition state and disables dependent mutations. Optional providers may be omitted only when omission leaves a valid task; remove their navigation and adapt layout consistently. Never silently render an incomplete editable form as valid. Validate references/options on the backend before allowing publication of the new definition format, and defensively parse on the client.

Multi-version provider manifests and environment-promotion compatibility are future deployment work. They do not block local runtime construction.

### 14.8 Onboarding, packaging and completion

```text
Register entity schema and backend capabilities
→ Select supported page kinds
→ Author explicit page definitions
→ Compose existing providers
→ Implement only necessary specialized providers
→ Validate and publish through governed lifecycle
→ Register authorized routes/navigation
→ Verify entity behavior and shared conventions
```

Not every entity requires every kind. Do not create an entity package just to copy generic pages. Apps retain thin route adapters; shared page geometry stays in platform shell; entity rendering stays in runtime packages; specialized providers stay in their appropriate domain/plane packages. Use the canonical existing-component lineage in section 2; do not create a competing replacement table.

Build generic layout/state primitives first or alongside the shared definition contract. Finalize the actual local schema before wiring the resolver, provider bindings and publication parser to it. Adapt Business Partner, then prove reuse with a second entity and Mesh. Keep a few meaningful failure tests: unknown required provider, invalid options/reference, unsupported page-kind/slot and access denial. Do not build historical deployment fixtures for a local-only runtime.

Completion requires a second entity with metadata-only sections and a specialized registered provider, no copied chrome/boundaries/scroll/footer implementation, no entity conditionals in the resolver, and parity for permissions, state, navigation and mutations. These are foundations to evolve; generic onboarding is not certified by the existence of current runtimes.

## Appendix A. Detailed component and behavior inventory

The component inventory below retains the agreed UI structure. The final implementation checklist is simplified for local development; future production mechanisms are not prerequisites. Sections 5–6 clarify responsive action priorities and Atlas's separate transient/docked channels; section 7 defines layout selection; sections 10–13 describe shared contracts and the simplified local-development scope. Section 14 extends this preserved inventory with the authoritative page-kind runtime and entity extension contract.

```text
ATHYPER SHARED APPLICATION EXPERIENCE — V1 DESIGN CONTRACT
│
├── Scope [local build; future deployment mechanisms deferred]
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
└── LOCAL BUILD CHECKLIST
    ├── Inspect active implementations and preserve unrelated local edits
    ├── Consolidate startup and shell using existing packages
    ├── Build shared PageWorkspace layouts and state handling
    ├── Define one pageKind contract and validated provider registry
    ├── Adapt Business Partner collection/detail/intake/Studio
    ├── Prove reuse with another entity and Mesh
    ├── Complete supported utilities and Knowledge features
    ├── Remove verified duplicate code and styles
    ├── Check affected flows, keyboard/narrow layout and relevant tests
    └── Defer replicas, release cohorts and version-skew machinery until needed
```
