"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { FileText, RotateCcw, X } from "lucide-react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@athyper/theme/utils";
import { useEditDraftContext } from "@athyper/content-ui";
import type { AccountingDistribution, DocumentLine } from "@athyper/api-contracts/documents";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import {
  type LineRecord,
  type MetaLineAlign,
  type MetaLineColumn,
  fieldLabel,
  formatFieldValue,
  recordId,
  recordValue,
  resolveLineColumns,
} from "./metaLineRuntime";

export type ItemsGridColumn =
  | string
  | {
      field: string;
      label?: string;
      align?: MetaLineAlign;
      width?: string | number;
      path?: string;
      aggregate?: "sum" | "count";
    };

export interface ItemsGridProps {
  lines: DocumentLine[];
  columns?: ItemsGridColumn[];
  entity?: CompiledEntity | null;
  fields?: EntityField[];
  currencyCode?: string;
  distributions?: AccountingDistribution[];
  selectedLineId?: string;
  selectedIds?: Set<string>;
  selectable?: boolean;
  allSelected?: boolean;
  onToggleLine?: (lineId: string) => void;
  onToggleAll?: () => void;
  onLineSelect?: (line: DocumentLine) => void;
  /**
   * Phase 11 #8: priority column names shown on narrow viewports.
   * When set, columns NOT in this list are hidden via `hidden md:table-cell`.
   * When undefined (default), all columns visible at every size.
   * Sourced from `entity.display_config.mobile_columns`.
   */
  mobileColumns?: string[];
}

function alignForField(field?: EntityField): MetaLineAlign {
  if (!field) return "left";
  if (["integer", "bigint", "decimal", "numeric", "money"].includes(field.data_type)) return "right";
  if (field.data_type === "boolean") return "center";
  return "left";
}

