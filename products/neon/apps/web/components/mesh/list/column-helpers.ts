// components/mesh/list/column-helpers.ts
//
// Adapter that converts ListPageConfig ColumnDef<T> into
// @tanstack/react-table ColumnDef format.

import { createColumnHelper } from "@tanstack/react-table";

import type { ColumnDef } from "./types";
import type { ColumnDef as TanStackColumnDef } from "@tanstack/react-table";

export function toTanStackColumns<T>(
  columns: ColumnDef<T>[],
): TanStackColumnDef<T, unknown>[] {
  const helper = createColumnHelper<T>();

  return columns.map((col) =>
    helper.display({
      id: col.id,
      header: () => col.header,
      cell: (info) => col.accessor(info.row.original),
      enableSorting: !!col.sortKey,
      enableResizing: true,
      size: col.width ? parseInt(col.width.replace(/\D/g, ""), 10) || 150 : 150,
      minSize: 80,
      maxSize: 600,
      meta: {
        align: col.align,
        sortKey: col.sortKey,
        sortFn: col.sortFn,
      },
    }),
  );
}
