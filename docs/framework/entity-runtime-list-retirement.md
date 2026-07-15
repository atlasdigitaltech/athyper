# Initiative: `@athyper/entity-runtime/list` retirement

**Status:** discovery complete; awaiting decision on retirement cadence.
**Prior framing:** "Migrate `EntityListPage` â†’ `runtime-record`."
**Actual framing:** "Delete dead code in `@athyper/entity-runtime`. Apps already migrated."

## TL;DR

The strategic initiative we queued at the end of Phase C â€” porting `EntityListPage` to a modern home â€” turned out to be unnecessary. The migration is already done. Every active app consumes `@athyper/runtime-list/server/RuntimeListPage` via app-specific adapters (`NeonListPage`, `MeshListPage`, `AdminListPage`). The legacy `EntityListPage` and its 11 sibling components in `@athyper/entity-runtime/list` have **zero consumers** outside the package itself.

What remains is dead-code retirement, not a multi-sprint port. Bounded, low-risk, no feature-parity work.

## Discovery findings

### The actual list-page landscape

Three list-page implementations exist in the monorepo. Only one is live.

| Implementation | Location | Status | Consumers |
|---|---|---|---|
| `RuntimeListPage` | [`@athyper/runtime-list/server`](packages/shared/runtime-domain/runtime-list/src/server/) | **active, production** | `NeonListPage`, `MeshListPage`, `AdminListPage` via adapter pattern |
| `RuntimeListPage` (different file, same name) | [`@athyper/runtime-canvas/list/runtime-list-page.tsx`](packages/shared/runtime-domain/runtime-canvas/src/list/runtime-list-page.tsx) | dead | Exported but no external import |
| `EntityListPage` | [`@athyper/entity-runtime/list/EntityListPage.tsx`](packages/product-deprecated/runtime-ui/entity-runtime/src/list/EntityListPage.tsx) | **dead** (3343 lines, 75 hooks) | None |

The apps route through:

```
apps/neon/app/(shell)/app/[entity]/page.tsx
  â†’ NeonListPage (@athyper/app-neon/list)
    â†’ RuntimeListPage (@athyper/runtime-list/server)
```

`EntityListPage` is **never instantiated**. It's exported from [`entity-runtime/src/index.ts:16`](packages/product-deprecated/runtime-ui/entity-runtime/src/index.ts#L16) and registered in [`renderer.registry.ts:41`](packages/product-deprecated/runtime-ui/entity-runtime/src/metadata/renderer.registry.ts#L41) as the `table` renderer, but **neither the export nor the registry has a consumer**.

### Dead sibling components

Same pattern repeats for the view-mode variants and the bulk/import pages:

| Component | Location | Lines | External consumers |
|---|---|---|---|
| `EntityListPage` | `entity-runtime/list/EntityListPage.tsx` | 3343 | 0 |
| `KanbanView` | `entity-runtime/list/KanbanView.tsx` | â€” | 0 |
| `DashboardView` | `entity-runtime/list/DashboardView.tsx` | â€” | 0 (the finance-workbench `PeriodCloseDashboardView` is a different file) |
| `ExcelView` | `entity-runtime/list/ExcelView.tsx` | â€” | 0 |
| `FilterDrawer` | `entity-runtime/list/FilterDrawer.tsx` | â€” | 0 (only `EntityListPage` imports it) |
| `SortDrawer` | `entity-runtime/list/SortDrawer.tsx` | â€” | 0 |
| `GroupDrawer` | `entity-runtime/list/GroupDrawer.tsx` | â€” | 0 |
| `ColumnDrawer` | `entity-runtime/list/ColumnDrawer.tsx` | â€” | 0 |
| `GroupedListView` | `entity-runtime/list/GroupedListView.tsx` | â€” | 0 |
| `RowActionMenu` | `entity-runtime/list/RowActionMenu.tsx` | â€” | 0 |
| `RowMetaStrip` | `entity-runtime/list/RowMetaStrip.tsx` | â€” | 0 |
| `EntityBulkPage` | `entity-runtime/bulk/EntityBulkPage.tsx` | â€” | 0 |
| `EntityImportPage` | `entity-runtime/import/EntityImportPage.tsx` | â€” | 0 |
| `useEntityListUrl` | `entity-runtime/list/useEntityListUrl.ts` | â€” | 0 (only `EntityListPage`) |
| `listRendererMap` | `entity-runtime/metadata/renderer.registry.ts` | â€” | 0 |

