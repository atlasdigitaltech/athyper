import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ResolvedColumn, RuntimeRecordRow, SortEntry, ViewDensity } from "../core/types";
import { formatRuntimeColumnValue, humanizeToken, resolveRecordId } from "../core/formatters";
import { buildGroupedRuntimeRows } from "../core/grouping";
import {
  runtimeStickyHeaderCellStyle,
  runtimeTableCellPadding,
  runtimeTableChrome,
  runtimeTableScrollStyle,
} from "../core/tableChrome";
import { firstParam, serializeListState } from "../core/urlState";

interface RuntimeListTableProps {
  columns:      ResolvedColumn[];
  rows:         RuntimeRecordRow[];
  density:      ViewDensity;
  activeSort:   SortEntry[];
  groupField?:  string;
  listBaseHref: string;
  rawSearchParams: Record<string, string | string[] | undefined>;
}

export function RuntimeListTable({
  columns,
  rows,
  density,
  activeSort,
  groupField,
  listBaseHref,
  rawSearchParams,
}: RuntimeListTableProps) {
  const cellPadding = runtimeTableCellPadding(density);
  const groupColumn = groupField ? columns.find((column) => column.name === groupField) : undefined;
  const groupedRows = buildGroupedRuntimeRows(rows, groupColumn);

  return (
    <div className={runtimeTableChrome.shell} style={runtimeTableScrollStyle}>
      <table className={runtimeTableChrome.table}>
        <thead className={runtimeTableChrome.head}>
          <tr>
            {columns.map((col) => {
              const sortEntry = activeSort.find((entry) => entry.key === col.name);
              return (
                <th
                  key={col.name}
                  scope="col"
                  aria-sort={ariaSort(sortEntry?.dir)}
                  className={runtimeTableChrome.headerCell}
                  style={runtimeStickyHeaderCellStyle}
                >
                  {col.isSortable ? (
                    <a
                      href={sortHref(listBaseHref, rawSearchParams, col.name)}
                      className={runtimeTableChrome.headerButton}
                    >
                      {col.label}
                      <RuntimeSortIcon dir={sortEntry?.dir} />
                    </a>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className={runtimeTableChrome.body}>
          {groupedRows.map((entry) => {
            if (entry.kind === "group") {
              return (
                <tr key={entry.key} className={runtimeTableChrome.groupRow}>
                  <td colSpan={columns.length} className={runtimeTableChrome.groupHeaderCell}>
                    {entry.label}: {entry.value}
                    <span className={runtimeTableChrome.groupCount}>{entry.count}</span>
                  </td>
                </tr>
              );
            }

            const { row, rowIndex } = entry;
            const id   = resolveRecordId(row);
            const href = id ? `${listBaseHref}/${id}` : null;
            return (
              <tr key={id ?? `row-${rowIndex}`} className={runtimeTableChrome.row}>
                {columns.map((col, colIndex) => {
                  const cell = formatRuntimeColumnValue(row, col);
                  return (
                    <td
                      key={col.name}
                      className={`${runtimeTableChrome.cell} ${cellPadding}`}
                    >
                      {renderRuntimeCell(col, colIndex, href, cell.display, cell.title)}
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

// Table helpers

function RuntimeSortIcon({ dir }: { dir?: "asc" | "desc" }) {
  if (dir === "asc") {
    return <ArrowUp aria-hidden="true" className={runtimeTableChrome.activeSortIcon} />;
  }
  if (dir === "desc") {
    return <ArrowDown aria-hidden="true" className={runtimeTableChrome.activeSortIcon} />;
  }
  return <ArrowUpDown aria-hidden="true" className={runtimeTableChrome.sortIcon} />;
}

function renderRuntimeCell(
  col:      ResolvedColumn,
  colIndex: number,
  href:     string | null,
  display:  string,
  title?:   string,
) {
  if (!display) {
    return <span className={runtimeTableChrome.mutedValue}>-</span>;
  }

  if (isStatusColumn(col)) {
    return (
      <span title={title} className={runtimeTableChrome.statusCell}>
        <span aria-hidden="true" className={runtimeTableChrome.statusDot} />
        <span className="truncate">{humanizeToken(display)}</span>
      </span>
    );
  }

  if (colIndex === 0 && href) {
    return (
      <a href={href} title={title} className={runtimeTableChrome.identityCell}>
        {display}
      </a>
    );
  }

  return (
    <span title={title} className={runtimeTableChrome.valueCell}>
      {display}
    </span>
  );
}

function isStatusColumn(col: ResolvedColumn): boolean {
  const name = col.name.toLowerCase();
  return col.uiType === "status" || name === "status" || name.endsWith("_status");
}

function currentSort(raw: Record<string, string | string[] | undefined>): { key: string; dir: "asc" | "desc" } | null {
  const val = firstParam(raw["sort"]);
  if (!val) return null;
  const [key, dir] = val.split(":");
  if (!key?.trim()) return null;
  return { key: key.trim(), dir: dir === "desc" ? "desc" : "asc" };
}

function sortHref(
  base:   string,
  raw:    Record<string, string | string[] | undefined>,
  field:  string,
): string {
  const cur    = currentSort(raw);
  const nextDir = cur?.key === field && cur.dir === "asc" ? "desc" : "asc";
  return serializeListState(base, raw, { sort: `${field}:${nextDir}`, page: null });
}

function ariaSort(
  dir?: "asc" | "desc",
): "ascending" | "descending" | "none" {
  if (dir === "asc") return "ascending";
  if (dir === "desc") return "descending";
  return "none";
}
