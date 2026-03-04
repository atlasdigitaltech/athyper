"use client";

import { cn } from "../lib/utils";

import type { DataTableConfig } from "./types";

/**
 * Props for the DataTable component.
 *
 * @typeParam T - The row item type.
 */
export interface DataTableProps<T> extends DataTableConfig<T> {
  /** Array of items to display as rows. */
  items: T[];
  /** Optional CSS class name for the wrapper element. */
  className?: string;
}

/**
 * A generic, typed data table component.
 *
 * Renders a simple, accessible table from typed data and column
 * definitions. All callbacks preserve the generic item type, giving
 * consumers full type safety from data through events.
 *
 * @typeParam T - The row item type.
 *
 * @example
 * <DataTable<User>
 *   items={users}
 *   getKey={u => u.id}
 *   columns={[
 *     { id: "name", header: "Name", accessor: u => u.fullName },
 *     { id: "email", header: "Email", accessor: u => u.email },
 *   ]}
 *   onRowClick={u => navigate(`/users/${u.id}`)}
 * />
 */
export function DataTable<T>({
  items,
  columns,
  getKey,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const visibleColumns = columns.filter((c) => !c.hidden);

  if (items.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-border p-8 text-sm text-muted-foreground",
          className,
        )}
      >
        No items found
      </div>
    );
  }

  return (
    <div
      className={cn("overflow-auto rounded-lg border border-border", className)}
    >
      <table className="w-full text-sm" role="grid">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {visibleColumns.map((col) => (
              <th
                key={col.id}
                className={cn(
                  "px-3 py-2 text-left font-medium text-muted-foreground",
                  col.align === "right" && "text-right",
                  col.align === "center" && "text-center",
                  col.width,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={getKey(item)}
              onClick={() => onRowClick?.(item)}
              className={cn(
                "border-b border-border last:border-0",
                onRowClick && "cursor-pointer hover:bg-muted/30",
              )}
            >
              {visibleColumns.map((col) => (
                <td
                  key={col.id}
                  className={cn(
                    "px-3 py-2",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                  )}
                >
                  {col.accessor(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
