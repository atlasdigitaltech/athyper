"use client";

import { useEffect, useMemo, useRef } from "react";
import type {
  RawSearchParams,
  ResolvedColumn,
  RuntimeListPresentation,
  RuntimeRecordRow,
  ViewDensity,
} from "../core/types";
import { formatRuntimeColumnValue, humanizeToken, resolveRecordId } from "../core/formatters";
import { buildGroupedRuntimeRows } from "../core/grouping";
import { filterRuntimeRows } from "../core/search";
import { runtimeCompactCardDensity, runtimeTableChrome } from "../core/table-chrome";
import { RuntimeLazyLoadFooter } from "../islands/runtime-lazy-load-footer";
import { useRuntimeListSearch } from "../islands/runtime-list-context";

interface RuntimeCompactListProps {
  columns:          ResolvedColumn[];
  allColumns:       ResolvedColumn[];
  rows:             RuntimeRecordRow[];
  density:          ViewDensity;
  groupField?:      string;
  listPresentation: RuntimeListPresentation;
  detailHrefBase:   string;
  page:             number;
  pageSize:         number;
  total?:           number;
  rawSearchParams:  RawSearchParams;
}

export function RuntimeCompactList({
  columns,
  allColumns,
  rows,
  density,
  groupField,
  listPresentation,
  detailHrefBase,
  page,
  pageSize,
  total,
  rawSearchParams,
}: RuntimeCompactListProps) {
  const {
    lazyList,
    query,
    runSearchAll,
    search,
    serverPagination,
    serverRows,
    serverSearch,
    setLocalMatchCount,
  } = useRuntimeListSearch();
  const lazyLoadSentinelRef = useRef<HTMLDivElement | null>(null);
  const densityConfig = runtimeCompactCardDensity(density);
  const rowSource = lazyList.enabled ? lazyList.loadedRows : rows;
  const loadedRows = useMemo(() => (
    search.enabled ? filterRuntimeRows(rowSource, search.fields, query) : rowSource
  ), [query, rowSource, search.enabled, search.fields]);
  const useServerRows = search.enabled &&
    serverSearch.state === "complete" &&
    Boolean(serverSearch.query) &&
    serverSearch.query === query.trim() &&
    serverRows !== null;
  const displayRows = useServerRows ? serverRows : loadedRows;
  const footerTotal = useServerRows
    ? serverPagination?.total
    : lazyList.pagination?.total ?? total;
  const columnMap = buildColumnMap(allColumns, columns);
  const groupColumn = groupField ? columnMap.get(groupField) : undefined;
  const groupedRows = useMemo(
    () => buildGroupedRuntimeRows(displayRows, groupColumn),
    [displayRows, groupColumn],
  );
  const titleColumn = columnMap.get(listPresentation.compact.titleField) ?? columns[0] ?? allColumns[0];
  const subtitleColumn = listPresentation.compact.subtitleField
    ? columnMap.get(listPresentation.compact.subtitleField)
    : undefined;
  const detailColumns = listPresentation.compact.bottomFields
    .map((fieldName) => columnMap.get(fieldName))
    .filter((column): column is ResolvedColumn => Boolean(column))
    .slice(0, densityConfig.detailLimit);

  useEffect(() => {
    setLocalMatchCount(loadedRows.length);
  }, [loadedRows.length, setLocalMatchCount]);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!search.enabled || !search.controls.autoSearchAllOnEmpty) return;
    if (!trimmedQuery || trimmedQuery.length < search.controls.minQueryLength) return;
    if (search.isFullyLoaded || loadedRows.length > 0) return;
    if (serverSearch.state === "pending" && serverSearch.query === trimmedQuery) return;
    if (serverSearch.state === "complete" && serverSearch.query === trimmedQuery) return;

    runSearchAll({
      rawSearchParams,
      pageSize,
      reason: "zeroLoadedMatches",
      debounceMs: search.controls.autoSearchAllDebounceMs + search.controls.queryStabilityMs,
    });
  }, [
    loadedRows.length,
    pageSize,
    query,
    rawSearchParams,
    runSearchAll,
    search.controls.autoSearchAllDebounceMs,
    search.controls.autoSearchAllOnEmpty,
    search.controls.minQueryLength,
    search.controls.queryStabilityMs,
    search.enabled,
    search.isFullyLoaded,
    serverSearch.query,
    serverSearch.state,
  ]);

  return (
    <div className="relative" data-runtime-list-region>
      <div className={`grid grid-cols-1 ${densityConfig.shellGap} md:grid-cols-2 lg:grid-cols-3`}>
        {groupedRows.map((entry) => {
          if (entry.kind === "group") {
            return (
              <div
                key={entry.key}
                className="col-span-full rounded-md border bg-muted/80 px-3 py-2 text-sm font-medium text-foreground"
              >
                {entry.label}: {entry.value}
                <span className={runtimeTableChrome.groupCount}>{entry.count}</span>
              </div>
            );
          }

          const { row, rowIndex } = entry;
          const id = resolveRecordId(row);
          const href = id ? `${detailHrefBase}/${id}` : null;
          const title = titleColumn
            ? readDisplay(row, titleColumn)
            : { display: "", title: undefined };
          const subtitle = subtitleColumn
            ? readDisplay(row, subtitleColumn)
            : null;
          const details = detailColumns
            .map((column) => ({ column, value: readDisplay(row, column) }))
            .filter((item) => item.value.display);
          const statusDetail = details.find(({ column }) => isStatusColumn(column));
          const factDetails = details.filter(({ column }) => !isStatusColumn(column));
          const content = (
            <>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div
                    title={title.title}
                    className={`${densityConfig.title} truncate text-foreground`}
                  >
                    {title.display || "-"}
                  </div>
                  {subtitle?.display && (
                    <div
                      title={subtitle.title}
                      className={`${densityConfig.subtitle} mt-0.5 truncate text-muted-foreground`}
                    >
                      {subtitle.display}
                    </div>
                  )}
                </div>
                {statusDetail && (
                  <div className="shrink-0">
                    {renderCompactValue(statusDetail.column, statusDetail.value.display)}
                  </div>
                )}
              </div>

              {factDetails.length > 0 && (
                <dl className={densityConfig.detailGrid}>
                  {factDetails.map(({ column, value }) => (
                    <div key={column.name} className={densityConfig.detailBox}>
                      <dt className={`${densityConfig.detailLabel} shrink-0 truncate text-muted-foreground`}>
                        {column.label}:
                      </dt>
                      <dd
                        title={value.title}
                        className={`${densityConfig.detailValue} min-w-0 truncate text-foreground`}
                      >
                        {renderCompactValue(column, value.display)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          );

          const className = [
            "block h-full min-w-0 rounded-md border bg-background shadow-sm transition-colors hover:border-border hover:bg-muted/40",
            densityConfig.card,
            href ? "cursor-pointer" : "",
          ].join(" ");

          return href ? (
            <a
              key={id ?? `row-${rowIndex}`}
              href={href}
              onClick={lazyList.enabled ? lazyList.saveScrollPosition : undefined}
              className={className}
            >
              {content}
            </a>
          ) : (
            <div key={id ?? `row-${rowIndex}`} className={className}>
              {content}
            </div>
          );
        })}
      </div>

      {lazyList.enabled && (
        <>
          <div
            ref={lazyLoadSentinelRef}
            tabIndex={lazyList.hasNextPage ? 0 : -1}
            aria-label="Load more records"
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && lazyList.hasNextPage) {
                event.preventDefault();
                lazyList.loadNextPage();
              }
            }}
            className="h-px w-full overflow-hidden"
          />
          <RuntimeLazyLoadFooter
            sentinelRef={lazyLoadSentinelRef}
            query={query}
            isServerSearch={useServerRows}
            page={page}
            pageSize={pageSize}
            rowCount={displayRows.length}
            loadedRowCount={useServerRows ? displayRows.length : lazyList.activeRows.length}
            datasetLoadedRowCount={lazyList.loadedRowCount}
            total={footerTotal}
            rawSearchParams={rawSearchParams}
          />
        </>
      )}
    </div>
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

function readDisplay(row: RuntimeRecordRow, column: ResolvedColumn): { display: string; title?: string } {
  const cell = formatRuntimeColumnValue(row, column);
  return { display: cell.display, title: cell.title };
}

function renderCompactValue(column: ResolvedColumn, display: string) {
  if (!display) return <span className={runtimeTableChrome.mutedValue}>-</span>;

  if (isStatusColumn(column)) {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border bg-muted px-2 py-0.5 text-sm font-medium text-foreground">
        <span aria-hidden="true" className={runtimeTableChrome.statusDot} />
        <span className="truncate">{humanizeToken(display)}</span>
      </span>
    );
  }

  return display;
}

function isStatusColumn(column: ResolvedColumn): boolean {
  const name = column.name.toLowerCase();
  return column.uiType === "status" || name === "status" || name.endsWith("_status");
}
