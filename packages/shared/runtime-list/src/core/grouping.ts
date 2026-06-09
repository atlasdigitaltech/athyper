import type { ResolvedColumn, RuntimeRecordRow } from "./types";
import { formatRuntimeColumnValue } from "./formatters";

export type GroupedRuntimeRow =
  | {
      kind:  "group";
      key:   string;
      label: string;
      value: string;
      count: number;
    }
  | {
      kind:     "row";
      row:      RuntimeRecordRow;
      rowIndex: number;
    };

export function buildGroupedRuntimeRows(
  rows:        RuntimeRecordRow[],
  groupColumn?:ResolvedColumn,
): GroupedRuntimeRow[] {
  if (!groupColumn) {
    return rows.map((row, rowIndex) => ({ kind: "row", row, rowIndex }));
  }

  const groups = new Map<string, { value: string; rows: Array<{ row: RuntimeRecordRow; rowIndex: number }> }>();
  for (const [rowIndex, row] of rows.entries()) {
    const cell = formatRuntimeColumnValue(row, groupColumn);
    const raw = cell.raw;
    const value = cell.display || "(Blank)";
    const key = `${groupColumn.name}:${raw === null || raw === undefined ? "__blank__" : String(raw)}`;
    const group = groups.get(key);
    if (group) {
      group.rows.push({ row, rowIndex });
    } else {
      groups.set(key, { value, rows: [{ row, rowIndex }] });
    }
  }

  const entries: GroupedRuntimeRow[] = [];
  for (const [key, group] of groups) {
    entries.push({
      kind:  "group",
      key,
      label: groupColumn.label,
      value: group.value,
      count: group.rows.length,
    });
    for (const item of group.rows) {
      entries.push({ kind: "row", row: item.row, rowIndex: item.rowIndex });
    }
  }
  return entries;
}
