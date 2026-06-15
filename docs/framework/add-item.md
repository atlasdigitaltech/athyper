# Add-Item Framework

A source-adapter framework for adding line items to documents (invoices, sales orders, journal entries, …) from any number of sources — manual entry, catalog selection, open PO lines, certified service sheets, goods receipts, contracts, inventory.

**Status:** v1 shipped June 2026. Five adapters live; two (contract, inventory) deferred — see [./source-adapters/](./source-adapters/).

---

## Why this exists

Before this framework, line-item add flows were one-off components per source. The codebase carried 7+ parallel "composer" sheets (`ProcureLineComposerSheet`, `SalesLineComposerSheet`, etc.) plus hardcoded "Add Item" / "Add Catalog Item" buttons wired to private state. Adding a new source meant duplicating a sheet, copy-pasting validation, and re-implementing telemetry — and there was no audit invariant: a committed line had no record of where it came from.

The framework collapses all that into one orchestrator (`AddItemController`) consuming pluggable `SourceAdapter`s, with a single audit guarantee — **every committed line carries a `sourceBinding`** identifying its source. New sources land as ~150-line adapter files following a fixed template.

---

## Package layout

```
@athyper/runtime-contracts        Zod-validated shapes (manifest, selection, binding, draft, side effects)
@athyper/ui/surfaces              Shells + SurfaceStackController (Phase 2-3 deliverables)
@athyper/runtime-add-item         Executable contract + registry + controller + test harness
@athyper/line-item-runtime        Concrete adapters (manual, catalog, open_po_line, open_receipt_line, open_service_sheet_line)
```

Dependency direction is strict: `runtime-add-item` depends on `runtime-contracts` + `@athyper/ui`. `line-item-runtime` depends on `runtime-add-item`. Apps depend on `line-item-runtime`. No package upstream of `runtime-add-item` can know about specific adapters.

---

## Core concepts

### SourceAdapter

A `SourceAdapter` is a TypeScript interface paired with a Zod-validated `manifest`. The manifest is declarative metadata (id, picker UI, selection shape, dedupe keys). The interface is behavior (fetch / normalize / validate / commit side-effects). Together they fully describe how a source contributes lines.

```ts
interface SourceAdapter<Selection, Draft extends DraftLine, ParentCtx> {
  manifest: SourceAdapterManifest;
  fetch(query, parentCtx): Promise<Page<Selection>>;
  toDraftShape(selection, parentCtx): Draft;
  resolveDefaults(draft, parentCtx): Promise<Draft>;
  applyParentContext(draft, parentCtx): Draft;
  validateSelection(selection, parentCtx): ValidationResult;
  isStillValid(stagedLine, parentCtx): Promise<ValidationResult>;
  dedupeKey?(line, parentCtx): string;
  onCommitSideEffects(line, parentCtx): SourceSideEffect[];
}
```

### SourceAdapterRegistry

Apps mount one registry at boot. Adapters register themselves via `registry.register(adapter)`. The registry:

- Re-validates the manifest with Zod at register time
- Rejects duplicate ids + framework-version mismatches with structured errors
- Filters `list({ hasPermission })` so the picker chooser hides adapters the user lacks
- Emits `adapter.register` / `adapter.reject` telemetry

### AddItemController

A React hook (`useAddItemController({ registry, parentCtx, telemetry })`) that orchestrates the pick-stage-fill-commit pipeline. The user-facing API:

- `availableAdapters` — permission-filtered list for the picker chooser
- `openPicker(adapterId)` / `cancelPicker()` — picker lifecycle
- `fetchActive(query)` — debounced fetch for the active picker
- `stageLine(adapter, draft)` — push a line into the working set (multi-source supported)
- `removeStagedLine(id)` — pop one
- `commit()` — validate staleness + run side-effects + return CommitResult

Multi-source staging is first-class: a user can pick catalog items, PO lines, and SES lines in one session, and `commit()` returns lines from all three with their respective side effects collected in order.

### DraftLineCommitter

Internal to `AddItemController`. Aggregates committed lines + side effects. Enforces two invariants:

1. Every committed line's `sourceBinding.sourceType` matches the adapter that produced it.
2. No two lines in the same commit have the same `link_source_line` binding (duplicate-source guard).

Side effects are *declarative*: adapters describe what should happen (`reserve_remaining_quantity`, `link_source_line`, `emit_event`); the committer collects them; the caller runs them inside a DB transaction.

### Telemetry

Eight typed events emitted via a `TelemetryDispatcher`:

