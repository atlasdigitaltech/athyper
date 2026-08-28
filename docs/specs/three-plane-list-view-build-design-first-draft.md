# Three-Plane List View Build Design — First Draft

**Status:** First-draft design for review  
**Date:** 2026-08-25  
**Scope:** A from-scratch List View capability shared by Neon, Mesh, and Studio  
**Reference policy:** Legacy packages are behavioral evidence only. They are not implementation sources, dependencies, compatibility layers, or package authorities.

## 1. Decision summary

Build one product-neutral List View runtime and three thin plane integrations.

- The shared runtime owns list state, descriptor interpretation, table/card presentation, organize controls, selection semantics, accessibility, cache keys, and diagnostics.
- Neon, Mesh, and Studio own route composition, work-context resolution, navigation URLs, plane-specific operations, and any plane-only cell or empty-state presentation.
- The server owns readable fields, effective actions, scope predicates, row access, filter/sort validation, masking, and mutation eligibility.
- The URL is the shareable source of list presentation state. Protected business scope and authorization evidence are never accepted from the URL as trusted facts.
- The initial release is a high-quality table/compact list, not a recreation of every historical view mode. Board, dashboard, and spreadsheet modes follow only after their contracts and use cases are explicit.

This should not revive either old implementation. The older `EntityListPage` was feature-rich but monolithic. The later `RuntimeListPage` had the right server-first adapter shape, but Neon was the only materially wired plane; Mesh and Admin, the predecessor to Studio, remained unavailable-state stubs.

## 2. Repository findings

### 2.1 Current state

The active applications have a secure three-plane shell, typed API transport, query lifecycle, and plane context selectors. Their business pages are still placeholders and there is no active frontend List View implementation.

The backend is further ahead:

- Published runtime entity descriptors exist in `server/packages/contracts/metadata` and `server/packages/platform/metadata`.
- Generic record read and mutation services exist in `server/packages/services/records`.
- Import/export orchestration exists in the record transfer service.
- Saved-view create, replace, default, pin, star, share, clone, and archive behavior exists in `server/packages/platform/preferences`.
- Studio metadata DDL already models list surfaces, ordered field bindings, operation placements, selection modes, visibility rules, and effective plane operation bindings.

However, this foundation is not yet sufficient for a frontend build:

1. The browser-safe entity/list contract packages are empty placeholders.
2. The current runtime descriptor is an execution descriptor. It contains storage details but omits most safe UI presentation data such as labels, ordered list bindings, renderers, widths, list defaults, and effective action presentation.
3. `GET /api/records/:entityCode` currently parses only `limit` and `search`, even though the service contract supports cursor, filters, sorting, count mode, and reference hydration.
4. The record repository's list path executes against the plane database rather than the transaction passed by the query service. That must be corrected and covered by an RLS-context integration test before List View ships.
5. No records, entity-descriptor, saved-view, import, or export operations are allowlisted in the three application BFF relays.
6. The current frontend saved-view client package is empty.
7. The saved-view repository stores default/pin/star flags in `master.principal_ui_preference`, while the current DDL and frontend spine explicitly prohibit saved views and larger view state there. Storage ownership must be corrected rather than copied.
8. Neon company/operating-organization context and Mesh network-account selection are currently browser-held presentation state. A record query needs a server-validated scope coordinate and a stable scope fingerprint.
9. Studio metadata authoring has mutation routes but no bounded authoring-catalog list projection. Studio should use a Studio-owned list data source normalized into the shared presenter, not force authoring data through the generic business-record endpoint.

### 2.2 Two useful legacy generations

The Git parent of `06d02f8c` contains both reference generations.

| Reference | Useful evidence | Main reason not to port |
|---|---|---|
| `packages/product-deprecated/runtime-ui/entity-runtime/src/list/EntityListPage.tsx` | Rich filters, URL state, modified-view behavior, table/compact/board/dashboard/spreadsheet views, bulk actions, row metadata, context actions | Roughly 3,000 lines in one client component, many hooks, heuristic behavior, direct fetches, mixed permissions/data/presentation, duplicated contracts |
| `packages/shared/runtime-domain/runtime-list` | Server-first presenter, adapter boundary, safe column projection, access-scope stripping, URL parsing, organize controls, responsive table/cards, bounded browser cache | Removed during the three-plane package migration; only Neon was substantially integrated and several advertised modes were not implemented |

The legacy-retirement document correctly states that the old implementations were dead code at retirement time. “Inspiration” here means retaining proven user behavior and rejecting the old package graph.

## 3. Reference disposition

### 3.1 Retain as product behavior

