"use client";

import React from "react";
import { FileText } from "lucide-react";
import { cn } from "@athyper/theme/utils";
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

function ColumnHeader({ column, currencyCode }: { column: MetaLineColumn; currencyCode?: string }) {
  const label = column.field.data_type === "money" && currencyCode
    ? `${column.label} (${currencyCode})`
    : column.label;
  const lineNumber = isLineNumberColumn(column);
  return (
    <th
      className={cn(
        "min-w-0 overflow-hidden py-2.5 text-xs font-medium text-muted-foreground",
        lineNumber ? "px-1 text-center" : cn("px-3", alignClass(column.align)),
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
}: ItemsGridProps) {
  const effectiveColumns = React.useMemo(
    () => normalizeColumns(columns, entity, fields),
    [columns, entity, fields],
  );

  if (lines.length === 0) {
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

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full table-fixed text-sm" style={{ minWidth: `${tableMinWidthRem}rem` }}>
        <colgroup>
          {selectable && <col style={{ width: `${SELECT_COLUMN_WIDTH_REM}rem` }} />}
          {effectiveColumns.map((column) => (
            <col key={column.key} style={{ width: defaultColumnWidth(column) }} />
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
              <ColumnHeader key={column.key} column={column} currencyCode={currencyCode} />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {lines.map((line) => {
            const lineKey = recordId(line as LineRecord);
            const isSelected = selectedLineId === lineKey || selectedIds?.has(lineKey);
            return (
              <tr
                key={lineKey}
                onClick={isInteractive ? () => onLineSelect?.(line) : undefined}
                className={cn(
                  "transition-colors",
                  isInteractive && "cursor-pointer",
                  isSelected ? "bg-accent/50 hover:bg-accent/60" : "hover:bg-muted/30",
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
                {effectiveColumns.map((column) => {
                  const value = columnValue(line, column);
                  const displayValue = formatFieldValue(value, column.field, currencyCode);
                  const wrapsDescription = isDescriptionColumn(column);
                  const lineNumber = isLineNumberColumn(column);
                  return (
                    <td
                      key={column.key}
                      className={cn(
                        "min-w-0 overflow-hidden py-2.5 align-middle text-sm",
                        lineNumber ? "px-1 text-center tabular-nums font-medium" : cn("px-3", alignClass(column.align)),
                        !lineNumber && column.align === "right" && "tabular-nums font-medium",
                      )}
                    >
                      <div
                        className={cn(
                          wrapsDescription
                            ? "whitespace-normal break-words leading-5"
                            : "truncate",
                        )}
                        title={displayValue === "-" ? undefined : displayValue}
                      >
                        {displayValue}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        {hasFooter && (
          <tfoot className="border-t bg-muted/30">
            <tr>
              {selectable && <td className={SELECT_CELL_CLASS} />}
              <td
                colSpan={footerLeadingColSpan}
                className="min-w-0 overflow-hidden px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground"
              >
                <div className="truncate" title={footerLabel}>{footerLabel}</div>
              </td>
              {footerTotalColumns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "min-w-0 overflow-hidden px-3 py-2.5 text-xs font-semibold tabular-nums",
                    alignClass(column.align),
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
