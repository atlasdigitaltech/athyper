"use client";
import { useContext, useState } from "react";
import type {
  ActivityAuditItem,
  ActivityTimelineItem,
} from "@athyper/contract-platform-entity-runtime";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { CollaborationPresentationContext } from "./collaboration-visibility";

/** Group only authorized, same-record events with an explicit correlation, within display day. */
export function ActivityEvents({
  items,
  timeline,
  fieldLabels,
}: {
  items: readonly ActivityAuditItem[];
  timeline: boolean;
  fieldLabels: Readonly<Record<string, string>>;
}) {
  const intl = useEntityI18n(),
    mode = useContext(CollaborationPresentationContext);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (key: string, open: boolean) =>
    setExpanded((old) => (old[key] === open ? old : { ...old, [key]: open }));
  const outcome = (value: string) =>
    ["success", "failure", "denied"].includes(value)
      ? intl.message(`activity.${value}`)
      : value;
  const source = (item: ActivityAuditItem) =>
    "source" in item ? (item as ActivityTimelineItem).source : "audit";
  const title = (item: ActivityAuditItem) =>
    source(item) === "snapshot"
      ? intl.message("activity.snapshotSavedEvent")
      : source(item) === "version"
        ? intl.message("activity.versionCommittedEvent")
        : item.event;
  const inspect = (item: ActivityAuditItem) => (
    <details
      className="a-activity-event-inspect"
      open={expanded[item.id] ?? false}
      onToggle={(event) => toggle(item.id, event.currentTarget.open)}
    >
      <summary>{intl.message("activity.inspect")}</summary>
      <dl>
        <div>
          <dt>{intl.message("activity.eventCode")}</dt>
          <dd>{item.event}</dd>
        </div>
        <div>
          <dt>{intl.message("activity.operation")}</dt>
          <dd>{item.operation}</dd>
        </div>
        {item.changedFields.length ? (
          <div>
            <dt>{intl.message("activity.changedFields")}</dt>
            <dd>
              {item.changedFields
                .map((key) => fieldLabels[key] ?? key)
                .join(", ")}
            </dd>
          </div>
        ) : null}
      </dl>
      {source(item) === "snapshot" ? (
        <p className="a-entity-activity__hint">
          {intl.message("activity.captureNotChange")}
        </p>
      ) : null}
    </details>
  );
  const content = (item: ActivityAuditItem) => (
    <>
      <div className="a-entity-activity__event-heading">
        <strong>{title(item)}</strong>
        <span
          className="a-entity-activity__outcome"
          data-outcome={item.outcome}
        >
          {outcome(item.outcome)}
        </span>
      </div>
      <time dateTime={item.occurredAt}>
        {intl.date(item.occurredAt, {
          dateStyle: "medium",
          timeStyle: "medium",
        })}
      </time>
      <p>
        {intl.message(
          source(item) === "snapshot"
            ? "activity.capturedBy"
            : "activity.actor",
        )}
        : <bdi>{item.actor ?? intl.message("activity.system")}</bdi>
      </p>
      {inspect(item)}
    </>
  );
  const days = new Map<string, ActivityAuditItem[]>();
  for (const item of items) {
    const day = intl.date(item.occurredAt, { dateStyle: "full" });
    days.set(day, [...(days.get(day) ?? []), item]);
  }
  return (
    <div className="a-activity-events">
      <p className="a-entity-activity__hint">
        {intl.message("activity.loadedEvents", { count: items.length })}
      </p>
      {!timeline && mode === "content" ? (
        <div className="a-activity-audit-table">
          <table>
            <thead>
              <tr>
                {[
                  "activity.occurred",
                  "activity.eventCode",
                  "activity.actor",
                  "activity.outcomeFilter",
                  "activity.inspect",
                ].map((key) => (
                  <th key={key}>{intl.message(key)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <time dateTime={item.occurredAt}>
                      {intl.date(item.occurredAt, {
                        dateStyle: "medium",
                        timeStyle: "medium",
                      })}
                    </time>
                  </td>
                  <td>{title(item)}</td>
                  <td>
                    <bdi>{item.actor ?? intl.message("activity.system")}</bdi>
                  </td>
                  <td>
                    <span
                      className="a-entity-activity__outcome"
                      data-outcome={item.outcome}
                    >
                      {outcome(item.outcome)}
                    </span>
                  </td>
                  <td>{inspect(item)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        [...days].map(([day, events]) => {
          const groups = new Map<string, ActivityAuditItem[]>();
          for (const item of events) {
            const correlation =
              timeline && "correlation" in item
                ? (item as ActivityTimelineItem).correlation
                : undefined;
            const key = correlation ? `correlation:${correlation}` : item.id;
            groups.set(key, [...(groups.get(key) ?? []), item]);
          }
          return (
            <section key={day}>
              <h3>{day}</h3>
              <ol
                className={
                  timeline ? "a-activity-timeline" : "a-entity-activity__items"
                }
              >
                {[...groups].map(([key, group]) => (
                  <li key={key} className="a-entity-activity__event">
                    {group.length === 1 ? (
                      content(group[0]!)
                    ) : (
                      <details
                        open={expanded[key] ?? false}
                        onToggle={(event) =>
                          toggle(key, event.currentTarget.open)
                        }
                      >
                        <summary>
                          {intl.message("activity.relatedEvents")} ·{" "}
                          {intl.message("activity.loadedEvents", {
                            count: group.length,
                          })}
                          <span className="a-activity-comparison__counts">
                            {Object.entries(
                              group.reduce<Record<string, number>>(
                                (counts, item) => ({
                                  ...counts,
                                  [item.outcome]:
                                    (counts[item.outcome] ?? 0) + 1,
                                }),
                                {},
                              ),
                            ).map(([status, count]) => (
                              <span key={status}>
                                {outcome(status)}: {intl.number(count)}
                              </span>
                            ))}
                          </span>
                        </summary>
                        <ol className="a-entity-activity__items">
                          {group.map((item) => (
                            <li
                              className="a-entity-activity__event"
                              key={item.id}
                            >
                              {content(item)}
                            </li>
                          ))}
                        </ol>
                      </details>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          );
        })
      )}
    </div>
  );
}