- Metadata-driven columns, labels, renderers, filterability, sortability, groupability, and aggregations.
- Shareable URL state for query, filters, sort, grouping, columns, density, mode, and saved-view identity.
- A clear “Modified from _view name_” state with discard/revert.
- Server-side search, filter, sort, pagination, field masking, and scope enforcement.
- Compact cards on narrow screens, even when the selected desktop mode is table.
- Search, filter, sort, group, columns, density, and saved views gathered into one coherent Organize area.
- Visible scope chips that explain the enforced company, legal entity, operating organization, network account, relationship, or tenant boundary.
- Column hide/show/reorder, multi-sort ordering, null ordering, density, and pinned spreadsheet columns where supported.
- Row navigation, open in new tab, copy permitted field values, and metadata-driven row actions.
- Selection bar, governed preflight, confirmation, progress, partial-result reporting, and explicit clearing of selection.
- Saved-view personal/shared/system scope, default, pin, star, clone, archive, and optimistic concurrency.
- Import validation/preview/commit and asynchronous export with downloadable artifacts.
- Bounded, identity- and scope-aware caching with context-switch and mutation invalidation.
- Cold/warm performance targets already documented for runtime lists: cold rows visible under 2,000 ms median and warm rows under 500 ms median.

### 3.2 Change deliberately

- Use canonical metadata mode names: `table`, `compact`, `board`, `dashboard`, and `spreadsheet`. Do not maintain `list`/`excel` aliases inside the new public contract.
- Produce a safe UI descriptor instead of sending storage schema/table names or raw authorization internals to the browser.
- Return configured actions as `enabled`, `disabled`, or `hidden`. Safe denials remain visible and explain why; the executing endpoint always reauthorizes.
- Keep query state and work context separate. A saved view cannot store tenant, company, operating-organization, network-account, or relationship authority.
- Make “selected rows” and “all matching rows” distinct bulk-selection modes. “All matching” requires a server-issued query snapshot token; it is never inferred from a checkbox.
- Use typed API operations and the same-origin relay. No component builds raw `/api/relay/...` fetches or reads CSRF cookies.
- Use one reducer/state model and small client islands rather than a page-sized client component.
- Use accessible menus/dialogs from the active foundation. A right-click menu is an optional shortcut to the same keyboard-accessible row menu, not the only path.
- Resolve relative date filters on the server using the effective timezone and, where requested, the company fiscal calendar.
- Default to cached or approximate counts. Exact counts are requested only by a surface that needs them and can meet the query budget.
- Treat list presets and complete saved views as different concepts only if product research proves both are needed. The first build has complete saved views only.

### 3.3 Retire

- Entity behavior inferred from field-name regexes, route-name heuristics, or labels such as “New” and “Export”.
- Browser-side permission inference and feature booleans used as authorization.
- Client-authoritative business scope from local storage.
- Raw database coordinates in browser contracts.
- Disabled operations silently removed when it is safe to explain the denial.
- Hard-coded entity canaries or plane-specific branches in the shared presenter.
- Duplicate URL parsers, duplicate descriptor converters, and duplicate API clients.
- Exact-count queries on every navigation.
- One component owning descriptor fetches, list fetches, all controls, all view modes, all dialogs, and all mutations.
- Separate HTML tables inside domain workbenches when the job is ordinary entity listing.

## 4. User outcomes by plane

| Plane | Primary user outcome | Scope authority | First representative slice |
|---|---|---|---|
| Neon | Find and act on operational/master records quickly across a permitted company or operating organization | Tenant plus authorized legal entity, company code, and/or operating organization | `business_partner`, followed by `company_code` or a procurement entity with a published list surface |
| Mesh | Work only as the selected buyer/supplier network account and see relationship-scoped records | Tenant plus validated actor network account and relationship participation | `network_relationship`, followed by `network_account` or order exchange |
| Studio | Inspect and manage administrative catalogs with strong status, version, and change-set context | Tenant context plus Studio permissions; authoring state comes from Studio services | Metadata entity catalog or change-set catalog through a Studio-owned read model |

The shared runtime must not assume that every data source is the generic Records service. It consumes a normalized List Descriptor and List Result. Neon and Mesh normally adapt generic records; Studio can adapt authoring, identity, configuration, or operations projections.

## 5. Functional scope

### 5.1 Capability matrix

| Capability | First release | Later | Notes |
|---|---:|---:|---|
| Server-rendered list frame and first rows | Yes |  | Stream toolbar and rows independently where useful |
| Table mode | Yes |  | Sortable headers, semantic cells, row actions |
| Compact/mobile card mode | Yes |  | Automatic mobile fallback plus explicit desktop mode |
| Search | Yes |  | Server search; optional loaded-row search only if descriptor allows it |
| Typed filters | Yes |  | Text, number/money, boolean, date/datetime, enum/lookup/reference, presence |
| Single sort | Yes |  | Multi-sort follows after basic list qualification |
| Multi-sort and null ordering |  | Yes | Maximum levels supplied by descriptor/tenant policy |
| Column show/hide/reorder | Yes |  | At least one identity column must remain visible |
| Density | Yes |  | Profile default, URL override, saved-view persistence |
| Scope and active-state chips | Yes |  | Scope chips are non-removable |
| Cursor pagination and page-size selection | Yes |  | Saved views exclude cursor/page |
| Saved views |  | Yes | Personal first, then share/system management |
| Grouped table |  | Yes | Server group counts; collapsible groups |
| Row selection and bulk actions |  | Yes | Explicit current-page vs all-matching semantics |
| Row operations | Yes |  | Enabled/disabled/hidden with reasons |
| Export current view |  | Yes | Exact normalized query and visible exportable fields |
| Import workflow |  | Yes | Upload, validate, preview, commit, progress, error report |
| Spreadsheet mode |  | Yes | Resize, pin, aggregate footer; editing is out of scope initially |
| Board mode |  | Yes | Requires configured group field and transition operations |
| Dashboard mode |  | Yes | Requires explicit metric definitions; no client aggregation over one page |
| Bookmark/comment indicators |  | Yes | Optional row decoration provider, not a core Records concern |
| Inline editing |  | Future decision | Requires locks, validation, concurrency, and mutation design |

