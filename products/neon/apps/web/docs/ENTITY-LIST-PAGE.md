# Entity List Page — Architecture & Reference

> Meta-driven list page system that works for all 99+ entity types.
> Server-side search, filter, sort, pagination with Redis caching.
> Client-side grouping, view switching, and safety-net filtering.
> Infinite scroll with manual load-more and scroll position memory.

---

## Table of Contents

1. [Overview](#overview)
2. [Data Flow](#data-flow)
3. [Search](#search)
4. [Filtering](#filtering)
5. [Sorting](#sorting)
6. [Grouping](#grouping)
7. [Pagination & Infinite Scroll](#pagination--infinite-scroll)
8. [Client-Side vs Server-Side](#client-side-vs-server-side)
9. [Redis Cache](#redis-cache)
10. [Cache Invalidation](#cache-invalidation)
11. [FK Resolution](#fk-resolution)
12. [View Modes](#view-modes)
13. [Smart Header](#smart-header)
14. [System Parameters](#system-parameters)
15. [State Management](#state-management)
16. [File Reference](#file-reference)

---

## Overview

The entity list page is a **hybrid client/server** architecture:

- **Server** handles search, filter, sort, pagination via parameterized SQL
- **Client** handles grouping, view switching, and runs filter/sort as a safety net
- **Redis** caches query results (2 min TTL) with generation-based invalidation
- **250ms debounce** prevents API hammering during rapid user input
- **Infinite scroll** with manual "Load More" — items accumulate across pages
- **Scroll position memory** via sessionStorage (restored on back-navigation)

```
User action (search/filter/sort/page)
    ↓
ListPageContext reducer → state update
    ↓ (250ms debounce)
onServerQueryChange(serverQuery)
    ↓
page.tsx setServerQuery → useEntityData re-fetches
    ↓
GET /api/data/{entity}?search=john&filters=status:ACTIVE&sort=name&dir=asc&page=1&pageSize=20
    ↓
Redis cache check (generation-aware key)
    ↓ (cache miss)
SQL: SELECT * FROM {table}
  WHERE tenant_id = $1 AND deleted_at IS NULL
    AND (name ILIKE '%john%' OR code ILIKE '%john%')   ← search
    AND status = 'ACTIVE'                               ← filter
  ORDER BY name ASC NULLS LAST                          ← sort
  LIMIT 20 OFFSET 0                                     ← pagination
    ↓
FK resolution + row decoration → cache to Redis (2 min TTL)
    ↓
Response: { data, meta: { serverFiltered: true, serverSorted: true }, refs }
    ↓
page.tsx: accumulate items (dedup by key) → pass to ListPageProvider
    ↓
ListPageContext: client filter/sort runs as safety net → render
```

---

## Data Flow

### User Types in Search Box

```
1. Input onChange → local state update (instant UI feedback)
2. Immediate dispatch SET_SEARCH to reducer (no input debounce)
3. Reducer: state.search = "india", page = 1
4. 250ms server debounce → onServerQueryChange({ search: "india", ... })
5. page.tsx: setServerQuery() → useEntityData re-fetches
6. Server: WHERE (name ILIKE '%india%' OR code ILIKE '%india%' OR ...)
7. Response: { data: [1 row], meta: { total: 1 } }
8. page.tsx: accumulated items replaced (page 1 reset)
9. Client: filteredItems recalculated (safety net — server already filtered)
10. Grid renders 1 result
```

### User Selects Quick Filter

```
1. Dropdown onChange → dispatch SET_FILTER { key: "status", value: "ACTIVE" }
2. Reducer: state.filters.status = "ACTIVE", page = 1
3. 250ms → onServerQueryChange({ filters: "status:ACTIVE", ... })
4. Server: WHERE status::text ILIKE 'ACTIVE' (case-insensitive exact match)
5. page.tsx: infinite scroll reset — accumulated items cleared, page = 1
6. Response with filtered results
```

### User Types Column Text Filter

```
1. Input onChange → 300ms debounce → dispatch SET_FILTER { key: "name", value: "spain" }
2. 250ms server debounce → onServerQueryChange({ filters: "name:~spain", ... })
3. Server: WHERE name::text ILIKE '%spain%'
4. Response with filtered results
```

### User Clicks Column Sort

```
1. Click header → dispatch SET_SORT { key: "name" }
2. Reducer: toggles asc ↔ desc, syncs to sortRules
3. 250ms → onServerQueryChange({ sort: "name", dir: "asc", ... })
4. Server: ORDER BY name ASC NULLS LAST
```

### User Clicks "Load More"

```
1. Click Load More → page.tsx: infinitePage++ → setServerQuery({ page: 2 })
2. useEntityData fetches page 2 from API
3. page.tsx: new items appended to accumulatedItems (dedup by stable key)
4. ListPageProvider receives full accumulated set as one "page"
5. Grid renders all accumulated items (no re-sort/re-filter — server trusted)
```

---

## Search

### Wire Format

```
GET /api/data/country?search=india&page=1&pageSize=20
```

### Server Behavior

- OR-combined ILIKE across all text-compatible columns:
  ```sql
  WHERE (name::text ILIKE '%india%' OR code_alpha_2::text ILIKE '%india%' OR ...)
  ```
- All columns cast to `::text` — safe for any column type
- Max 10 searchable columns (configurable via `search.maxSearchColumns`)
- Minimum query length: 2 characters (configurable via `search.minLength`)
- Columns eligible: `isSearchable = true` OR `dataType ∈ TEXT_COMPATIBLE_TYPES`

### Numeric Search Optimization

When the search term is purely numeric (e.g. "024"):

- Narrows the ILIKE OR to only numeric-type columns and code/identifier columns
- Code columns identified by suffix (`_code`, `_number`, `_no`, `_num`, `_id`) or exact name (`code`, `number`, `numeric_code`)
- Falls back to all searchable columns if no code/numeric columns found
- Prevents OR explosion across 10+ text columns when only code columns can match

### Client Behavior

- Runs `config.searchFn(item, query)` on all items as safety net
- Checks if any searchable field value contains the query (case-insensitive)
- Active during 250ms debounce window before server response arrives

### Debounce Chain

```
Keystroke → SET_SEARCH (immediate) → 250ms (server debounce) → API call
Total latency: ~250ms from last keystroke to API request

Column text filter: Keystroke → 300ms (input debounce) → SET_FILTER → 250ms (server debounce) → API call
Total latency: ~550ms from last keystroke to API request
```

---

## Filtering

### Two Filter Types

| Type | Wire Format | SQL | Example |
|------|-------------|-----|---------|
| **Quick Filter** (dropdown) | `status:ACTIVE` | `status::text ILIKE 'ACTIVE'` | Status = Active |
| **Column Text Filter** (input) | `name:~spain` | `name::text ILIKE '%spain%'` | Name contains "spain" |

The `~` prefix signals ILIKE with wildcards (partial match). No prefix = ILIKE without wildcards (case-insensitive exact match).

All filter values use `::text` cast — this makes ILIKE safe for any column type (numeric, boolean, uuid, etc.) without requiring type-specific guards.

### Wire Format (Combined)

```
GET /api/data/country?filters=status:ACTIVE,name:~spain,region:~asia
```

### Server-Side Processing

1. `parseFilters("status:ACTIVE,name:~spain")` → structured filter array
2. `buildFilterClauses(filters, fields)` → parameterized WHERE fragments
3. Cross-checks each column against field metadata — unknown columns silently skipped
4. Boolean values cast properly (`"true"` → `true`)
5. All values parameterized via Kysely `sql` template (no string interpolation)

### Client-Side Safety Net

Always runs `config.filterFn(item, filters)` regardless of `serverFiltered` flag:

- **Quick filters**: exact match (case-insensitive)
- **Column text filters**: contains match (case-insensitive)
- Skips default filter values (e.g., `"all"`)

### Why Both Client and Server Filter?

During the 250ms debounce window, the user sees new filter values in the UI but `items` still
contains stale data from the previous server query. Client-side filtering catches this gap:

```
Time 0:    User selects "Active" → UI shows filter chip
Time 0-250: items = old server data → client filter removes non-Active rows
Time 250:  Server query fires with filters=status:ACTIVE
Time ~400: Server response arrives → items = already filtered → client filter is a no-op
```

### Validation & Security

- Column names validated via regex: `^[a-zA-Z_][a-zA-Z0-9_]*$`
- Max 20 filter clauses per request
- Max 500 characters per filter value
- All values parameterized via Kysely `sql` template (no string interpolation)

---

## Sorting

### Server-Side

```sql
ORDER BY name ASC NULLS LAST
-- Falls back to: ORDER BY created_at DESC (when sort column unknown)
```

- Validates sort column against field metadata
- Unknown columns fall back to `created_at DESC`
- Always appends `NULLS LAST`

### Client-Side

- Uses `sortRules[]` (multi-sort) or legacy `sortKey/sortDir`
- Looks up column via `config.columns` → uses `col.sortFn` (custom) or `localeCompare`
- Pre-built `sortKeyMap` for O(1) column lookup per comparison
- **Skipped in infinite scroll mode** — re-sorting accumulated items would cause visual reordering

### Multi-Sort

```typescript
sortRules: [
  { fieldId: "status", dir: "asc" },
  { fieldId: "name", dir: "desc" },
]
// → ORDER BY status ASC, then name DESC within same status
```

Currently, only the first sort rule is sent to the server. Multi-sort is client-side only.

---

## Grouping

### Always Client-Side

Grouping requires the full result set to build groups correctly. When grouping is active:

1. Debounce effect sends `pageSize=1000` to fetch all matching rows
2. `groupedItems` computed via `useMemo` from `sortedItems`
3. Groups by stringified accessor value: `{ key: "Active", label: "Active", items: [...] }`
4. Collapse state tracked in `state.collapsedGroups`
5. Groups capped at 50 (configurable via `MAX_GROUPS`) — cardinality warning shown when truncated

### Behavior

```
User enables "Group by Status"
  ↓
SET_GROUP_BY dispatched → state.groupBy = [{ fieldId: "status" }]
  ↓
250ms debounce → onServerQueryChange({ pageSize: 1000, ... })
  ↓
Server returns up to 1000 filtered/sorted rows
  ↓
Client groups into: Active (150 rows), Draft (30 rows), Inactive (20 rows)
  ↓
Renders collapsible GroupSection rows with items
```

### Group Label Formatting

- `null`/`undefined`/empty → "(No value)"
- `true`/`false` → "Yes"/"No"
- `ALL_CAPS` or `all_lower` → Title Case (e.g. `UNDER_REVIEW` → "Under Review")

---

## Pagination & Infinite Scroll

### Infinite Scroll (Default Mode)

The list page uses **manual load-more** (not automatic scroll-triggered):

```
Initial load: page.tsx fetches page 1 (20 items)
    ↓
User clicks "Load More" → page.tsx increments infinitePage → fetches page 2
    ↓
New items appended to accumulatedItems (dedup by stable key)
    ↓
ListPageProvider receives full accumulated set as a single "page"
    ↓
Grid renders all accumulated items without re-filter/re-sort
```

**Key behaviors:**

- **Item accumulation**: Items from all pages are merged with deduplication via stable keys
- **Item cap**: 500 items maximum — "Load More" button hidden beyond this
- **Page size options**: 20, 50, 100, 200 (controls batch size per load-more)
- **Filter/search reset**: Clears accumulated items, resets to page 1, scrolls to top
- **Error recovery**: On load-more failure, page reverts so retry fetches the same page
- **Server trust**: In infinite mode, `isServerFiltered` and `isServerSorted` are always `true` — client skips redundant re-filter/re-sort on the accumulated array

### Scroll Position Memory

On unmount, the page saves accumulated items and scroll position to `sessionStorage`:

```
Save (unmount): { scrollTop, items, page } → sessionStorage (under 500KB guard)
Restore (mount): items + page restored, scrollTop applied via requestAnimationFrame
```

This enables instant back-navigation without re-fetching all accumulated pages.

### Server-Side Pagination

When `serverPagination` is available (from API response):

- **Footer** shows server totals: "Showing 1–25 of 247 countries"
- **Page navigation** uses `serverPagination.totalPages`
- **paginatedItems** returns `sortedItems` directly (server already sliced)
- **Page changes** trigger server re-fetch via debounced `onServerQueryChange`

### Client-Side Pagination (Fallback)

When no server pagination (mock data or grouping mode):

- **Footer** shows `sortedItems.length` as total
- **paginatedItems** = `sortedItems.slice(start, start + pageSize)`
- **Page changes** are instant (no API call)

### Page Sizes

**Infinite scroll mode**: 20, 50, 100, 200 (batch size per load-more)

**Paginated mode**: 10, 25, 50, 100 (configurable via `pagination.allowedPageSizes`)

Default: 25 (configurable via `pagination.defaultPageSize`)

Maximum: 1000 (hard cap via `pagination.maxPageSize`)

---

## Client-Side vs Server-Side

| Operation | Client-Side | Server-Side | Notes |
|-----------|:-----------:|:-----------:|-------|
| **Search** | Safety net (skipped in infinite mode) | WHERE + ILIKE | 250ms debounced |
| **Quick Filter** | Safety net (skipped in infinite mode) | WHERE ILIKE (exact) | Dropdown selection |
| **Column Text Filter** | Safety net (skipped in infinite mode) | WHERE ILIKE (partial) | 300ms + 250ms debounced |
| **Sort** | Safety net (skipped in infinite mode) | ORDER BY + NULLS LAST | Only first sortRule sent |
| **Group** | Always | pageSize=1000 fetch | Server sends full filtered set |
| **Paginate** | Only when no server pagination | LIMIT/OFFSET | Server total for page count |
| **Infinite Scroll** | Accumulation + dedup in page.tsx | Server paginates per-page | Manual load-more |
| **Count** | filteredItems.length | COUNT(*) with same WHERE | Cached separately (5 min) |
| **FK Resolution** | — | Server-side with caps | Rows decorated with `_ref_*` |
| **View Mode** | localStorage preference | — | Responsive defaults |

### Why Client Always Filters/Sorts (Paginated Mode)

1. **Debounce gap**: 250ms window where UI shows new filters but items are stale
2. **Negligible cost**: Client-side filtering 25 rows is sub-millisecond
3. **Correctness guarantee**: Even if server response arrives out-of-order, UI is correct
4. **No-op when in sync**: When server data matches current filters, all items pass

### Why Client Skips Filter/Sort (Infinite Scroll Mode)

1. **Expensive**: Re-filtering/re-sorting 200+ accumulated items per render
2. **Visual jumping**: Re-sorting causes cards/rows to visually reorder
3. **Server trusted**: All accumulated items already passed server-side WHERE/ORDER BY

---

## Redis Cache

### Cache Architecture

```
L1: In-process Map (10-minute TTL)
    ↓ miss
L2: Redis (TTL varies by type)
    ↓ miss
DB query → write-back to L1 + L2
```

### Cache Keys

| Type | Key Pattern | TTL |
|------|-------------|-----|
| Query Result | `ep:qr:ns{ns}:{tenantId}:{entity}:g{gen}:{hash}` | 2 min (reference: 30 min) |
| Query Count | `ep:qc:ns{ns}:{tenantId}:{entity}:g{gen}:{hash}` | 5 min |
| Entity Fields | `ep:fields:ns{ns}:{tenantId}:{entity}:{versionId}` | 24h |
| FK Map | `ep:fkmap:ns{ns}:{schema}.{table}` | 24h |
| Schema Columns | `ep:cols:ns{ns}:{schema}.{table}` | 24h |
| FK Label | `ep:ref:ns{ns}:{tenantId}:{schema}.{table}:{id}` | 30 min |
| Display Policy | `ep:dp:ns{ns}:{schema}.{table}` | 24h |
| Generation Counter | `ep:egen:{tenantId}:{entity}` | 24h |

### Category-Based TTLs

Entity metadata can specify a `cacheCategory` via feature flags:

| Category | Query TTL | Use Case |
|----------|-----------|----------|
| `reference` | 30 min | Countries, currencies, UOM — rarely change |
| `master` | 5 min | Accounts, products — moderate change frequency |
| `transactional` | 2 min (default) | Orders, invoices — frequent changes |

### Query Hash

Cache keys include a deterministic 16-char SHA-256 hash of query parameters:

```
hashQueryParams({ search, filters, sort, dir, page, pageSize })
→ "a1b2c3d4e5f6g7h8"
```

Count cache uses `hashFilterParams` (excludes page/pageSize since count doesn't change with pagination).

### Fail-Open Design

- Redis errors → return `null`, computation continues
- `REDIS_URL` not set → L1-only (in-process cache, 10 min TTL)
- Payload guard: 512KB max per cache entry
- Distributed lock-lite: prevents cross-worker stampede on cache miss
- SWR (stale-while-revalidate): serves stale cache at 50% TTL while triggering background recompute

---

## Cache Invalidation

### Generation-Based Strategy

```
POST/PATCH/DELETE /api/data/{entity}[/{id}]
    ↓
INCR ep:egen:{tenantId}:{entity}  (generation counter)
    ↓
Next GET → new generation → cache key mismatch → fresh SQL
    ↓
Old cache entries expire naturally via TTL (2 min max)
```

### Benefits over SCAN/KEYS

- **O(1) invalidation** — single INCR operation
- **No blocking** — no key enumeration
- **Distributed-safe** — atomic counter works across workers
- **Self-cleaning** — orphaned keys expire via TTL

### Write Path Integration

| Endpoint | After Success |
|----------|--------------|
| `POST /api/data/:entity` | `invalidateEntityQueryCache(tenantId, entity)` |
| `PATCH /api/data/:entity/:id` | `invalidateEntityQueryCache(tenantId, entity)` |
| `DELETE /api/data/:entity/:id` | `invalidateEntityQueryCache(tenantId, entity)` |

---

## FK Resolution

### Server-Side Process

1. Resolve field metadata with FK enrichment
2. Optionally limit to visible columns (via `columns` query param)
3. Collect unique UUIDs per FK column from result rows
4. Group by target table for batch queries
5. Check Redis cache for previously resolved labels
6. Query DB only for cache misses
7. Build display labels from entity display policy
8. Decorate rows with `_ref_<column>` keys
9. Write-back to Redis (fire-and-forget)

### Caps & Limits

| Limit | Default | Purpose |
|-------|---------|---------|
| Per-column IDs | 200 | Prevent runaway queries |
| Per-request IDs | 600 | Total budget across all FK columns |
| Timeout | 250ms | Time budget for all FK resolution |

### Row Decoration

```json
{
  "id": "abc-123",
  "account_id": "def-456",
  "_ref_account_id": "Acme Corporation",
  "status": "ACTIVE"
}
```

Column accessors check `_ref_<column>` first, displaying the resolved label instead of the raw UUID.

---

## View Modes

| Mode | Component | Description |
|------|-----------|-------------|
| `table` | EntityDataGrid | Standard data table with `<colgroup>` and auto-sized columns |
| `table-columns` | AdjustableDataGrid | Draggable/resizable columns via @tanstack/react-table |
| `card-grid` | EntityCardGrid | Responsive card grid with density-aware gaps |
| `kanban` | KanbanBoard | Swim lanes by status |
| `tree` | EntityTreeView | Hierarchical tree with expand/collapse |
| `timeline` | — | Placeholder (coming soon) |

### Table Layout (table / table-columns)

Both table views use standard `<table>` layout (no virtualization):

- **EntityDataGrid**: `<table>` with `<colgroup>` — utility columns (`w-10` for checkbox, expand, actions) get fixed widths; data columns auto-size from content via `table-auto` behavior
- **AdjustableDataGrid**: `<table>` with TanStack-managed column widths via `header.getSize()` / `cell.column.getSize()` — supports drag-resize and column reordering
- **Shared density classes**: `DENSITY_TABLE_CLASSES` from `types.ts` — `compact` (tight rows, xs text), `comfortable` (default), `spacious` (relaxed padding)
- **Sticky headers**: Both use `sticky top-0 z-10` on `<TableHeader>`

### Responsive Defaults

```
Mobile (< 1024px):   config.defaultViewMode    → "card-grid"
Desktop (≥ 1024px):  config.defaultViewModeDesktop → "table"
```

User preferences saved to `localStorage` with `:userSet` flag — explicit choices override responsive defaults. Viewport changes (e.g. dev ViewportSwitcher) clear `:userSet` flags and re-resolve defaults.

### Density

| Mode | Behavior | System Default |
|------|----------|----------------|
| `compact` | Tight rows, xs text | Yes (mobile + desktop) |
| `comfortable` | Standard spacing | — |
| `spacious` | Relaxed padding | — |

Density is viewport-responsive: `config.defaultDensity` (mobile) / `config.defaultDensityDesktop` (desktop). Both default to `"compact"`.

---

## Smart Header

The content header (title, search, filters, chips) uses `useSmartHeader` for scroll-responsive collapse:

```
At top (scrollY ≤ 48px): always expanded
Scrolling down:           collapse after 20px dead zone
Scrolling up:             expand after 20px dead zone
Fast scroll up (> 60px):  immediate expand
Focus exception:          don't collapse while user interacts with header controls
Transition lock:          300ms cooldown after toggle (prevents layout-shift feedback loops)
```

The header collapses the filter bar and chips (via CSS `grid-rows-[0fr]` animation) to maximize data area while scrolling through results.

---

## System Parameters

Centralized in `config/entity-data-params.ts` (Zod-validated):

```typescript
{
  pagination: {
    defaultPageSize: 25,        // default rows per page
    maxPageSize: 1000,          // hard cap
    allowedPageSizes: [10, 25, 50, 100],
  },
  search: {
    minLength: 2,               // chars before server search triggers
    debounceMs: 250,            // server query debounce
    maxSearchColumns: 10,       // max columns in ILIKE OR
  },
  filter: {
    maxFilterClauses: 20,       // max simultaneous WHERE clauses
    maxFilterValueLength: 500,  // max chars per filter value
  },
  queryCache: {
    enabled: true,
    ttlSeconds: 120,            // query result cache TTL (default/transactional)
    countTtlSeconds: 300,       // COUNT cache TTL
    maxPayloadBytes: 524288,    // 512KB payload guard
    categoryTtls: {
      reference: 1800,          // 30 min (countries, currencies)
      master: 300,              // 5 min (accounts, products)
      transactional: 120,       // 2 min (orders, invoices)
    },
    swrRatio: 0.5,              // serve stale at 50% TTL + background recompute
  },
  fkResolution: {
    perColumnCap: 200,          // UUIDs per FK column
    perRequestCap: 600,         // total UUIDs per request
    timeoutMs: 250,             // time budget
  },
  fallback: {
    clientFallbackPageSize: 1000,
    serverTimeoutMs: 5000,
  },
}
```

Override via environment: `ENTITY_DATA_PARAMS='{"pagination":{"defaultPageSize":50}}'`

---

## State Management

### Reducer Actions (29 total)

**Search & Filter:**
`SET_SEARCH`, `SET_FILTER`, `SET_FILTERS`, `REMOVE_FILTER`, `CLEAR_FILTERS`,
`SET_ADVANCED_FILTER`, `APPLY_ADVANCED_FILTERS`, `CLEAR_ADVANCED_FILTERS`, `TOGGLE_ADVANCED`

**Sort & Group:**
`SET_SORT`, `SET_SORT_RULES`, `SET_GROUP_BY`, `TOGGLE_GROUP_COLLAPSE`

**View & Layout:**
`SET_VIEW_MODE`, `SET_DENSITY`, `SET_COLUMN_VISIBILITY`, `SET_COLUMN_ORDER`,
`SET_COLUMN_SIZING`, `SET_FILTER_BAR`

**Selection & Expansion:**
`TOGGLE_SELECT`, `SELECT_ALL`, `DESELECT_ALL`,
`TOGGLE_EXPAND`, `EXPAND_ALL`, `COLLAPSE_ALL`

**Pagination:**
`SET_PAGE`, `SET_PAGE_SIZE`

**Presets & Settings:**
`SET_PREVIEW_ITEM`, `APPLY_PRESET`, `OPEN_SETTINGS`, `CLOSE_SETTINGS`,
`APPLY_SETTINGS`, `SET_SETTINGS_DEFAULT_TAB`, `SET_PRESET_DIRTY`,
`OPEN_ADAPT_FILTERS`, `CLOSE_ADAPT_FILTERS`

### Context Value

```typescript
{
  state: ListPageState,
  dispatch: Dispatch<ListPageAction>,
  config: ListPageConfig<T>,
  capabilities: ExplorerCapabilities,
  allItems: T[],
  filteredItems: T[],
  sortedItems: T[],
  groupedItems: ItemGroup<T>[],
  totalGroupCount: number,
  paginatedItems: T[],
  totalFilteredCount: number,
  totalPages: number,
  loading: boolean,
  error: string | null,
  refresh: () => void,
  isPendingQuery: boolean,
  scrollContainerRef: RefObject<HTMLDivElement | null>,
  previewItem: T | null,
  infiniteScroll: InfiniteScrollState | null,
}
```

### Pending Query Detection

When filter/search/sort state changes, `isPendingQuery` is set to `true`. It clears when:

- New items arrive (reference identity change)
- Loading transitions from `true` → `false`
- Safety timeout (5 seconds) — handles cases where server returns identical data

Used to show opacity overlay on the data area during server round-trips.

---

## File Reference

### Core Architecture

| Component | Path |
|-----------|------|
| State Management | `components/mesh/list/ListPageContext.tsx` |
| Type Definitions | `components/mesh/list/types.ts` |
| Page Component | `app/(shell)/app/[entity]/view/list/page.tsx` |
| Data Fetching | `lib/use-entity-data.ts` |
| Query Builder | `lib/entity-query-builder.ts` |
| Config Builder | `lib/entity-list-config.ts` |
| System Parameters | `config/entity-data-params.ts` |
| Cache Invalidation | `lib/query-cache-invalidation.ts` |
| Redis Cache | `lib/redis-cache.ts` |
| Entity Meta Fields | `lib/entity-meta-fields.ts` |

### API Handlers

| Component | Path |
|-----------|------|
| List + Create | `app/api/data/[entity]/route.ts` |
| Read + Update + Delete | `app/api/data/[entity]/[id]/route.ts` |

### UI Components

| Component | Path |
|-----------|------|
| View Router | `components/mesh/list/ViewRouter.tsx` |
| Content Header | `components/mesh/list/ListContentHeader.tsx` |
| Filter Chips | `components/mesh/list/FilterChips.tsx` |
| Pagination Footer | `components/mesh/list/ListPageFooter.tsx` |
| Data Table | `components/mesh/list/EntityDataGrid.tsx` |
| Adjustable Table | `components/mesh/list/AdjustableDataGrid.tsx` |
| Card Grid | `components/mesh/list/EntityCardGrid.tsx` |
| Tree View | `components/mesh/list/EntityTreeView.tsx` |
| Kanban Board | `components/mesh/list/KanbanBoard.tsx` |
| Data Grid Row | `components/mesh/list/DataGridRow.tsx` |
| Group Section | `components/mesh/list/GroupSection.tsx` |
| Infinite Scroll Sentinel | `components/mesh/list/InfiniteScrollSentinel.tsx` |
| Back to Top Button | `components/mesh/list/BackToTopButton.tsx` |
| Settings Sheet | `components/mesh/list/ViewSettingsSheet.tsx` |
| Adapt Filters Sheet | `components/mesh/list/AdaptFiltersSheet.tsx` |
| Preview Drawer | `components/mesh/list/PreviewDrawer.tsx` |
| Selection Toolbar | `components/mesh/list/SelectionToolbar.tsx` |

### Hooks & Utilities

| Component | Path |
|-----------|------|
| Smart Header | `components/mesh/list/useSmartHeader.ts` |
| Explorer Capabilities | `components/mesh/list/explorer-capabilities.ts` |
| Column Helpers | `components/mesh/list/column-helpers.ts` |
| Barrel Export | `components/mesh/list/index.ts` |

All paths relative to `products/neon/apps/web/`.
