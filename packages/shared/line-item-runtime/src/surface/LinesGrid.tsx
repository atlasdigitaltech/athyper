"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@athyper/theme/utils";
import { fmtAmount } from "@athyper/runtime-shared/core";
import { SearchInput } from "@athyper/ui/composites";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import { resolveListConfig } from "@athyper/metadata-client/compiled-reader";
import type { RowSelectionState } from "@athyper/ui/data";
import { recordId, useCompiledEntityMetadata } from "../meta";
import type {
  LinesGridProps,
  LineItemVariantKey,
  LineRecord,
} from "../types";
import {
  normalizeProcureDraftLine,
  resolveProcureGridSummary,
} from "../variants/procure";
import { LineItemComposerSheet, LineItemEditorSheet } from "../components/LineItemSheet";
import { createManualInvoiceLineAdapter } from "../adapters/manual-invoice-line";
import { AddItemDropdown } from "./AddItemDropdown";
import { LineItemMobileRow } from "./LineItemMobileRow";
import { LineItemsSelectionBar } from "./LineItemsSelectionBar";
import { SourceAdapterPicker, type SourceAdapter } from "@athyper/runtime-add-item";
import { relayMutate } from "@athyper/runtime-shared/client";
import {
  EmbeddedEntityList,
  LinesColumnPicker,
  useLocalStoragePreference,
} from "../embedded";

// ─────────────────────────────────────────────────────────────────────────────
// VARIANT KEY INFERENCE
// ─────────────────────────────────────────────────────────────────────────────

function resolveVariantKey(
  displayConfig: Record<string, unknown> | null | undefined,
  entityCode: string,
  lineEntityCode: string,
): LineItemVariantKey {
  const configured = displayConfig?.["line_ui_variant"];
  if (typeof configured === "string" && configured.trim()) return configured as LineItemVariantKey;

  const code = `${entityCode} ${lineEntityCode}`.toLowerCase();
  if (code.includes("sales") || code.includes("so_line") || code.includes("order_line")) return "sales";
  if (code.includes("purchase") || code.includes("invoice_line") || code.includes("po_line")) return "procure";
  return "generic";
}

// AddItemDropdown lives in its own module so it can be tested in isolation
// and reused. See ./AddItemDropdown.tsx.

// ─────────────────────────────────────────────────────────────────────────────
// AMOUNT TOTALS FOOTER
// ─────────────────────────────────────────────────────────────────────────────

const NUMERIC_DATA_TYPES = new Set(["money", "decimal", "integer", "numeric", "bigint"]);
const LINE_SEARCH_KEYS = [
  "description",
  "item_description",
  "item_code",
  "item_id",
  "line_no",
  "line_number",
];
const LINE_GRID_PINNED_COLUMNS = [
  "select",
  "line_number",
  "line_no",
  "line_num",
  "description",
  "item_description",
];

