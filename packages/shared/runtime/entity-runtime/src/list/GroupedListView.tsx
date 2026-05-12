"use client";

/**
 * GroupedListView — table list with visual group-header rows
 *
 * Used when viewMode === "list" and state.group is set.
 * Groups the current page's rows by groupFieldName, rendering a colored
 * section header (collapsible) before each group's data rows.
 *
 * Counts:
 *   - groupCounts (server-provided) → shown as the authoritative total.
 *   - Falls back to local row count when groupCounts is absent.
 *   - When a group spans multiple pages (pageCount < serverTotal), shows
 *     a "(N shown)" indicator next to the total.
 *
 * Group ordering:
 *   columnOrder → count-desc → Unassigned always last.
 *
 * Cell rendering mirrors EntityListPage: resolveFieldRenderer + RuntimeStatusText
 * for semantic-resolver columns.
 */

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { resolveRuntimeStatusColors, RuntimeStatusText, listTypography } from "./listPresentation";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import type { ColumnPresentation } from "@athyper/api-contracts/entity-list";
import { resolveFieldRenderer } from "../field-renderers/registry";
import { configuredCodeFieldName, configuredTitleFieldName } from "../metadata/fieldSemantics";

// ── Helpers ───────────────────────────────────────────────────────────────────

const UNASSIGNED_KEY = "__unassigned__";

function getGroupValue(row: Record<string, unknown>, fieldName: string): string {
  const v = row[fieldName];
  if (v === null || v === undefined || v === "") return UNASSIGNED_KEY;
  return String(v);
}

function orderGroups(
  groups: Map<string, Record<string, unknown>[]>,
  groupCounts: Record<string, number> | undefined,
  columnOrder: string[] | undefined,
): [string, Record<string, unknown>[]][] {
  const assigned   = Array.from(groups.entries()).filter(([k]) => k !== UNASSIGNED_KEY);
  const unassigned = Array.from(groups.entries()).filter(([k]) => k === UNASSIGNED_KEY);

  if (columnOrder?.length) {
    const ordered: [string, Record<string, unknown>[]][] = [];
    for (const key of columnOrder) {
      const entry = groups.get(key);
      if (entry) ordered.push([key, entry]);
    }
    for (const [key, rows] of assigned) {
      if (!columnOrder.includes(key)) ordered.push([key, rows]);
    }
    return [...ordered, ...unassigned];
  }

  // Sort by server total (if available) else local count, descending
  assigned.sort(([ka, a], [kb, b]) => {
    const ca = groupCounts?.[ka] ?? a.length;
    const cb = groupCounts?.[kb] ?? b.length;
    return cb - ca;
  });
  return [...assigned, ...unassigned];
}

// ── Density ───────────────────────────────────────────────────────────────────

