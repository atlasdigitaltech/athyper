"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiTransportError,
  entityListDescriptorOperation,
  entityListOperation,
  type HttpClient,
} from "@athyper/platform-api-client";
import {
  COMPARE_MAX_RECORDS,
  COMPARE_MIN_RECORDS,
  MATRIX_COLUMNS_PER_PAGE,
  MATRIX_ROWS_PER_PAGE,
  type EntityListDescriptorV1,
  type EntityListResultV1,
  type EntityListRowV1,
  type EntityListScopeCoordinateV1,
  type JsonValue,
  type ListCompareLocationV1,
  type ListFieldDescriptorV1,
  type ListLocationStateV1,
  type ListMatrixMeasureV1,
  type ListMatrixStateV1,
  type ListMatrixV1,
} from "@athyper/contract-platform-entity-list";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { Button } from "@athyper/platform-ui";
import { ComparePanel } from "../compare/compare-panel";
import { formatFieldValue } from "../field-format";
import type { ListWidthTier } from "../presentation-tier";
import {
  basisCurrency,
  buildMatrixBlock,
  cellKey,
  factFilters,
  matrixCellsQuery,
  matrixColumns,
  matrixColumnsQuery,
  matrixCoverageQuery,
  matrixParent,
  matrixPresets,
  matrixRowsQuery,
  rankedMeasure,
  shownMeasures,
  unitsDiffer,
  type MatrixBlock,
  type MatrixCellState,
  type MatrixColumnModel,
  type MatrixParent,
} from "./matrix-model";

// The Matrix Layout (Entity list Matrix blueprint sections 9 and 10): one
// row per row-Entity record, one column per column-Entity record, the
// declared measures in each cell with the server's rank. Pages are walked by
// cursor; every block is drawn complete or not at all.

type EntityIntl = ReturnType<typeof useEntityI18n>;
type Query = Readonly<Record<string, unknown>>;

export interface EntityMatrixProps {
  readonly client: HttpClient;
  readonly descriptor: EntityListDescriptorV1;
  readonly matrix: ListMatrixV1;
  readonly state: ListLocationStateV1;
  readonly scope?: EntityListScopeCoordinateV1;
  readonly widthTier?: ListWidthTier;
  readonly refreshKey: string;
  readonly onMatrixChange: (change: Pick<ListLocationStateV1, "matrix" | "matrixRowPage" | "matrixColumnPage">) => void;
}

type Paged =
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly access: boolean }
  | { readonly status: "ready"; readonly page: EntityListResultV1; readonly index: number };

/** Walks a cursor-paged list to `page` from its first page, remembering the
 * cursors it has seen so moving back and forth costs one request a step. */
function usePagedList(input: {
  readonly client: HttpClient;
  readonly entityCode: string;
  readonly enabled: boolean;
  /** The query identity; a change starts again from the first page. */
  readonly key: string;
  readonly build: (cursor: string | undefined) => Query;
  readonly page: number;
  readonly attempt: number;
  readonly count: () => void;
}): Paged {
  const [state, setState] = useState<{ readonly key: string; readonly paged: Paged }>({ key: "", paged: { status: "loading" } });
  const cursors = useRef<{ key: string; list: (string | undefined)[] }>({ key: "", list: [undefined] });
  const build = useRef(input.build);
  build.current = input.build;
  useEffect(() => {
    if (!input.enabled) return;
    if (cursors.current.key !== input.key) cursors.current = { key: input.key, list: [undefined] };
    const controller = new AbortController();
    setState({ key: input.key, paged: { status: "loading" } });
    (async () => {
      const known = cursors.current.list;
      let index = Math.min(input.page, known.length - 1);
      let page: EntityListResultV1 | undefined;
      for (;;) {
        input.count();
        page = await input.client.request(entityListOperation, {
          params: { entityCode: input.entityCode },
          query: build.current(known[index]) as never,
          signal: controller.signal,
        });
        if (page.pagination.nextCursor) known[index + 1] = page.pagination.nextCursor;
        if (index >= input.page || !page.pagination.nextCursor) break;
        index += 1;
      }
      if (!controller.signal.aborted) setState({ key: input.key, paged: { status: "ready", page, index } });
    })().catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      const status = cause instanceof ApiTransportError ? cause.status : 0;
      setState({ key: input.key, paged: { status: "failed", access: status === 403 } });
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.enabled, input.key, input.page, input.attempt]);
  return state.key === input.key ? state.paged : { status: "loading" };
}