### 5.2 Page anatomy

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Back | Entity title                         [Create] [More actions]   │
│ Scope: Company MY01 · Operating Org APAC                            │
├──────────────────────────────────────────────────────────────────────┤
│ [Search................................] [Filter 2] [Organize] [View] │
│ Saved view: Open suppliers · Modified     [Revert] [Save as…]        │
│ Status: Active ×   Country: MY ×   Sort: Updated ↓   50 rows         │
├──────────────────────────────────────────────────────────────────────┤
│ □  Code       Name                  Status       Updated       ⋮      │
│ □  SUP-1042   Northwind Supply      Active       25 Aug 2026  ⋮      │
│ □  SUP-1088   Contoso Materials     On hold      24 Aug 2026  ⋮      │
│ ...                                                                  │
├──────────────────────────────────────────────────────────────────────┤
│ 2 selected  [Bulk action] [Export selected] [Clear]   Prev  Next     │
└──────────────────────────────────────────────────────────────────────┘
```

On narrow screens, the toolbar wraps, advanced controls open in a full-height drawer, and each row becomes a compact card with identity, status, two or three configured facts, and an accessible actions menu.

## 6. Detailed interaction design

### 6.1 Initial load

1. The route authenticates and resolves tenant plus plane context.
2. The server loads the safe list descriptor and effective collection actions.
3. If Read is denied, it returns the standard non-disclosing 403/404 behavior and never queries rows.
4. The route parses URL state against the descriptor. Unknown fields/operators/modes are removed with a non-sensitive diagnostic; protected scope injection is rejected or stripped before query execution.
5. Metadata default state is applied, then an eligible principal default saved view, then explicit URL overrides.
6. The server queries the first row page using the effective scope and readable field projection.
7. The page renders the title/scope immediately and streams list content where this improves first-row time.
8. Client islands hydrate search, organize drawers, selection, menus, and subsequent-page fetches.

Precedence is:

```text
published list-surface defaults
  -> system view, when explicitly configured as the surface default
  -> principal default saved view
  -> explicit URL state
  -> temporary drawer draft, before Apply only
