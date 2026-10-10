"use client";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  entityListOperation,
  entityListQuery,
  type HttpClient,
} from "@athyper/platform-api-client";
import type {
  EntityListDescriptorV1,
  EntityListResultV1,
  EntityListRowV1,
  EntityListScopeCoordinateV1,
  JsonValue,
  ListFieldDescriptorV1,
  ListFilterV1,
  ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import type { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { useListPages } from "../list-pages";
import { formatFieldValue } from "../field-format";
import {
  GROUP_HEADING_LIMIT,
  groupChoices,
  groupHeadings,
  groupLevel,
  headingFilters,
  limitHeadings,
  sumsAcross,
  type GroupHeading,
  type GroupLevel,
} from "./grouped-tree-model";
import { TreeIndent, TreeToggle } from "./tree-parts";

type EntityIntl = ReturnType<typeof useEntityI18n>;

/** A command from the tree strip, applied by every loaded node. `seq`
 * distinguishes repeated commands. */
export type TreeCommand = { readonly seq: number } & (
  | { readonly kind: "expandAll" }
  | { readonly kind: "collapseAll" }
  | { readonly kind: "level"; readonly level: number }
);

/** Where the grouped tree's queries come from: the list's own query (filters,
 * search, sort, page size, scope) and whether counts are exact. */
export interface GroupedTreeSource {
  readonly client: HttpClient;
  readonly scope?: EntityListScopeCoordinateV1;
  readonly refreshKey: string;
  readonly query: ListLocationStateV1;
  readonly exact: boolean;
  /** Per-group aggregates as `field:aggregate` (A2), exact counts only. */
  readonly aggregates?: readonly string[];
  /** The viewer's zone, for date buckets (A3). */
  readonly timeZone?: string;
}

interface TreeContext {
  readonly descriptor: EntityListDescriptorV1;
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly levels: readonly GroupLevel[];
  readonly source: GroupedTreeSource;
  readonly variant: "table" | "cards";
  readonly columnCount: number;
  readonly intl: EntityIntl;
  readonly command?: TreeCommand;
  readonly renderRecords: (
    rows: readonly EntityListRowV1[],
    level: number,
  ) => ReactNode;
  readonly onGroupRows?: (
    key: string,
    rows: readonly EntityListRowV1[],
  ) => void;
}
const Context = createContext<TreeContext | undefined>(undefined);

/** One request for the next level's groups under a parent (exact counts only):
 * `groupsOnly`, so no rows are fetched that the tree would never draw. */
function useGroupBuckets(input: {
  readonly ctx: TreeContext;
  readonly group: string | undefined;
  readonly filters: readonly ListFilterV1[];
}) {
  const { ctx, group, filters } = input;
  const [state, setState] = useState<{
    readonly buckets?: NonNullable<EntityListResultV1["groups"]>;
    readonly truncated?: boolean;
    readonly failed?: boolean;
  }>({});
  const key = group
    ? JSON.stringify([
        ctx.descriptor.revision.descriptorHash,
        ctx.descriptor.scope.fingerprint,
        group,
        filters,
        ctx.source.query.query ?? null,
        ctx.source.query.standardViewKey ?? null,
        ctx.source.query.filters,
        ctx.source.aggregates ?? null,
        ctx.source.timeZone ?? null,
        ctx.source.refreshKey,
      ])
    : undefined;
  const latest = useRef(input);
  latest.current = input;
  useEffect(() => {
    const { ctx, group, filters } = latest.current;
    if (!key || !group) return;
    const controller = new AbortController();
    setState({});
    ctx.source.client
      .request(entityListOperation, {
        params: { entityCode: ctx.descriptor.entity.code },
        query: entityListQuery(
          {
            ...ctx.source.query,
            filters: [...ctx.source.query.filters, ...filters],
            group,
            groupsOnly: true,
            cursor: undefined,
            ...(ctx.source.aggregates?.length
              ? { aggregates: ctx.source.aggregates }
              : {}),
            ...(groupLevel(group).unit && ctx.source.timeZone
              ? { timeZone: ctx.source.timeZone }
              : {}),
          },
          ctx.descriptor,
          ctx.source.scope,
        ),
        signal: controller.signal,
      })
      .then((page) => {
        if (controller.signal.aborted) return;
        if (
          page.descriptorHash !== ctx.descriptor.revision.descriptorHash ||
          page.scopeFingerprint !== ctx.descriptor.scope.fingerprint
        )
          throw new TypeError(
            "Group response authority no longer matches its descriptor",
          );
        setState({
          buckets: page.groups ?? [],
          ...(page.groupsTruncated ? { truncated: true } : {}),
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ failed: true });
      });
    // `key` captures every input; requests abort when the list state changes.
    return () => controller.abort();
  }, [key]);
  return state;
}

function headingLabel(
  heading: GroupHeading,
  intl: EntityIntl,
  unit?: GroupLevel["unit"],
): string {
  if (heading.kind === "none") return intl.message("list.board.noValue");
  if (heading.kind === "unmapped") return intl.message("list.gantt.unmapped");
  if (unit) {
    // A date bucket (A3): "October 2026" or "Q4 2026".
    const bucket = String(heading.value ?? "");
    const quarter = /^(\d{4})-Q([1-4])$/.exec(bucket);
    if (quarter)
      return intl.message("list.gantt.quarterTitle", {
        quarter: Number(quarter[2]),
        year: quarter[1]!,
      });
    return intl.date(`${bucket}-01T00:00:00Z`, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return heading.label ?? "";
}

/** A heading's aggregates (A2), labelled by field and aggregate. Values are
 * formatted like the field and without a floating-point round trip: decimal
 * text stays text. A money total shows its currency, or says the group spans
 * currencies instead of showing a meaningless sum. A sum the server withheld
 * because it would cross a semi-additive field's time field (decision 8)
 * says so in the Summary's own words. */
function headingAggregates(
  heading: GroupHeading,
  fields: readonly ListFieldDescriptorV1[],
  intl: EntityIntl,
): ReactNode {
  const entries: [string, number | string | null][] = [
    ...Object.entries(heading.aggregates ?? {}),
    ...Object.keys(heading.states ?? {})
      .filter((key) => !(key in (heading.aggregates ?? {})))
      .map((key): [string, null] => [key, null]),
  ];
  if (!entries.length) return null;
  return entries.map(([key, value]) => {
    const [fieldKey, aggregate] = key.split(":");
    const field = fields.find((item) => item.key === fieldKey);
    const mixed = heading.mixedCurrencies?.includes(key);
    const unknown = heading.unknownCurrencies?.includes(key);
    const state = heading.states?.[key];
    if (field && state)
      return (
        <span key={key} className="a-entity-tree__aggregate" data-state={state}>
          <span className="a-entity-tree__aggregate-label">
            {intl.message(`list.group.aggregate.${aggregate}`, { field: field.label })}
          </span>{" "}
          <span className="a-entity-tree__aggregate-value">
            {state === "notSummable"
              ? intl.message("list.aggregate.notSummable", { fields: (field.sumWithin ?? []).map((time) => time.label).join(", ") })
              : intl.message("list.aggregate.suppressed")}
          </span>
        </span>
      );
    if (!field || (value === null && !mixed && !unknown)) return null;
    const currency = heading.aggregateCurrencies?.[key];
    return (
      <span key={key} className="a-entity-tree__aggregate">
        <span className="a-entity-tree__aggregate-label">
          {intl.message(`list.group.aggregate.${aggregate}`, {
            field: field.label,
          })}
        </span>{" "}
        <span className="a-entity-tree__aggregate-value">
          {mixed
            ? intl.message("list.group.mixedCurrencies")
            : unknown
              ? intl.message("list.group.unknownCurrency")
              : `${formatFieldValue(value, field, intl)}${currency ? ` ${currency}` : ""}`}
        </span>
      </span>
    );
  });
}

function choicesFor(field: ListFieldDescriptorV1, intl: EntityIntl) {
  return groupChoices(field, {
    yes: intl.message("entity.value.yes"),
    no: intl.message("entity.value.no"),
  });
}

/** Records grouped under headings for up to three grouping fields, each group
 * loading its own content (Tree blueprint section 7.1). Table renders rows
 * inside the list's table body; Cards renders nested sections. */
export function GroupedTree({
  descriptor,
  groups,
  levelOne,
  levelOneTruncated,
  source,
  variant,
  columnCount,
  intl,
  command,
  renderRecords,
  onGroupRows,
}: {
  readonly descriptor: EntityListDescriptorV1;
  readonly groups: readonly string[];
  /** Level-1 buckets from the list's own groups-only page, under exact counts. */
  readonly levelOne?: NonNullable<EntityListResultV1["groups"]>;
  /** The server returned the first 50 level-1 groups of more. */
  readonly levelOneTruncated?: boolean;
  readonly source: GroupedTreeSource;
  readonly variant: "table" | "cards";
  readonly columnCount: number;
  readonly intl: EntityIntl;
  readonly command?: TreeCommand;
  readonly renderRecords: (
    rows: readonly EntityListRowV1[],
    level: number,
  ) => ReactNode;
  /** Each last-level group's loaded records (empty when it unmounts), so
   * selection can cover every loaded record. Must be stable. */
  readonly onGroupRows?: (
    key: string,
    rows: readonly EntityListRowV1[],
  ) => void;
}) {
  const levels = groups
    .map(groupLevel)
    .filter((level) =>
      descriptor.fields.some((field) => field.key === level.field),
    );
  const fields = levels.map((level) =>
    descriptor.fields.find((field) => field.key === level.field)!,
  );
  if (!fields.length) return null;
  const ctx: TreeContext = {
    descriptor,
    fields,
    levels,
    source,
    variant,
    columnCount,
    intl,
    ...(command ? { command } : {}),
    renderRecords,
    ...(onGroupRows ? { onGroupRows } : {}),
  };
  const all = groupHeadings(
    fields[0]!,
    choicesFor(fields[0]!, intl),
    source.exact ? (levelOne ?? []) : undefined,
    levels[0]!.unit,
    sumsAcross(descriptor, source.aggregates ?? [], fields[0]!.key),
  );
  const { headings, more } = limitHeadings(all);
  return (
    <Context.Provider value={ctx}>
      {headings.map((heading, index) => (
        <GroupNode
          key={heading.key}
          heading={heading}
          fieldIndex={0}
          level={1}
          path=""
          filters={[]}
          defaultExpanded={index === 0}
          first={index === 0}
        />
      ))}
      {levelOneTruncated || more ? (
        <Message
          level={1}
          text={intl.message("list.group.moreGroups", {
            count: GROUP_HEADING_LIMIT,
          })}
        />
      ) : null}
    </Context.Provider>
  );
}

function GroupNode({
  heading,
  fieldIndex,
  level,
  path,
  filters,
  defaultExpanded,
  first,
  visible = true,
}: {
  readonly heading: GroupHeading;
  readonly fieldIndex: number;
  readonly level: number;
  readonly path: string;
  readonly filters: readonly ListFilterV1[];
  readonly defaultExpanded: boolean;
  readonly first?: boolean;
  /** False while an ancestor is collapsed: the node stays mounted, keeping
   * what it loaded, so reopening sends no request. */
  readonly visible?: boolean;
}) {
  const ctx = useContext(Context)!;
  const { intl, source, variant } = ctx;
  const field = ctx.fields[fieldIndex]!;
  const unit = ctx.levels[fieldIndex]!.unit;
  const last = fieldIndex === ctx.fields.length - 1;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const loadedOnce = useRef(defaultExpanded);
  if (expanded) loadedOnce.current = true;
  const lastCommand = useRef(ctx.command?.seq);
  useEffect(() => {
    const command = ctx.command;
    if (!command || command.seq === lastCommand.current) return;
    lastCommand.current = command.seq;
    // Commands act on loaded nodes only: expanding never fans out into one
    // request per unloaded group (Tree blueprint section 8).
    if (command.kind === "collapseAll") setExpanded(false);
    else if (command.kind === "expandAll") {
      if (loadedOnce.current) setExpanded(true);
    } else setExpanded(level < command.level && loadedOnce.current);
  }, [ctx.command, level]);
  const filter = headingFilters(field, heading, unit, source.timeZone);
  const own = filter ? [...filters, ...filter] : filters;
  const key = `${path}/${heading.key}`;
  const label = headingLabel(heading, intl, unit);
  const nextField = last ? undefined : ctx.fields[fieldIndex + 1];
  const nextLevel = last ? undefined : ctx.levels[fieldIndex + 1];
  const nextEntry = nextLevel
    ? nextLevel.unit
      ? `${nextLevel.field}:${nextLevel.unit}`
      : nextLevel.field
    : undefined;
  const wantsBuckets =
    loadedOnce.current &&
    heading.kind !== "unmapped" &&
    nextField &&
    source.exact;
  const buckets = useGroupBuckets({
    ctx,
    group: wantsBuckets ? nextEntry : undefined,
    filters: own,
  });
  const wantsRecords =
    loadedOnce.current && heading.kind !== "unmapped" && last;
  const records = useListPages({
    client: source.client,
    descriptor: ctx.descriptor,
    query: wantsRecords
      ? {
          ...source.query,
          filters: [...source.query.filters, ...own],
          cursor: undefined,
        }
      : undefined,
    scope: source.scope,
    refreshKey: source.refreshKey,
  });
  const reportRows = ctx.onGroupRows;
  useEffect(() => {
    if (!reportRows || !last) return;
    reportRows(key, records.rows);
    return () => reportRows(key, []);
  }, [reportRows, last, key, records.rows]);
  const count =
    source.exact && heading.count !== undefined ? heading.count : undefined;
  const shown = visible && expanded;
  let children: ReactNode = null;
  if (loadedOnce.current) {
    if (heading.kind === "unmapped") {
      children = (heading.values ?? []).map((value) => (
        <GroupNode
          key={JSON.stringify(value)}
          heading={{
            key: JSON.stringify([field.key, "choice", value]),
            kind: "choice",
            value,
            label: formatFieldValue(value, field, intl),
          }}
          fieldIndex={fieldIndex}
          level={level + 1}
          path={key}
          filters={filters}
          defaultExpanded={false}
          visible={shown}
        />
      ));
    } else if (nextField) {
      const allSubheadings = source.exact
        ? buckets.buckets
          ? groupHeadings(
              nextField,
              choicesFor(nextField, intl),
              buckets.buckets,
              nextLevel?.unit,
              sumsAcross(ctx.descriptor, source.aggregates ?? [], nextField.key),
            )
          : undefined
        : groupHeadings(
            nextField,
            choicesFor(nextField, intl),
            undefined,
            nextLevel?.unit,
          );
      const limited = allSubheadings && limitHeadings(allSubheadings);
      const subheadings = limited?.headings;
      children = subheadings?.length ? (
        <>
          {subheadings.map((sub) => (
            <GroupNode
              key={sub.key}
              heading={sub}
              fieldIndex={fieldIndex + 1}
              level={level + 1}
              path={key}
              filters={own}
              defaultExpanded={false}
              visible={shown}
            />
          ))}
          {shown &&
          (buckets.truncated || limited!.more) ? (
            <Message
              level={level + 1}
              text={intl.message("list.group.moreGroups", {
                count: GROUP_HEADING_LIMIT,
              })}
            />
          ) : null}
        </>
      ) : !shown ? null : buckets.failed ? (
        <Message level={level + 1} text={intl.message("list.tree.failed")} />
      ) : !subheadings ? (
        <Message level={level + 1} text={intl.message("list.tree.loading")} />
      ) : (
        <Message level={level + 1} text={intl.message("list.tree.noRecords")} />
      );
    } else {
      const loading = records.loading && !records.rows.length;
      const remaining =
        records.total !== undefined
          ? records.total - records.rows.length
          : undefined;
      children = !shown ? null : (
        <>
          {records.failed ? (
            <Message
              level={level + 1}
              text={intl.message("list.tree.failed")}
            />
          ) : null}
          {loading ? (
            <Message
              level={level + 1}
              text={intl.message("list.tree.loading")}
            />
          ) : null}
          {!loading && !records.failed && !records.rows.length ? (
            <Message
              level={level + 1}
              text={intl.message("list.tree.noRecords")}
            />
          ) : null}
          {records.rows.length
            ? ctx.renderRecords(records.rows, level + 1)
            : null}
          {records.hasNext ? (
            <Message level={level + 1}>
              <button
                type="button"
                className="a-entity-tree__more"
                disabled={records.loading}
                onClick={records.loadMore}
              >
                {remaining !== undefined
                  ? intl.message("list.tree.loadMoreLeft", { count: remaining })
                  : intl.message("list.tree.loadMore")}
              </button>
            </Message>
          ) : null}
        </>
      );
    }
  }
  const toggle = (
    <TreeToggle
      expandable
      expanded={expanded}
      label={intl.message(
        expanded ? "list.group.collapse" : "list.group.expand",
        { group: label },
      )}
      onToggle={() => setExpanded((value) => !value)}
    />
  );
  const heading_ = (
    <>
      <TreeIndent level={level} />
      {toggle}
      <strong>{label}</strong>
      {count !== undefined ? (
        <span className="a-entity-tree__count">{intl.number(count)}</span>
      ) : null}
      {source.exact
        ? headingAggregates(heading, ctx.descriptor.fields, intl)
        : null}
    </>
  );
  if (!visible) return <>{children}</>;
  if (variant === "cards")
    return (
      <section className="a-entity-tree__section" data-level={level}>
        <h3 className="a-entity-tree__heading">{heading_}</h3>
        {children}
      </section>
    );
  return (
    <>
      <tr
        className="a-entity-list__group-row a-entity-tree__group-row"
        role="row"
        data-tree-key={key}
        aria-level={level}
        aria-expanded={expanded}
        tabIndex={first ? 0 : -1}
        aria-label={
          count !== undefined
            ? intl.message("list.gantt.toggleGroup", { group: label, count })
            : label
        }
      >
        <th colSpan={ctx.columnCount} scope="rowgroup">
          <span className="a-entity-tree__heading">{heading_}</span>
        </th>
      </tr>
      {children}
    </>
  );
}

function Message({
  level,
  text,
  children,
}: {
  readonly level: number;
  readonly text?: string;
  readonly children?: ReactNode;
}) {
  const ctx = useContext(Context)!;
  const content = (
    <span className="a-entity-tree__heading">
      <TreeIndent level={level} />
      <span
        className="a-entity-tree__toggle a-entity-tree__toggle--spacer"
        aria-hidden="true"
      />
      {text ? <span className="a-entity-tree__message">{text}</span> : children}
    </span>
  );
  if (ctx.variant === "cards")
    return <div className="a-entity-tree__section-message">{content}</div>;
  return (
    <tr className="a-entity-tree__message-row">
      <td colSpan={ctx.columnCount}>{content}</td>
    </tr>
  );
}
