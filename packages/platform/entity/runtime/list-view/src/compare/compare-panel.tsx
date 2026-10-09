"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiTransportError,
  entityListOperation,
  entityListQuery,
  type HttpClient,
} from "@athyper/platform-api-client";
import {
  COMPARE_MIN_RECORDS,
  COMPARE_NARROW_COLUMNS,
  type EntityListDescriptorV1,
  type EntityListRowV1,
  type EntityListScopeCoordinateV1,
  type ListCompareLocationV1,
  type ListCompareV1,
} from "@athyper/contract-platform-entity-list";
import { resolveEntityStatusTone } from "@athyper/contract-platform-entity-runtime";
import {
  ComparisonTable,
  type ComparisonTableCell,
  type ComparisonTableColumn,
  type ComparisonTableMark,
  type ComparisonTableRow,
  type ComparisonTableSection,
} from "@athyper/platform-entity-comparison";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { formatFieldValue } from "../field-format";
import { CompareCollection } from "./compare-collection";
import {
  buildCompareModel,
  compareQueryState,
  differenceOrder,
  type CompareModel,
  type CompareRowModel,
} from "./compare-model";

// The record comparison panel (Entity list Compare blueprint sections 7, 9
// and 10). One standalone request per opening; everything else (baseline,
// differences only, sections, words) works on values already loaded.

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly rows: readonly EntityListRowV1[] }
  | { readonly status: "access" }
  | { readonly status: "error" };

export interface ComparePanelProps {
  readonly client: HttpClient;
  readonly descriptor: EntityListDescriptorV1;
  readonly compare: ListCompareV1;
  readonly location: ListCompareLocationV1;
  readonly scope?: EntityListScopeCoordinateV1;
  readonly narrow: boolean;
  /** Replaces the comparison's URL state (baseline, removal, all rows). */
  readonly onChange: (location: ListCompareLocationV1) => void;
  readonly onClose: () => void;
  readonly onOpenRecord?: (id: string) => void;
}