| Event | When |
|---|---|
| `adapter.register` | Adapter accepted by the registry |
| `adapter.reject` | Adapter rejected (with reason code: `duplicate_id`, `framework_version_too_low`, `invalid_manifest`) |
| `picker.open` | User opens an adapter's picker |
| `picker.fetch.ok` | `adapter.fetch` returns; carries `itemCount` + `durationMs` |
| `picker.fetch.fail` | `adapter.fetch` throws |
| `commit.ok` | Commit succeeds; carries `lineCount` + `adapterIds` |
| `commit.fail` | Commit rejected (sourceBinding mismatch, duplicate guard, or stale `fail` strategy) |
| `commit.stale` | One or more staged lines flagged stale by `isStillValid`; strategy attached |

Apps wire one listener that bridges to GlitchTip / Sentry / OTel. Listener throws are isolated — a bad listener can't kill the bus.

---

## Authoring a new adapter

The flow is mechanical. For a new source `X`:

### 1. Define the shapes

In `packages/shared/line-item-runtime/src/adapters/X.ts`:

```ts
export interface XSelection extends Record<string, unknown> {
  // What the picker returns — usually a database row plus chosen qty/uom.
  itemId: string;
  // ...
  chosenQty?: number;
}

export interface XDraft extends DraftLine {
  // What gets committed onto the parent document. Top-level fields
  // mirror the conventional line shape so the existing composer / persist
  // layer reads it without translation. sourceBinding is inherited.
  itemId: string;
  description: string;
  quantity: number;
  // ...
}

export interface XParentCtx extends Record<string, unknown> {
  parentEntityCode: string;
  parentRecordId: string;
  lineEntityCode: string;
  currencyCode?: string;
}
```

### 2. Define the I/O contracts

Make the backend wiring pluggable. Real apps inject relay-fetch callbacks; tests inject stubs.

```ts
export type XFetchItems = (query: SourceQuery, ctx: XParentCtx) => Promise<Page<XSelection>>;
export type XCheckLive = (id: string, ctx: XParentCtx) => Promise<XSelection | null>;
```

### 3. Write the factory

```ts
export function createXAdapter(opts: {
  fetchItems: XFetchItems;
  checkLive?: XCheckLive;
  permissionCode?: string | undefined;
  stalenessStrategy?: "fail" | "warn" | "refresh";
}): SourceAdapter<XSelection, XDraft, XParentCtx> {
  const manifest: SourceAdapterManifest = {
    id: "x",
    version: 1,
    minFrameworkVersion: 1,
    label: "Add from X",
    permissionCode: "permissionCode" in opts ? opts.permissionCode : "DEFAULT_X_PERMISSION",
    picker: {
      kind: "modal-select", // or "overlay" / "page" — never drawer-form / drawer-peek / dialog-confirm
      columns: [/* ... */],
      filters: [/* ... */],
      search: { enabled: true },
      defaultSort: { field: "...", direction: "desc" },
    },
    cacheStrategy: "session",
    stalenessStrategy: opts.stalenessStrategy ?? "fail",
    selectionShape: { kind: "id_qty", idField: "itemId", qtyField: "chosenQty" },
    dedupeKeys: ["itemId"], // composite if needed: ["docId", "lineId"]
    fill: { fieldNames: [], prefilledFieldNames: [], requiredFieldNames: [] },
  };

  return {
    manifest,
    async fetch(query, ctx) { return opts.fetchItems(query, ctx); },
    toDraftShape(selection, ctx) {
      const binding: SourceBinding = {
        sourceType: manifest.id,
        sourceDocType: "x_source",
        sourceDocId: selection.itemId,
        sourceRef: { /* preserve all picker-time values for audit */ },
      };
      return {
        // top-level fields the persist layer needs
        sourceBinding: binding,
      };
    },
    async resolveDefaults(draft) { return draft; },
    applyParentContext(draft, ctx) {
      if (ctx.currencyCode && draft.currencyCode !== ctx.currencyCode) {
        return {
          ...draft,
          sourceBinding: {
            ...draft.sourceBinding,
            sourceRef: {
              ...(draft.sourceBinding.sourceRef ?? {}),
              parentCurrency: ctx.currencyCode,
              currencyMismatch: true,
            },
          },
        };
      }
      return draft;
    },
    validateSelection(selection) {
      // pure validation against picker-time state
    },
    async isStillValid(stagedLine, ctx) {
      if (!opts.checkLive) return { ok: true };
      // re-fetch, compare watermarks (qty, status, isFullyInvoiced, etc.)
    },
    dedupeKey(line) { return String(line.itemId); },
    onCommitSideEffects(line) {
      return [
        // declarative effects only — adapter does NOT execute them
        { kind: "reserve_remaining_quantity", /* ... */ },
        { kind: "link_source_line", sourceBinding: line.sourceBinding },
      ];
    },
  };
}
```

### 4. Run the contract suite