const text = (value: JsonValue | undefined) => (typeof value === "string" || typeof value === "number" ? String(value) : undefined);

function axisLabel(row: EntityListRowV1, identity: string, title: string | undefined): { readonly code: string; readonly title?: string } {
  const value = (key: string) => row.displayValues?.[key] ?? text(row.values[key]);
  const code = value(identity) ?? "—";
  const named = title ? value(title) : undefined;
  return { code, ...(named && named !== code ? { title: named } : {}) };
}

function measureText(row: EntityListRowV1, measure: ListMatrixMeasureV1, intl: EntityIntl): string {
  const field = { key: measure.key, label: measure.label, valueKind: measure.valueKind } as ListFieldDescriptorV1;
  const shown = row.displayValues?.[measure.key] ?? formatFieldValue(row.values[measure.key], field, intl);
  const currency = measure.currencyField ? text(row.values[measure.currencyField]) : undefined;
  const unit = measure.unitField ? text(row.values[measure.unitField]) : undefined;
  return [currency, shown, unit ? `/ ${unit}` : undefined].filter(Boolean).join(" ");
}

export function EntityMatrix(props: EntityMatrixProps) {
  const intl = useEntityI18n();
  const { matrix, state, client } = props;
  const saved: ListMatrixStateV1 = state.matrix ?? { measures: matrixPresets(matrix).everything, columns: [] };
  const measures = shownMeasures(matrix, saved.measures);
  const rank = rankedMeasure(matrix);
  const parent: MatrixParent = matrixParent(matrix, state.filters);
  const parentId = parent.kind === "chosen" ? parent.id : parent.kind === "locked" ? props.scope?.parentRecordId : undefined;
  const filtered = factFilters(matrix, state.filters);
  const rowPage = state.matrixRowPage ?? 0;
  const columnPage = state.matrixColumnPage ?? 0;
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [comparing, setComparing] = useState<ListCompareLocationV1>();
  const [baseRevision, setBaseRevision] = useState<{ key: string; revision: string }>();
  const requests = useRef(0);
  const count = () => {
    requests.current += 1;
  };
  const ready = Boolean(parentId) || parent.kind === "chosen";
  const scopeKey = JSON.stringify([props.refreshKey, parentId ?? null]);

  const rows = usePagedList({
    client,
    entityCode: matrix.rows.entity,
    enabled: ready,
    key: JSON.stringify([scopeKey, search]),
    build: (cursor) => matrixRowsQuery({ matrix, parent, ...(parentId ? { parentId } : {}), search, ...(cursor ? { cursor } : {}) }),
    page: rowPage,
    attempt,
    count,
  });
  const columns = usePagedList({
    client,
    entityCode: matrix.columns.entity,
    enabled: ready,
    key: JSON.stringify([scopeKey, saved.columns]),
    build: (cursor) => matrixColumnsQuery({ matrix, parent, ...(parentId ? { parentId } : {}), pinned: saved.columns, ...(cursor ? { cursor } : {}) }),
    page: columnPage,
    attempt,
    count,
  });
  const rowIds = rows.status === "ready" ? rows.page.rows.map((row) => row.id) : [];
  const columnModels = useMemo(() => (columns.status === "ready" ? matrixColumns(matrix, columns.page.rows) : []), [columns, matrix]);
  const columnIds = columnModels.map((column) => column.id);
  const cellsKey = JSON.stringify([scopeKey, rowIds, columnIds, filtered, measures.map((item) => item.key), saved.columns, attempt]);
  const [cells, setCells] = useState<{ key: string; block?: MatrixBlock; failed?: boolean; revision?: string }>({ key: "" });
  useEffect(() => {
    if (!ready || !rowIds.length || !columnIds.length) return;
    const controller = new AbortController();
    count();
    client
      .request(entityListOperation, {
        params: { entityCode: props.descriptor.entity.code },
        query: matrixCellsQuery({ matrix, parent, measures, rowKeys: rowIds, columnKeys: columnIds, pinned: saved.columns, filters: state.filters, ...(props.scope ? { scope: props.scope } : {}) }) as never,
        signal: controller.signal,
      })
      .then((page) => {
        if (controller.signal.aborted) return;
        if (page.descriptorHash !== props.descriptor.revision.descriptorHash || page.scopeFingerprint !== props.descriptor.scope.fingerprint)
          throw new TypeError("Matrix response authority no longer matches its descriptor");
        setCells({
          key: cellsKey,
          block: buildMatrixBlock({ matrix, rowIds, columns: columnModels, facts: page.rows, ...(page.ranks ? { ranks: page.ranks } : {}), hasNext: page.pagination.hasNext, filtered: filtered.length > 0 }),
          ...(page.rankRevision ? { revision: page.rankRevision } : {}),
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setCells({ key: cellsKey, failed: true });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellsKey, ready]);
  const block = cells.key === cellsKey ? cells.block : undefined;

  // The ranked set's revision: the first page fixes it for this parent and
  // these filters; a later page ranked from different data says so.
  const revisionKey = JSON.stringify([scopeKey, filtered, saved.columns]);
  useEffect(() => {
    if (cells.key !== cellsKey || !cells.revision) return;
    if (!baseRevision || baseRevision.key !== revisionKey) setBaseRevision({ key: revisionKey, revision: cells.revision });
  }, [cells, cellsKey, revisionKey, baseRevision]);
  const revisionChanged = Boolean(cells.key === cellsKey && cells.revision && baseRevision?.key === revisionKey && baseRevision.revision !== cells.revision);

  // Coverage per column (section 5.4 point 4): one group count per parent.
  const columnField = props.descriptor.fields.find((field) => field.key === matrix.columns.field);
  const coverageOffered = Boolean(matrix.exactCounts && columnField?.groupable && ready);
  const [coverage, setCoverage] = useState<{ key: string; counts?: ReadonlyMap<string, number>; truncated?: boolean }>({ key: "" });
  useEffect(() => {
    if (!coverageOffered) return;
    const controller = new AbortController();
    count();
    client
      .request(entityListOperation, {
        params: { entityCode: props.descriptor.entity.code },
        query: matrixCoverageQuery({ matrix, parent, ...(props.scope ? { scope: props.scope } : {}) }) as never,
        signal: controller.signal,
      })
      .then((page) => {
        if (controller.signal.aborted) return;
        setCoverage({
          key: scopeKey,
          counts: new Map((page.groups ?? []).flatMap((group) => (text(group.value) !== undefined && group.count !== undefined ? [[text(group.value)!, group.count] as const] : []))),
          ...(page.groupsTruncated ? { truncated: true } : {}),
        });
      })
      .catch(() => undefined);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, coverageOffered, attempt]);
  const coverageCounts = coverage.key === scopeKey ? coverage.counts : undefined;
  const itemTotal = rows.status === "ready" ? rows.page.pagination.total : undefined;

  // Drill-down (section 5.4 point 6): the column Entity's own Compare,
  // offered only once its descriptor shows one; read when a choice begins.
  const [columnDescriptor, setColumnDescriptor] = useState<EntityListDescriptorV1 | "unavailable">();
  useEffect(() => {
    if (selected.length < COMPARE_MIN_RECORDS || columnDescriptor) return;
    const controller = new AbortController();
    client
      .request(entityListDescriptorOperation, { params: { entityCode: matrix.columns.entity }, signal: controller.signal })
      .then((next) => !controller.signal.aborted && setColumnDescriptor(next.surface.compare ? next : "unavailable"))
      .catch(() => !controller.signal.aborted && setColumnDescriptor("unavailable"));
    return () => controller.abort();
  }, [selected.length, columnDescriptor, client, matrix.columns.entity]);

  const change = (next: Partial<ListMatrixStateV1>, pages: { readonly row?: number; readonly column?: number } = {}) =>
    props.onMatrixChange({
      matrix: { ...saved, ...next },
      matrixRowPage: pages.row ?? rowPage,
      matrixColumnPage: pages.column ?? columnPage,
    });

  if (!ready)
    return (
      <section className="a-entity-matrix" aria-label={intl.message("list.mode.matrix")}>
        <div className="a-entity-matrix__state" role="status">
          <p>{intl.message("list.matrix.chooseParent", { parent: matrix.parentLabel })}</p>
          <p className="a-entity-matrix__hint">{intl.message("list.matrix.chooseParentHint", { parent: matrix.parentLabel })}</p>
        </div>
      </section>
    );

  const failed = rows.status === "failed" || columns.status === "failed" || (cells.key === cellsKey && cells.failed);
  const loading = !failed && (rows.status === "loading" || columns.status === "loading" || (rowIds.length > 0 && columnIds.length > 0 && !block));
  const currency = block ? basisCurrency(block, rank) : undefined;
  const basis = rank ? [currency, matrix.basisLabel].filter(Boolean).join(" · ") : undefined;
  const rowTotal = rows.status === "ready" ? rows.page.pagination.total : undefined;
  const columnTotal = columns.status === "ready" ? columns.page.pagination.total : undefined;
  // A page past the end (after the filters narrowed) settles on the last one.
  const rowIndex = rows.status === "ready" ? rows.index : rowPage;
  const columnIndex = columns.status === "ready" ? columns.index : columnPage;
  const rowStart = rowIndex * MATRIX_ROWS_PER_PAGE + 1;
  const columnStart = columnIndex * MATRIX_COLUMNS_PER_PAGE + 1;
  const presets = matrixPresets(matrix);
  const preset = saved.measures.length === 1 && saved.measures[0] === presets.primary[0] ? "primary" : "everything";
  const compareDescriptor = columnDescriptor && columnDescriptor !== "unavailable" ? columnDescriptor : undefined;
  const compareOffered = Boolean(compareDescriptor) && selected.length >= COMPARE_MIN_RECORDS && selected.length <= COMPARE_MAX_RECORDS;

  const rankLine = (cell: Extract<MatrixCellState, { kind: "value" }>, column: MatrixColumnModel, differ: boolean): string | undefined => {
    if (!rank || cell.row.values[rank.key] === null || cell.row.values[rank.key] === undefined) return undefined;
    if (column.ineligible) return intl.message("list.matrix.notEligibleRank");
    if (!cell.rank) return undefined;
    if (differ) return intl.message("list.matrix.unitsDiffer");
    if (cell.rank.rank === 1) return intl.message(rank.better === "lower" ? "list.matrix.lowest" : "list.matrix.highest");
    return [intl.message("list.matrix.rankOf", { rank: cell.rank.rank, count: cell.rank.count }), cell.rank.difference ? `+${cell.rank.difference}%` : undefined].filter(Boolean).join(" · ");
  };

  const cellContent = (rowId: string, rowName: string, column: MatrixColumnModel, columnName: string, first: boolean, differ: boolean) => {
    const cell = block?.status === "ready" ? block.cells.get(cellKey(rowId, column.id)) : undefined;
    if (!cell) return { label: "", body: null };
    if (cell.kind === "declined") {
      const label = intl.message("list.matrix.declined");
      return { label: `${rowName}, ${columnName}, ${label}`, body: first ? <span className="a-entity-matrix__declined">{label}</span> : <span className="a-visually-hidden">{label}</span>, declined: true };
    }
    if (cell.kind !== "value") {
      const label = cell.kind === "absent" ? (matrix.absentLabel ?? intl.message("list.matrix.absent")) : "—";
      return { label: `${rowName}, ${columnName}, ${cell.kind === "absent" ? label : intl.message("list.matrix.noValueShown")}`, body: <span className="a-entity-matrix__empty">{label}</span> };
    }
    const values = measures.map((measure) => ({ measure, shown: measureText(cell.row, measure, intl) }));
    const line = rankLine(cell, column, differ);
    const best = cell.rank?.rank === 1 && !column.ineligible && !differ;
    return {
      label: [rowName, columnName, ...values.map((item) => (item.measure === measures[0] ? item.shown : `${item.measure.label} ${item.shown}`)), line].filter(Boolean).join(", "),
      body: (
        <>
          <span className="a-entity-matrix__primary">{values[0]?.shown}</span>
          {line ? <span className="a-entity-matrix__rank" data-best={best ? "" : undefined}>{line}</span> : null}
          {values.slice(1).map((item) => (
            <span key={item.measure.key} className="a-entity-matrix__secondary">
              <span>{item.measure.label}</span> {item.shown}
            </span>
          ))}
        </>
      ),
    };
  };

  const header = (column: MatrixColumnModel) => {
    const name = axisLabel(column.row, matrix.columns.identityField, matrix.columns.titleField);
    const covered = coverageCounts?.get(column.id);
    const partial = covered !== undefined && itemTotal !== undefined && covered < itemTotal;
    return { name, covered, partial };
  };

  const narrow = props.widthTier === "narrow";
  const columnHeaders = columnModels.map((column) => ({ column, ...header(column) }));
  const rowModels = rows.status === "ready" ? rows.page.rows.map((row) => ({ row, name: axisLabel(row, matrix.rows.identityField, matrix.rows.titleField) })) : [];

  return (
    <section className="a-entity-matrix" aria-label={intl.message("list.mode.matrix")} data-matrix-requests={requests.current}>
      <div className="a-entity-matrix__toolbar">
        {matrix.rows.searchable ? (
          <form
            className="a-entity-matrix__search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchDraft.trim());
              change({}, { row: 0 });
            }}
          >
            <input
              type="search"
              value={searchDraft}
              aria-label={intl.message("list.matrix.searchRows", { rows: matrix.rows.label })}
              placeholder={intl.message("list.matrix.searchRows", { rows: matrix.rows.label })}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </form>
        ) : null}
        {matrix.measures.length > 1 ? (
          <label className="a-entity-matrix__display">
            <span>{intl.message("list.matrix.display")}</span>
            <select value={preset} onChange={(event) => change({ measures: event.target.value === "primary" ? presets.primary : presets.everything })}>
              <option value="primary">{intl.message(rank ? "list.matrix.presetPrimaryRank" : "list.matrix.presetPrimary", { measure: matrix.measures[0]!.label })}</option>
              <option value="everything">{intl.message("list.matrix.presetEverything")}</option>
            </select>
          </label>
        ) : null}
        <span className="a-entity-matrix__spacer" />
        {saved.columns.length ? (
          <Button variant="secondary" size="small" onClick={() => change({ columns: [] }, { column: 0 })}>
            {intl.message("list.matrix.showAllColumns", { columns: matrix.columns.label })}
          </Button>
        ) : (
          <Button variant="secondary" size="small" disabled={!selected.length} onClick={() => change({ columns: selected }, { column: 0 })}>
            {intl.message("list.matrix.showSelectedColumns", { count: selected.length })}
          </Button>
        )}
        {columnDescriptor !== "unavailable" ? (
          <Button variant="secondary" size="small" disabled={!compareOffered} onClick={() => setComparing({ records: [...selected] })}>
            {intl.message("list.matrix.compareSelected", { count: selected.length })}
          </Button>
        ) : null}
      </div>
      {basis ? (
        <p className="a-entity-matrix__basis">
          {intl.message("list.matrix.basis", { basis, measure: rank!.label })}
        </p>
      ) : null}
      {revisionChanged ? (
        <div className="a-entity-matrix__notice" role="status">
          <span>{intl.message("list.matrix.revisionChanged")}</span>
          <Button variant="secondary" size="small" onClick={() => { setBaseRevision(undefined); setAttempt((value) => value + 1); }}>
            {intl.message("list.matrix.refresh")}
          </Button>
        </div>
      ) : null}
      {matrix.fieldsRestricted ? <p className="a-entity-matrix__hint">{intl.message("list.matrix.fieldsRestricted")}</p> : null}
      {filtered.length ? <p className="a-entity-matrix__hint">{intl.message("list.matrix.filteredCells")}</p> : null}
      {failed ? (
        <div className="a-entity-matrix__state" role="alert">
          <p>{intl.message("list.matrix.failed")}</p>
          <Button variant="secondary" size="small" onClick={() => setAttempt((value) => value + 1)}>{intl.message("list.matrix.retry")}</Button>
        </div>
      ) : block?.status === "incomplete" ? (
        <div className="a-entity-matrix__state" role="alert">
          <p>{intl.message("list.matrix.incomplete")}</p>
          <Button variant="secondary" size="small" onClick={() => setAttempt((value) => value + 1)}>{intl.message("list.matrix.retry")}</Button>
        </div>
      ) : loading ? (
        <div className="a-entity-matrix__state" aria-busy="true"><p>{intl.message("list.matrix.loading")}</p></div>
      ) : !rowModels.length || !columnHeaders.length ? (
        <div className="a-entity-matrix__state" role="status">
          <p>{intl.message(!rowModels.length ? "list.matrix.noRows" : "list.matrix.noColumns", { rows: matrix.rows.label, columns: matrix.columns.label })}</p>
        </div>
      ) : narrow ? (
        <ol className="a-entity-matrix__narrow">
          {rowModels.map(({ row, name }) => {
            const differ = block ? unitsDiffer(block, row.id, columnModels, rank) : false;
            return (
              <li key={row.id}>
                <h3>{name.code}{name.title ? <span> {name.title}</span> : null}</h3>
                <dl>
                  {columnHeaders.map(({ column, name: columnName }) => {
                    const content = cellContent(row.id, name.code, column, columnName.code, true, differ);
                    return (
                      <div key={column.id}>
                        <dt>{columnName.code}</dt>
                        <dd aria-label={content.label}>{content.body}</dd>
                      </div>
                    );
                  })}
                </dl>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="a-entity-matrix__scroll">
          <table className="a-entity-matrix__table">
            <caption className="a-visually-hidden">
              {intl.message("list.matrix.caption", { rows: matrix.rows.label, columns: matrix.columns.label, measure: measures[0]!.label })}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="a-entity-matrix__corner">
                  {matrix.rows.label}
                  <span className="a-entity-matrix__secondary">{measures[0]!.label}</span>
                </th>
                {columnHeaders.map(({ column, name, covered, partial }) => {
                  const checked = selected.includes(column.id);
                  return (
                    <th key={column.id} scope="col" data-declined={column.declined ? "" : undefined}>
                      <label className="a-entity-matrix__select">
                        <input
                          type="checkbox"
                          checked={checked}
                          aria-label={intl.message("list.matrix.selectColumn", { column: name.code })}
                          onChange={() => setSelected((current) => (checked ? current.filter((id) => id !== column.id) : [...current, column.id].slice(-COMPARE_MAX_RECORDS)))}
                        />
                        <span className="a-entity-matrix__code">{name.code}</span>
                      </label>
                      {name.title ? <span className="a-entity-matrix__title">{name.title}</span> : null}
                      {matrix.columns.headerFields.map((field) => {
                        const value = column.row.displayValues?.[field.key] ?? formatFieldValue(column.row.values[field.key], field as ListFieldDescriptorV1, intl);
                        return (
                          <span key={field.key} className="a-entity-matrix__secondary">
                            <span>{field.label}</span> {value}
                          </span>
                        );
                      })}
                      {covered !== undefined && itemTotal !== undefined ? (
                        <span className="a-entity-matrix__secondary">{intl.message("list.matrix.coverage", { count: covered, total: itemTotal, rows: matrix.rows.label })}</span>
                      ) : null}
                      <span className="a-entity-matrix__chips">
                        {partial ? <span className="a-entity-matrix__chip" data-tone="warning">{intl.message("list.matrix.partial")}</span> : null}
                        {column.ineligible ? <span className="a-entity-matrix__chip" data-tone="neutral">{intl.message("list.matrix.notEligible")}</span> : null}
                        {column.declined ? <span className="a-entity-matrix__chip" data-tone="neutral">{intl.message("list.matrix.declinedChip")}</span> : null}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rowModels.map(({ row, name }, rowIndex) => {
                const differ = block ? unitsDiffer(block, row.id, columnModels, rank) : false;
                return (
                  <tr key={row.id}>
                    <th scope="row">
                      <span className="a-entity-matrix__code">{name.code}</span>
                      {name.title ? <span className="a-entity-matrix__title">{name.title}</span> : null}
                    </th>
                    {columnHeaders.map(({ column, name: columnName }) => {
                      const content = cellContent(row.id, name.code, column, columnName.code, rowIndex === 0, differ);
                      return (
                        <td key={column.id} aria-label={content.label} data-declined={content.declined ? "" : undefined}>
                          {content.body}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="a-entity-matrix__paging">
        <span>
          {intl.message(rowTotal !== undefined ? "list.matrix.rowsOf" : "list.matrix.rowsFrom", { rows: matrix.rows.label, from: rowStart, to: rowStart + rowIds.length - 1, total: rowTotal ?? 0 })}
        </span>
        <Button variant="secondary" size="small" disabled={rowIndex === 0} onClick={() => change({}, { row: rowIndex - 1 })}>
          {intl.message("list.matrix.previousRows", { rows: matrix.rows.label })}
        </Button>
        <Button variant="secondary" size="small" disabled={rows.status !== "ready" || !rows.page.pagination.hasNext} onClick={() => change({}, { row: rowIndex + 1 })}>
          {intl.message("list.matrix.nextRows", { rows: matrix.rows.label })}
        </Button>
        <span className="a-entity-matrix__spacer" />
        <span>
          {intl.message(columnTotal !== undefined ? "list.matrix.columnsOf" : "list.matrix.columnsFrom", { columns: matrix.columns.label, from: columnStart, to: columnStart + columnIds.length - 1, total: columnTotal ?? 0 })}
        </span>
        <Button variant="secondary" size="small" disabled={columnIndex === 0} onClick={() => change({}, { column: columnIndex - 1 })}>
          {intl.message("list.matrix.previousColumns", { columns: matrix.columns.label })}
        </Button>
        <Button variant="secondary" size="small" disabled={columns.status !== "ready" || !columns.page.pagination.hasNext} onClick={() => change({}, { column: columnIndex + 1 })}>
          {intl.message("list.matrix.nextColumns", { columns: matrix.columns.label })}
        </Button>
      </div>
      {comparing && compareDescriptor ? (
        <ComparePanel
          client={client}
          descriptor={compareDescriptor}
          compare={compareDescriptor.surface.compare!}
          location={comparing}
          narrow={narrow}
          onChange={setComparing}
          onClose={() => setComparing(undefined)}
        />
      ) : null}
    </section>
  );
}