Verification command for each:

```sh
# Replace <Name> with the component
grep -rn "<Name>\b" packages/ apps/ \
  | grep -v node_modules | grep -v '\.next' \
  | grep -v "entity-runtime/src/list\|entity-runtime/src/bulk\|entity-runtime/src/import\|entity-runtime/src/metadata"
```

In every case the output is either empty or references only barrels within `entity-runtime` itself.

### Why `runtime-list` and `entity-runtime` diverged

`@athyper/runtime-list` is a server-component-first framework with:
- Adapter pattern: each app (`neon`, `mesh`, `admin`) supplies its own session/access-context/saved-views/descriptor fetchers.
- Distinct view-mode terminology: `"list" | "compact" | "board" | "dashboard" | "excel"` instead of entity-runtime's `"table" | "kanban" | "dashboard" | "spreadsheet"`.
- Its own list-state contract, URL serialization, and saved-views layer.

`@athyper/entity-runtime/list` predates this. The architectural evolution to runtime-list happened without a deletion pass on the legacy code. The legacy ban policy ([verify-plane-boundaries.ts:181-189](scripts/policy/verify-plane-boundaries.ts#L181-L189)) was meant to prevent **new** imports of entity-runtime, but it didn't trigger a retirement of the existing dead code.

### What stays in `entity-runtime`

The package is not entirely dead â€” only its `list`, `bulk`, and `import` subtrees are. The following exports are live and consumed by `@athyper/document-runtime`:

| Subpath | Active consumer | Decision |
|---|---|---|
| `./header` | `document-runtime/composite/CompositeFlowWizard`, `intake/FlowWizard`, `pages/DocumentDetailPage` | keep |
| `./field-renderers` | `document-runtime/items/metaLineRuntime`, `document-runtime/pages/DocumentDetailPage` | keep |
| `./actions` | `document-runtime/pages/DocumentDetailPage` | keep |
| `./panels` | `document-runtime/pages/DocumentDetailPage` | keep |
| `./detail` (= `EntityDetailPage`) | TBD audit | likely keep â€” referenced by `detailRendererMap` which may still be consulted |
| `./form` | TBD audit | needs the same dead-code check before retirement |
| `./edit` | TBD audit | same |
| `./intake` | TBD audit | same |

Detail/form/edit/intake are out of scope for this initiative; they need their own audits.

## Recommended path

### Stage R1 â€” Retire the list subtree (~1 day)

Single PR, surgically delete:

1. **Files**:
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/EntityListPage.tsx`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/KanbanView.tsx`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/DashboardView.tsx`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/ExcelView.tsx`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/FilterDrawer.tsx`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/SortDrawer.tsx`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/GroupDrawer.tsx`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/ColumnDrawer.tsx`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/GroupedListView.tsx`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/RowActionMenu.tsx`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/RowMetaStrip.tsx`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/CompactView.tsx`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/ColumnFilterHeader.tsx`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/ColumnFilterPopover.tsx`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/FieldFilterControl.tsx`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/ListOverflowMenu.tsx`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/MyWorkDropdown.tsx`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/SmartCreateButton.tsx`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/useEntityListUrl.ts`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/listPresentation.tsx`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/virtualFilterLabels.ts`
   - `packages/product-deprecated/runtime-ui/entity-runtime/src/list/index.ts`

2. **Re-exports** in [`entity-runtime/src/index.ts`](packages/product-deprecated/runtime-ui/entity-runtime/src/index.ts) â€” drop `EntityListPage`, `KanbanView`, `DashboardView`, `ExcelView`, `useEntityListUrl`, etc.

3. **Renderer map** in [`entity-runtime/src/metadata/renderer.registry.ts`](packages/product-deprecated/runtime-ui/entity-runtime/src/metadata/renderer.registry.ts) â€” delete `listRendererMap` and `ListRendererKey`. Decide whether to keep `detailRendererMap` (depends on detail-page audit).

4. **Subpath export** in [`entity-runtime/package.json`](packages/product-deprecated/runtime-ui/entity-runtime/package.json) â€” drop `"./list": "./src/list/index.ts"`.

5. **Verification**:
   - `pnpm typecheck` across all packages.
   - `pnpm test` runtime-line-item, metadata-client, api-client.
   - `verify-plane-boundaries.ts` â€” should stay green.

### Stage R2 â€” Retire the bulk + import subtrees (~half day)

Same structural pattern as R1, smaller surface:
- `packages/product-deprecated/runtime-ui/entity-runtime/src/bulk/`
- `packages/product-deprecated/runtime-ui/entity-runtime/src/import/`
- Subpath exports `./bulk` and `./import` removed from package.json.

### Stage R3 (optional, deferred) â€” Retire `runtime-canvas/list/runtime-list-page.tsx`

Same dead-code analysis applies. Lower priority since `runtime-canvas` is not on the legacy ban list â€” the dead code there is just clutter, not a structural issue.

### Stage R4 (audit only) â€” Map remaining `entity-runtime` exports

Audit the surviving exports (`./detail`, `./form`, `./edit`, `./intake`, etc.) the same way. Some may also be dead. Future retirement initiatives address them.

## Risks

| Risk | Mitigation |
|---|---|
| Dynamic dispatch via `listRendererMap` we didn't surface | Grep already confirmed no consumer reads the map. If something escapes, it surfaces immediately on `pnpm typecheck` post-delete. |
| Test fixtures or storybook stories importing dead components | Same grep + typecheck catches them. |
| Future consumer plans to adopt `EntityListPage` | Reverse-direction: `runtime-list` is the active framework; new consumers should adopt it, not the legacy page. |
| Documentation referencing dead components | Spot-check docs/, update migration-log.md with the retirement entry. |

## Effort budget

| Stage | Effort | Risk |
|---|---|---|
| R1 list retirement | ~1 day | low |
| R2 bulk + import retirement | ~half day | low |
| R3 runtime-canvas RuntimeListPage retirement | ~half day | low; defer until R1+R2 ship |
| R4 audit of remaining `entity-runtime` subtrees | ~1 day | discovery only, no code |

**Total: ~2 days for R1+R2, the value-delivering steps.** Compare to the ~2-3 sprint budget the original "EntityListPage â†’ runtime-record" framing implied.

## Why this re-scoping matters

The discovery cost was ~2 hours and saved an effort budget of 2-3 sprints. The original initiative description ("port a 3343-line legacy file to runtime-record") rested on an assumption â€” that `EntityListPage` was load-bearing â€” that turned out to be wrong.

Pattern worth applying to future initiatives: before scoping a "migrate X to Y" effort, run a consumer audit of X. A handful of grep calls catches cases where the migration is either unnecessary (X is dead) or already done (X has been replaced; the remaining surface is just cleanup).

## Open questions

1. **`detailRendererMap`** in [`renderer.registry.ts:30`](packages/product-deprecated/runtime-ui/entity-runtime/src/metadata/renderer.registry.ts#L30). Grep confirmed no external consumer â€” `detailRendererMap` and `DetailRendererKey` only appear in the definition file plus two internal barrels (`entity-runtime/src/index.ts:75,85` and `entity-runtime/src/metadata/index.ts:33,39`). Despite that, **intentionally deferred to R4** along with the rest of the `./detail` audit, so R1 stays surgical to the list subtree. Deleting `detailRendererMap` in R1 would pull `./detail` into scope unnecessarily.
2. **`runtime-canvas/src/index.tsx:54`** re-exports `RuntimeListPage`. Does anything outside the package read it? Likely no; confirm before R3.
3. **migration-log.md** â€” the retirement gets an entry when R1 lands: a brief paragraph noting that `entity-runtime/list` is being progressively retired because apps already use `runtime-list`, with a pointer to this doc.

## Recommendation

1. Ship the pending DDL audit/cut-over PR per the ship checklist.
2. Open R1 as its own small PR. ~1 day of work, ~5000 lines deleted, no behavior change. Reviewable in a single sitting.
3. R2 follows R1 immediately, also small.
4. R3 and R4 are nice-to-haves; defer until product pressure or a quiet sprint allows.

The "EntityListPage migration" initiative as originally named is **closed without building**, replaced by the smaller "entity-runtime list retirement" initiative scoped above. Same end state, ~95% less effort.
