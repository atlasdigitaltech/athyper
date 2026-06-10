"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { fmtAmount } from "@athyper/runtime-shared/core";
import {
  formatFieldValue,
  recordId,
  textValue,
} from "../meta";
import type {
  LinesGridProps,
  LineItemVariantKey,
  MetaLineColumn,
  LineOrganizerConfig,
  LineRecord,
} from "../types";
import {
  buildProcureColumnCatalog,
  normalizeProcureDraftLine,
  resolveProcureGridSummary,
} from "../variants/procure";
import { buildSalesColumnCatalog } from "../variants/sales";
import { buildGenericColumnCatalog } from "../variants/generic";
import { LineItemComposerSheet, LineItemEditorSheet } from "../components/LineItemSheet";

// ─────────────────────────────────────────────────────────────────────────────
// COLUMN HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function resolveColumnCatalog(
  lineEntity: LinesGridProps["entity"] | null,
  lineEntityCode: string,
  variantKey: LineItemVariantKey,
): MetaLineColumn[] {
  // Check display_config for explicit line entity metadata
  const lineEntityMeta = (lineEntity as Record<string, unknown> | null | undefined)?.[lineEntityCode] as
    import("@athyper/api-contracts/metadata").CompiledEntity | undefined;

  if (variantKey === "procure") return buildProcureColumnCatalog(lineEntityMeta ?? null);
  if (variantKey === "sales")   return buildSalesColumnCatalog(lineEntityMeta ?? null);
  return buildGenericColumnCatalog(lineEntityMeta ?? null);
}

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

// ─────────────────────────────────────────────────────────────────────────────
// FLOATING SELECTION BAR
// ─────────────────────────────────────────────────────────────────────────────

