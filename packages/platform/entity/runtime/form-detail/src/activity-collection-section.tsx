"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { ApiTransportError } from "@athyper/platform-api-client";
import { entityActivityCollectionsClient } from "@athyper/platform-entity-descriptor-client";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { Button } from "@athyper/platform-ui";
import type {
  ActivityCollectionComparisonResult,
  ActivityCollectionSnapshot,
  ActivityCollectionPage,
} from "@athyper/contract-platform-entity-runtime";
import { CollaborationVisibilityContext } from "./collaboration-visibility";
import { formatActivityValue } from "./activity-comparison-model";

type Page =
  | ActivityCollectionPage<ActivityCollectionComparisonResult>
  | ActivityCollectionPage<ActivityCollectionSnapshot>;
/** Owns one authorized section. Mounted in the record's persistent side/full portal. */
export function ActivityCollectionSection({
  entityCode,
  recordId,
  section,
  from,
  to,
}: {
  entityCode: string;
  recordId: string;
  section: { key: string; label: string };
  from?: string;
  to: string;
}) {
  const client = useApiClient(),
    intl = useEntityI18n(),
    visible = useContext(CollaborationVisibilityContext);
  const [page, setPage] = useState<Page>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<"unavailable" | "incompatible" | undefined>();
  const [changesOnly, setChangesOnly] = useState(true),
    [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const request = useRef<AbortController | undefined>(undefined);
  async function load(cursor?: string) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(undefined);
    try {
      const input = {
        entityCode,
        recordId,
        key: section.key,
        signal: controller.signal,
        cursor,
      };
      const next = from
        ? await entityActivityCollectionsClient.compare(client, {
            ...input,
            from,
            to,
          })
        : await entityActivityCollectionsClient.read(client, {
            ...input,
            id: to,
          });
      if (controller.signal.aborted) return;
      if (cursor) {
        if (!page || page.releaseHash !== next.releaseHash)
          throw Error("Collection release changed");
        const ids = new Set(page.items.map((item) => item.id));
        if (next.items.some((item) => ids.has(item.id)))
          throw Error("Repeated collection page");
        setPage({ ...next, items: [...page.items, ...next.items] } as Page);
      } else setPage(next);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setPage(undefined);
        setError(
          cause instanceof ApiTransportError && cause.status === 409
            ? "incompatible"
            : "unavailable",
        );
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    setPage(undefined);
    if (visible) void load();
    return () => request.current?.abort();
  }, [client, entityCode, recordId, section.key, from, to, visible]);
  const comparison = page && "counts" in page ? page : undefined;
  const rows =
    page?.items.filter(
      (item) =>
        !from ||
        !changesOnly ||
        !("change" in item) ||
        item.change !== "unchanged",
    ) ?? [];
  return (
    <section
      className="a-entity-activity__detail a-activity-comparison a-activity-collection"
      aria-label={
        error ? intl.message("activity.collection.unavailable") : section.label
      }
      aria-busy={busy}
    >
      <header>
        <h3>
          {error
            ? intl.message("activity.collection.unavailable")
            : (page?.label ?? section.label)}
        </h3>
      </header>
      {error ? (
        <div role="status">
          <p>
            {intl.message(
              error === "incompatible"
                ? "activity.collection.incompatible"
                : "activity.collection.unavailable",
            )}
          </p>
          <Button onClick={() => void load()}>
            {intl.message("action.retry")}
          </Button>
        </div>
      ) : null}
      {busy && !page ? (
        <p role="status">{intl.message("collaboration.loading")}</p>
      ) : null}
      {page ? (
        <>
          <p>
            {intl.message("activity.collection.loaded", {
              loaded: page.items.length,
              total: page.totalItems,
            })}
          </p>
          {comparison ? (
            <>
              <div className="a-activity-comparison__counts" aria-live="polite">
                {Object.entries(comparison.counts)
                  .filter(([, count]) => count > 0)
                  .map(([kind, count]) => (
                    <span key={kind}>
                      {intl.message(`activity.collection.${kind}`)}:{" "}
                      {intl.number(count)}
                    </span>
                  ))}
              </div>
              <div className="a-activity-comparison__tools">
                <label>
                  <input
                    type="checkbox"
                    checked={changesOnly}
                    onChange={(e) => setChangesOnly(e.target.checked)}
                  />
                  {intl.message("activity.changesOnly")}
                </label>
              </div>
            </>
          ) : null}
          <div className="a-activity-comparison__tools">
            <Button
              variant="ghost"
              onClick={() =>
                setExpanded(
                  Object.fromEntries(rows.map((row) => [row.id, true])),
                )
              }
            >
              {intl.message("activity.expandAll")}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                setExpanded(
                  Object.fromEntries(rows.map((row) => [row.id, false])),
                )
              }
            >
              {intl.message("activity.collapseAll")}
            </Button>
          </div>
          {!rows.length ? (
            <p role="status">
              {intl.message(
                page.nextCursor
                  ? "activity.collection.moreUnseen"
                  : page.totalItems === 0
                    ? "activity.collection.empty"
                    : "activity.collection.noVisibleChanges",
              )}
            </p>
          ) : null}
          {rows.map((row) => {
            const diff = "change" in row;
            const fieldCount = diff
              ? row.fields.filter((field) => field.changed).length
              : 0;
            return (
              <details
                className="a-activity-comparison__section"
                key={row.id}
                open={expanded[row.id] ?? false}
                onToggle={(e) => {
                  const open = e.currentTarget.open;
                  setExpanded((old) =>
                    old[row.id] === open ? old : { ...old, [row.id]: open },
                  );
                }}
              >
                <summary>
                  <strong>
                    {row.label ?? intl.message("activity.collection.record")}{" "}
                    <bdi>{row.id}</bdi>
                  </strong>
                  {diff ? (
                    <span>
                      {intl.message(`activity.collection.${row.change}`)}
                    </span>
                  ) : null}
                  {fieldCount ? (
                    <span>
                      {intl.message("activity.changeCount", {
                        count: fieldCount,
                      })}
                    </span>
                  ) : null}
                </summary>
                {diff && row.valueComparison === "different_target" ? (
                  <p>{intl.message("activity.collection.replacementNote")}</p>
                ) : null}
                {diff && row.valueComparison === "unavailable" ? (
                  <p>{intl.message("activity.limitedSection")}</p>
                ) : null}
                <dl>
                  {row.fields.map((field) => {
                    const compared = "before" in field;
                    const cell = (side: "before" | "after") => {
                      if (!compared)
                        return formatActivityValue(field, field.format, intl);
                      const presence = diff
                        ? side === "before"
                          ? row.beforePresence
                          : row.afterPresence
                        : "present";
                      return presence !== "present"
                        ? intl.message(`activity.collection.${presence}`)
                        : formatActivityValue(field[side], field.format, intl);
                    };
                    return (
                      <div
                        className="a-activity-comparison__field"
                        data-changed={compared && field.changed}
                        key={field.key}
                      >
                        <dt>{field.label}</dt>
                        {compared ? (
                          <dd>
                            <small>{intl.message("activity.before")}</small>
                            <span>{cell("before")}</span>
                          </dd>
                        ) : null}
                        <dd>
                          {compared ? (
                            <small>{intl.message("activity.after")}</small>
                          ) : null}
                          <span>{cell("after")}</span>
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </details>
            );
          })}
          {page.nextCursor ? (
            <Button disabled={busy} onClick={() => void load(page.nextCursor)}>
              {intl.message("activity.more")}
            </Button>
          ) : null}
          {page.notes.length ? (
            <aside
              className={`a-activity-comparison__notes${comparison && !Object.entries(comparison.counts).some(([key, value]) => key !== "unchanged" && value > 0) ? " a-activity-comparison__result" : ""}`}
              data-limited="true"
              role="note"
            >
              <p>{intl.message("activity.comparisonNotes")}</p>
              <ul>
                {page.notes.map((note) => (
                  <li key={note}>
                    {intl.message(`activity.collection.${note}`)}
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
