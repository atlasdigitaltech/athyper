/**
 * ExcelView — spreadsheet-style tabular view for EntityListPage
 *
 * Features:
 *   - Column widths persisted to localStorage per entity (Phase 1)
 *   - Drag-to-resize handles; double-click to reset individual column width
 *   - table-layout: fixed so column widths are authoritative; cells truncate with ellipsis
 *   - Pinned columns sticky-left (Phase 2) — user-controlled, persisted to URL / saved views
 *     · Pinned columns render first in their pinned order, then all unpinned columns
 *     · Cumulative sticky left offsets derived from colWidths
 *     · Pin/Unpin icon in column header (visible on hover; always visible when pinned)
 *     · Visual separator (accent shadow) on the last pinned column
 *   - Aggregation footer when aggregations prop is provided
 */
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Pin, PinOff } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import type { ColumnPresentation } from "@athyper/api-contracts/entity-list";
import { listTypography } from "./listPresentation";
import { configuredCodeFieldName, configuredTitleFieldName } from "../metadata/fieldSemantics";

// ── Column width defaults by data_type ────────────────────────────────────────

const DEFAULT_COL_WIDTHS: Record<string, number> = {
  money:    120,
  decimal:  120,
  integer:   90,
  boolean:   70,
  date:     100,
  datetime: 140,
  uuid:     130,
  enum:     130,
  text:     240,
  string:   160,
};
const FALLBACK_WIDTH = 160;
const ROW_NUM_WIDTH  = 36;   // matches left-9 (2.25rem) for the row-# sticky column
const MIN_COL_WIDTH  = 40;

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ExcelViewProps {
  rows:                  Record<string, unknown>[];
  entity:                CompiledEntity;
  /** Ordered list of visible field names. When empty, all entity fields are shown. */
  visibleColumns?:       string[];
  presentationConfig?:   { columns: ColumnPresentation[] };
  onRowClick?:                  (row: Record<string, unknown>) => void;
  onRowContextMenu?:            (row: Record<string, unknown>, e: { clientX: number; clientY: number; preventDefault(): void }) => void;
  onIdentityCellContextMenu?:   (row: Record<string, unknown>, e: React.MouseEvent) => void;
  aggregations?:                Record<string, number | null>;
  loading?:              boolean;
  /** Pinned (frozen) column names — render first and stay sticky. From URL state. */
  pinnedCols?:           string[];
  /** Called when the user pins or unpins a column. Writes back to URL state. */
  onPinnedColsChange?:   (cols: string[]) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ExcelView({
  rows,
  entity,
  visibleColumns,
  presentationConfig,
  onRowClick,
  onRowContextMenu,
  onIdentityCellContextMenu,
  aggregations,
  loading = false,
  pinnedCols = [],
  onPinnedColsChange,
}: ExcelViewProps) {

  const codeFieldName  = configuredCodeFieldName(entity);
  const titleFieldName = configuredTitleFieldName(entity);

  // ── Field resolution ───────────────────────────────────────────────────────
  const allFields = [...entity.fields].sort((a, b) => a.sort_order - b.sort_order);
  const orderedFields = visibleColumns && visibleColumns.length > 0
    ? visibleColumns
        .map((name) => allFields.find((f) => f.name === name))
        .filter((f): f is (typeof allFields)[number] => f != null)
    : allFields;

  const getLabel = (fieldName: string) => {
    const pres = presentationConfig?.columns.find((c) => c.fieldName === fieldName);
    return pres?.label ?? entity.fields.find((f) => f.name === fieldName)?.label ?? fieldName;
  };

  const formatCell = (value: unknown, fieldName: string): string => {
    if (value == null) return "";
    const field = entity.fields.find((f) => f.name === fieldName);
    if (field?.data_type === "money" || field?.data_type === "decimal") {
      const n = typeof value === "number" ? value : parseFloat(String(value));
      if (!isNaN(n)) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (field?.data_type === "date" || field?.data_type === "datetime") {
      const d = new Date(String(value));
      if (!isNaN(d.getTime())) return d.toLocaleDateString();
    }
    return String(value);
  };

  // ── Pinned column layout ───────────────────────────────────────────────────
  const pinnedSet = useMemo(() => new Set(pinnedCols), [pinnedCols]);

  // fieldByName: fast lookup from orderedFields
  const fieldByName = useMemo(
    () => new Map(orderedFields.map((f) => [f.name, f])),
    [orderedFields],
  );

  // ── Column width state — persisted to localStorage ─────────────────────────
  const storageKey = `athyper:${entity.entity_code}:excel:colWidths`;

  const [colWidths, setColWidths] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setColWidths(raw ? (JSON.parse(raw) as Record<string, number>) : {});
    } catch {
      setColWidths({});
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      if (Object.keys(colWidths).length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(colWidths));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch { /* ignore storage quota errors */ }
  }, [colWidths, storageKey]);

  const getColWidth = useCallback(
    (fieldName: string, dataType: string) =>
      colWidths[fieldName] ?? DEFAULT_COL_WIDTHS[dataType] ?? FALLBACK_WIDTH,
    [colWidths],
  );

  // ── Pinned column ordering + sticky offsets ────────────────────────────────
  // pinnedFields: pinned cols in their pinned order (skipping any no longer visible)
  // unpinnedFields: remaining visible cols in their original order
  // displayFields: concat of the two → drives colgroup + thead + tbody
  const { pinnedFields, unpinnedFields, displayFields, stickyOffsets, lastPinnedName } =
    useMemo(() => {
      const pinned   = pinnedCols
        .map((n) => fieldByName.get(n))
        .filter((f): f is (typeof orderedFields)[number] => f != null);
      const unpinned = orderedFields.filter((f) => !pinnedSet.has(f.name));
      const display  = [...pinned, ...unpinned];

      // Cumulative left offset for each pinned column
      let acc = ROW_NUM_WIDTH;
      const offsets = new Map<string, number>();
      for (const f of pinned) {
        offsets.set(f.name, acc);
        acc += getColWidth(f.name, f.data_type);
      }

      return {
        pinnedFields:   pinned,
        unpinnedFields: unpinned,
        displayFields:  display,
        stickyOffsets:  offsets,
        lastPinnedName: pinned.length > 0 ? pinned[pinned.length - 1]!.name : null,
      };
    }, [pinnedCols, pinnedSet, orderedFields, fieldByName, getColWidth]);

  // ── Drag-to-resize ─────────────────────────────────────────────────────────
  const dragState    = useRef<{ fieldName: string; startX: number; startW: number } | null>(null);
  const colWidthsRef = useRef(colWidths);
  useEffect(() => { colWidthsRef.current = colWidths; }, [colWidths]);

  const handleResizeMouseDown = useCallback((
    e: React.MouseEvent,
    fieldName: string,
    dataType: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const startW = colWidthsRef.current[fieldName] ?? DEFAULT_COL_WIDTHS[dataType] ?? FALLBACK_WIDTH;
    dragState.current = { fieldName, startX: e.clientX, startW };

    const onMove = (mv: MouseEvent) => {
      if (!dragState.current) return;
      const delta = mv.clientX - dragState.current.startX;
      const next  = Math.max(MIN_COL_WIDTH, dragState.current.startW + delta);
      setColWidths((prev) => ({ ...prev, [dragState.current!.fieldName]: next }));
    };

    const onUp = () => {
      dragState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  }, []);

  const handleResizeDblClick = useCallback((e: React.MouseEvent, fieldName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setColWidths((prev) => {
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
  }, []);

  // ── Pin / Unpin ────────────────────────────────────────────────────────────
  const handleTogglePin = useCallback((fieldName: string) => {
    if (!onPinnedColsChange) return;
    const next = pinnedSet.has(fieldName)
      ? pinnedCols.filter((n) => n !== fieldName)
      : [...pinnedCols, fieldName];
    onPinnedColsChange(next);
  }, [onPinnedColsChange, pinnedCols, pinnedSet]);

  // ── Total table width ──────────────────────────────────────────────────────
  const totalWidth = useMemo(
    () => ROW_NUM_WIDTH + displayFields.reduce((sum, f) => sum + getColWidth(f.name, f.data_type), 0),
    [displayFields, getColWidth],
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const hasAgg = aggregations && Object.keys(aggregations).length > 0 && rows.length > 0;

  // ── Shared cell classifier (header, body, footer all use this) ─────────────
  const colCls = (fieldName: string) => {
    const isPinned     = pinnedSet.has(fieldName);
    const isLastPinned = fieldName === lastPinnedName;
    return {
      isPinned,
      isLastPinned,
      leftOffset: stickyOffsets.get(fieldName),
      // Visual separator after the last pinned column — stronger shadow than data cols
      separatorShadow: isLastPinned
        ? "shadow-separator-primary"
        : "",
    };
  };

  return (
    <div className="overflow-auto rounded-md border max-h-[calc(100dvh-10rem)] min-h-[50dvh]">
      <table
        className={cn(listTypography.sheet.table, "border-collapse")}
        style={{ width: totalWidth, tableLayout: "fixed" }}
      >
        {/* Authoritative column widths */}
        <colgroup>
          <col style={{ width: ROW_NUM_WIDTH }} />
          {displayFields.map((field) => (
            <col key={field.name} style={{ width: getColWidth(field.name, field.data_type) }} />
          ))}
        </colgroup>

        {/* Sticky header */}
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            {/* Row-number column */}
            <th className={cn("sticky left-0 z-20 border-b border-r bg-muted px-2 py-1 text-right select-none", listTypography.sheet.rowNumber)}>
              #
            </th>

            {displayFields.map((field) => {
              const { isPinned, isLastPinned, leftOffset, separatorShadow } = colCls(field.name);
              const label = getLabel(field.name);

              return (
                <th
                  key={field.name}
                  style={isPinned ? { left: leftOffset } : undefined}
                  className={cn(
                    "relative border-b border-r px-2 py-1 text-left overflow-hidden group/col",
                    listTypography.sheet.header,
                    isPinned && "sticky z-10 bg-muted",
                    separatorShadow,
                  )}
                >
                  <div className="flex items-center gap-0.5 min-w-0">
                    <span className="block truncate flex-1 pr-0.5" title={label}>
                      {label}
                    </span>

                    {/* Pin toggle — always visible when pinned; hover-reveal when not */}
                    {onPinnedColsChange && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleTogglePin(field.name); }}
                        className={cn(
                          "shrink-0 rounded p-0.5 transition-all",
                          isPinned
                            ? "text-primary opacity-70 hover:opacity-100"
                            : "text-muted-foreground opacity-0 group-hover/col:opacity-50 hover:!opacity-100 hover:text-primary",
                        )}
                        title={isPinned ? "Unpin column" : "Pin column"}
                      >
                        {isPinned
                          ? <PinOff className="h-3 w-3" />
                          : <Pin    className="h-3 w-3" />}
                      </button>
                    )}
                  </div>

                  {/* Drag-to-resize handle — right edge */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 group/resize"
                    onMouseDown={(e) => handleResizeMouseDown(e, field.name, field.data_type)}
                    onDoubleClick={(e) => handleResizeDblClick(e, field.name)}
                    title="Drag to resize · Double-click to reset"
                  >
                    <div className="absolute inset-y-1 right-px w-px bg-border group-hover/resize:bg-primary/60 group-active/resize:bg-primary transition-colors" />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={displayFields.length + 1}
                className="h-20 text-center text-sm text-muted-foreground"
              >
                No records
              </td>
            </tr>
          ) : (
            rows.map((row, rowIdx) => (
              <tr
                key={String(row.id ?? rowIdx)}
                className={cn(
                  "border-b hover:bg-primary/5 transition-colors",
                  onRowClick && "cursor-pointer",
                )}
                onClick={() => onRowClick?.(row)}
                onContextMenu={(e) => onRowContextMenu?.(row, e)}
              >
                {/* Row number */}
                <td className={cn("sticky left-0 z-10 border-r bg-background px-2 py-0.5 text-right select-none overflow-hidden", listTypography.sheet.rowNumber)}>
                  {rowIdx + 1}
                </td>

                {displayFields.map((field) => {
                  const { isPinned, leftOffset, separatorShadow } = colCls(field.name);
                  const cellText = formatCell(row[field.name], field.name);
                  const isIdentity =
                    field.name === codeFieldName ||
                    field.name === titleFieldName;
                  return (
                    <td
                      key={field.name}
                      title={cellText || undefined}
                      style={isPinned ? { left: leftOffset } : undefined}
                      className={cn(
                        "border-r px-2 py-0.5 overflow-hidden",
                        listTypography.sheet.cell,
                        isPinned && "sticky z-10 bg-background",
                        separatorShadow,
                        (field.data_type === "money" || field.data_type === "decimal" || field.data_type === "integer")
                          && "text-right tabular-nums",
                      )}
                    >
                      <span
                        className={cn("block truncate", isIdentity && onIdentityCellContextMenu && "cursor-context-menu")}
                        onContextMenu={isIdentity && onIdentityCellContextMenu
                          ? (e) => { e.stopPropagation(); onIdentityCellContextMenu(row, e); }
                          : undefined}
                      >
                        {cellText}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>

        {/* Aggregation footer */}
        {hasAgg && (
          <tfoot className="sticky bottom-0 z-10 border-t-2 bg-muted font-medium">
            <tr>
              <td className={cn("sticky left-0 z-20 border-r bg-muted px-2 py-1 text-right overflow-hidden", listTypography.sheet.rowNumber)}>
                Σ
              </td>
              {displayFields.map((field) => {
                const { isPinned, leftOffset, separatorShadow } = colCls(field.name);
                const val = aggregations![field.name];
                return (
                  <td
                    key={field.name}
                    style={isPinned ? { left: leftOffset } : undefined}
                    className={cn(
                      "border-r px-2 py-1 text-right tabular-nums overflow-hidden",
                      listTypography.sheet.cell,
                      isPinned && "sticky z-10 bg-muted",
                      separatorShadow,
                    )}
                  >
                    {val != null
                      ? val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : null}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