const DENSITY_CELL: Record<string, string> = {
  compact:     "px-3 py-1.5",
  comfortable: "px-3 py-2.5",
  spacious:    "px-4 py-4",
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface GroupedListViewProps {
  rows:                    Record<string, unknown>[];
  groupFieldName:          string;
  entity:                  CompiledEntity;
  /** Filtered, ordered EntityField[] — same set the DataTable would receive. */
  visibleDescriptorFields: EntityField[];
  presentationConfig?:     { columns: ColumnPresentation[] };
  /** Server-provided total count per group value (key = group value or "__unassigned__"). */
  groupCounts?:            Record<string, number>;
  /** Explicit column order (from lifecycle/enum sort_order). */
  columnOrder?:            string[];
  loading?:                boolean;
  density?:                "compact" | "comfortable" | "spacious";
  onRowClick?:                  (row: Record<string, unknown>) => void;
  onRowContextMenu?:            (row: Record<string, unknown>, e: { clientX: number; clientY: number; preventDefault(): void }) => void;
  onIdentityCellContextMenu?:   (row: Record<string, unknown>, e: React.MouseEvent) => void;
  rowActions?:                  (row: Record<string, unknown>) => React.ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GroupedListView({
  rows,
  groupFieldName,
  entity,
  visibleDescriptorFields,
  presentationConfig,
  groupCounts,
  columnOrder,
  loading,
  density = "comfortable",
  onRowClick,
  onRowContextMenu,
  onIdentityCellContextMenu,
  rowActions,
}: GroupedListViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const groups = useMemo(() => {
    const map = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const key = getGroupValue(row, groupFieldName);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return orderGroups(map, groupCounts, columnOrder);
  }, [rows, groupFieldName, groupCounts, columnOrder]);

  const cellCls       = DENSITY_CELL[density] ?? DENSITY_CELL["comfortable"]!;
  const colCount      = visibleDescriptorFields.length + (rowActions ? 1 : 0);
  const codeFieldName  = configuredCodeFieldName(entity);
  const titleFieldName = configuredTitleFieldName(entity) ?? visibleDescriptorFields[0]?.name;

  // Derive the group field object for its label
  const groupFieldObj = entity.fields.find((f) => f.name === groupFieldName);
  const groupFieldLabel = groupFieldObj?.label ?? groupFieldName;

  // Summarise total across groups
  const totalCount = groupCounts
    ? Object.values(groupCounts).reduce((a, b) => a + b, 0)
    : rows.length;

  if (!loading && rows.length === 0) {
    return (
      <div className={listTypography.emptyState}>No records found</div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        Grouped by <span className="font-medium">{groupFieldLabel}</span>
        {" · "}
        <span className="tabular-nums">{totalCount.toLocaleString()}</span>
        {groupCounts ? " total" : " on this page"}
      </p>

      <div className="overflow-auto min-h-[50dvh] max-h-[calc(100dvh-12rem)] rounded-md border">
        <table className={cn("w-full border-collapse", listTypography.table.cell)}>
          {/* Sticky column header */}
          <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
            <tr className="border-b">
              {visibleDescriptorFields.map((field) => (
                <th
                  key={field.name}
                  className={cn(
                    "text-left whitespace-nowrap",
                    listTypography.table.header,
                    cellCls,
                  )}
                >
                  {field.label ?? field.name}
                </th>
              ))}
              {rowActions && <th className={cn("w-8 shrink-0", cellCls)} />}
            </tr>
          </thead>

          <tbody>
            {groups.map(([groupKey, groupRows]) => {
              const isUnassigned = groupKey === UNASSIGNED_KEY;
              const label        = isUnassigned ? "Unassigned" : groupKey.replace(/_/g, " ");
              const serverTotal  = groupCounts?.[groupKey];
              const pageCount    = groupRows.length;
              const isCollapsed  = collapsed.has(groupKey);

              // Semantic color for the group header (same mapping as KanbanView)
              const headerColorCls = isUnassigned
                ? "bg-muted/40 text-muted-foreground border-border"
                : (() => {
                    try {
                      return resolveRuntimeStatusColors(groupKey).subtleBadge;
                    } catch {
                      return "bg-muted/40 text-muted-foreground border-border";
                    }
                  })();

              return (
                <>
                  {/* Group header row */}
                  <tr
                    key={`${groupKey}__hdr`}
                    className={cn("border-t cursor-pointer select-none", headerColorCls)}
                    onClick={() => toggleCollapse(groupKey)}
                  >
                    <td colSpan={colCount} className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        {isCollapsed
                          ? <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
                          : <ChevronDown  className="h-3.5 w-3.5 shrink-0 opacity-60" />}
                        <span className="text-xs font-semibold capitalize">{label}</span>
                        <span
                          className="ml-0.5 rounded-full bg-background/60 dark:bg-background/30 px-2 py-0.5 text-2xs font-bold tabular-nums"
                          title={serverTotal !== undefined
                            ? `${serverTotal.toLocaleString()} total · ${pageCount} on this page`
                            : `${pageCount} on this page`}
                        >
                          {(serverTotal ?? pageCount).toLocaleString()}
                        </span>
                        {serverTotal !== undefined && pageCount < serverTotal && (
                          <span className="text-2xs opacity-50 tabular-nums">
                            ({pageCount} shown)
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Data rows */}
                  {!isCollapsed && groupRows.map((row, rowIdx) => {
                    const id = String(row.id ?? rowIdx);
                    return (
                      <tr
                        key={id}
                        onClick={() => onRowClick?.(row)}
                        onContextMenu={(e) => onRowContextMenu?.(row, e)}
                        className={cn(
                          "border-t hover:bg-muted/30 transition-colors",
                          onRowClick && "cursor-pointer",
                        )}
                      >
                        {visibleDescriptorFields.map((field) => {
                          const colPres = presentationConfig?.columns.find(
                            (c) => c.fieldName === field.name,
                          );
                          const value = row[field.name];
                          const isIdentity =
                            (field.name === codeFieldName && field.data_type === "text") ||
                            field.name === titleFieldName;
                          const identityHandler = isIdentity && onIdentityCellContextMenu
                            ? (e: React.MouseEvent) => { e.stopPropagation(); onIdentityCellContextMenu(row, e); }
                            : undefined;
                          return (
                            <td
                              key={field.name}
                              className={cn(cellCls, "whitespace-nowrap max-w-[280px] truncate")}
                            >
                              {colPres?.semanticResolver && typeof value === "string" && value ? (
                                <RuntimeStatusText value={value} resolverName={colPres.semanticResolver} />
                              ) : field.name === codeFieldName && field.data_type === "text" && value != null && value !== "" ? (
                                <span
                                  className="text-xs font-medium tabular-nums text-muted-foreground cursor-context-menu"
                                  onContextMenu={identityHandler}
                                >
                                  {String(value)}
                                </span>
                              ) : (
                                (() => {
                                  const Renderer = resolveFieldRenderer(field);
                                  return identityHandler ? (
                                    <span className="cursor-context-menu" onContextMenu={identityHandler}>
                                      <Renderer value={value} field={field} mode="view" density="table" />
                                    </span>
                                  ) : (
                                    <Renderer value={value} field={field} mode="view" density="table" />
                                  );
                                })()
                              )}
                            </td>
                          );
                        })}
                        {rowActions && (
                          <td className={cn(cellCls, "w-8 text-right")}>
                            {rowActions(row)}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