```ts
// adapters/__tests__/X.test.ts
import { defineSourceAdapterContractSuite } from "@athyper/runtime-add-item/test-harness";

describe("Contract suite — x", () => {
  defineSourceAdapterContractSuite(
    "x",
    () => createXAdapter({ fetchItems: async () => ({ items: [SAMPLE] }) }),
    {
      parentCtx: { /* ... */ },
      validQuery: {},
      validSelection: SAMPLE,
      invalidSelection: { /* should fail validateSelection */ },
      staleStagedLine: { /* should fail isStillValid */ },
    },
  );
});
```

The suite is 14 framework assertions: manifest schema validity, framework-version compatibility, picker kind whitelist, sourceBinding preservation across the three normalization stages, validation branches, side-effect declarativeness, dedupeKeys populated. If your adapter passes this suite + the integration patterns below, it ships.

### 5. Integration scenarios to cover

Mirror the patterns in [open_po_line.integration.test.tsx](../../packages/shared/line-item-runtime/src/adapters/__tests__/open-po-line.integration.test.tsx):

- Permission gating (allow + deny + undefined-permission paths)
- Multi-line staging + commit with the right number of side effects
- Side-effect ordering (e.g., `reserve` before `link` per line)
- Staleness `fail` strategy under concurrent modification (mutate the world mid-staging)
- Staleness `warn` opt-in (commits + emits `commit.stale`)
- Duplicate source-line guard (stage the same item twice → second rejected by committer)
- Validation rejections per branch (qty > remaining, qty ≤ 0, source-specific flags)
- Currency mismatch annotation
- Staleness opt-out (no `checkLive` → no checks performed)

---

## Anti-patterns

### Don't `await` inside `onCommitSideEffects`

Side effects are *declarative*. The committer collects them in memory and hands them to the caller. Calling `await` (or worse, executing the effect) inside the hook breaks the transactional pipeline.

### Don't run FX conversion in `applyParentContext`

The adapter records currency mismatch in `sourceRef` and returns — *the parent doc's posting / pricing service decides what to do*. Adapter-level FX is a domain bleed.

### Don't set `cacheStrategy: "session"` on a `page` picker

The schema rejects this at register time. Page navigation invalidates session storage by definition — pick `stale-while-revalidate` or `none`.

### Don't omit `permissionCode` to "make it work"

If your adapter doesn't have a permission, set it explicitly to `undefined`. Omitting is a maintenance signal that nobody decided whether this needs gating — every adapter with backend I/O should at minimum have a permission code, even if it defaults to the entity's general read permission.

### Don't deep-mutate selections in `toDraftShape`

`toDraftShape` should be pure. Cloning the selection + adding fields is fine. Mutating it in place breaks the picker's row cache.

### Don't put `selectionShape: { kind: "id_only" }` on a partial-qty source

If your source supports partial selection (PO line at 50 of 100, contract drawing 30 days of 365), use `id_qty` or `id_qty_uom`. The selection shape is what tells the controller the user can specify quantity at pick time. `id_only` skips that step.

---

## Adapter reference

| Adapter | Picker | Selection | Match | Side effects | DDL |
|---|---|---|---|---|---|
| [`manual_invoice_line`](../../packages/shared/line-item-runtime/src/adapters/manual-invoice-line.ts) | n/a (composer is fill) | `id_only` | — | none | n/a — pure UI source |
| [`catalog`](../../packages/shared/line-item-runtime/src/adapters/catalog.ts) | `overlay` | `id_qty_uom` | — | `emit_event` | `mesh.catalog_item` + `mesh.catalog_price` |
| [`open_po_line`](../../packages/shared/line-item-runtime/src/adapters/open-po-line.ts) | `modal-select` | `id_qty` | `three_way` | `reserve_remaining_quantity` + `link_source_line` | resolved via `commitment` abstraction |
| [`open_receipt_line`](../../packages/shared/line-item-runtime/src/adapters/open-receipt-line.ts) | `modal-select` | `id_qty` | `three_way` | `reserve_remaining_quantity` (targets `goods_receipt_line`) + `link_source_line` | `document.goods_receipt` + `goods_receipt_line` |
| [`open_service_sheet_line`](../../packages/shared/line-item-runtime/src/adapters/open-service-sheet-line.ts) | `modal-select` | `id_qty` | `three_way` | `reserve_remaining_quantity` (targets `service_sheet_line`) + `link_source_line` | `document.service_entry_sheet` + `service_entry_sheet_line` |
| `open_contract_line` | DEFERRED | — | — | — | none — [deferral note](./source-adapters/open_contract_line.md) |
| `inventory` | DEFERRED | — | — | — | partial only — [deferral note](./source-adapters/inventory.md) |

---

## Related

- Interaction surface standard: [packages/shared/runtime-canvas/](../../packages/shared/runtime-canvas) — six shell kinds + stack rules
- [Runbook rb-17 — Add-Item framework operations](../local/runbooks/rb-17-add-item-framework.md)
- Source-adapter deferral notes: [./source-adapters/](./source-adapters/)
