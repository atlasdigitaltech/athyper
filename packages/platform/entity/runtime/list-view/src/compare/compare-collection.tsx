"use client";
import React, { useEffect, useMemo, useState } from "react";
import { entityListOperation, type HttpClient } from "@athyper/platform-api-client";
import type {
  EntityListDescriptorV1,
  EntityListResultV1,
  EntityListRowV1,
  ListCompareCollectionV1,
} from "@athyper/contract-platform-entity-list";
import {
  ComparisonTable,
  type ComparisonTableCell,
  type ComparisonTableColumn,
  type ComparisonTableMark,
  type ComparisonTableRow,
} from "@athyper/platform-entity-comparison";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import {
  COMPARE_LINE_PAGE,
  COMPARE_MASTER_PAGE,
  COMPARE_SMALL_MAX_LINES,
  buildLineRows,
  checkLineRead,
  lineCountQuery,
  lineQuery,
  masterQuery,
  type LineReadIssue,
  type LineRowModel,
  type MasterRow,
} from "./compare-lines";

// One C4 line-item collection in the comparison panel (Entity list Compare
// blueprint 5.8 and 10a). It opens collapsed with its counts, narrows first
// (search, choice filters, pinned items), then pages by the master list.

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly masterRows?: readonly MasterRow[]; readonly lines: ReadonlyMap<string, readonly EntityListRowV1[]>; readonly hasNext: boolean; readonly issue?: LineReadIssue }
  | { readonly status: "scope" }
  | { readonly status: "error" };

export interface CompareCollectionProps {
  readonly client: HttpClient;
  readonly descriptor: EntityListDescriptorV1;
  readonly collection: ListCompareCollectionV1;
  /** Compared record IDs in column order. */
  readonly records: readonly string[];
  /** The compared records' rows (from the headers request); a missing record is unavailable. */
  readonly headerRows: ReadonlyMap<string, EntityListRowV1>;
  /** Readable names for each column, in column order. */
  readonly names: readonly string[];
  /** Column indexes shown (all, or the narrow pair). */
  readonly shown: readonly number[];
  readonly baseline: number;
  readonly all: boolean;
  readonly pinned: readonly string[];
  readonly onPinnedChange: (items: readonly string[]) => void;
}

