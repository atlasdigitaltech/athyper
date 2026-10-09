"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  ActivityComparison as Comparison,
  ActivitySnapshotItem,
} from "@athyper/contract-platform-entity-runtime";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { Button } from "@athyper/platform-ui";
import {
  ComparisonTable,
  type ComparisonOutcome,
  type ComparisonTableCell,
  type ComparisonTableRow,
  type ComparisonTableSection,
} from "@athyper/platform-entity-comparison";
import {
  changed,
  comparable,
  formatActivityValue,
  groupActivityFields,
  type ActivityPresentation,
  type ComparisonField,
} from "./activity-comparison-model";

// The snapshot comparison on the shared comparison table (Entity list Compare
// blueprint section 9.6, C1b). The earlier snapshot is the fixed baseline:
// the server orders the pair by snapshot sequence. Wording is relative to the
// earlier snapshot, never "changed".

const outcomeOf = (field: ComparisonField): ComparisonOutcome =>
  !comparable(field) ? "not_comparable" : changed(field) ? "differs" : "same";

export function ActivityComparison({
  comparison,
  metadata,
  fieldLabels,
  snapshots,
  onClose,
  hasCollections = false,
}: {
  comparison: Comparison;
  hasCollections?: boolean;
  metadata?: ActivityPresentation;
  fieldLabels: Readonly<Record<string, string>>;
  snapshots: readonly ActivitySnapshotItem[];
  onClose: () => void;
}) {
  const intl = useEntityI18n();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [live, setLive] = useState("");
  const [focusRow, setFocusRow] = useState<string>();
  const position = useRef(-1);
  const groups = useMemo(() => groupActivityFields(comparison.fields, metadata), [comparison.fields, metadata]);
  const fieldMeta = (key: string) => metadata?.fields.find((item) => item.key === key);
  const label = (field: ComparisonField) => fieldMeta(field.key)?.label ?? fieldLabels[field.key] ?? field.label;
  const total = comparison.fields.length;
  const differs = comparison.fields.filter(changed).length;
  const notCompared = comparison.fields.filter((field) => !comparable(field)).length;
  const isOpen = (key: string) => open[key] ?? true;
  const rowId = (group: string, field: string) => `a-activity-compare-row-${group}-${field}`;
  const order = groups.flatMap((group) => group.fields.filter(changed).map((field) => ({ group: group.key, field })));

  useEffect(() => {
    if (!focusRow) return;
    document.getElementById(focusRow)?.focus();
    setFocusRow(undefined);
  }, [focusRow, open]);

  const snapshotOf = (id: string) => snapshots.find((item) => item.id === id);
  const column = (id: string, earlier: boolean) => {
    const snapshot = snapshotOf(id);
    return {
      key: id,
      code: snapshot ? `${intl.message("activity.snapshot")} ${snapshot.sequence}` : intl.message(earlier ? "activity.before" : "activity.after"),
      ...(snapshot ? { title: intl.date(snapshot.capturedAt, { dateStyle: "medium", timeStyle: "short" }) } : {}),
      note: intl.message(earlier ? "activity.earlierSnapshot" : "activity.laterSnapshot"),
      // The earlier snapshot is the fixed baseline; there is no column menu.
      ...(earlier ? { baselineLabel: intl.message("list.compare.baseline") } : {}),
    };
  };

  const cell = (field: ComparisonField, side: "before" | "after"): ComparisonTableCell => {
    const value = field[side];
    const state = value.state !== "value" ? "unavailable" : value.value === null || value.value === undefined || value.value === "" ? "empty" : "value";
    // A captured reference is compared by its stored identity and shown as a
    // linked record: never resolved against today's label, never an identifier.
    const content = state === "value" && field.reference ? intl.message("activity.linkedRecord") : formatActivityValue(value, fieldMeta(field.key), intl);
    const outcome = outcomeOf(field);
    return {
      content,
      state,
      ...(side === "before"
        ? { baseline: true }
        : {
            marks: [
              outcome === "same"
                ? { tone: "same" as const, label: intl.message("activity.sameAsEarlier") }
                : outcome === "differs"
                  ? { tone: "differs" as const, label: intl.message("activity.differsFromEarlier") }
                  : { tone: "muted" as const, label: intl.message("list.compare.notCompared") },
            ],
          }),
    };
  };
  const row = (group: string, field: ComparisonField): ComparisonTableRow => {
    const outcome = outcomeOf(field);
    return {
      key: field.key,
      id: rowId(group, field.key),
      label: label(field),
      outcome,
      ...(outcome === "differs"
        ? { badge: intl.message("list.compare.differs") }
        : outcome === "not_comparable"
          ? { badge: intl.message("list.compare.notCompared") }
          : {}),
      cells: [cell(field, "before"), cell(field, "after")],
    };
  };
  const sections: ComparisonTableSection[] = groups.map((group) => {
    const differing = group.fields.filter(changed);
    const notComparable = group.fields.filter((field) => !comparable(field));
    return {
      key: group.key,
      label: [group.tabLabel, group.label ?? intl.message("activity.additionalFields")].filter(Boolean).join(" · "),
      open: isOpen(group.key),
      counts: [
        { label: differing.length ? intl.message("list.compare.sectionDiffer", { count: differing.length }) : intl.message("list.compare.sectionNone"), emphasis: differing.length > 0 },
        ...(notComparable.length ? [{ label: intl.message("list.compare.sectionNotCompared", { count: notComparable.length }) }] : []),
      ],
      rows: (all ? group.fields : differing).map((field) => row(group.key, field)),
      ...(!all && notComparable.length ? { notCompared: { label: intl.message("list.compare.notComparedGroup"), rows: notComparable.map((field) => row(group.key, field)) } } : {}),
      emptyMessage: intl.message("list.compare.sectionEmpty"),
    };
  });

  const step = (direction: 1 | -1) => {
    const next = position.current + direction;
    if (next < 0 || next >= order.length) {
      setLive(intl.message(next < 0 ? "list.compare.firstDifference" : "list.compare.lastDifference"));
      return;
    }
    position.current = next;
    const target = order[next]!;
    if (!isOpen(target.group)) setOpen((previous) => ({ ...previous, [target.group]: true }));
    setFocusRow(rowId(target.group, target.field.key));
    setLive(intl.message("list.compare.differenceAt", { index: next + 1, count: order.length, field: label(target.field) }));
  };

  return (
    <section className="a-entity-activity__detail a-activity-comparison" aria-label={intl.message("activity.comparison")}>
      <header>
        <div>
          <h3>{intl.message("activity.comparison")}</h3>
        </div>
        <Button variant="secondary" onClick={onClose}>
          {intl.message("activity.closeDetails")}
        </Button>
      </header>
      <div className="a-activity-comparison__tools">
        <label className="a-activity-comparison__switch">
          <input type="checkbox" role="switch" checked={!all} onChange={(event) => setAll(!event.target.checked)} />
          {intl.message("list.compare.differencesOnly")}
        </label>
        <span className="a-activity-comparison__summary" aria-live="polite">
          {[
            intl.message("list.compare.summary", { differs, fields: total }),
            ...(notCompared ? [intl.message("list.compare.summaryNotCompared", { count: notCompared })] : []),
          ].join(" · ")}
        </span>
        <div>
          <Button variant="ghost" disabled={!order.length} onClick={() => step(-1)}>
            {intl.message("list.compare.previous")}
          </Button>
          <Button variant="ghost" disabled={!order.length} onClick={() => step(1)}>
            {intl.message("list.compare.next")}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(Object.fromEntries(groups.map((group) => [group.key, true])))}>
            {intl.message("activity.expandAll")}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(Object.fromEntries(groups.map((group) => [group.key, false])))}>
            {intl.message("activity.collapseAll")}
          </Button>
        </div>
      </div>
      {!differs ? (
        <div className="a-activity-comparison__result" role="status" data-limited={notCompared > 0}>
          <strong>{intl.message(hasCollections ? "activity.collection.noRootDifferences" : "activity.noDifferences")}</strong>
          {notCompared ? <p>{intl.message("activity.incompleteComparison")}</p> : null}
        </div>
      ) : null}
      <div className="a-activity-comparison__table">
        <ComparisonTable
          caption={intl.message("activity.comparison")}
          fieldHeading={intl.message("list.compare.field")}
          columns={[column(comparison.from, true), column(comparison.to, false)]}
          sections={sections}
          onToggleSection={(key) => setOpen((previous) => ({ ...previous, [key]: !isOpen(key) }))}
        />
      </div>
      <p className="a-comparison__visually-hidden" aria-live="polite">{live}</p>
      <p className="a-entity-activity__hint">{intl.message("activity.currentLayout")}</p>
    </section>
  );
}