```

Scope and authorization sit outside this chain and cannot be overridden.

### 6.2 Search

- Search is displayed only when at least one readable searchable field exists.
- Input is debounced, updates the URL with `replace`, resets the cursor, and cancels the previous request.
- Pressing Enter commits a history entry so Back returns to the prior query.
- The descriptor defines minimum length and whether loaded-row search is allowed. Server search remains the default.
- An unsupported search returns a typed state with guidance to use filters; it does not masquerade as “no records”.
- Search terms are treated literally unless an explicitly configured advanced syntax is introduced later.

### 6.3 Filters

- The filter drawer uses a draft. URL and data remain unchanged until Apply.
- Available operators are supplied per field and revalidated by the server.
- Initial operators:

| Field kind | Operators |
|---|---|
| Text | contains, equals, not equals, empty, not empty |
| Number/money | equals, not equals, greater/greater-equal, less/less-equal, between, empty, not empty |
| Boolean | is true, is false, empty |
| Date/datetime | on, before, after, between, relative period, empty, not empty |
| Enum/lookup/reference | any of, none of, empty, not empty |
| JSON/unsupported complex | presence only unless a renderer supplies a governed operator |

- M1 combines clauses with AND. OR groups and nested logic are deferred until the server query contract supports them safely.
- Lookup/reference options use a bounded, searchable option endpoint with the same field-read and record-scope checks.
- Cheap facets may be returned with the list. Expensive/all facets require an explicit request and budget.
- Active filter chips use resolved labels, never raw UUIDs when a readable display value is available.
- Relative filters store stable sigils such as `@today` or `@this_fiscal_year`; the server resolves dates per request.

### 6.4 Sort

- Clicking a sortable header cycles ascending, descending, and none for the primary sort.
- The advanced Sort drawer adds, removes, and reorders levels and chooses null placement.
- The server appends the entity identity field as a stable tiebreaker.
- Invalid or unreadable sort fields fail validation; they are not interpolated into SQL.
- Saved views store sort definitions, not cursors.

### 6.5 Columns and density

- Only readable list-bound fields are offered.
- Users can show, hide, and reorder fields. At least one configured identity field remains visible.
- A reset restores the published surface order.
- Column choice is a projection hint only; the server remains authoritative and may omit a field.
- Density values are `compact`, `comfortable`, and `spacious`. The bootstrap profile is the default; URL/saved-view state may override it for one list.
- Width and pinning are stored only for spreadsheet mode in the first implementation that supports them.

### 6.6 Pagination and loading

- The wire API is cursor-based and always returns a deterministic stable sort.
- The URL may carry the opaque cursor and a presentation page index for browser history. Neither is saveable view state.
- First-release controls are Previous, Next, and page size. Arbitrary page jumps require a proven cursor-map/count design and are not assumed.
- Default page size is 50 unless the descriptor or tenant policy supplies a lower allowed default. The current Records service hard maximum of 100 remains until measured evidence supports an increase.
- Exact total is optional. The footer distinguishes “50 loaded”, “more available”, approximate total, and exact total.
- A subsequent-page failure keeps current rows visible and offers retry.

### 6.7 Saved views

A saveable view contains:

- query text and declared search mode;
- typed filter clauses;
- sort levels;
- grouping;
- columns and order;
- density and view mode;
- spreadsheet pin/width state when that mode ships.

It never contains page/cursor, tenant ID, principal ID, permission result, scope predicate, company/legal-entity/organization/network-account IDs, CSRF data, or record selection.

Behavior:

- Selecting a view applies its canonical state and places its ID in the URL.
- Any saveable edit changes the state to “Modified from _name_”.
- Revert reloads the base view. Save updates only an owned personal view using `If-Match`; Save as creates a personal copy.
- A version conflict offers reload or save as copy. It never overwrites silently.
- Personal, shared, and system views have explicit ownership and write rules.
- Default, pinned, and starred relationships need a dedicated bounded preference/relationship store consistent with the DDL policy; they must not reuse the small UI preference JSON bucket.

### 6.8 Row navigation and actions

- Clicking a non-interactive row area opens the canonical record route.
- Keyboard users can focus a row and press Enter; selection checkboxes and action controls do not trigger navigation.
- The row menu exposes Open, Open in new tab, Copy permitted identity values, and effective metadata operations.
- A disabled operation remains visible with a reason when disclosure is safe.
- Operations with dynamic row eligibility use a bounded eligibility/preflight call when the menu opens or the action begins.
- Every execution endpoint rechecks permission, scope, lifecycle, current row version, MFA/SoD requirements, and handler validity.

### 6.9 Selection and bulk actions

Selection modes are explicit:

1. `explicit`: concrete record IDs and versions, normally the current page.
2. `all_matching`: a server-issued snapshot token tied to plane, tenant, principal/auth epoch, effective scope, descriptor revision, and canonical query hash.

Changing search, filters, sort, entity, view, work context, or auth epoch clears selection. Pagination may retain explicit selection only when the UI clearly shows off-page selected count.

Bulk flow:

1. Choose an action.
2. Server preflight reports eligible, ineligible, requires-confirmation, and deferred counts without disclosing forbidden rows.
3. User confirms the precise affected scope.
4. Small operations execute synchronously; larger operations enqueue a governed job.
5. Result reports succeeded, skipped, failed, and support reference. Partial completion is explicit.
6. Successful mutations invalidate relevant list generations and clear selection.

### 6.10 Import and export

- Export submits the exact canonical query, effective scope fingerprint, requested format, and allowed export columns. It never means “all tenant data” merely because no row is selected.
- Small exports may return directly only if a governed limit allows it. Normal exports use the existing asynchronous request/job/download lifecycle.
- Import is a separate route/surface launched from List View: upload chunks, map fields if required, validate, preview, commit, monitor, cancel, and download the error report.
- Import/export visibility comes from effective operation descriptors; their endpoints still authorize independently.

### 6.11 View modes

- `table`: default operational list and M1 authority.
- `compact`: configured identity/status/facts; also the responsive fallback.
- `spreadsheet`: read-only dense analysis at first. It supports resizing, pinning, and aggregate footers; inline editing requires a separate design.
- `board`: requires a declared group field, ordered columns, group counts, and valid transition operations. Drag-and-drop is not implied; accessible Move actions are mandatory.
- `dashboard`: requires server-defined metrics and aggregations. It must not calculate “totals” from only the current page.

An unsupported or unconfigured mode is absent. The runtime does not silently fabricate a dashboard or infer a board from the first status-like field.

### 6.12 Empty, loading, and error states

Distinct states are required:

- initial skeleton;
- no records exist;
- no matches for current search/filters;
- search is not configured;
- entity/list surface is unpublished;
- selected work context is required;
- access denied without entity disclosure;
- dependency unavailable with retry and support reference;
- stale cached rows retained while refresh failed;
- later page failed while current rows remain;
- descriptor revision changed and the URL/saved view was partially normalized.

## 7. Target contracts

Create a browser-safe package at `packages/contracts/platform/entity-list`, tentatively named `@athyper/contract-platform-entity-list`.

### 7.1 Safe list descriptor

```ts
interface EntityListDescriptorV1 {
  schemaVersion: 1;
  plane: "neon" | "mesh" | "studio";
  entity: {
    code: string;
    label: string;
    pluralLabel: string;
    identityField: string;
    detailRouteTemplate?: string;
  };
  revision: {
    release: number;
    descriptorHash: string;
    surfaceHash: string;
  };
  surface: {
    key: string;
    title: string;
    description?: string;
    defaultState: SaveableListStateV1;
    supportedModes: readonly ListViewMode[];
  };
  fields: readonly ListFieldDescriptorV1[];
  actions: readonly EffectiveListActionV1[];
  scope: {
    status: "ready" | "context_required";
    labels: readonly { key: string; label: string; value: string }[];
    fingerprint: string;
  };
  limits: {
    defaultPageSize: number;
    allowedPageSizes: readonly number[];
    maxSortLevels: number;
    countMode: "none" | "cached" | "approximate" | "exact";
  };
}
```

`ListFieldDescriptorV1` includes field key, safe label, value kind, semantic role, renderer key, read-only formatting options, default visibility/order/width, and supported filter/sort/group/aggregate behavior. It contains no storage path, SQL type, raw policy body, or denied field.

`EffectiveListActionV1` includes action key, label, icon key, placement, selection cardinality, execution kind, state, safe disabled reason code/message, and whether dynamic preflight is required. Permission codes need not be exposed unless a separately reviewed client use case requires them.

### 7.2 Canonical state

```ts
type ListViewMode = "table" | "compact" | "board" | "dashboard" | "spreadsheet";

