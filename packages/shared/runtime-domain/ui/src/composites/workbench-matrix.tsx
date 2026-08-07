"use client";

/**
 * WorkbenchMatrix â€” cross-tab summary grid for analytical workbench views.
 *
 * Renders a labeled row Ã— column matrix where each cell shows a value with an
 * optional tone (success / warning / destructive etc.) and a click handler.
 * Used in reconciliation, period-close, and dimension analysis views.
 *
 * Usage:
 *   <WorkbenchMatrix
 *     columns={["Jan", "Feb", "Mar"]}
 *     rows={[
 *       { label: "Revenue", cells: [{ value: "1,200", tone: "success" }, ...] },
 *       { label: "Expenses", cells: [...] },
 *     ]}
 *   />
 */

import { useMemo, type ReactNode } from "react";
import { cn } from "@athyper/platform-theme/utils";
import { Badge } from "../primitives/badge";
import { Button, buttonVariants } from "../primitives/button";

export type WorkbenchMatrixTone =
  | "default"
  | "muted"
  | "info"
  | "success"
  | "warning"
  | "destructive"
  | "primary";

export interface WorkbenchMatrixAxisItem {
  key: string;
  label: ReactNode;
  subLabel?: ReactNode;
  badge?: ReactNode;
}

export interface WorkbenchMatrixCellItem {
  key?: string;
  rowKey: string;
  columnKey: string;
  label?: ReactNode;
  title?: string;
  tone?: WorkbenchMatrixTone;
  isCovered?: boolean;
}

export interface WorkbenchMatrixLegendItem {
  key: string;
  label: ReactNode;
  marker?: ReactNode;
  tone?: WorkbenchMatrixTone;
}

export interface WorkbenchMatrixAction {
  key: string;
  label: ReactNode;
  href?: string;
  disabled?: boolean;
  onClick?: () => void;
}

export interface WorkbenchMatrixSelection {
  title: ReactNode;
  detail?: ReactNode;
  actions?: WorkbenchMatrixAction[];
}

export interface WorkbenchMatrixProps {
  rows: WorkbenchMatrixAxisItem[];
  columns: WorkbenchMatrixAxisItem[];
  cells: WorkbenchMatrixCellItem[];
  rowHeaderLabel?: ReactNode;
  coverageHeaderLabel?: ReactNode;
  controls?: ReactNode;
  summary?: ReactNode;
  legend?: WorkbenchMatrixLegendItem[];
  selection?: WorkbenchMatrixSelection;
  selectedRowKey?: string | null;
  selectedColumnKey?: string | null;
  selectedCellKey?: string | null;
  emptyCellLabel?: ReactNode;
  className?: string;
  onSelectRow?: (row: WorkbenchMatrixAxisItem) => void;
  onSelectColumn?: (column: WorkbenchMatrixAxisItem) => void;
  onSelectCell?: (cell: WorkbenchMatrixCellItem | null, row: WorkbenchMatrixAxisItem, column: WorkbenchMatrixAxisItem) => void;
  formatCoverage?: (covered: number, total: number) => ReactNode;
}

function matrixCellKey(rowKey: string, columnKey: string): string {
  return `${rowKey}::${columnKey}`;
}

function toneClass(tone: WorkbenchMatrixTone = "default"): string {
  switch (tone) {
    case "primary":
      return "border-primary/30 bg-primary/10 text-primary";
    case "info":
      return "border-info/30 bg-info/10 text-info";
    case "success":
      return "border-success/30 bg-success/10 text-success";
    case "warning":
      return "border-warning/30 bg-warning/10 text-warning";
    case "destructive":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "muted":
      return "border-border bg-muted text-muted-foreground";
    default:
      return "border-border bg-background text-foreground";
  }
}

function defaultFormatCoverage(covered: number, total: number): string {
  return `${covered}/${total}`;
}

function isCellCovered(cell: WorkbenchMatrixCellItem | undefined): boolean {
  return !!cell && cell.isCovered !== false;
}

