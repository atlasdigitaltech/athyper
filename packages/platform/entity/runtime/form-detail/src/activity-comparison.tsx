"use client";
import { useState } from "react";
import type {
  ActivityComparison as Comparison,
  ActivitySnapshotItem,
} from "@athyper/contract-platform-entity-runtime";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { Button } from "@athyper/platform-ui";
import { ChevronRightIcon } from "@athyper/platform-icons";
import {
  changed,
  comparable,
  formatActivityValue,
  groupActivityFields,
  type ActivityPresentation,
  type ActivityFieldGroup,
} from "./activity-comparison-model";

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
  const [changesOnly, setChangesOnly] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const groups = groupActivityFields(comparison.fields, metadata);
  const changes = groups.filter((group) => group.fields.some(changed));
  const notes = groups.filter(
    (group) =>
      !group.fields.some(changed) &&
      group.fields.some((field) => !comparable(field)),
  );
  const fieldCount = comparison.fields.filter(changed).length;
  const limited = comparison.fields.some((field) => !comparable(field));
  const main = changesOnly ? changes : groups;
  const visible = changesOnly ? [...main, ...notes] : main;
  const title = (id: string, fallback: string) => {
    const snapshot = snapshots.find((item) => item.id === id);
    return snapshot
      ? `${intl.message("activity.snapshot")} ${snapshot.sequence} · ${intl.date(snapshot.capturedAt, { dateStyle: "medium", timeStyle: "short" })}`
      : intl.message(fallback);
  };
  const before = title(comparison.from, "activity.before"),
    after = title(comparison.to, "activity.after");
  const section = (group: ActivityFieldGroup, note = false) => {
    const fields =
      changesOnly && !note
        ? group.fields.filter((field) => changed(field) || !comparable(field))
        : group.fields;
    return (
      <details
        className="a-activity-comparison__section"
        key={group.key}
        open={expanded[group.key] ?? !note}
        onToggle={(event) => {
          const open = event.currentTarget.open;
          setExpanded((old) =>
            old[group.key] === open ? old : { ...old, [group.key]: open },
          );
        }}
      >
        <summary>
          <span>
            {group.tabLabel ? <small>{group.tabLabel}</small> : null}
            <strong>
              {group.label ?? intl.message("activity.additionalFields")}
            </strong>
          </span>
          {group.fields.some(changed) ? (
            <span>
              {intl.message("activity.changeCount", {
                count: group.fields.filter(changed).length,
              })}
            </span>
          ) : note ? (
            <span>{intl.message("activity.limitedSection")}</span>
          ) : null}
        </summary>
        <div className="a-activity-comparison__fields">
          <div className="a-activity-comparison__columns" aria-hidden="true">
            <span>{intl.message("activity.field")}</span>
            <span>{before}</span>
            <span>{after}</span>
          </div>
          <dl>
            {fields.map((field) => (
              <div
                className="a-activity-comparison__field"
                data-changed={changed(field)}
                key={field.key}
              >
                <dt>
                  {metadata?.fields.find((item) => item.key === field.key)
                    ?.label ??
                    fieldLabels[field.key] ??
                    field.label}
                </dt>
                <dd>
                  <span className="a-activity-comparison__value-label">
                    {before}
                  </span>
                  <span>
                    {formatActivityValue(
                      field.before,
                      metadata?.fields.find((item) => item.key === field.key),
                      intl,
                    )}
                  </span>
                </dd>
                <dd>
                  <span className="a-activity-comparison__value-label">
                    {after}
                  </span>
                  <span>
                    {formatActivityValue(
                      field.after,
                      metadata?.fields.find((item) => item.key === field.key),
                      intl,
                    )}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
    );
  };
  return (
    <section
      className="a-entity-activity__detail a-activity-comparison"
      aria-label={intl.message("activity.comparison")}
    >
      <header>
        <div>
          <h3>{intl.message("activity.comparison")}</h3>
          <p>
            {before} <ChevronRightIcon aria-hidden="true" size={16} /> {after}
          </p>
        </div>
        <Button variant="secondary" onClick={onClose}>
          {intl.message("activity.closeDetails")}
        </Button>
      </header>
      <div className="a-activity-comparison__counts" aria-live="polite">
        {fieldCount ? (
          <span>
            {intl.message("activity.changeCount", { count: fieldCount })}
          </span>
        ) : null}
        {changes.length ? (
          <span>
            {intl.message("activity.sectionCount", { count: changes.length })}
          </span>
        ) : null}
      </div>
      <div className="a-activity-comparison__tools">
        <label>
          <input
            type="checkbox"
            checked={changesOnly}
            onChange={(event) => setChangesOnly(event.target.checked)}
          />
          {intl.message("activity.changesOnly")}
        </label>
        <div>
          <Button
            variant="ghost"
            onClick={() =>
              setExpanded(
                Object.fromEntries(visible.map((group) => [group.key, true])),
              )
            }
          >
            {intl.message("activity.expandAll")}
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              setExpanded(
                Object.fromEntries(visible.map((group) => [group.key, false])),
              )
            }
          >
            {intl.message("activity.collapseAll")}
          </Button>
        </div>
      </div>
      {!fieldCount ? (
        <div
          className="a-activity-comparison__result"
          role="status"
          data-limited={limited}
        >
          <strong>
            {intl.message(
              hasCollections
                ? "activity.collection.noRootDifferences"
                : "activity.noDifferences",
            )}
          </strong>
          {limited ? (
            <p>{intl.message("activity.incompleteComparison")}</p>
          ) : null}
        </div>
      ) : null}
      {main.map((group) => section(group))}
      {changesOnly && notes.length ? (
        <div className="a-activity-comparison__notes">
          <p>{intl.message("activity.comparisonNotes")}</p>
          {notes.map((group) => section(group, true))}
        </div>
      ) : null}
      <p className="a-entity-activity__hint">
        {intl.message("activity.currentLayout")}
      </p>
    </section>
  );
}