function normalizeColumns(
  columns: ItemsGridColumn[] | undefined,
  entity: CompiledEntity | null | undefined,
  fields: EntityField[] | undefined,
): MetaLineColumn[] {
  if (columns?.length) {
    const fieldsByName = new Map((fields ?? entity?.fields ?? []).map((field) => [field.name, field]));
    return columns.flatMap((column, index): MetaLineColumn[] => {
      const config = typeof column === "string" ? { field: column } : column;
      const field = fieldsByName.get(config.field);
      if (field) {
        return [{
          key: field.name,
          field,
          label: config.label ?? fieldLabel(field),
          align: config.align ?? alignForField(field),
          width: config.width,
          valuePath: config.path,
          aggregate: config.aggregate ?? (field.is_aggregatable ? "sum" : undefined),
          sortOrder: index,
        }];
      }

      const syntheticField = {
        id: config.field,
        name: config.field,
        column_name: config.field,
        label: config.label ?? config.field,
        description: null,
        data_type: "string",
        ui_type: null,
        format: null,
        unit: null,
        cardinality: "one",
        origin: "business",
        is_required: false,
        is_readonly: false,
        is_unique: false,
        is_searchable: false,
        is_filterable: false,
        is_sortable: false,
        is_groupable: false,
        is_aggregatable: false,
        is_pii: false,
        default_value: null,
        validation_rules: null,
        enum_domain_code: null,
        reference_config: null,
        sort_order: index,
        group_key: null,
        i18n_key: null,
      } satisfies EntityField;

      return [{
        key: config.field,
        field: syntheticField,
        label: config.label ?? config.field,
        align: config.align ?? "left",
        width: config.width,
        valuePath: config.path,
        aggregate: config.aggregate,
        sortOrder: index,
      }];
    });
  }

  if (entity) return resolveLineColumns(entity);
  if (fields?.length) {
    return fields
      .map((field, index) => ({
        key: field.name,
        field,
        label: fieldLabel(field),
        align: alignForField(field),
        aggregate: field.is_aggregatable ? "sum" as const : undefined,
        sortOrder: field.sort_order ?? index,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return [];
}

function isDescriptionColumn(column: MetaLineColumn): boolean {
  const name = column.field.name.toLowerCase();
  const label = column.label.toLowerCase();
  return name.includes("description") || label.includes("description");
}

function isLineNumberColumn(column: MetaLineColumn): boolean {
  const name = column.field.name.toLowerCase();
  return name === "line_number" || name === "line_no" || name === "line_num" || column.label === "#";
}

const SELECT_COLUMN_WIDTH_REM = 2.25;

/**
 * Above this row count (lines + pending creates), ItemsGrid switches from
 * full-DOM rendering to a windowed render via `useWindowVirtualizer`. Below
 * this threshold the classic render path runs unchanged — virtualization
 * has overhead (spacer rows, measureElement) that isn't worth paying on
 * small grids.
 */
const VIRTUALIZE_THRESHOLD = 50;

/**
 * Initial row-height estimate used by the virtualizer before measureElement
 * captures actual sizes. Tuned for `py-2.5` (10+10) + text-sm leading (~24) =
 * ~44px display rows. Slight underestimation is preferred to slight over —
 * scrolling produces top-pad correction faster than bottom-pad.
 */
const ESTIMATED_ROW_HEIGHT = 44;
const LINE_NUMBER_MIN_WIDTH_REM = 2.5;
const SELECT_CELL_CLASS = "w-9 px-1 py-2.5 text-center align-middle";

function firstTrackToken(width: string): string | undefined {
  const normalized = width.trim();
  const minmaxMatch = normalized.match(/^minmax\(([^,]+),/i);
  if (minmaxMatch?.[1]) return minmaxMatch[1].trim();
  const clampMatch = normalized.match(/^clamp\(([^,]+),/i);
  if (clampMatch?.[1]) return clampMatch[1].trim();
  return normalized;
}

function remFromWidthHint(width: string): number | undefined {
  const token = firstTrackToken(width);
  if (!token) return undefined;
  if (token.endsWith("rem")) return Number.parseFloat(token);
  if (token.endsWith("px")) return Number.parseFloat(token) / 16;
  if (token.endsWith("ch")) return Number.parseFloat(token) * 0.5;
  return undefined;
}

function defaultColumnWidth(column: MetaLineColumn): string | undefined {
  if (column.width != null) {
    const parsedWidthRem = typeof column.width === "number"
      ? column.width / 16
      : remFromWidthHint(column.width);
    if (isLineNumberColumn(column) && parsedWidthRem != null && parsedWidthRem < LINE_NUMBER_MIN_WIDTH_REM) {
      return `${LINE_NUMBER_MIN_WIDTH_REM}rem`;
    }
    if (typeof column.width === "number") return `${column.width}px`;
    return firstTrackToken(column.width);
  }
  if (isLineNumberColumn(column)) return `${LINE_NUMBER_MIN_WIDTH_REM}rem`;
  if (isDescriptionColumn(column)) return undefined;
  if (column.align === "right") return "9rem";
  if (column.align === "center") return "7rem";
  return "12rem";
}

function defaultColumnMinRem(column: MetaLineColumn): number {
  const lineNumber = isLineNumberColumn(column);
  if (column.width != null) {
    if (typeof column.width === "number") {
      const parsed = column.width / 16;
      return lineNumber ? Math.max(LINE_NUMBER_MIN_WIDTH_REM, parsed) : Math.max(4, parsed);
    }
    const parsed = remFromWidthHint(column.width);
    if (parsed != null && Number.isFinite(parsed)) {
      return lineNumber ? Math.max(LINE_NUMBER_MIN_WIDTH_REM, parsed) : Math.max(4, parsed);
    }
  }
  if (lineNumber) return LINE_NUMBER_MIN_WIDTH_REM;
  if (isDescriptionColumn(column)) return 18;
  if (column.align === "right") return 9;
  if (column.align === "center") return 7;
  return 12;
}

function alignClass(align: MetaLineAlign): string {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

function columnValue(line: DocumentLine, column: MetaLineColumn): unknown {
  return recordValue(line as LineRecord, column.valuePath ?? column.field);
}

function ColumnHeader({
  column,
  currencyCode,
  hiddenOnMobile,
}: {
  column: MetaLineColumn;
  currencyCode?: string;
  hiddenOnMobile?: boolean;
}) {
  const label = column.field.data_type === "money" && currencyCode
    ? `${column.label} (${currencyCode})`
    : column.label;
  const lineNumber = isLineNumberColumn(column);
  return (
    <th
      className={cn(
        "min-w-0 overflow-hidden py-2.5 text-xs font-medium text-muted-foreground",
        lineNumber ? "px-1 text-center" : cn("px-3", alignClass(column.align)),
        hiddenOnMobile && "hidden md:table-cell",
      )}
      style={{ width: defaultColumnWidth(column) }}
    >
      <div className="truncate" title={label}>{label}</div>
    </th>
  );
}

export function ItemsGrid({
  lines,
  columns,
  entity,
  fields,
  currencyCode,
  selectedLineId,
  selectedIds,
  selectable,
  allSelected,
  onToggleLine,
  onToggleAll,
  onLineSelect,
  mobileColumns,
}: ItemsGridProps) {
  // Phase 11 #8: narrow-viewport column visibility set. Columns NOT listed
  // here get `hidden md:table-cell` so they appear at >= md but hide below.
  // null = no filter (all columns at every size).
  const mobileSet = mobileColumns && mobileColumns.length > 0
    ? new Set(mobileColumns)
    : null;
  const hideOnMobile = (columnFieldName: string): boolean =>
    mobileSet !== null && !mobileSet.has(columnFieldName);
  // Phase 6b: optional read of the document Edit Session. When present and in
  // edit mode, per-row visual state surfaces pending creates / updates /
  // deletes so the user can see what will be committed on Save without
  // scrolling away or opening detail sheets.
  //
  // Returns `null` outside an EditDraftProvider OR when the provider value
  // is `null` (object-page mode but not actively editing). Classic-tabs and
  // read-only renders see no behavior change.
  const editSession = useEditDraftContext();
  const pendingLineDeletes = editSession?.pendingLineDeletes;
  const pendingLineUpdates = editSession?.pendingLineUpdates;
  const pendingLineCreates = editSession?.pendingLineCreates;

  // Phase 6d: parse line-keyed validation errors from the session into a
  // per-line / per-field lookup. Server returns errors keyed `line:<id>:<field>`
  // when a transactional save fails on a specific line operation; we surface
  // them as cell-level highlights with inline tooltips so the user sees the
  // failure where it happened rather than just a banner above the grid.
  const lineFieldErrors = React.useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    const errors = editSession?.fieldErrors;
    if (!errors) return map;
    for (const [key, message] of Object.entries(errors)) {
      if (!key.startsWith("line:")) continue;
      const rest = key.slice("line:".length);
      const colonIdx = rest.indexOf(":");
      if (colonIdx <= 0) continue;
      const lineId   = rest.slice(0, colonIdx);
      const fieldName = rest.slice(colonIdx + 1);
      if (!fieldName) continue;
      let perLine = map.get(lineId);
      if (!perLine) {
        perLine = new Map();
        map.set(lineId, perLine);
      }
      perLine.set(fieldName, message);
    }
    return map;
  }, [editSession?.fieldErrors]);

  const effectiveColumns = React.useMemo(
    () => normalizeColumns(columns, entity, fields),
    [columns, entity, fields],
  );

  if (lines.length === 0 && !(pendingLineCreates && pendingLineCreates.length > 0)) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <FileText className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No records</p>
      </div>
    );
  }

  if (effectiveColumns.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <FileText className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No line columns are configured.</p>
      </div>
    );
  }

  const totals = new Map<string, number>();
  for (const column of effectiveColumns) {
    if (column.aggregate !== "sum") continue;
    totals.set(
      column.key,
      lines.reduce((sum, line) => sum + (Number(columnValue(line, column)) || 0), 0),
    );
  }

  const hasFooter = totals.size > 0;
  const isInteractive = Boolean(onLineSelect);
  const footerLabel = `${lines.length} record${lines.length !== 1 ? "s" : ""}`;
  const firstTotalColumnIndex = effectiveColumns.findIndex((column) => totals.has(column.key));
  const footerLeadingColSpan = firstTotalColumnIndex > 0 ? firstTotalColumnIndex : 1;
  const footerTotalColumns = effectiveColumns.slice(firstTotalColumnIndex > 0 ? firstTotalColumnIndex : 1);
  const tableMinWidthRem = Math.max(
    36,
    (selectable ? SELECT_COLUMN_WIDTH_REM : 0) + effectiveColumns.reduce((sum, column) => sum + defaultColumnMinRem(column), 0),
  );

  // ── Phase 6e: Virtualization ─────────────────────────────────────────────
  // For grids above VIRTUALIZE_THRESHOLD rows, switch from full DOM rendering
  // to a windowed render via @tanstack/react-virtual's useWindowVirtualizer.
  // Document scroll is the source of truth (matching the existing sticky-thead
  // behavior); the page is what the user scrolls.
  //
  // measureElement updates row sizes dynamically — important once inline-edit
  // rows land in a future phase since editing rows can be taller than display
  // rows. For now all rows are display-only and ESTIMATED_ROW_HEIGHT suffices.
  //
  // Rows below the threshold render through the classic path unchanged so
  // the typical small-document UX has zero behavioral change.
  const pendingCreateCount = pendingLineCreates?.length ?? 0;
  const allRowsCount = lines.length + pendingCreateCount;
  const shouldVirtualize = allRowsCount > VIRTUALIZE_THRESHOLD;

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Capture the table's offset from document top so the virtualizer's scroll
  // math accounts for content above the table (page header, document chrome,
  // overview section, etc.). Re-runs when virtualization toggles or row count
  // crosses the threshold; further layout shifts (window resize, expand /
  // collapse of header) are not auto-tracked — acceptable for v1.
  useLayoutEffect(() => {
    if (!shouldVirtualize || !tableContainerRef.current) return;
    const measured = tableContainerRef.current.offsetTop;
    if (measured !== scrollMargin) setScrollMargin(measured);
  }, [shouldVirtualize, allRowsCount, scrollMargin]);

  const virtualizer = useWindowVirtualizer({
    count: shouldVirtualize ? allRowsCount : 0,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 10,
    scrollMargin,
  });

  const virtualItems = shouldVirtualize ? virtualizer.getVirtualItems() : [];
  const totalSize = shouldVirtualize ? virtualizer.getTotalSize() : 0;
  const topPad = virtualItems[0]?.start ?? 0;
  const bottomPad = totalSize > 0
    ? Math.max(0, totalSize - (virtualItems[virtualItems.length - 1]?.end ?? 0))
    : 0;
  const cellSpan = (selectable ? 1 : 0) + effectiveColumns.length;

  // ── Row renderers ────────────────────────────────────────────────────────
  // Extracted to keep the classic and virtualized tbody bodies in sync.
  // Both paths share the same per-row JSX; the virtualized path adds
  // `ref` (for measureElement) and `data-index` (for virtualizer bookkeeping).
  function renderLineRow(
    line: DocumentLine,
    rowProps: { virtualRef?: (el: Element | null) => void; virtualIndex?: number } = {},
  ): React.ReactNode {
    const lineKey = recordId(line as LineRecord);
    const isSelected = selectedLineId === lineKey || selectedIds?.has(lineKey);
    const isPendingDelete = Boolean(pendingLineDeletes?.includes(lineKey));
    const isPendingUpdate = Boolean(pendingLineUpdates && lineKey in pendingLineUpdates);
    const rowState: "clean" | "pendingUpdate" | "pendingDelete" =
      isPendingDelete ? "pendingDelete"
      : isPendingUpdate ? "pendingUpdate"
      : "clean";
    const rowErrors = lineFieldErrors.get(lineKey);
    const rowHasError = Boolean(rowErrors && rowErrors.size > 0);
    return (
      <tr
        key={lineKey}
        ref={rowProps.virtualRef as React.Ref<HTMLTableRowElement>}
        data-index={rowProps.virtualIndex}
        data-row-state={rowState}
        onClick={isInteractive ? () => onLineSelect?.(line) : undefined}
        className={cn(
          "group/row relative transition-colors",
          isInteractive && "cursor-pointer",
          isSelected ? "bg-accent/50 hover:bg-accent/60" : "hover:bg-muted/30",
          rowState === "pendingUpdate" && "bg-primary/[0.04]",
          rowState === "pendingDelete" && "bg-destructive/[0.05] line-through text-muted-foreground/70",
          rowHasError && "ring-1 ring-inset ring-destructive/30 bg-destructive/[0.04]",
        )}
      >
        {selectable && (
          <td className={SELECT_CELL_CLASS} onClick={(event) => event.stopPropagation()}>
            <input
              type="checkbox"
              checked={Boolean(selectedIds?.has(lineKey))}
              onChange={() => onToggleLine?.(lineKey)}
              className="h-3.5 w-3.5 rounded border-border"
            />
          </td>
        )}
        {effectiveColumns.map((column, columnIndex) => {
          const value = columnValue(line, column);
          const displayValue = formatFieldValue(value, column.field, currencyCode);
          const wrapsDescription = isDescriptionColumn(column);
          const lineNumber = isLineNumberColumn(column);
          const isLastColumn = columnIndex === effectiveColumns.length - 1;
          const cellError = rowErrors?.get(column.field.name);
          return (
            <td
              key={column.key}
              className={cn(
                "min-w-0 overflow-hidden py-2.5 align-middle text-sm",
                lineNumber ? "px-1 text-center tabular-nums font-medium" : cn("px-3", alignClass(column.align)),
                !lineNumber && column.align === "right" && "tabular-nums font-medium",
                isLastColumn && rowState !== "clean" && "relative pr-9",
                cellError && "bg-destructive/[0.08] text-destructive",
                hideOnMobile(column.field.name) && "hidden md:table-cell",
              )}
              title={cellError ?? undefined}
              data-cell-error={cellError ? "" : undefined}
            >
              <div
                className={cn(
                  wrapsDescription ? "whitespace-normal break-words leading-5" : "truncate",
                )}
                title={cellError ?? (displayValue === "-" ? undefined : displayValue)}
              >
                {displayValue}
              </div>
              {isLastColumn && rowState !== "clean" && editSession && (
                <button
                  type="button"
                  aria-label={rowState === "pendingDelete" ? "Undo delete" : "Discard changes"}
                  title={rowState === "pendingDelete" ? "Undo delete" : "Discard changes"}
                  onClick={(event) => {
                    event.stopPropagation();
                    editSession.resetLine(lineKey);
                  }}
                  className="absolute right-2 top-1/2 inline-flex size-8 md:size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </td>
          );
        })}
      </tr>
    );
  }

  function renderCreateRow(
    draft: Record<string, unknown>,
    index: number,
    rowProps: { virtualRef?: (el: Element | null) => void; virtualIndex?: number } = {},
  ): React.ReactNode {
    const rowKey = `__pending_create_${index}`;
    return (
      <tr
        key={rowKey}
        ref={rowProps.virtualRef as React.Ref<HTMLTableRowElement>}
        data-index={rowProps.virtualIndex}
        data-row-state="pendingCreate"
        className="group/row relative bg-primary/[0.06] italic text-foreground/90"
      >
        {selectable && <td className={SELECT_CELL_CLASS} />}
        {effectiveColumns.map((column, columnIndex) => {
          const value = recordValue(draft as LineRecord, column.valuePath ?? column.field);
          const displayValue = formatFieldValue(value, column.field, currencyCode);
          const wrapsDescription = isDescriptionColumn(column);
          const lineNumber = isLineNumberColumn(column);
          const isLastColumn = columnIndex === effectiveColumns.length - 1;
          return (
            <td
              key={column.key}
              className={cn(
                "min-w-0 overflow-hidden py-2.5 align-middle text-sm",
                lineNumber ? "px-1 text-center tabular-nums font-medium" : cn("px-3", alignClass(column.align)),
                !lineNumber && column.align === "right" && "tabular-nums font-medium",
                isLastColumn && "relative pr-9",
                hideOnMobile(column.field.name) && "hidden md:table-cell",
              )}
            >
              <div
                className={cn(
                  wrapsDescription ? "whitespace-normal break-words leading-5" : "truncate",
                )}
                title={displayValue === "-" ? undefined : displayValue}
              >
                {lineNumber && !value ? "+" : displayValue}
              </div>
              {isLastColumn && editSession && (
                <button
                  type="button"
                  aria-label="Remove draft line"
                  title="Remove draft line"
                  onClick={(event) => {
                    event.stopPropagation();
                    editSession.removePendingCreate(index);
                  }}
                  className="absolute right-2 top-1/2 inline-flex size-8 md:size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </td>
          );
        })}
      </tr>
    );
  }

  return (
    <div ref={tableContainerRef} className="min-w-0 overflow-x-auto">
      <table className="w-full table-fixed text-sm" style={{ minWidth: `${tableMinWidthRem}rem` }}>
        <colgroup>
          {selectable && <col style={{ width: `${SELECT_COLUMN_WIDTH_REM}rem` }} />}
          {effectiveColumns.map((column) => (
            <col
              key={column.key}
              style={{ width: defaultColumnWidth(column) }}
              className={cn(hideOnMobile(column.field.name) && "hidden md:table-column")}
            />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 border-b bg-muted">
          <tr>
            {selectable && (
              <th className={SELECT_CELL_CLASS} onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={Boolean(allSelected)}
                  onChange={() => onToggleAll?.()}
                  className="h-3.5 w-3.5 rounded border-border"
                  aria-label="Select all"
                />
              </th>
            )}
            {effectiveColumns.map((column) => (
              <ColumnHeader
                key={column.key}
                column={column}
                currencyCode={currencyCode}
                hiddenOnMobile={hideOnMobile(column.field.name)}
              />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {shouldVirtualize ? (
            <>
              {/* Top spacer absorbs the scroll offset for rows above the
                  current viewport. Spans all columns. */}
              {topPad > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={cellSpan} style={{ height: topPad, padding: 0 }} />
                </tr>
              )}
              {virtualItems.map((vi) => {
                const measure = virtualizer.measureElement as (el: Element | null) => void;
                if (vi.index < lines.length) {
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  const line = lines[vi.index]!;
                  return renderLineRow(line, { virtualRef: measure, virtualIndex: vi.index });
                }
                const createIdx = vi.index - lines.length;
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const draft = pendingLineCreates![createIdx]!;
                return renderCreateRow(draft, createIdx, { virtualRef: measure, virtualIndex: vi.index });
              })}
              {/* Bottom spacer reserves space for rows below the viewport. */}
              {bottomPad > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={cellSpan} style={{ height: bottomPad, padding: 0 }} />
                </tr>
              )}
            </>
          ) : (
            <>
              {lines.map((line) => renderLineRow(line))}
              {/* Phase 6b: pending creates appended as rendered rows. These have
                  no server ID yet; the synthetic row key is __pending_create_N.
                  Selection / click handlers are intentionally not wired — the
                  underlying record is a temp object, not a DocumentLine. */}
              {pendingLineCreates?.map((draft, index) => renderCreateRow(draft, index))}
            </>
          )}
        </tbody>
        {hasFooter && (
          <tfoot className="border-t bg-muted/30">
            <tr>
              {selectable && <td className={SELECT_CELL_CLASS} />}
              <td
                colSpan={footerLeadingColSpan}
                className="min-w-0 overflow-hidden px-3 py-2.5 text-left text-xs font-medium text-muted-foreground"
              >
                <div className="truncate" title={footerLabel}>{footerLabel}</div>
              </td>
              {footerTotalColumns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "min-w-0 overflow-hidden px-3 py-2.5 text-xs font-medium tabular-nums",
                    alignClass(column.align),
                    hideOnMobile(column.field.name) && "hidden md:table-cell",
                  )}
                >
                  <div className="truncate">
                    {totals.has(column.key)
                      ? formatFieldValue(totals.get(column.key), column.field, currencyCode)
                      : ""}
                  </div>
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