function CellToken({
  cell,
  emptyCellLabel,
}: {
  cell?: WorkbenchMatrixCellItem;
  emptyCellLabel: ReactNode;
}) {
  if (!cell) {
    return (
      <span className="inline-flex h-6 min-w-9 items-center justify-center rounded-md border border-dashed bg-muted/40 px-1 text-xs font-medium text-muted-foreground">
        {emptyCellLabel}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex min-h-7 min-w-7 items-center justify-center rounded-md border px-1.5 text-xs font-medium leading-none",
        toneClass(cell.tone),
      )}
      title={cell.title}
    >
      {cell.label ?? emptyCellLabel}
    </span>
  );
}

function LegendToken({ item }: { item: WorkbenchMatrixLegendItem }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "inline-flex size-5 items-center justify-center rounded border px-1 text-xs font-medium leading-none",
          toneClass(item.tone),
        )}
      >
        {item.marker ?? ""}
      </span>
      <span>{item.label}</span>
    </span>
  );
}

export function WorkbenchMatrix({
  rows,
  columns,
  cells,
  rowHeaderLabel = "Rows",
  coverageHeaderLabel = "Coverage",
  controls,
  summary,
  legend = [],
  selection,
  selectedRowKey,
  selectedColumnKey,
  selectedCellKey,
  emptyCellLabel = ".",
  className,
  onSelectRow,
  onSelectColumn,
  onSelectCell,
  formatCoverage = defaultFormatCoverage,
}: WorkbenchMatrixProps) {
  const cellLookup = useMemo(() => {
    const lookup = new Map<string, WorkbenchMatrixCellItem>();
    for (const cell of cells) {
      lookup.set(matrixCellKey(cell.rowKey, cell.columnKey), {
        ...cell,
        key: cell.key ?? matrixCellKey(cell.rowKey, cell.columnKey),
      });
    }
    return lookup;
  }, [cells]);

  const rowCoverage = useMemo(() => {
    const lookup = new Map<string, number>();
    for (const row of rows) {
      const covered = columns.filter((column) => isCellCovered(cellLookup.get(matrixCellKey(row.key, column.key)))).length;
      lookup.set(row.key, covered);
    }
    return lookup;
  }, [cellLookup, columns, rows]);

  const columnCoverage = useMemo(() => {
    const lookup = new Map<string, number>();
    for (const column of columns) {
      const covered = rows.filter((row) => isCellCovered(cellLookup.get(matrixCellKey(row.key, column.key)))).length;
      lookup.set(column.key, covered);
    }
    return lookup;
  }, [cellLookup, columns, rows]);

  const totalCells = rows.length * columns.length;
  const coveredCells = cells.filter((cell) => isCellCovered(cell)).length;

  return (
    <section className={cn("flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card", className)}>
      {(controls || summary) && (
        <div className="grid gap-2 border-b px-3 py-2">
          {controls && <div className="flex min-w-0 flex-wrap items-center gap-3">{controls}</div>}
          {(legend.length > 0 || summary) && (
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-3 text-xs text-muted-foreground">
              {legend.length > 0 && (
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                  {legend.map((item) => <LegendToken key={item.key} item={item} />)}
                </div>
              )}
              {summary && <div className="shrink-0 text-right text-sm font-medium">{summary}</div>}
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto bg-card">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-40 w-64 min-w-64 border-b border-r bg-muted px-3 py-2 text-left text-xs font-medium text-muted-foreground shadow-sm">
                {rowHeaderLabel}
              </th>
              {columns.map((column) => {
                const selected = selectedColumnKey === column.key;
                return (
                  <th
                    key={column.key}
                    className={cn(
                      "sticky top-0 z-30 min-w-32 border-b bg-muted px-2 py-1 text-center text-xs font-medium text-foreground shadow-sm",
                      selected && "bg-accent text-accent-foreground ring-1 ring-inset ring-primary/20",
                    )}
                  >
                    <button
                      type="button"
                      className="inline-flex max-w-32 flex-col items-center gap-0.5 rounded px-1.5 py-0.5 text-center outline-none transition-colors hover:bg-background/70 focus-visible:ring-2 focus-visible:ring-ring/40"
                      onClick={() => onSelectColumn?.(column)}
                    >
                      <span className="max-w-full truncate text-sm leading-4">{column.label}</span>
                      {column.subLabel && <span className="max-w-full truncate text-xs font-normal leading-4 text-muted-foreground">{column.subLabel}</span>}
                      {column.badge && <Badge variant="outline" size="sm">{column.badge}</Badge>}
                    </button>
                  </th>
                );
              })}
              <th className="sticky right-0 top-0 z-40 w-20 min-w-20 border-b border-l bg-muted px-2 py-2 text-center text-xs font-medium text-muted-foreground shadow-sm">
                {coverageHeaderLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 2}
                  className="h-40 border-b px-3 py-6 text-center text-sm text-muted-foreground"
                >
                  No matrix rows matched.
                </td>
              </tr>
            ) : rows.map((row) => {
              const rowSelected = selectedRowKey === row.key;
              return (
                <tr key={row.key} className={cn(rowSelected && "bg-primary/5")}>
                  <th
                    className={cn(
                      "sticky left-0 z-20 w-64 min-w-64 border-b border-r bg-card px-3 py-2 text-left align-middle",
                      rowSelected && "bg-accent",
                    )}
                  >
                    <button
                      type="button"
                      className="flex w-full min-w-0 flex-col rounded text-left outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40"
                      onClick={() => onSelectRow?.(row)}
                    >
                      <span className="truncate tabular-nums text-xs leading-4 text-muted-foreground">{row.subLabel}</span>
                      <span className="truncate text-sm font-medium leading-5 text-foreground">{row.label}</span>
                      {row.badge && <span className="mt-1">{row.badge}</span>}
                    </button>
                  </th>

                  {columns.map((column) => {
                    const cell = cellLookup.get(matrixCellKey(row.key, column.key));
                    const cellSelected = !!cell && selectedCellKey === cell.key;
                    const columnSelected = selectedColumnKey === column.key;
                    return (
                      <td
                        key={column.key}
                        className={cn(
                          "border-b px-2 py-2 text-center align-middle",
                          columnSelected && "bg-primary/10",
                          cellSelected && "bg-primary/15 ring-1 ring-inset ring-primary/30",
                        )}
                      >
                        <button
                          type="button"
                          className="inline-flex size-8 items-center justify-center rounded-md outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
                          onClick={() => onSelectCell?.(cell ?? null, row, column)}
                          aria-label={`${row.label} / ${column.label}`}
                        >
                          <CellToken cell={cell} emptyCellLabel={emptyCellLabel} />
                        </button>
                      </td>
                    );
                  })}

                  <td className="sticky right-0 z-10 w-20 min-w-20 border-b bg-card px-2 py-2 text-center align-middle text-sm font-medium text-foreground">
                    {formatCoverage(rowCoverage.get(row.key) ?? 0, columns.length)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {columns.length > 0 && rows.length > 0 && (
            <tfoot>
              <tr>
                <th className="sticky bottom-0 left-0 z-40 border-r border-t bg-muted px-3 py-2 text-left text-xs font-medium text-muted-foreground shadow-[0_-1px_0_hsl(var(--border))]">
                  Column coverage
                </th>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "sticky bottom-0 z-30 border-t bg-muted px-2 py-2 text-center text-sm font-medium text-foreground shadow-[0_-1px_0_hsl(var(--border))]",
                      selectedColumnKey === column.key && "bg-accent text-accent-foreground ring-1 ring-inset ring-primary/20",
                    )}
                  >
                    {formatCoverage(columnCoverage.get(column.key) ?? 0, rows.length)}
                  </td>
                ))}
                <td className="sticky bottom-0 right-0 z-40 border-l border-t bg-muted px-2 py-2 text-center text-sm font-medium text-foreground shadow-[0_-1px_0_hsl(var(--border))]">
                  {formatCoverage(coveredCells, totalCells)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {selection && (
        <div className="flex flex-wrap items-center gap-2 border-t bg-foreground px-3 py-2 text-background">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{selection.title}</div>
            {selection.detail && <div className="truncate text-xs text-background/70">{selection.detail}</div>}
          </div>
          {selection.actions?.map((action) => (
            action.href && !action.disabled ? (
              <a
                key={action.key}
                href={action.href}
                className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "h-8")}
              >
                {action.label}
              </a>
            ) : (
              <Button
                key={action.key}
                type="button"
                variant="secondary"
                size="sm"
                className="h-8"
                disabled={action.disabled}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            )
          ))}
        </div>
      )}

    </section>
  );
}