interface SaveableListStateV1 {
  query?: string;
  filters: readonly {
    field: string;
    operator: string;
    value?: unknown;
  }[];
  sort: readonly {
    field: string;
    direction: "asc" | "desc";
    nulls?: "first" | "last";
  }[];
  group?: string;
  columns: readonly string[];
  density: "compact" | "comfortable" | "spacious";
  mode: ListViewMode;
  spreadsheet?: {
    pinned: readonly string[];
    widths: Readonly<Record<string, number>>;
  };
}

interface ListLocationStateV1 extends SaveableListStateV1 {
  savedViewId?: string;
  baseSavedViewId?: string;
  cursor?: string;
  pageIndex?: number;
  pageSize?: number;
}
```

The package must own parse, validate, canonicalize, compare, and URL encode/decode functions so server routes, client islands, saved views, cache keys, and tests use the same semantics.

### 7.3 List result

```ts
interface EntityListResultV1 {
  schemaVersion: 1;
  descriptorHash: string;
  scopeFingerprint: string;
  queryHash: string;
  rows: readonly {
    id: string;
    version?: number;
    values: Readonly<Record<string, unknown>>;
    decoration?: {
      commentCount?: number;
      hasOpenComment?: boolean;
      bookmarked?: boolean;
    };
  }[];
  pagination: {
    pageSize: number;
    hasNext: boolean;
    nextCursor?: string;
    hasPrevious: boolean;
    previousCursor?: string;
    total?: number;
    countMode: "none" | "cached" | "approximate" | "exact";
  };
  facets?: Readonly<Record<string, readonly { value: unknown; label: string; count?: number }[]>>;
  groups?: readonly { value: unknown; label: string; count?: number }[];
}
```

## 8. HTTP and server design

### 8.1 Recommended routes

| Method and route | Purpose |
|---|---|
| `GET /api/entity-runtime/:entityCode/list-descriptor` | Safe effective UI descriptor for Neon/Mesh generic entities |
| `GET /api/records/:entityCode` | Typed record list query |
| `GET /api/records/:entityCode/fields/:field/options` | Bounded lookup/reference filter options |
| `POST /api/records/:entityCode/selection-snapshots` | Create all-matching selection token |
| `POST /api/records/:entityCode/bulk/preflight` | Evaluate bulk eligibility |
| `POST /api/records/:entityCode/bulk/actions/:actionCode` | Execute/enqueue bulk operation |
| Existing `/api/records/:entityCode/imports` family | Governed import lifecycle |
| Existing `/api/records/:entityCode/exports` family | Governed export lifecycle |
| Canonical `/api/platform/preferences/saved-views` family | Saved-view lifecycle after contract/storage correction |
| `GET /api/studio/.../list-descriptor` and list endpoints | Studio-owned authoring/admin projections normalized to the same browser contract |

The frontend URL can remain readable (`q`, `filter.<field>`, `sort`, `group`, `cols`, `density`, `view`, `vid`). The API client converts it to repeated typed query parameters. Complex values are JSON-encoded by the shared contract, never parsed ad hoc by SQL code.

### 8.2 Required backend closure before UI work

1. Extend route parsing to cursor, filters, sort, count mode, and optional facets/groups.
2. Add missing operators required by M1 (`ne`, contains, between, and date-relative resolution) or narrow the UI descriptor until each is implemented.
3. Execute list SQL on the transaction supplied by `RecordQueryService`; prove RLS/session variables apply to list, count, facet, and option queries.
4. Apply authorization scopes and metadata operation-scope bindings to collection queries. Tenant filtering alone is insufficient for Neon and Mesh.
5. Compile list surfaces and surface field bindings into a safe UI projection. Do not expand the browser contract from the raw execution descriptor.
6. Resolve effective actions server-side in order: Read -> feature support -> configured operation -> permission -> scope -> lifecycle/selection eligibility -> valid handler.
7. Convert saved-view routes to registered route contracts/OpenAPI coverage and settle dedicated storage for flags/default relationships.
8. Add exact operations to the BFF allowlist for all three apps, including body limits, idempotency, upload/download classes, and tenant requirements.
9. Add typed operations and parsers to `@athyper/platform-api-client`.
10. Add a Studio catalog query/read model rather than querying metadata authoring tables from browser code.

### 8.3 Query safety rules

- Only descriptor-declared, readable fields enter projection, filter, sort, group, facet, or aggregate SQL.
- Every dynamic field maps to a server-resolved storage path; user input is never a raw SQL identifier.
- A stable identity tiebreaker is mandatory.
- Cursor tokens bind descriptor hash, scope fingerprint, sort, and query hash and expire or fail cleanly after incompatible change.
- Counts, facets, and groups use the identical scope and filter predicate as row retrieval.
- Reference hydration is bounded and cannot reveal a target the principal cannot read.
- Error details contain field keys/reason codes only where disclosure is safe; diagnostics contain no filter values, row values, tenant IDs, or principal IDs.

## 9. Frontend package and composition design

```text
packages/contracts/platform/entity-list/
  schemas, parsers, canonical state, URL codec, fixtures