export function ComparePanel(props: ComparePanelProps) {
  const intl = useEntityI18n();
  const { descriptor, compare, location } = props;
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [words, setWords] = useState(true);
  const [pair, setPair] = useState<readonly [number, number]>([0, 1]);
  const [menu, setMenu] = useState<string>();
  const [live, setLive] = useState("");
  const [focusRow, setFocusRow] = useState<string>();
  const position = useRef(-1);
  const heading = useRef<HTMLHeadingElement>(null);
  const requested = location.records.join(",");

  useEffect(() => heading.current?.focus(), []);
  // The narrow pair returns to the first two columns whenever the compared
  // set or the baseline changes, instead of keeping a stale pair (audit 4).
  useEffect(() => setPair([0, 1]), [requested, location.baseline]);
  useEffect(() => {
    const controller = new AbortController();
    setLoad({ status: "loading" });
    props.client
      .request(entityListOperation, {
        params: { entityCode: descriptor.entity.code },
        query: { ...entityListQuery(compareQueryState(descriptor, compare, location), descriptor, props.scope), countMode: "none" },
        signal: controller.signal,
      })
      .then((page) => {
        if (controller.signal.aborted) return;
        if (page.descriptorHash !== descriptor.revision.descriptorHash || page.scopeFingerprint !== descriptor.scope.fingerprint)
          throw new TypeError("Compare response authority no longer matches its descriptor");
        setLoad({ status: "ready", rows: page.rows });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        // Access changed between the descriptor and the request: no partial comparison.
        const code = cause instanceof ApiTransportError ? cause.problem?.code : undefined;
        setLoad({ status: code === "PROJECTION_FIELD_NOT_ALLOWED" ? "access" : "error" });
      });
    return () => controller.abort();
    // The request depends only on the compared records (section 7.2).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested, attempt, descriptor.revision.descriptorHash]);

  const model = useMemo(
    () => (load.status === "ready" ? buildCompareModel({ descriptor, compare, location, rows: load.rows, intl }) : undefined),
    [load, descriptor, compare, location, intl],
  );
  const order = useMemo(() => (model ? differenceOrder(model) : []), [model]);
  const isOpen = (key: string, collapsed: boolean) => open[key] ?? !collapsed;

  useEffect(() => {
    if (!focusRow) return;
    document.getElementById(focusRow)?.focus();
    setFocusRow(undefined);
  }, [focusRow, open]);

  const entityPlural = descriptor.entity.pluralLabel;
  const recordName = (index: number) => {
    const column = model?.columns[index];
    return column?.code ?? column?.title ?? intl.message("list.compare.unavailableRecord");
  };
  const change = (next: { readonly records?: readonly string[]; readonly baseline?: string | undefined; readonly all?: boolean; readonly items?: readonly string[] }) => {
    const merged = { ...location, ...next };
    props.onChange(Object.freeze({
      records: merged.records,
      ...(merged.baseline && merged.records.includes(merged.baseline) ? { baseline: merged.baseline } : {}),
      ...(merged.all ? { all: true as const } : {}),
      ...(merged.items?.length ? { items: merged.items.slice(0, 100) } : {}),
    }));
  };
  const announce = (message: string) => setLive(message);

  const step = (direction: 1 | -1) => {
    if (!model || !order.length) return;
    const next = position.current + direction;
    if (next < 0 || next >= order.length) {
      announce(intl.message(next < 0 ? "list.compare.firstDifference" : "list.compare.lastDifference"));
      return;
    }
    position.current = next;
    const [sectionKey, rowKey] = order[next]!.split(":") as [string, string];
    const section = model.sections.find((item) => item.key === sectionKey)!;
    const row = section.rows.find((item) => item.key === rowKey)!;
    if (!isOpen(section.key, section.collapsed)) setOpen((previous) => ({ ...previous, [section.key]: true }));
    setFocusRow(rowId(section.key, row.key));
    announce(intl.message("list.compare.differenceAt", { index: next + 1, count: order.length, field: row.label }));
  };

  const header = (
    <div className="a-entity-compare__header">
      <h2 ref={heading} tabIndex={-1}>
        {intl.message("list.compare.heading", { count: location.records.length, entity: entityPlural })}
      </h2>
      <button type="button" className="a-entity-compare__button" onClick={props.onClose}>
        {intl.message("list.compare.close")}
      </button>
    </div>
  );
  const frame = (body: React.ReactNode) => (
    <section
      className="a-entity-compare"
      data-narrow={props.narrow ? "" : undefined}
      aria-label={intl.message("list.compare.caption", { count: location.records.length, entity: entityPlural })}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        if (menu) setMenu(undefined);
        else props.onClose();
      }}
    >
      {header}
      {body}
      <p className="a-comparison__visually-hidden" aria-live="polite">{live}</p>
    </section>
  );

  if (load.status === "loading")
    return frame(
      <div className="a-entity-compare__state" aria-busy="true">
        <p>{intl.message("list.compare.loading", { count: location.records.length })}</p>
      </div>,
    );
  if (load.status === "access")
    return frame(
      <div className="a-entity-compare__state" role="alert">
        <p>{intl.message("list.compare.accessChanged")}</p>
        <button type="button" className="a-entity-compare__button" data-primary="" onClick={() => window.location.reload()}>
          {intl.message("list.compare.reload")}
        </button>
      </div>,
    );
  if (load.status === "error" || !model)
    return frame(
      <div className="a-entity-compare__state" role="alert">
        <p>{intl.message("list.compare.failed")}</p>
        <button type="button" className="a-entity-compare__button" onClick={() => setAttempt((value) => value + 1)}>
          {intl.message("list.compare.retry")}
        </button>
      </div>,
    );
  if (model.available < COMPARE_MIN_RECORDS)
    return frame(
      <div className="a-entity-compare__state" role="status">
        <p>{intl.message("list.compare.onlyOne")}</p>
        <button type="button" className="a-entity-compare__button" data-primary="" onClick={props.onClose}>
          {intl.message("list.compare.close")}
        </button>
      </div>,
    );

  const baseline = model.columns.findIndex((column) => column.baseline);
  const shown = visibleColumns(model, pair, props.narrow, baseline);
  const statusField = compare.statusField ? descriptor.fields.find((field) => field.key === compare.statusField) : undefined;
  const hasText = compare.sections.some((section) => section.fields.some((field) => field.valueKind === "text"));
  const offerWords = hasText && baseline >= 0;

  const columns: ComparisonTableColumn[] = shown.map((index) => {
    const column = model.columns[index]!;
    const statusLabel = statusField && column.statusValue !== undefined ? formatFieldValue(column.statusValue, statusField, intl) : undefined;
    return {
      key: column.id,
      ...(column.unavailable ? { title: intl.message("list.compare.unavailableRecord"), unavailable: true } : {}),
      ...(column.code ? { code: column.code } : {}),
      ...(column.title ? { title: column.title } : {}),
      ...(statusLabel
        ? {
            status: (
              <span className={`a-entity-list__status a-entity-list__status--${resolveEntityStatusTone(column.statusValue, statusField!.statusTones)}`}>
                <span aria-hidden="true" />
                {statusLabel}
              </span>
            ),
          }
        : {}),
      ...(column.baseline ? { baselineLabel: intl.message("list.compare.baseline") } : {}),
      ...(column.differFromBaseline !== undefined ? { note: intl.message("list.compare.differFromBaseline", { count: column.differFromBaseline }) } : {}),
      menu: (
        <ColumnMenu
          label={intl.message("list.compare.options", { record: recordName(index) })}
          open={menu === column.id}
          onToggle={() => setMenu((current) => (current === column.id ? undefined : column.id))}
          items={[
            ...(column.unavailable
              ? []
              : column.baseline
                ? [{ label: intl.message("list.compare.clearBaseline"), run: () => { change({ baseline: undefined }); announce(intl.message("list.compare.baselineCleared")); } }]
                : [{ label: intl.message("list.compare.setBaseline"), run: () => { change({ baseline: column.id }); announce(intl.message("list.compare.baselineSet", { record: recordName(index) })); } }]),
            {
              label: intl.message("list.compare.remove"),
              disabled: location.records.length <= COMPARE_MIN_RECORDS,
              run: () => {
                const records = location.records.filter((id) => id !== column.id);
                // Removing the baseline clears it; a neighbour is never promoted.
                change({ records, ...(column.baseline ? { baseline: undefined } : {}) });
                announce(intl.message(column.baseline ? "list.compare.baselineCleared" : "list.compare.removed", { record: recordName(index) }));
              },
            },
            ...(!column.unavailable && props.onOpenRecord ? [{ label: intl.message("list.compare.openRecord"), run: () => props.onOpenRecord!(column.id) }] : []),
          ]}
          onDone={() => setMenu(undefined)}
        />
      ),
    };
  });

  const toRow = (sectionKey: string, row: CompareRowModel): ComparisonTableRow => ({
    key: row.key,
    id: rowId(sectionKey, row.key),
    label: row.label,
    outcome: row.outcome,
    ...(row.outcome === "differs"
      ? { badge: intl.message("list.compare.differs") }
      : row.outcome === "not_comparable"
        ? { badge: intl.message(row.currencyNotCompared ? "list.compare.currencyNotCompared" : "list.compare.notCompared") }
        : {}),
    ...(row.mixedCurrencies ? { note: intl.message("list.compare.mixedCurrencies") } : {}),
    cells: shown.map((index) => cellView(row, index, baseline, words && offerWords, intl)),
  });
  const sections: ComparisonTableSection[] = model.sections.map((section) => {
    const differing = section.rows.filter((row) => row.outcome === "differs");
    const notCompared = section.rows.filter((row) => row.outcome === "not_comparable");
    const rows = location.all ? section.rows : differing;
    return {
      key: section.key,
      label: section.label,
      open: isOpen(section.key, section.collapsed),
      counts: [
        { label: section.differs ? intl.message("list.compare.sectionDiffer", { count: section.differs }) : intl.message("list.compare.sectionNone"), emphasis: section.differs > 0 },
        ...(section.notCompared ? [{ label: intl.message("list.compare.sectionNotCompared", { count: section.notCompared }) }] : []),
      ],
      rows: rows.map((row) => toRow(section.key, row)),
      ...(!location.all && notCompared.length ? { notCompared: { label: intl.message("list.compare.notComparedGroup"), rows: notCompared.map((row) => toRow(section.key, row)) } } : {}),
      emptyMessage: intl.message("list.compare.sectionEmpty"),
    };
  });
  const summary = [
    intl.message("list.compare.summary", { differs: model.differs, fields: model.fields }),
    ...(model.notCompared ? [intl.message("list.compare.summaryNotCompared", { count: model.notCompared })] : []),
    ...(model.available < location.records.length ? [intl.message("list.compare.summaryAvailable", { count: model.available })] : []),
  ].join(" · ");
  // Line items are counted in their own sections, so "everything matches" speaks only for a comparison without them.
  const everythingMatches = !location.all && model.differs === 0 && model.notCompared === 0 && !compare.collections?.length;

  return frame(
    <>
      <div className="a-entity-compare__toolbar">
        <label className="a-entity-compare__switch">
          <input type="checkbox" role="switch" checked={!location.all} onChange={(event) => change({ all: !event.target.checked })} />
          <span>{intl.message("list.compare.differencesOnly")}</span>
        </label>
        <span className="a-entity-compare__summary" aria-live="polite">{summary}</span>
        <span className="a-entity-compare__spacer" />
        <button type="button" className="a-entity-compare__button" disabled={!order.length} onClick={() => step(-1)}>
          {intl.message("list.compare.previous")}
        </button>
        <button type="button" className="a-entity-compare__button" disabled={!order.length} onClick={() => step(1)}>
          {intl.message("list.compare.next")}
        </button>
        <button type="button" className="a-entity-compare__button" onClick={() => setOpen(Object.fromEntries(model.sections.map((section) => [section.key, false])))}>
          {intl.message("list.compare.collapseAll")}
        </button>
        <button type="button" className="a-entity-compare__button" onClick={() => setOpen(Object.fromEntries(model.sections.map((section) => [section.key, true])))}>
          {intl.message("list.compare.expandAll")}
        </button>
      </div>
      {offerWords ? (
        <div className="a-entity-compare__toolbar">
          <label className="a-entity-compare__switch">
            <input type="checkbox" role="switch" checked={words} onChange={(event) => setWords(event.target.checked)} />
            <span>{intl.message("list.compare.highlightWords")}</span>
          </label>
        </div>
      ) : null}
      {compare.fieldsRestricted ? <p className="a-entity-compare__note" role="note">{intl.message("list.compare.restricted")}</p> : null}
      {compare.sections.some((section) => section.fields.some((field) => field.better)) || compare.collections?.some((collection) => collection.fields.some((field) => field.better)) ? (
        <p className="a-entity-compare__note">{intl.message("list.compare.bestNote")}</p>
      ) : null}
      {model.summaries.length ? (
        <ul className="a-entity-compare__summaries" aria-label={intl.message("list.compare.summaries")}>
          {model.summaries.map((summary) => (
            <li key={summary.label}>
              {intl.message(summary.columns.length > 1 ? "list.compare.summaryChipTie" : "list.compare.summaryChip", {
                label: summary.label,
                records: summary.columns.map((index) => recordName(index)).join(", "),
                value: summary.display,
              })}
            </li>
          ))}
        </ul>
      ) : null}
      {props.narrow ? (
        <div className="a-entity-compare__pair">
          {([0, 1] as const).map((slot) => (
            <label key={slot}>
              <span>{intl.message(slot === 0 ? "list.compare.firstRecord" : "list.compare.secondRecord")}</span>
              <select
                value={shown[slot]}
                disabled={slot === 0 && baseline >= 0}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setPair((current) => (slot === 0 ? [value, current[1]] : [current[0], value]));
                }}
              >
                {model.columns.map((column, index) => (
                  <option key={column.id} value={index} disabled={index === shown[slot === 0 ? 1 : 0]}>
                    {[recordName(index), column.title].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}
      <div className="a-entity-compare__scroll">
        <ComparisonTable
          caption={intl.message("list.compare.caption", { count: location.records.length, entity: entityPlural })}
          fieldHeading={intl.message("list.compare.field")}
          columns={columns}
          sections={sections}
          onToggleSection={(key) => {
            const section = model.sections.find((item) => item.key === key)!;
            setOpen((previous) => ({ ...previous, [key]: !isOpen(key, section.collapsed) }));
          }}
        />
      </div>
      {compare.collections?.map((collection) => (
        <CompareCollection
          key={collection.key}
          client={props.client}
          descriptor={descriptor}
          collection={collection}
          records={location.records}
          headerRows={new Map(load.rows.map((row) => [row.id, row]))}
          names={model.columns.map((_, index) => [recordName(index), model.columns[index]!.title].filter(Boolean).join(" · "))}
          shown={shown}
          baseline={baseline}
          all={location.all === true}
          pinned={location.items ?? []}
          onPinnedChange={(items) => change({ items })}
        />
      ))}
      {everythingMatches ? (
        <div className="a-entity-compare__state" role="status">
          <p>{intl.message("list.compare.noDifferences")}</p>
          <button type="button" className="a-entity-compare__button" onClick={() => change({ all: true })}>
            {intl.message("list.compare.showAll")}
          </button>
        </div>
      ) : null}
    </>,
  );
}

const rowId = (section: string, row: string) => `a-entity-compare-row-${section}-${row}`;

/** The columns shown: all of them, or a pair at the narrow breakpoint, with
 * the baseline fixed in the first slot (section 9.3). */
function visibleColumns(model: CompareModel, pair: readonly [number, number], narrow: boolean, baseline: number): readonly number[] {
  const all = model.columns.map((_, index) => index);
  if (!narrow || all.length <= COMPARE_NARROW_COLUMNS) return all;
  const first = baseline >= 0 ? baseline : Math.min(pair[0], all.length - 1);
  let second = Math.min(pair[1], all.length - 1);
  if (second === first) second = (first + 1) % all.length;
  return [first, second];
}

function cellView(row: CompareRowModel, index: number, baseline: number, highlight: boolean, intl: ReturnType<typeof useEntityI18n>): ComparisonTableCell {
  const cell = row.cells[index]!;
  const marks: ComparisonTableMark[] = [];
  const relative = row.relative?.[index];
  if (cell.state === "masked") marks.push({ tone: "muted", label: intl.message("list.compare.notCompared") });
  else if (relative && index !== baseline && cell.state !== "unavailable")
    marks.push(
      relative === "same"
        ? { tone: "same", label: intl.message("list.compare.sameAsBaseline") }
        : relative === "differs"
          ? { tone: "differs", label: intl.message("list.compare.differsFromBaseline") }
          : { tone: "muted", label: intl.message("list.compare.notCompared") },
    );
  if (row.differentRecord[index]) marks.push({ tone: "muted", label: intl.message("list.compare.differentRecord") });
  const best = row.best.includes(index);
  if (best) marks.unshift({ tone: "best", label: intl.message("list.compare.best") });
  const segments = highlight ? row.words[index] : undefined;
  const content =
    cell.state === "value" ? (
      segments ? (
        <>
          {segments.map((segment, position) =>
            segment.differs ? (
              <mark key={position}>
                {segment.text}
                <span className="a-comparison__visually-hidden"> {intl.message("list.compare.wordDiffers")}</span>
              </mark>
            ) : (
              <React.Fragment key={position}>{segment.text}</React.Fragment>
            ),
          )}
        </>
      ) : (
        cell.display
      )
    ) : cell.state === "masked" ? (
      cell.display
    ) : cell.state === "empty" ? (
      intl.message("list.compare.notSet")
    ) : (
      intl.message("list.compare.unavailableRecord")
    );
  return { content, state: cell.state, ...(marks.length ? { marks } : {}), ...(index === baseline ? { baseline: true } : {}), ...(best ? { best: true } : {}) };
}

function ColumnMenu(props: {
  readonly label: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onDone: () => void;
  readonly items: readonly { readonly label: string; readonly disabled?: boolean; readonly run: () => void }[];
}) {
  return (
    <div className="a-entity-compare__menu">
      <button type="button" className="a-entity-compare__menu-trigger" aria-haspopup="menu" aria-expanded={props.open} aria-label={props.label} onClick={props.onToggle}>
        <span aria-hidden="true">⋯</span>
      </button>
      {props.open ? (
        <div role="menu" aria-label={props.label} className="a-entity-compare__menu-items">
          {props.items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                props.onDone();
                item.run();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