function AmountTotalsFooter({
  lines,
  entity,
  currencyCode,
}: {
  lines:        LineRecord[];
  /** Compiled line entity; when null (still loading) the footer hides. */
  entity:       CompiledEntity | null;
  currencyCode?: string;
}) {
  // Mirror the column projection EmbeddedEntityList renders — same source of
  // truth (resolveListConfig), so the totals row stays aligned with what
  // the user sees in the grid.
  const totals = useMemo(() => {
    if (!entity) return [];
    return resolveListConfig(entity).columns
      .filter((field) => NUMERIC_DATA_TYPES.has(field.data_type))
      .map((field) => ({
        key:   field.name,
        label: field.label ?? field.name,
        total: lines.reduce((sum, line) => {
          const n = Number((line as Record<string, unknown>)[field.name] ?? 0);
          return Number.isFinite(n) ? sum + n : sum;
        }, 0),
      }));
  }, [entity, lines]);

  const nonZero = totals.filter((t) => Math.abs(t.total) > 0.001);
  if (nonZero.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-border/40 px-4 py-2.5">
      {nonZero.map(({ key, label, total }) => (
        <span key={key} className="flex items-baseline gap-1.5 text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-semibold tabular-nums text-foreground">{fmtAmount(total, currencyCode)}</span>
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LINES GRID COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function LinesGrid({
  surface,
  entity,
  entityCode,
  recordId: parentRecordId,
  lineEntityCode,
  currencyCode,
  companyCodeId,
  record,
  lines,
  distributions,
  isLoading,
  onRefresh,
  editMode = true,
  draftMode = false,
  onDraftLinesChange,
  mobileColumns,
  renderRowExpansion,
}: LinesGridProps) {
  // Plan v5 amendment 2 — expanded row state owned by the grid. Single-row
  // expansion only: opening a second line collapses the first, matching the
  // PI v1.2 spec §4.3 row drawer pattern. Mobile branch ignores expansion
  // today; the card layout already exposes line context per row.
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const expansionEnabled = Boolean(renderRowExpansion);
  const [composerOpen,  setComposerOpen]  = useState(false);
  const [composerMode,  setComposerMode]  = useState<"manual" | "catalog">("manual");
  const [editorOpen,    setEditorOpen]    = useState(false);
  const [activeLine,    setActiveLine]    = useState<LineRecord | null>(null);
  // Selection state — owned here, threaded into EmbeddedEntityList controlled.
  // Keyed by `recordId(line) || String(index)` via the getRowId prop on the
  // embedded grid, so selection survives sort and search changes. The
  // FloatingSelectionBar below derives its count + clear handler from this.
  const [rowSelection,  setRowSelection]  = useState<RowSelectionState>({});
  const [draftLines,    setDraftLines]    = useState<LineRecord[]>([]);
  const [lineSearch,    setLineSearch]    = useState("");

  // Manual-line source adapter — used by draft-mode composer submits so each
  // local draft line carries a sourceBinding. Held in a ref so re-renders
  // don't recreate it.
  const manualInvoiceLineAdapterRef = useRef(createManualInvoiceLineAdapter());

  // Picker-adapter state: which adapter (if any) currently has its picker
  // open. The picker is rendered conditionally below; selections route
  // through onPickerCommit which mirrors the draft / non-draft persistence
  // already used by handleDraftComposerSubmit.
  const [activePickerAdapter, setActivePickerAdapter] = useState<SourceAdapter | null>(null);

  // parentCtx — assembled from existing props. Read by the picker hook
  // (validateSelection, isStillValid, toDraftShape) so adapters can scope
  // queries (e.g. open_po_line filters by supplierId from the parent
  // invoice's supplier).
  const supplierId = useMemo(() => {
    const value = record?.supplier_id ?? record?.supplierId;
    return typeof value === "string" ? value : undefined;
  }, [record]);
  const parentCtx = useMemo(
    () => ({
      parentEntityCode: entityCode,
      parentRecordId,
      lineEntityCode,
      currencyCode,
      supplierId,
    }),
    [entityCode, parentRecordId, lineEntityCode, currencyCode, supplierId],
  );

  const displayConfig = entity ? (entity.display_config as Record<string, unknown> | null | undefined) : null;
  const variantKey = resolveVariantKey(displayConfig, entityCode, lineEntityCode);

  // For draft mode, merge server lines + draft lines
  const allLines = draftMode ? [...lines, ...draftLines] : lines;

  // Compiled metadata used by AmountTotalsFooter — column rendering itself
  // is driven by EmbeddedEntityList's own useCompiledEntity call (it reads
  // display_config.list_columns directly from the descriptor). This local
  // fetch hits the same backend endpoint as useCompiledEntity; both layers
  // tolerate the duplicate request, but react-query's cache (used by
  // EmbeddedEntityList) and this hook's own cancellation keep it cheap.
  const lineEntity = useCompiledEntityMetadata(lineEntityCode);

  // Column visibility — descriptor's list_columns provides the default; users
  // can add/remove columns via the popover and the choice persists across
  // sessions via localStorage. `null` in storage means "use descriptor
  // defaults" so future seed changes flow through to users who never opened
  // the picker.
  const descriptorVisibleKeys = useMemo<string[]>(
    () => lineEntity ? resolveListConfig(lineEntity).columns.map((f) => f.name) : [],
    [lineEntity],
  );
  const [persistedVisibleKeys, setPersistedVisibleKeys] =
    useLocalStoragePreference<string[] | null>(
      `line-grid:${lineEntityCode}:columns`,
      null,
    );
  const effectiveVisibleKeys = persistedVisibleKeys ?? descriptorVisibleKeys;

  const summaryItems = useMemo(() => {
    if (variantKey !== "procure") return null;
    return resolveProcureGridSummary(allLines);
  }, [allLines, variantKey]);

  function handleRowClick(row: Record<string, unknown>) {
    // When the parent surface provides `renderRowExpansion`, the row drawer
    // is the primary detail affordance — clicking toggles inline expansion.
    // The line editor sheet stays reachable via per-row "Edit" affordances
    // (LineItemEditorSheet open path) and the mobile-row openRow handler.
    if (expansionEnabled) {
      const rowId = recordId(row as LineRecord);
      if (!rowId) return;
      setExpandedLineId((current) => (current === rowId ? null : rowId));
      return;
    }
    setActiveLine(row as LineRecord);
    setEditorOpen(true);
  }

  const selectionCount = useMemo(
    () => Object.values(rowSelection).filter(Boolean).length,
    [rowSelection],
  );

  /**
   * Composer submit handler — runs the form payload through the
   * manual_invoice_line adapter to attach sourceBinding, then routes:
   *   • Draft mode  → appends to local draftLines, bubbles up
   *   • Non-draft mode → POSTs to /api/records/<entity>/<id>/lines
   *
   * Both flows now carry sourceBinding end-to-end. Draft mode keeps it on
   * the in-memory line for the eventual bulk save; non-draft mode persists
   * it via the backend's source_binding column (DDL 01s_).
   */
  async function handleComposerSubmit(payload: Record<string, unknown>): Promise<void> {
    const normalized = variantKey === "procure"
      ? normalizeProcureDraftLine(payload, null)
      : payload;
    const draftId = `draft-${Date.now()}`;
    const adapter = manualInvoiceLineAdapterRef.current;
    const draft = adapter.toDraftShape(
      { draftId, payload: normalized },
      {
        parentEntityCode: entityCode,
        parentRecordId,
        lineEntityCode,
        currencyCode,
      },
    );

    if (draftMode) {
      const newLine = {
        id: draftId,
        line_number: allLines.length + 1,
        ...draft,
      } as unknown as LineRecord;
      const next = [...draftLines, newLine];
      setDraftLines(next);
      onDraftLinesChange?.([...lines, ...next]);
      return;
    }

    // Non-draft persistence — POST the line with sourceBinding included.
    // The backend route accepts the camelCase `sourceBinding` field (the
    // alias maps to the snake_case DB column).
    const collectionUrl = `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentRecordId)}/lines`;
    const body = {
      ...normalized,
      sourceBinding: draft.sourceBinding,
    };
    const res = await relayMutate(collectionUrl, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Line save failed (${res.status})`);
    }
    onRefresh?.();
  }

  /**
   * Picker commit — selected Selection rows flow through the adapter's
   * normalization pipeline (toDraftShape → resolveDefaults → applyParentContext),
   * then are persisted via the same path as manual entries:
   *   • Draft mode: appended to draftLines and bubbled up.
   *   • Non-draft mode: POSTed to the records collection endpoint, then
   *     onRefresh fires so the parent re-fetches.
   */
  async function handlePickerCommit(
    adapter: SourceAdapter,
    rows: Array<Record<string, unknown>>,
  ): Promise<void> {
    if (rows.length === 0) {
      setActivePickerAdapter(null);
      return;
    }
    const drafts: Record<string, unknown>[] = [];
    for (const row of rows) {
      // Each row goes through the adapter's three-stage normalization. The
      // adapter contract guarantees these are pure / deterministic.
      let draft = adapter.toDraftShape(row, parentCtx as never) as Record<string, unknown>;
      draft = (await adapter.resolveDefaults(draft as never, parentCtx as never)) as Record<string, unknown>;
      draft = adapter.applyParentContext(draft as never, parentCtx as never) as Record<string, unknown>;
      drafts.push(draft);
    }

    if (draftMode) {
      const baseNumber = allLines.length;
      const newLines = drafts.map((d, i) => ({
        id: `picker-${Date.now()}-${i}`,
        line_number: baseNumber + i + 1,
        ...d,
      })) as unknown as LineRecord[];
      const next = [...draftLines, ...newLines];
      setDraftLines(next);
      onDraftLinesChange?.([...lines, ...next]);
      setActivePickerAdapter(null);
      return;
    }

    // Non-draft mode: POST each line via relayMutate. Backend route accepts
    // sourceBinding as part of the body; downstream services persist it
    // into purchase_invoice_line.source_binding (added in DDL 01s_).
    const collectionUrl = `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentRecordId)}/lines`;
    let failureCount = 0;
    for (const draft of drafts) {
      try {
        const res = await relayMutate(collectionUrl, {
          method: "POST",
          body: JSON.stringify(draft),
        });
        if (!res.ok) failureCount += 1;
      } catch {
        failureCount += 1;
      }
    }
    if (failureCount === drafts.length) {
      // Total failure — keep the picker open so the user can retry.
      return;
    }
    onRefresh?.();
    setActivePickerAdapter(null);
  }

  function handleDraftEditorSubmit(payload: Record<string, unknown>): void {
    if (!activeLine) return;
    const lineId = recordId(activeLine);
    const next = draftLines.map((l) =>
      recordId(l) === lineId ? { ...l, ...payload } as LineRecord : l,
    );
    setDraftLines(next);
    onDraftLinesChange?.([...lines, ...next]);
  }

  // Columns are now resolved by EmbeddedEntityList from the compiled line
  // entity's display_config.list_columns (see
  // server/db/seed/platform/003_control/040b_line_grid_list_columns.sql).
  // The variant column catalogs that lived in this package were retired in
  // the DDL/catalog retirement initiative — this component no longer hands
  // over a columnsOverride.

  // The line records are TanStack's row.original — flatten the LineRecord
  // type into a plain record so the controlled callbacks (onRowClick, etc.)
  // can read fields by name without juggling DocumentLine specifics.
  const rowsForGrid = useMemo(
    () => allLines as unknown as Array<Record<string, unknown>>,
    [allLines],
  );

  // Phase 11 #8's `mobileColumns` prop is preserved on the public API but
  // unused for now: the migrated DataTable doesn't support per-column
  // viewport hiding (CSS `hidden md:table-cell`). Re-add via DataTable
  // column visibility or a media-query hook when a real consumer needs it.
  void mobileColumns;

  const headerSlot = (
    <>
      <span className="shrink-0 font-medium text-foreground">
        {allLines.length} {allLines.length === 1 ? "Line" : "Lines"}
      </span>
      {summaryItems?.map(({ label, count, intent }) => (
        <span
          key={label}
          className={cn(
            "ml-3 shrink-0",
            intent === "error"   ? "text-destructive"  :
            intent === "warning" ? "text-amber-500"     :
                                   "text-muted-foreground",
          )}
        >
          · {count} {label}
        </span>
      ))}
      <SearchInput
        value={lineSearch}
        onSearch={setLineSearch}
        debounceMs={150}
        placeholder="Search lines..."
        aria-label="Search lines"
        className="ml-auto w-56 min-w-[12rem] shrink-0"
        onKeyDown={(event) => {
          if (event.key === "Escape") setLineSearch("");
        }}
      />
      {lineEntity && (
        // Hidden on mobile — the Columns picker controls a column set that
        // doesn't exist in card mode. Leaving the trigger visible would be
        // a dead button.
        <div className="hidden md:block">
          <LinesColumnPicker
            entity={lineEntity}
            defaultVisible={descriptorVisibleKeys}
            visible={effectiveVisibleKeys}
            onApply={(next) => {
              // Treat a back-to-default selection as "clear preference" so
              // future descriptor changes flow through to the user without
              // requiring them to click Reset.
              const same = next.length === descriptorVisibleKeys.length
                && next.every((k, i) => k === descriptorVisibleKeys[i]);
              setPersistedVisibleKeys(same ? null : next);
            }}
          />
        </div>
      )}
    </>
  );

  // Type chip only when the doc actually mixes line types — single-type
  // docs (e.g. all `item` rows) keep the mobile cards quieter.
  const showLineType = useMemo(() => {
    const types = new Set<string>();
    for (const line of allLines) {
      const value = (line as Record<string, unknown>).line_type
                 ?? (line as Record<string, unknown>).type;
      if (typeof value === "string" && value.trim()) types.add(value);
    }
    return types.size > 1;
  }, [allLines]);

  const primaryActionSlot = editMode ? (
    <AddItemDropdown
      onAddManual={() => {
        setActiveLine(null);
        setComposerMode("manual");
        setComposerOpen(true);
      }}
      onPickAdapter={(adapter) => setActivePickerAdapter(adapter)}
    />
  ) : undefined;

  const footerSlot = surface.affectsTotals && allLines.length > 0 ? (
    <AmountTotalsFooter lines={allLines} entity={lineEntity} currencyCode={currencyCode} />
  ) : undefined;

  return (
    <div className="flex flex-col">
      <EmbeddedEntityList
        entityCode={lineEntityCode}
        scope={{ parent_id: parentRecordId }}
        dataOverride={rowsForGrid}
        visibleColumnKeys={persistedVisibleKeys ?? undefined}
        clientSearchQuery={lineSearch}
        clientSearchKeys={LINE_SEARCH_KEYS}
        loading={isLoading}
        currencyCode={currencyCode}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        // Stable selection identity — guards against shuffled selection
        // when the user sorts or searches. Draft rows (no persisted id)
        // fall back to index inside EmbeddedEntityList; we accept that
        // their selection isn't stable across re-sorts.
        getRowId={(row, index) => recordId(row as LineRecord) || String(index)}
        onRowClick={handleRowClick}
        renderRowExpansion={expansionEnabled
          ? (row) => renderRowExpansion!(row as LineRecord)
          : undefined}
        getIsRowExpanded={expansionEnabled
          ? (row) => recordId(row as LineRecord) === expandedLineId
          : undefined}
        paginationMode="none"
        // Mobile branch — single-glance row cards below md (768px). Same
        // rows, same selection, same row-click → opens LineItemSheet.
        mobileRows={{
          renderRow: ({ row, selected, setSelected, openRow, entity: lineEnt, currencyCode: cc }) => (
            <LineItemMobileRow
              row={row}
              selected={selected}
              setSelected={setSelected}
              openRow={openRow}
              entity={lineEnt}
              currencyCode={cc}
              showLineType={showLineType}
            />
          ),
          emptyMessage: "No lines",
          virtualized: true,
          virtualRowEstimate: 88,
          virtualOverscan: 8,
        }}
        // Rounded grid container — the toolbar + table + footer read as one
        // unified card. `overflow-hidden` clips the inner toolbar background
        // and table corners to the outer radius.
        className="rounded-lg border border-border overflow-hidden"
        // Two-level header pattern:
        //   - top row (toolbar): subtle muted background, taller padding so
        //     the count + status pills + search + columns picker read as a
        //     distinct band above the table.
        //   - second row (column headers): clean, no per-column sort arrows.
        //     Sort affordance moves to the toolbar in a future Sort drawer.
        toolbarClassName="bg-muted/40 px-5 py-3"
        // Flatten DataTable's default `rounded-md border` so the outer
        // grid's border isn't doubled up with the inner table's chrome.
        // The table container owns horizontal scroll because the outer
        // wrapper clips rounded corners with overflow-hidden.
        tableContainerClassName="border-0 rounded-none overflow-x-auto overflow-y-auto max-h-[min(70dvh,42rem)]"
        pinnedColumns={LINE_GRID_PINNED_COLUMNS}
        virtualized
        virtualRowEstimate={44}
        virtualOverscan={8}
        disableHeaderSort
        slots={{
          header: headerSlot,
          primaryAction: primaryActionSlot,
          footer: footerSlot,
        }}
      />

      {/* Floating selection action bar — shared @athyper/ui primitive via
          surface adapter. Phase 4a is visual-only (Copy / Delete still
          deferred via undefined handlers); phase 4b wires them to the
          bulk-action engine. */}
      <LineItemsSelectionBar
        selectionCount={selectionCount}
        onClearSelection={() => setRowSelection({})}
        editMode={editMode}
      />

      {/* Composer sheet — opens via "+ Add Item" button */}
      <LineItemComposerSheet
        open={composerOpen}
        onOpenChange={setComposerOpen}
        line={activeLine}
        entityCode={entityCode}
        recordId={parentRecordId}
        lineEntityCode={lineEntityCode}
        currencyCode={currencyCode}
        companyCodeId={companyCodeId}
        record={record}
        composerMode={composerMode}
        variantKey={variantKey}
        onMutated={onRefresh}
        onDraftSubmit={(payload) => handleComposerSubmit(payload)}
      />

      {/* Source-adapter picker. Mounted when the user picks an adapter
          from the AddItemDropdown. Stays mounted as long as the user has
          a picker open; closes on Cancel or after a successful commit. */}
      {activePickerAdapter && (
        <SourceAdapterPicker
          adapter={activePickerAdapter}
          parentCtx={parentCtx}
          open={true}
          bindingLabel={`${activePickerAdapter.manifest.label} · ${entityCode}`}
          onClose={() => setActivePickerAdapter(null)}
          onCommit={(rows) => void handlePickerCommit(activePickerAdapter, rows as Array<Record<string, unknown>>)}
        />
      )}

      {/* Editor sheet */}
      {activeLine && (
        <LineItemEditorSheet
          open={editorOpen}
          onOpenChange={setEditorOpen}
          line={activeLine as import("@athyper/api-contracts/documents").DocumentLine}
          distributions={distributions}
          entityCode={entityCode}
          recordId={parentRecordId}
          lineEntityCode={lineEntityCode}
          currencyCode={currencyCode}
          companyCodeId={companyCodeId}
          record={record}
          canEdit={editMode}
          variantKey={variantKey}
          onMutated={onRefresh}
          onDraftSubmit={draftMode ? (payload) => { handleDraftEditorSubmit(payload); } : undefined}
        />
      )}
    </div>
  );
}
