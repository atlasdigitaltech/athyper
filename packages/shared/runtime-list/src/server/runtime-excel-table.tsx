import {
  LIST_URL_PARAMS as P,
  type ResolvedColumn,
  type RuntimeListPresentation,
  type RuntimeRecordRow,
  type SortEntry,
  type ViewDensity,
} from "../core/types";
import { firstParam } from "../core/url-state";
import { RuntimeExcelTableIsland } from "../islands/runtime-excel-table-island";

interface RuntimeExcelTableProps {
  entityCode:        string;
  columns:          ResolvedColumn[];
  allColumns:       ResolvedColumn[];
  rows:             RuntimeRecordRow[];
  density:          ViewDensity;
  activeSort:       SortEntry[];
  groupField?:      string;
  selectable:       boolean;
  listPresentation: RuntimeListPresentation;
  listBaseHref:     string;
  page:             number;
  pageSize:         number;
  total?:           number;
  rawSearchParams:  Record<string, string | string[] | undefined>;
}

export function RuntimeExcelTable({
  entityCode,
  columns,
  allColumns,
  rows,
  density,
  activeSort,
  groupField,
  selectable,
  listPresentation,
  listBaseHref,
  page,
  pageSize,
  total,
  rawSearchParams,
}: RuntimeExcelTableProps) {
  const columnMap = buildColumnMap(allColumns, columns);
  const displayColumns = listPresentation.excel.columns
    .map((name) => columnMap.get(name))
    .filter((column): column is ResolvedColumn => Boolean(column));
  const hasSelectedColumns = Boolean(firstParam(rawSearchParams[P.COLUMNS]));
  const effectiveColumns = hasSelectedColumns
    ? columns
    : displayColumns.length > 0
      ? displayColumns
      : columns;
  const groupColumn = groupField ? columnMap.get(groupField) : undefined;

  return (
    <RuntimeExcelTableIsland
      entityCode={entityCode}
      columns={effectiveColumns}
      rows={rows}
      density={density}
      activeSort={activeSort}
      groupColumn={groupColumn}
      selectable={selectable}
      listBaseHref={listBaseHref}
      page={page}
      pageSize={pageSize}
      total={total}
      rawSearchParams={rawSearchParams}
    />
  );
}

function buildColumnMap(
  allColumns: ResolvedColumn[],
  columns:    ResolvedColumn[],
): Map<string, ResolvedColumn> {
  const map = new Map<string, ResolvedColumn>();
  for (const column of allColumns) map.set(column.name, column);
  for (const column of columns) map.set(column.name, column);
  return map;
}
