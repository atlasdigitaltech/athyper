"use client";
import React, { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { entityListOperation, entityListQuery, type HttpClient } from "@athyper/platform-api-client";
import {
  LIST_AGGREGATE_REQUEST_MEASURES,
  LIST_GROUP_LIMIT,
  type EntityListDescriptorV1,
  type EntityListResultV1,
  type EntityListScopeCoordinateV1,
  type ListAggregateMeasureV1,
  type ListAggregateStateV1,
  type ListAggregateV1,
  type ListFieldDescriptorV1,
  type ListFilterV1,
  type ListGroupTotalsV1,
  type ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { Button, Checkbox, ChoiceSelect, Label } from "@athyper/platform-ui";
import { formatFieldValue } from "../field-format";
import type { ListWidthTier } from "../presentation-tier";
import { handleTreeKeyDown } from "../tree/tree-keyboard";
import { TreeIndent, TreeToggle } from "../tree/tree-parts";
import {
  choiceLabel,
  levelOptions,
  sameTotals,
  summaryCell,
  summaryLevels,
  summaryMeasures,
  summaryQuery,
  summaryRows,
  summaryState,
  type SummaryLevel,
  type SummaryRow,
} from "./aggregate-model";

// The Aggregate Layout, shown as Summary (Entity list Aggregate blueprint
// sections 7, 11 and 12): grouped rows at up to three levels, the declared
// measures in each cell, the total first. Opening sends one request and each
// expansion one more; every number comes from the server, every state that
// is not a number is text, and a cell drills down to its records in Table.

type EntityIntl = ReturnType<typeof useEntityI18n>;

export interface EntityAggregateProps {
  readonly client: HttpClient;
  readonly descriptor: EntityListDescriptorV1;
  readonly aggregate: ListAggregateV1;
  readonly state: ListLocationStateV1;
  readonly scope?: EntityListScopeCoordinateV1;
  readonly widthTier?: ListWidthTier;
  readonly refreshKey: string;
  readonly timeZone?: string;
  readonly onAggregateChange: (change: Pick<ListLocationStateV1, "aggregate">) => void;
  /** Opens Table with these filters added: exactly the records a cell counted. */
  readonly onDrillDown: (filters: readonly ListFilterV1[]) => void;
}

type Loaded =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "ready"; readonly rows: readonly SummaryRow[]; readonly parent?: ListGroupTotalsV1; readonly truncated: boolean };

/** One level's groups under a parent: one request (section 7.1). */
function useLevel(input: {
  readonly client: HttpClient;
  readonly descriptor: EntityListDescriptorV1;
  readonly state: ListLocationStateV1;
  readonly scope?: EntityListScopeCoordinateV1;
  readonly level: SummaryLevel | undefined;
  readonly filters: readonly ListFilterV1[];
  readonly measures: readonly ListAggregateMeasureV1[];
  readonly timeZone?: string;
  readonly identity: string;
  readonly count: () => void;
}): Loaded {
  const [loaded, setLoaded] = useState<{ readonly key: string; readonly value: Loaded }>({ key: "", value: { status: "loading" } });
  const latest = useRef(input);
  latest.current = input;
  const key = input.level ? JSON.stringify([input.identity, input.level.entry, input.filters, input.measures.map((item) => item.key)]) : "";
  useEffect(() => {
    const { client, descriptor, state, scope, level, filters, measures, timeZone } = latest.current;
    if (!key || !level) return;
    const controller = new AbortController();
    latest.current.count();
    client
      .request(entityListOperation, {
        params: { entityCode: descriptor.entity.code },
        query: entityListQuery(summaryQuery({ state, level, filters, measures, identityField: descriptor.entity.identityField, ...(timeZone ? { timeZone } : {}) }), descriptor, scope),
        signal: controller.signal,
      })
      .then((page: EntityListResultV1) => {
        if (controller.signal.aborted) return;
        if (page.descriptorHash !== descriptor.revision.descriptorHash || page.scopeFingerprint !== descriptor.scope.fingerprint)
          throw new TypeError("Summary response authority no longer matches its descriptor");
        setLoaded({
          key,
          value: {
            status: "ready",
            rows: summaryRows(page.groups ?? [], level, timeZone),
            ...(page.parentGroup ? { parent: page.parentGroup } : {}),
            truncated: page.groupsTruncated === true,
          },
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ key, value: { status: "failed" } });
      });
    return () => controller.abort();
  }, [key]);
  return loaded.key === key ? loaded.value : { status: "loading" };
}

function bucketLabel(value: unknown, unit: SummaryLevel["unit"], intl: EntityIntl): string | undefined {
  if (!unit || typeof value !== "string") return undefined;
  const quarter = /^(\d{4})-Q([1-4])$/.exec(value);
  if (quarter) return intl.message("list.gantt.quarterTitle", { quarter: Number(quarter[2]), year: quarter[1]! });
  if (/^\d{4}-\d{2}$/.test(value)) return intl.date(`${value}-01T00:00:00Z`, { month: "long", year: "numeric", timeZone: "UTC" });
  return undefined;
}

function rowLabel(row: SummaryRow, level: SummaryLevel, intl: EntityIntl): string {
  if (row.kind === "none") return intl.message("list.board.noValue");
  return bucketLabel(row.value, level.unit, intl) ?? choiceLabel(level.field, row.value, row.label);
}

function levelName(level: SummaryLevel, intl: EntityIntl): string {
  return level.unit
    ? intl.message(level.unit === "month" ? "list.group.byMonth" : "list.group.byQuarter", { field: level.dimension.label })
    : level.dimension.label;
}

export function measureLabel(measure: ListAggregateMeasureV1, intl: EntityIntl): string {
  if (measure.aggregate === "count") return intl.message("list.aggregate.measure.count");
  if (measure.aggregate === "countDistinct") return intl.message("list.aggregate.measure.countDistinct", { field: measure.label ?? "" });
  return intl.message(`list.group.aggregate.${measure.aggregate}`, { field: measure.label ?? "" });
}

function cellText(totals: ListGroupTotalsV1, measure: ListAggregateMeasureV1, intl: EntityIntl): string {
  const cell = summaryCell(totals, measure);
  switch (cell.kind) {
    case "value": {
      if (measure.aggregate === "count" || measure.aggregate === "countDistinct") return intl.number(Number(cell.value));
      const field = { key: measure.field ?? measure.key, label: measure.label ?? "", valueKind: measure.valueKind ?? "decimal" } as ListFieldDescriptorV1;
      return [formatFieldValue(cell.value, field, intl), cell.currency].filter(Boolean).join(" ");
    }
    case "empty":
      return "—";
    case "notSummable":
      return intl.message("list.aggregate.notSummable", { fields: (measure.timeFields ?? []).map((item) => item.label).join(", ") });
    case "suppressed":
      return intl.message("list.aggregate.suppressed");
    case "mixedCurrency":
      return intl.message("list.group.mixedCurrencies");
    case "unknownCurrency":
      return intl.message("list.group.unknownCurrency");
  }
}

export function EntityAggregate(props: EntityAggregateProps) {
  const intl = useEntityI18n();
  const { aggregate, descriptor, state } = props;
  const summary: ListAggregateStateV1 = summaryState(state, aggregate);
  const levels = useMemo(() => summaryLevels(aggregate, descriptor, summary.rows), [aggregate, descriptor, summary.rows]);
  const measures = useMemo(() => summaryMeasures(aggregate, summary.measures), [aggregate, summary.measures]);
  const [attempt, setAttempt] = useState(0);
  const [changed, setChanged] = useState(false);
  const requests = useRef(0);
  const count = () => {
    requests.current += 1;
  };
  // Everything a level's numbers depend on; a change starts again collapsed.
  const identity = JSON.stringify([props.refreshKey, attempt, state.filters, state.query ?? null, state.standardViewKey ?? null, summary.rows, summary.measures]);
  const [expanded, setExpanded] = useState<{ readonly identity: string; readonly keys: ReadonlySet<string> }>({ identity, keys: new Set() });
  const open = expanded.identity === identity ? expanded.keys : new Set<string>();
  const toggle = (key: string) =>
    setExpanded(() => {
      const next = new Set(open);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { identity, keys: next };
    });
  const shared = { client: props.client, descriptor, state, ...(props.scope ? { scope: props.scope } : {}), measures, ...(props.timeZone ? { timeZone: props.timeZone } : {}), identity, count };
  const top = useLevel({ ...shared, level: levels[0], filters: [] });
  const narrow = props.widthTier === "narrow";
  const change = (next: Partial<ListAggregateStateV1>) => {
    setChanged(false);
    props.onAggregateChange({ aggregate: { ...summary, ...next } });
  };
  const refresh = () => {
    setChanged(false);
    setAttempt((value) => value + 1);
  };

  const pickers = (
    <div className="a-entity-aggregate__toolbar">
      <fieldset className="a-entity-aggregate__rows">
        <legend>{intl.message("list.aggregate.rows")}</legend>
        {[0, 1, 2].slice(0, Math.min(3, summary.rows.length + 1)).map((index) => {
          const options = levelOptions(aggregate, summary.rows, index);
          if (index > 0 && !options.length && index >= summary.rows.length) return null;
          return (
            <span key={index} className="a-entity-aggregate__level">
            <ChoiceSelect
              label={intl.message("list.aggregate.level", { level: index + 1 })}
              value={summary.rows[index] ?? ""}
              placeholder={intl.message("list.aggregate.levelNone")}
              options={[
                ...(index > 0 ? [{ value: "", label: intl.message("list.aggregate.levelNone") }] : []),
                ...options.map((option) => ({
                  value: option.entry,
                  label: option.unit
                    ? intl.message(option.unit === "month" ? "list.group.byMonth" : "list.group.byQuarter", { field: option.dimension.label })
                    : option.dimension.label,
                })),
              ]}
              onChange={(entry) =>
                change({ rows: entry ? [...summary.rows.slice(0, index), entry, ...summary.rows.slice(index + 1)].slice(0, 3) : summary.rows.slice(0, index) })
              }
            />
            </span>
          );
        })}
      </fieldset>
      <fieldset className="a-entity-aggregate__measures">
        <legend>{intl.message("list.aggregate.measures")}</legend>
        {aggregate.measures.map((measure) => {
          const checked = summary.measures.includes(measure.key);
          const full = !checked && summary.measures.length >= LIST_AGGREGATE_REQUEST_MEASURES;
          return (
            <Label key={measure.key} className="a-entity-aggregate__measure">
              <Checkbox
                checked={checked}
                disabled={full || (checked && summary.measures.length === 1)}
                onChange={() =>
                  change({
                    // Kept in declared order, so a shared link reads the same.
                    measures: aggregate.measures.map((item) => item.key).filter((key) => (key === measure.key ? !checked : summary.measures.includes(key))),
                  })
                }
              />
              <span>{measureLabel(measure, intl)}</span>
            </Label>
          );
        })}
        {summary.measures.length >= LIST_AGGREGATE_REQUEST_MEASURES ? (
          <span className="a-entity-aggregate__hint">{intl.message("list.aggregate.measureLimit", { count: LIST_AGGREGATE_REQUEST_MEASURES })}</span>
        ) : null}
      </fieldset>
    </div>
  );

  const notices = (
    <>
      {aggregate.fieldsRestricted ? <p className="a-entity-aggregate__hint">{intl.message("list.aggregate.fieldsRestricted")}</p> : null}
      {changed ? (
        <div className="a-entity-aggregate__notice" role="status">
          <span>{intl.message("list.aggregate.changed")}</span>
          <Button variant="secondary" size="small" onClick={refresh}>
            {intl.message("list.aggregate.refresh")}
          </Button>
        </div>
      ) : null}
    </>
  );

  let body: ReactNode;
  if (!levels.length || top.status === "loading")
    body = <div className="a-entity-aggregate__state" aria-busy="true"><p>{intl.message("list.aggregate.loading")}</p></div>;
  else if (top.status === "failed")
    body = (
      <div className="a-entity-aggregate__state" role="alert">
        <p>{intl.message("list.aggregate.failed")}</p>
        <Button variant="secondary" size="small" onClick={refresh}>{intl.message("list.aggregate.retry")}</Button>
      </div>
    );
  else if (!top.rows.length)
    body = <div className="a-entity-aggregate__state" role="status"><p>{intl.message("list.aggregate.noRecords")}</p></div>;
  else {
    const context: RowContext = { levels, measures, intl, open, toggle, narrow, onDrillDown: props.onDrillDown, onChanged: () => setChanged(true), shared };
    const total = top.parent;
    const rows = (
      <>
        {total ? <TotalRow totals={total} context={context} /> : null}
        {top.rows.map((row, index) => (
          <SummaryNode key={row.key} row={row} depth={0} ancestors={[]} parentPath="" context={context} position={index + 1} size={top.rows.length} first={index === 0} />
        ))}
        {top.truncated ? <Notice depth={0} context={context} text={intl.message("list.aggregate.truncated", { count: LIST_GROUP_LIMIT, dimension: levels[0]!.dimension.label })} /> : null}
      </>
    );
    body = narrow ? (
      <div className="a-entity-aggregate__narrow" role="treegrid" aria-label={intl.message("list.mode.aggregate")} onKeyDown={handleTreeKeyDown}>
        {rows}
      </div>
    ) : (
      <div className="a-entity-aggregate__scroll">
        <table className="a-entity-aggregate__table" role="treegrid" aria-label={intl.message("list.mode.aggregate")} onKeyDown={handleTreeKeyDown}>
          <caption className="a-visually-hidden">
            {intl.message("list.aggregate.caption", { entity: descriptor.entity.pluralLabel, levels: levels.map((level) => levelName(level, intl)).join(" › ") })}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="a-entity-aggregate__corner">
                {levels.map((level) => levelName(level, intl)).join(" › ")}
              </th>
              {measures.map((measure) => (
                <th key={measure.key} scope="col">{measureLabel(measure, intl)}</th>
              ))}
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
    );
  }

  return (
    <section className="a-entity-aggregate" aria-label={intl.message("list.mode.aggregate")} data-aggregate-requests={requests.current}>
      {pickers}
      {notices}
      {body}
    </section>
  );
}

interface RowContext {
  readonly levels: readonly SummaryLevel[];
  readonly measures: readonly ListAggregateMeasureV1[];
  readonly intl: EntityIntl;
  readonly open: ReadonlySet<string>;
  readonly toggle: (key: string) => void;
  readonly narrow: boolean;
  readonly onDrillDown: (filters: readonly ListFilterV1[]) => void;
  readonly onChanged: () => void;
  readonly shared: Omit<Parameters<typeof useLevel>[0], "level" | "filters">;
}

function Cells({ totals, context, label }: { readonly totals: ListGroupTotalsV1; readonly context: RowContext; readonly label: string }) {
  return (
    <>
      {context.measures.map((measure) => {
        const text = cellText(totals, measure, context.intl);
        const kind = summaryCell(totals, measure).kind;
        return context.narrow ? (
          <div key={measure.key} className="a-entity-aggregate__pair" data-state={kind === "value" ? undefined : kind}>
            <span>{measureLabel(measure, context.intl)}</span>
            <span>{text}</span>
          </div>
        ) : (
          <td key={measure.key} aria-label={`${label}, ${measureLabel(measure, context.intl)} ${text}`} data-state={kind === "value" ? undefined : kind}>
            {text}
          </td>
        );
      })}
    </>
  );
}

function TotalRow({ totals, context }: { readonly totals: ListGroupTotalsV1; readonly context: RowContext }) {
  const label = context.intl.message("list.aggregate.total");
  const drill = (
    <button
      type="button"
      className="a-entity-aggregate__drill"
      onClick={() => context.onDrillDown([])}
      aria-label={context.intl.message("list.aggregate.showAllRecords", { count: totals.count ?? 0 })}
    >
      {label}
    </button>
  );
  if (context.narrow)
    return (
      <div className="a-entity-aggregate__item" data-total="">
        <div className="a-entity-aggregate__heading">{drill}</div>
        <Cells totals={totals} context={context} label={label} />
      </div>
    );
  return (
    <tr className="a-entity-aggregate__total">
      <th scope="row">{drill}</th>
      <Cells totals={totals} context={context} label={label} />
    </tr>
  );
}

function SummaryNode({
  row,
  depth,
  ancestors,
  parentPath,
  context,
  position,
  size,
  first,
}: {
  readonly row: SummaryRow;
  readonly depth: number;
  readonly ancestors: readonly ListFilterV1[];
  /** The parent's position path; rows are keyed by position, so no record
   * identity reaches the page, even in an attribute. */
  readonly parentPath: string;
  readonly context: RowContext;
  readonly position: number;
  readonly size: number;
  readonly first?: boolean;
}) {
  const { levels, intl } = context;
  const level = levels[depth]!;
  const filters = [...ancestors, ...row.filters];
  const path = `${parentPath}/${position}`;
  const next = levels[depth + 1];
  const expandable = Boolean(next);
  const expanded = expandable && context.open.has(path);
  const label = rowLabel(row, level, intl);
  const children = useLevel({ ...context.shared, level: expanded ? next : undefined, filters });
  // The expansion recomputes this row; a different figure means the data
  // changed since the summary opened (section 7.4).
  const reported = useRef("");
  useEffect(() => {
    if (children.status !== "ready" || !children.parent || reported.current === path) return;
    reported.current = path;
    if (!sameTotals(children.parent, row.totals, context.measures)) context.onChanged();
  }, [children, path, row.totals, context]);
  const drill = (
    <button
      type="button"
      className="a-entity-aggregate__drill"
      data-tree-open=""
      tabIndex={-1}
      onClick={() => context.onDrillDown(filters)}
      aria-label={intl.message("list.aggregate.showRecords", { count: row.totals.count ?? 0, group: label })}
    >
      {label}
    </button>
  );
  const toggle = (
    <TreeToggle
      expandable={expandable}
      expanded={expanded}
      label={next ? intl.message(expanded ? "list.aggregate.collapse" : "list.aggregate.expand", { dimension: levelName(next, intl), group: label }) : label}
      onToggle={() => context.toggle(path)}
    />
  );
  const rowProps = {
    "data-tree-key": path,
    "aria-level": depth + 1,
    "aria-setsize": size,
    "aria-posinset": position,
    ...(expandable ? { "aria-expanded": expanded } : {}),
    tabIndex: first ? 0 : -1,
  };
  const heading = (
    <>
      <TreeIndent level={depth + 1} />
      {toggle}
      {drill}
    </>
  );
  const own = context.narrow ? (
    <div className="a-entity-aggregate__item" role="row" {...rowProps}>
      <div className="a-entity-aggregate__heading">{heading}</div>
      <Cells totals={row.totals} context={context} label={label} />
    </div>
  ) : (
    <tr role="row" {...rowProps}>
      <th scope="row">
        <span className="a-entity-aggregate__heading">{heading}</span>
      </th>
      <Cells totals={row.totals} context={context} label={label} />
    </tr>
  );
  if (!expanded) return own;
  return (
    <>
      {own}
      {children.status === "loading" ? (
        <Notice depth={depth + 1} context={context} text={intl.message("list.aggregate.levelLoading")} />
      ) : children.status === "failed" ? (
        <Notice depth={depth + 1} context={context} text={intl.message("list.aggregate.levelFailed")} />
      ) : (
        <>
          {children.rows.map((child, index) => (
            <SummaryNode key={child.key} row={child} depth={depth + 1} ancestors={filters} parentPath={path} context={context} position={index + 1} size={children.rows.length} />
          ))}
          {children.truncated ? (
            <Notice depth={depth + 1} context={context} text={intl.message("list.aggregate.truncated", { count: LIST_GROUP_LIMIT, dimension: next!.dimension.label })} />
          ) : null}
        </>
      )}
    </>
  );
}

function Notice({ depth, context, text }: { readonly depth: number; readonly context: RowContext; readonly text: string }) {
  const content = (
    <span className="a-entity-aggregate__heading">
      <TreeIndent level={depth + 1} />
      <span className="a-entity-aggregate__hint">{text}</span>
    </span>
  );
  if (context.narrow) return <div className="a-entity-aggregate__message">{content}</div>;
  return (
    <tr className="a-entity-aggregate__message">
      <td colSpan={context.measures.length + 1}>{content}</td>
    </tr>
  );
}