function FloatingSelectionBar({
  selectedIds,
  onClearSelection,
  onDeleteSelected,
  onCopySelected,
  editMode,
}: {
  selectedIds:      Set<string>;
  onClearSelection: () => void;
  onDeleteSelected?: () => void;
  onCopySelected?:   () => void;
  editMode?:         boolean;
}) {
  const count = selectedIds.size;
  if (count === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-background px-4 py-2 shadow-lg shadow-black/10 ring-1 ring-border/20">
        <span className="text-xs font-medium text-foreground">
          {count} {count === 1 ? "line" : "lines"} selected
        </span>
        <span className="h-4 w-px bg-border/40" />
        {editMode && onCopySelected && (
          <button
            type="button"
            onClick={onCopySelected}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Copy
          </button>
        )}
        {editMode && onDeleteSelected && (
          <button
            type="button"
            onClick={onDeleteSelected}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            Delete
          </button>
        )}
        <button
          type="button"
          onClick={onClearSelection}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD ITEM DROPDOWN BUTTON
// ─────────────────────────────────────────────────────────────────────────────

function AddItemDropdown({
  onAddItem,
  disabled,
}: {
  onAddItem: (mode: "manual" | "catalog") => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative flex">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(false); onAddItem("manual"); }}
        className="flex h-7 items-center gap-1.5 rounded-l-lg bg-foreground pl-3 pr-2.5 text-xs font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Add Item
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-label="More add options"
        className="flex h-7 items-center rounded-r-lg border-l border-background/20 bg-foreground px-1.5 text-background transition-opacity hover:opacity-85 disabled:opacity-40"
      >
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-md">
          <button
            type="button"
            onClick={() => { setOpen(false); onAddItem("manual"); }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Add Item
          </button>
          <button
            type="button"
            disabled
            className="flex w-full cursor-not-allowed items-center gap-2.5 px-3 py-2 text-left text-xs text-muted-foreground/40"
          >
            <ShoppingBag className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Add Catalog Item
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LINES TABLE
// ─────────────────────────────────────────────────────────────────────────────

function LinesTable({
  lines,
  columns,
  selectedIds,
  onRowClick,
  onSelectionChange,
  currencyCode,
  isLoading,
  editMode,
}: {
  lines:            LineRecord[];
  columns:          MetaLineColumn[];
  selectedIds:      Set<string>;
  onRowClick:       (line: LineRecord) => void;
  onSelectionChange: (id: string, checked: boolean) => void;
  currencyCode?:    string;
  isLoading?:       boolean;
  editMode?:        boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-muted-foreground animate-pulse">Loading lines…</div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">No lines yet.</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/40">
            {editMode && (
              <th className="w-10 py-2.5 pl-4 pr-2 text-left">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded accent-foreground"
                  checked={selectedIds.size === lines.length && lines.length > 0}
                  onChange={(e) => {
                    for (const line of lines) {
                      const id = recordId(line);
                      if (id) onSelectionChange(id, e.target.checked);
                    }
                  }}
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "whitespace-nowrap px-3 py-2.5 text-xs font-medium text-muted-foreground",
                  col.align === "right" ? "text-right" : "text-left",
                )}
                style={{ minWidth: col.minWidth, width: col.width }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => {
            const id       = recordId(line);
            const selected = selectedIds.has(id);
            return (
              <tr
                key={id || i}
                onClick={() => onRowClick(line)}
                className={cn(
                  "cursor-pointer border-b border-border/20 transition-colors last:border-b-0",
                  selected ? "bg-muted/30" : "hover:bg-muted/10",
                )}
              >
                {editMode && (
                  <td className="w-10 py-2.5 pl-4 pr-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded accent-foreground"
                      checked={selected}
                      onChange={(e) => id && onSelectionChange(id, e.target.checked)}
                    />
                  </td>
                )}
                {columns.map((col) => {
                  let cellValue: ReactNode;
                  if (col.renderCell) {
                    cellValue = col.renderCell(line, currencyCode);
                  } else if (col.field) {
                    const raw = (line as Record<string, unknown>)[col.key] ?? (line as Record<string, unknown>)[col.field.name];
                    const formatted = formatFieldValue(raw, col.field, currencyCode);
                    cellValue = (
                      <span className={formatted === "-" ? "text-muted-foreground/40" : undefined}>
                        {formatted}
                      </span>
                    );
                  } else {
                    const raw = (line as Record<string, unknown>)[col.key];
                    cellValue = raw != null ? String(raw) : <span className="text-muted-foreground/40">—</span>;
                  }
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        "px-3 py-2.5 text-sm",
                        col.align === "right" ? "text-right tabular-nums" : "text-left",
                      )}
                    >
                      {cellValue}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AMOUNT TOTALS FOOTER
// ─────────────────────────────────────────────────────────────────────────────

function AmountTotalsFooter({
  lines,
  columns,
  currencyCode,
}: {
  lines:       LineRecord[];
  columns:     MetaLineColumn[];
  currencyCode?: string;
}) {
  const numericColumns = columns.filter((c) => c.numeric && c.field);
  if (numericColumns.length === 0) return null;

  const totals = useMemo(
    () => numericColumns.map((col) => ({
      key:   col.key,
      label: col.label,
      total: lines.reduce((sum, line) => {
        const raw = (line as Record<string, unknown>)[col.key] ?? (line as Record<string, unknown>)[col.field!.name];
        const n   = Number(raw ?? 0);
        return Number.isFinite(n) ? sum + n : sum;
      }, 0),
    })),
    [lines, numericColumns],
  );

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
}: LinesGridProps) {
  const [composerOpen,  setComposerOpen]  = useState(false);
  const [composerMode,  setComposerMode]  = useState<"manual" | "catalog">("manual");
  const [editorOpen,    setEditorOpen]    = useState(false);
  const [activeLine,    setActiveLine]    = useState<LineRecord | null>(null);
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set());
  const [draftLines,    setDraftLines]    = useState<LineRecord[]>([]);

  const displayConfig = entity ? (entity.display_config as Record<string, unknown> | null | undefined) : null;
  const variantKey = resolveVariantKey(displayConfig, entityCode, lineEntityCode);

  // For draft mode, merge server lines + draft lines
  const allLines = draftMode ? [...lines, ...draftLines] : lines;

  // Use procure catalog for procure, sales for sales, generic otherwise
  const lineEntity = null; // We don't pre-fetch the line entity here; sheets handle it
  const columns = useMemo(() => {
    if (variantKey === "procure") return buildProcureColumnCatalog(null);
    if (variantKey === "sales")   return buildSalesColumnCatalog(null);
    return buildGenericColumnCatalog(null);
  }, [variantKey]);

  const summaryItems = useMemo(() => {
    if (variantKey !== "procure") return null;
    return resolveProcureGridSummary(allLines);
  }, [allLines, variantKey]);

  function handleRowClick(line: LineRecord) {
    setActiveLine(line);
    setEditorOpen(true);
  }

  function handleSelectionChange(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handleDraftComposerSubmit(payload: Record<string, unknown>): void {
    const normalized = variantKey === "procure"
      ? normalizeProcureDraftLine(payload, null)
      : payload;
    const newLine = { id: `draft-${Date.now()}`, line_number: allLines.length + 1, ...normalized } as LineRecord;
    const next = [...draftLines, newLine];
    setDraftLines(next);
    onDraftLinesChange?.([...lines, ...next]);
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

  return (
    <div className="flex flex-col">
      {/* Toolbar — line count, status badges, add button */}
      <div className="flex items-center gap-2 border-b border-border/30 px-4 py-2.5">
        {/* Left: count + status */}
        <div className="flex min-w-0 flex-1 items-center gap-0 overflow-x-auto text-xs">
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
        </div>

        {/* Right: add item */}
        {editMode && (
          <AddItemDropdown
            onAddItem={(mode) => {
              setActiveLine(null);
              setComposerMode(mode);
              setComposerOpen(true);
            }}
          />
        )}
      </div>

      {/* Grid */}
      <LinesTable
        lines={allLines}
        columns={columns}
        selectedIds={selectedIds}
        onRowClick={handleRowClick}
        onSelectionChange={handleSelectionChange}
        currencyCode={currencyCode}
        isLoading={isLoading}
        editMode={editMode}
      />

      {/* Totals footer */}
      {surface.affectsTotals && allLines.length > 0 && (
        <AmountTotalsFooter lines={allLines} columns={columns} currencyCode={currencyCode} />
      )}

      {/* Floating selection action bar */}
      <FloatingSelectionBar
        selectedIds={selectedIds}
        onClearSelection={() => setSelectedIds(new Set())}
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
        onDraftSubmit={draftMode ? (payload) => { handleDraftComposerSubmit(payload); } : undefined}
      />

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
