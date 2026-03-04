import type React from "react";

/**
 * Column definition for a generic data table.
 *
 * @typeParam T - The row item type.
 *
 * @example
 * const cols: ColumnDef<User>[] = [
 *   { id: "name", header: "Name", accessor: u => u.fullName },
 *   { id: "role", header: "Role", accessor: u => <RoleBadge role={u.role} /> },
 * ];
 */
export interface ColumnDef<T> {
  /** Unique column identifier. */
  id: string;
  /** Text rendered in the column header. */
  header: string;
  /** Accessor function to extract cell content from a row item. */
  accessor: (item: T) => React.ReactNode;
  /** Key used for sorting. `undefined` means the column is not sortable. */
  sortKey?: string;
  /** Alignment of cell content. Defaults to "left". */
  align?: "left" | "center" | "right";
  /** Tailwind width class, e.g. `"w-[200px]"`. */
  width?: string;
  /** Whether this column is hidden by default. */
  hidden?: boolean;
}

/**
 * Configuration for a generic data table.
 *
 * @typeParam T - The row item type.
 */
export interface DataTableConfig<T> {
  /** Column definitions describing each visible column. */
  columns: ColumnDef<T>[];
  /** Extract a unique, stable key from each row item for React reconciliation. */
  getKey: (item: T) => string;
  /** Called when a row is clicked. Receives the full typed item. */
  onRowClick?: (item: T) => void;
}