packages/platform/entity/runtime/list-view/
  core/             pure reducers, state merge, query keys, column resolution
  server/           shared server presenter and skeletons
  components/       table, compact cards, footer, state chips, empty/error states
  organize/         search, filters, sort, columns, density, views
  selection/        explicit/all-matching state and selection bar
  saved-views/      client controller using typed operations
  styles.css

packages/planes/neon/list-view/
  NeonListRoute, work-context adapter, routes, Neon-only decorations

packages/planes/mesh/list-view/
  MeshListRoute, network-account adapter, routes, Mesh-only decorations

packages/planes/studio/list-view/
  StudioListRoute and adapters for authoring/admin projections

apps/<plane>/app/(shell)/.../[entityCode]/page.tsx
  thin route composition only
```

Tentative package name for the shared UI/runtime is `@athyper/platform-entity-list-view`. It may depend on contracts, platform UI, surface-kit, query, API client, icons, i18n, and theme. It must not import a plane package, application, Next.js auth implementation, or server implementation.

The shared package should expose a data-source adapter with normalized operations rather than callbacks scattered across components:

```ts
interface ListDataSource {
  descriptor(input: ListCoordinate): Promise<EntityListDescriptorV1>;
  query(input: ListQueryRequestV1, signal?: AbortSignal): Promise<EntityListResultV1>;
  fieldOptions(input: FieldOptionsRequestV1, signal?: AbortSignal): Promise<FieldOptionsResultV1>;
  execute(input: ListActionRequestV1): Promise<ListActionResultV1>;
}
```

Server-only route composition and browser client creation should be separate exports so no server credentials or non-serializable callbacks cross the React boundary.

## 10. Plane integration details

### 10.1 Neon

- Preserve canonical entity navigation established by the prior design: `/app/:entityCode`, `/app/:entityCode/new`, and `/app/:entityCode/:recordId`, unless route governance explicitly chooses a new namespace.
- Include selected company/legal entity/operating organization as a server-validated query coordinate.
- On work-context change: cancel Neon principal queries, clear selection, reset cursor, resolve a new scope fingerprint, and revalidate the active saved view against the same entity descriptor.
- Favor table, compact, and spreadsheet. Board is enabled only for configured transactional lifecycles; dashboard belongs to a defined workbench metric surface.
- First candidate: `business_partner`, because current authorization evidence already requires operating-organization scope and therefore exercises the important security boundary.

### 10.2 Mesh

- The selected actor network account is mandatory for participant-scoped entities. “No account selected” is a context-required state, not an unscoped list.
- The server validates actor account and relationship participation on every query/action.
- Buyer/supplier role, counterparty, relationship status, and exchange state are likely high-value quick filters, but they must come from the surface descriptor.
- Favor table and compact first. Board may later fit exchange lifecycle queues.
- First candidate: `network_relationship`, because it proves either-participant visibility and actor-account scoping rather than a simple tenant-only list.

### 10.3 Studio

- Studio List View presents administrative read models such as entities, change sets, releases, catalogs, users, roles, or operational jobs.
- It must not grant generic CRUD over authoring tables. Mutations remain governed Studio operations with revision, review, publication, and rollback rules.
- Status, target planes, revision, owner, updated time, validation state, and publication state are useful first columns for metadata catalogs.
- Favor table and compact first; spreadsheet may be useful for catalog inspection. Board/dashboard need explicit administrative use cases.
- First candidate: a read-only metadata entity or change-set catalog, followed by navigation to the existing authoring workflow.

## 11. Caching, invalidation, and diagnostics

List query keys must include at least:

```text
plane
tenant
principal/auth epoch or safe principal fingerprint
work-context/scope fingerprint
entity and surface
descriptor/surface revision
canonical query hash
cursor and page size
```

- Authenticated upstream fetches remain `no-store`. Reuse occurs in explicitly scoped application/query caches.
- Context replacement cancels and removes the prior principal/scope query root.
- Record mutation, import commit, bulk execution, saved-view mutation, descriptor generation, and permission/profile change emit targeted invalidation.
- A fresh/stale browser entry may preserve rows during background refresh. A failed refresh must show stale state without replacing rows with an empty error.
- Diagnostics record operation name, duration, cache classification, row/page counts, descriptor revision, and hashed cache key only.
- Preserve the existing performance targets: cold rows under 2,000 ms median, warm rows under 500 ms median, and no skeleton replacement on a valid warm navigation.

## 12. Accessibility and internationalization

- Table markup uses real headers, row/column relationships, and an accessible name.
- Sorting announces field and direction; selection announces selected count.
- All toolbar and row-menu actions are keyboard reachable. Escape closes the top surface and restores focus.
- Drawers/dialogs trap focus, restore focus, and meet touch target requirements.
- Column reorder has keyboard Move up/down alternatives; drag is never the sole interaction.
- Board transitions have a menu/button alternative to drag-and-drop.
- Loading uses status regions without repeatedly announcing every row.
- Empty/error messages and disabled reasons are localized message keys, not server-supplied arbitrary English.
- Formatting uses the effective locale, timezone, numbering system, and currency. The layout is qualified in LTR and RTL, compact/comfortable, high contrast, and reduced motion.
- Horizontal overflow is contained within the list surface and does not make the shell page itself scroll sideways.

## 13. Testing and acceptance evidence

### 13.1 Contract and unit

- Parse every descriptor/result/problem fixture in frontend and server tests.
- Round-trip URL state, including unknown/duplicate/malformed values.
- Verify saved-state canonicalization excludes cursor, scope, selection, and authority.
- Test precedence and modified-view comparison.
- Test field/operator/mode sanitization and stable query hashes.
- Test selection clearing on query/context/revision changes.
- Test action state resolution and safe disabled reasons.

### 13.2 Server integration and security

- Read denial prevents descriptor and row disclosure.
- Field denial removes projection, filter, sort, facet, group, and option access.
- Neon cross-company/operating-organization negative tests.
- Mesh non-participant and wrong-actor-account negative tests.
- Studio authoring list permission and tenant isolation tests.
- RLS transaction variables apply to list, exact count, facet, and option queries.
- Cursor replay under another scope, principal, query, or descriptor revision fails.
- Export and all-matching selection use the same effective predicate as the visible list.
- Every mutation and transfer reauthorizes independently of descriptor/UI state.

### 13.3 Component/browser

- Keyboard search/filter/sort/columns/menu/drawer/selection flows.
- Focus restoration, screen-reader names, axe checks, reduced motion.
- Desktop table and mobile compact rendering.
- Long labels, long values, no results, unavailable dependency, stale refresh, and partial bulk outcomes.
- RTL, high contrast, all densities, and responsive snapshots.

### 13.4 Three-plane E2E

- Neon: select permitted business context, filter/search, open record, attempt a denied cross-scope URL, change context, and prove rows/selection/cache are replaced.
- Mesh: act as buyer/supplier account, list only participating relationships, switch actor account, and execute one permitted lifecycle action.
- Studio: list authoring catalog, filter by status/target plane, open a governed workspace, and verify a disabled/denied operation explanation.
- Saved view: create, modify, revert, update with ETag, conflict, clone, default, share, archive.
- Export: request current view, monitor, download, and verify no out-of-scope rows.
- Import: upload, validate invalid rows, download error report, preview, commit, and observe invalidation.

## 14. Delivery plan

### Phase 0 — Contract and security closure

- Create the browser-safe list contract and fixtures.
- Compile safe list surfaces/actions.
- Complete list route parsing and query operators.
- Fix transaction/RLS execution and collection scope enforcement.
- Define scope-coordinate flow for Neon and Mesh.
- Add relay and typed API operations.
- Decide saved-view relationship storage.
- Add Studio list read-model contract.

**Exit:** A server integration test can retrieve one correctly scoped descriptor and row page for each plane, and all negative-scope tests pass.

Implementation checkpoint (2026-08-27): Neon `business_partner` sends an explicit company/legal-entity/operating-organization coordinate, and Mesh `network_relationship` sends an explicit actor network-account coordinate. Each plane resolver revalidates its coordinate against the current principal's server-side experience catalog and emits a closed repository constraint. Studio `metadata_entity` uses a Studio-owned, code-registered read adapter with a global-or-current-tenant catalog constraint; it deliberately does not publish fake generic CRUD metadata because Studio's existing permission is a governed `system_action`, not an `entity_operation`. Row and count predicates, cursors, and response fingerprints bind the resolved scope, with missing, invalid, incompatible, and cross-scope cases negatively tested. The remaining Phase 0 naming issue is migration from the currently published Mesh permission `mesh.catalog.network_relationship.read` to the reviewed canonical name `mesh.network.network_relationship.read` after that permission is released.

### Phase 1 — Read-only table vertical slice

- Shared frame, table, compact mobile cards, semantic formatting, skeleton/empty/error states.
- Server search, basic filters, single sort, column visibility/order, density, Previous/Next, page size, URL round-trip.
- Neon `business_partner`, Mesh `network_relationship`, and a Studio catalog slice.

**Exit:** All three routes use the same shared runtime with no plane branch inside it; accessibility and cold/warm first-row targets pass.

Implementation checkpoint (2026-08-27): the shared Phase 1 runtime is now wired to Neon `business_partner`, Mesh `network_relationship`, and Studio `metadata_entity` at `/app/:entity`, `/workspace/:entity`, and `/admin/catalogs/:catalog`, respectively. It provides debounced server search, descriptor-limited filters, tri-state single sort, column visibility and keyboard ordering, density, table/compact modes, cursor history, page-size selection, semantic rendering, responsive cards, URL restoration, and distinct initial/subsequent loading and failure states. Development evidence includes 71 business partners with scoped counts of 30 CATL, 20 Athyper APAC, and 20 Athyper EMEA; 49 cross-tenant Mesh relationships with actor-account counts of 17, 17, and 15; and 30 global Studio metadata entities. The Mesh runtime publication is active at release 1, while Studio intentionally uses its administrative read adapter. Contract, component, server, database, and production-E2E definitions cover URL restoration, context replacement, stale-request cancellation, cursor/scope binding, invalid scope denial, WCAG scanning, and LCP/INP budgets. The Phase 1 implementation is deployed locally; final closure still requires a fresh credentialed browser session to execute the live accessibility/performance journeys.

### Phase 2 — Organize, actions, and saved views

- Multi-sort, reference options, facets, grouped table.
- Effective primary/row/overflow actions with disabled reasons.
- Saved views with personal CRUD, default, pin/star, clone, conflict, then governed sharing.

**Exit:** State precedence, saved-view conflict, permission, and context-switch E2E tests pass.

### Phase 3 — Selection and transfers

- Explicit and all-matching selection.
- Bulk preflight/execution/result.
- Asynchronous export current view and selected rows.
- Import launch and full existing transfer lifecycle.

**Exit:** Cross-scope, query-snapshot, partial-result, idempotency, audit, and invalidation tests pass.

### Phase 4 — Advanced presentations and optimization

- Spreadsheet, then board, then dashboard only for qualified metadata surfaces.
- Optional row collaboration decorations.
- Intent prefetch, scoped warm cache, virtualization where measured, and production performance qualification.

**Exit:** Each advanced mode has an explicit descriptor contract, representative plane use case, accessibility evidence, and performance budget.

## 15. Definition of done

The three-plane List View is done when:

1. One shared active implementation serves Neon, Mesh, and Studio through plane-owned adapters.
2. No active source imports retired/reference packages.
3. Browser-safe versioned contracts cover descriptor, state, result, saved view, selection, actions, and problems.
4. Read, field, collection-scope, operation, and execution authorization are server-enforced and negatively tested.
5. URL state is shareable and deterministic; saved views are scope-free and concurrency-safe.
6. Context switches cannot show stale rows, preserve an invalid selection, or reuse an incompatible cache entry.
7. The BFF explicitly allowlists every operation with the correct method, body limit, request class, CSRF, and idempotency rules.
8. Table and compact modes pass desktop/mobile, keyboard, screen-reader, RTL, high-contrast, and reduced-motion checks.
9. Empty, no-match, unavailable, denied, stale-refresh, and later-page-failure states are distinct.
10. Cold/warm performance and query-plan gates pass at representative tenant sizes.
11. Package ownership, canonical boundaries, typecheck, contracts, OpenAPI, E2E, and release policies pass.
12. Legacy behaviors not retained are recorded as deliberate retirement decisions rather than accidental omissions.

## 16. Recommended decisions for review

1. **Approve one shared runtime plus plane adapters.** Do not build three grids.
2. **Approve table + compact as the first release.** Defer spreadsheet, board, and dashboard until the base query/security path is qualified.
3. **Approve a safe UI list descriptor separate from the server execution descriptor.** Do not expose storage coordinates.
4. **Approve cursor-first pagination with optional cached/approximate totals.** Do not require an exact total on every query.
5. **Approve server-validated explicit work-context coordinates.** Local storage may remember a choice, but it is never authority.
6. **Approve dedicated saved-view relationship storage.** Do not extend the current misuse of small UI preferences.
7. **Approve separate Studio data-source adapters.** Studio administrative catalogs should normalize into the shared List View without pretending they are ordinary business-record CRUD.

## 17. Open questions

- Route namespaces are now fixed for Phase 1 as Neon `/app/:entity`, Mesh `/workspace/:entity`, and Studio `/admin/catalogs/:catalog`.
- The first Studio slice is fixed as the metadata entity catalog through a Studio-owned read adapter.
- Phase 1 uses an explicit server-validated coordinate on every scoped list request; local state may remember the selection but is never authority.
- Is shared saved-view authoring available to ordinary users, designated curators, or Studio administrators only?
- Which count modes can meet target-scale budgets for each representative entity class?
- Is client-side loaded-row search still a required user feature, or can the new runtime standardize on server search?
- Which operations require all-matching selection in the first bulk release?
- Does spreadsheet inline editing have a committed business use case? If yes, it needs a separate lock/concurrency/validation design before implementation.