export function CompareCollection(props: CompareCollectionProps) {
  const intl = useEntityI18n();
  const { collection, descriptor, records } = props;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [cursors, setCursors] = useState<readonly (string | undefined)[]>([undefined]);
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [coverage, setCoverage] = useState<{ readonly total?: number; readonly perRecord: ReadonlyMap<string, number> }>();
  const master = collection.master;
  const available = records.filter((id) => props.headerRows.has(id));
  const parentValues = master ? [...new Set(available.map((id) => props.headerRows.get(id)!.values[master.recordParentField]))] : [];
  const parentId = parentValues.length === 1 && typeof parentValues[0] === "string" ? parentValues[0] : undefined;
  const narrowingKey = JSON.stringify([appliedSearch, filters, pinnedOnly ? props.pinned : []]);
  const recordsKey = records.join(",");

  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  // Any change of narrowing starts again from the first page.
  useEffect(() => {
    setCursors([undefined]);
    setPage(0);
  }, [narrowingKey, recordsKey]);

  useEffect(() => {
    if (collection.unavailable) return;
    const controller = new AbortController();
    const request = (entityCode: string, query: Readonly<Record<string, unknown>>) =>
      props.client.request(entityListOperation, { params: { entityCode }, query: query as never, signal: controller.signal });
    setLoad({ status: "loading" });
    (async () => {
      if (master && !parentId) return setLoad({ status: "scope" });
      let masterRows: MasterRow[] | undefined;
      let hasNext = false;
      if (master) {
        const result = await request(master.entity, masterQuery(collection, parentId!, { search: appliedSearch, filters, ...(pinnedOnly && props.pinned.length ? { pinned: props.pinned } : {}) }, cursors[page]));
        hasNext = result.pagination.hasNext;
        if (result.pagination.nextCursor && !cursors[page + 1]) setCursors((previous) => [...previous.slice(0, page + 1), result.pagination.nextCursor]);
        masterRows = result.rows.map((row) => ({
          id: row.id,
          label: [row.displayValues?.[master.identityField] ?? row.values[master.identityField], master.titleField ? row.displayValues?.[master.titleField] ?? row.values[master.titleField] : undefined]
            .filter((part) => part !== undefined && part !== null && part !== "")
            .map(String)
            .join(" "),
        }));
      }
      const lines = new Map<string, readonly EntityListRowV1[]>();
      let issue: LineReadIssue | undefined;
      await Promise.all(
        available.map(async (id) => {
          if (master) {
            if (!masterRows!.length) return lines.set(id, []);
            const result: EntityListResultV1 = await request(collection.targetEntity, lineQuery(collection, descriptor.entity.code, id, masterRows!.map((row) => row.id)));
            issue ??= checkLineRead(collection, id, result.rows, result.pagination.hasNext);
            lines.set(id, result.rows);
            return;
          }
          // Small mode: every line, up to five pages of 100.
          const rows: EntityListRowV1[] = [];
          let cursor: string | undefined;
          for (let count = 0; ; count++) {
            const result: EntityListResultV1 = await request(collection.targetEntity, lineQuery(collection, descriptor.entity.code, id, undefined, cursor));
            rows.push(...result.rows);
            if (!result.pagination.hasNext) break;
            if (rows.length >= COMPARE_SMALL_MAX_LINES || count >= COMPARE_SMALL_MAX_LINES / COMPARE_LINE_PAGE - 1) {
              issue ??= { kind: "too_many", record: id };
              break;
            }
            cursor = result.pagination.nextCursor;
          }
          issue ??= checkLineRead(collection, id, rows, false);
          lines.set(id, rows);
        }),
      );
      if (!controller.signal.aborted) setLoad({ status: "ready", ...(masterRows ? { masterRows } : {}), lines, hasNext, ...(issue ? { issue } : {}) });
    })().catch(() => {
      if (!controller.signal.aborted) setLoad({ status: "error" });
    });
    return () => controller.abort();
    // The page reads depend on the records, the narrowing, the page and retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordsKey, narrowingKey, page, attempt, parentId, collection.key]);

  // Coverage: two exact counts, only when both Entities publish exact counts.
  useEffect(() => {
    if (collection.unavailable || !master?.exactCounts || !collection.exactCounts || !parentId) return setCoverage(undefined);
    const controller = new AbortController();
    const request = (entityCode: string, query: Readonly<Record<string, unknown>>) =>
      props.client.request(entityListOperation, { params: { entityCode }, query: query as never, signal: controller.signal });
    Promise.all([
      request(master.entity, masterQuery(collection, parentId, {}, undefined, true)),
      ...available.map((id) => request(collection.targetEntity, lineCountQuery(collection, descriptor.entity.code, id))),
    ])
      .then(([masterCount, ...lineCounts]) => {
        if (controller.signal.aborted) return;
        const perRecord = new Map<string, number>();
        lineCounts.forEach((result, index) => {
          if (typeof result!.pagination.total === "number") perRecord.set(available[index]!, result!.pagination.total);
        });
        setCoverage({ ...(typeof masterCount!.pagination.total === "number" ? { total: masterCount!.pagination.total } : {}), perRecord });
      })
      .catch(() => undefined);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordsKey, parentId, collection.key]);

  const rows = useMemo(
    () => (load.status === "ready" && !load.issue ? buildLineRows({ collection, records, lines: load.lines, ...(load.masterRows ? { masterRows: load.masterRows } : {}), baseline: props.baseline, intl }) : []),
    [load, collection, records, props.baseline, intl],
  );
  const differs = rows.filter((row) => row.outcome === "differs").length;
  const itemCount = load.status === "ready" ? (load.masterRows?.length ?? new Set(rows.map((row) => row.key.split(":")[0])).size) : 0;
  const from = page * COMPARE_MASTER_PAGE + 1;
  const to = page * COMPARE_MASTER_PAGE + itemCount;
  const summary =
    load.status !== "ready" || load.issue
      ? undefined
      : master
        ? intl.message("list.compare.lines.differAmong", { count: new Set(rows.filter((row) => row.outcome === "differs").map((row) => row.masterId)).size, from: itemCount ? from : 0, to: itemCount ? to : 0 })
        : intl.message("list.compare.lines.differOf", { count: differs, total: rows.length });

  if (collection.unavailable)
    return (
      <section className="a-entity-compare__collection" aria-label={collection.label}>
        <h3>{collection.label}</h3>
        <p className="a-entity-compare__note" role="note">
          {intl.message(collection.unavailable === "MATCH_KEY_UNAVAILABLE" || collection.unavailable === "NO_READABLE_FIELDS" ? "list.compare.lines.unavailableAccess" : "list.compare.lines.unavailableList")}
        </p>
      </section>
    );

  const columns: ComparisonTableColumn[] = props.shown.map((index) => {
    const id = records[index]!;
    const count = coverage?.perRecord.get(id);
    return {
      key: id,
      title: props.names[index]!,
      ...(index === props.baseline ? { baselineLabel: intl.message("list.compare.baseline") } : {}),
      ...(!props.headerRows.has(id) ? { unavailable: true } : {}),
      ...(count !== undefined && coverage?.total !== undefined ? { note: intl.message("list.compare.lines.coverage", { count, total: coverage.total }) } : {}),
    };
  });
  const visible = props.all ? rows : rows.filter((row) => row.outcome !== "same");
  const tableRows: ComparisonTableRow[] = visible.map((row, position) => ({
    key: row.key,
    id: `a-entity-compare-line-${collection.key}-${position}`,
    label: row.label,
    outcome: row.outcome,
    ...(row.outcome === "differs" ? { badge: intl.message("list.compare.differs") } : row.outcome === "not_comparable" ? { badge: intl.message("list.compare.notCompared") } : {}),
    ...(row.mixedCurrencies ? { note: intl.message("list.compare.mixedCurrencies") } : {}),
    ...(row.masterId
      ? {
          action: (
            <button
              type="button"
              className="a-entity-compare__pin"
              aria-pressed={props.pinned.includes(row.masterId)}
              onClick={() => {
                const id = row.masterId!;
                props.onPinnedChange(props.pinned.includes(id) ? props.pinned.filter((item) => item !== id) : [...props.pinned, id]);
              }}
            >
              {intl.message(props.pinned.includes(row.masterId) ? "list.compare.lines.pinned" : "list.compare.lines.pin")}
            </button>
          ),
        }
      : {}),
    cells: props.shown.map((index) => lineCell(row, index, props.baseline, collection, intl)),
  }));

  return (
    <section className="a-entity-compare__collection" aria-label={collection.label}>
      <button type="button" className="a-entity-compare__collection-heading" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="a-comparison__chevron" aria-hidden="true" />
        <span>{collection.label}</span>
        {summary ? <span className="a-comparison__count" data-emphasis={differs ? "" : undefined}>{summary}</span> : null}
      </button>
      {open ? (
        <>
          <div className="a-entity-compare__toolbar">
            {master?.searchable ? (
              <input
                type="search"
                className="a-entity-compare__search"
                aria-label={intl.message("list.compare.lines.search")}
                placeholder={intl.message("list.compare.lines.search")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            ) : null}
            {master?.filters.map((filter) => (
              <select
                key={filter.key}
                className="a-entity-compare__search"
                aria-label={filter.label}
                value={filters[filter.key] ?? ""}
                onChange={(event) => setFilters((previous) => ({ ...previous, [filter.key]: event.target.value }))}
              >
                <option value="">{intl.message("list.compare.lines.filterAll", { label: filter.label })}</option>
                {filter.options.map((option) => (
                  <option key={String(option.value)} value={String(option.value)}>
                    {option.label}
                  </option>
                ))}
              </select>
            ))}
            {master ? (
              <label className="a-entity-compare__switch">
                <input type="checkbox" checked={pinnedOnly} disabled={!props.pinned.length} onChange={(event) => setPinnedOnly(event.target.checked)} />
                <span>{intl.message("list.compare.lines.pinnedOnly", { count: props.pinned.length })}</span>
              </label>
            ) : null}
            <span className="a-entity-compare__spacer" />
            {master && load.status === "ready" && !load.issue ? (
              <>
                <span className="a-entity-compare__summary">{itemCount ? intl.message("list.compare.lines.range", { from, to }) : ""}</span>
                <button type="button" className="a-entity-compare__button" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
                  {intl.message("list.compare.lines.previous")}
                </button>
                <button type="button" className="a-entity-compare__button" disabled={!load.hasNext} onClick={() => setPage((value) => value + 1)}>
                  {intl.message("list.compare.lines.next")}
                </button>
              </>
            ) : null}
          </div>
          {collection.accessIndependent ? <p className="a-entity-compare__note" role="note">{intl.message("list.compare.lines.accessNote")}</p> : null}
          {load.status === "loading" ? (
            <div className="a-entity-compare__state" aria-busy="true"><p>{intl.message("list.compare.lines.loading")}</p></div>
          ) : load.status === "scope" ? (
            <div className="a-entity-compare__state" role="status"><p>{intl.message("list.compare.lines.scope")}</p></div>
          ) : load.status === "error" || load.issue ? (
            <div className="a-entity-compare__state" role="alert">
              <p>{issueMessage(load.status === "ready" ? load.issue : undefined, props, intl)}</p>
              <button type="button" className="a-entity-compare__button" onClick={() => setAttempt((value) => value + 1)}>
                {intl.message("list.compare.retry")}
              </button>
            </div>
          ) : !itemCount ? (
            <div className="a-entity-compare__state" role="status"><p>{intl.message("list.compare.lines.none")}</p></div>
          ) : (
            <div className="a-entity-compare__scroll">
              <ComparisonTable
                caption={collection.label}
                fieldHeading={collection.matchKey[0]?.label ?? intl.message("list.compare.field")}
                columns={columns}
                sections={[{ key: collection.key, label: collection.label, open: true, counts: [], rows: tableRows, emptyMessage: intl.message("list.compare.lines.noDifferences") }]}
                onToggleSection={() => undefined}
              />
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function issueMessage(issue: LineReadIssue | undefined, props: CompareCollectionProps, intl: ReturnType<typeof useEntityI18n>): string {
  const name = (id: string) => props.names[props.records.indexOf(id)] ?? "";
  if (!issue) return intl.message("list.compare.lines.failed");
  if (issue.kind === "duplicate") return intl.message("list.compare.lines.duplicate", { item: issue.label, record: name(issue.record) });
  if (issue.kind === "too_many") return intl.message("list.compare.lines.tooMany", { record: name(issue.record), max: COMPARE_SMALL_MAX_LINES });
  return intl.message("list.compare.lines.incomplete");
}

function lineCell(row: LineRowModel, index: number, baseline: number, collection: ListCompareCollectionV1, intl: ReturnType<typeof useEntityI18n>): ComparisonTableCell {
  const cell = row.cells[index]!;
  const marks: ComparisonTableMark[] = [];
  if (row.best.includes(index)) marks.push({ tone: "best", label: intl.message("list.compare.best") });
  if (row.unitsDiffer[index]) marks.push({ tone: "muted", label: intl.message("list.compare.lines.unitsDiffer") });
  const relative = row.relative?.[index];
  if (relative && index !== baseline && !(cell.state === "unavailable" && cell.reason === "record_unavailable"))
    marks.push(
      relative === "same"
        ? { tone: "same", label: intl.message("list.compare.sameAsBaseline") }
        : relative === "differs"
          ? { tone: "differs", label: intl.message("list.compare.differsFromBaseline") }
          : relative === "not_in_baseline"
            ? { tone: "differs", label: intl.message("list.compare.lines.notInBaseline") }
            : { tone: "muted", label: intl.message("list.compare.notCompared") },
    );
  if (cell.state === "absent")
    return { content: collection.absentLabel ?? intl.message("list.compare.lines.notInRecord"), state: "empty", ...(marks.length ? { marks } : {}), ...(index === baseline ? { baseline: true } : {}) };
  if (cell.state === "unavailable")
    return {
      content:
        cell.reason === "record_unavailable" ? (
          intl.message("list.compare.unavailableRecord")
        ) : (
          <>
            <span aria-hidden="true">—</span>
            <span className="a-comparison__visually-hidden">{intl.message("list.compare.lines.notShown")}</span>
          </>
        ),
      state: "unavailable",
      ...(marks.length ? { marks } : {}),
      ...(index === baseline ? { baseline: true } : {}),
    };
  return {
    content: cell.state === "empty" ? intl.message("list.compare.notSet") : row.displays[index]!,
    state: cell.state,
    ...(marks.length ? { marks } : {}),
    ...(index === baseline ? { baseline: true } : {}),
    ...(row.best.includes(index) ? { best: true } : {}),
  };
}
