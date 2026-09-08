"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  addRecordBookmarksOperation,
  removeRecordBookmarksOperation,
  recordBookmarksOperation,
  entityListScopeQuery,
  type HttpClient,
  type RecordBookmarkItemV1,
} from "@athyper/platform-api-client";
import type { EntityListScopeCoordinateV1 } from "@athyper/contract-platform-entity-list";
import { ChevronRightIcon, StarIcon } from "@athyper/platform-icons";
import { Button } from "@athyper/platform-ui";

export interface FavouriteRecord {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly href?: string;
}
export interface EntityFavouritesProps {
  readonly records: readonly FavouriteRecord[];
  readonly browseHref?: string;
  readonly loading?: boolean;
  readonly error?: string;
  readonly busy?: boolean;
  readonly removedLabel?: string;
  readonly onRemove?: (id: string) => void;
  readonly onUndo?: () => void;
  readonly onRetry?: () => void;
}
export function EntityFavourites({
  records,
  browseHref,
  loading,
  error,
  busy,
  removedLabel,
  onRemove,
  onUndo,
  onRetry,
}: EntityFavouritesProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section
      className="a-entity-pulse__panel a-entity-pulse__favourites"
      aria-label="Favourites"
    >
      <div className="a-entity-pulse__panel-heading">
        <div>
          <h3>
            <StarIcon size={19} />
            Favourites
          </h3>
          <p>Your go-to records, close at hand.</p>
        </div>
        {records.length > 5 ? (
          <button
            type="button"
            className="a-entity-pulse__text-link"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Show fewer" : "View favourites"}
            <ChevronRightIcon size={15} />
          </button>
        ) : null}
      </div>
      {error ? (
        <div className="a-entity-pulse__notice" role="alert">
          {error}
          {onRetry ? (
            <button type="button" onClick={onRetry} disabled={loading || busy}>
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
      {loading ? (
        <div
          className="a-entity-pulse__loading"
          role="status"
          aria-label="Loading favourites"
        >
          {[0, 1, 2].map((key) => (
            <div
              className="a-skeleton a-entity-pulse__row-skeleton"
              key={key}
            />
          ))}
        </div>
      ) : records.length ? (
        <div className="a-entity-pulse__records">
          {records.slice(0, expanded ? records.length : 5).map((record) => (
            <div className="a-entity-pulse__favourite" key={record.id}>
              {onRemove ? (
                <button
                  className="a-entity-pulse__favourite-star"
                  type="button"
                  aria-label={`Remove ${record.label} from favourites`}
                  disabled={busy}
                  onClick={() => onRemove(record.id)}
                >
                  <StarIcon size={19} />
                </button>
              ) : (
                <span
                  className="a-entity-pulse__favourite-star"
                  aria-hidden="true"
                >
                  <StarIcon size={19} />
                </span>
              )}
              {record.href ? (
                <a
                  className="a-entity-pulse__favourite-link"
                  href={record.href}
                >
                  <span className="a-entity-pulse__row-copy">
                    <strong>{record.label}</strong>
                    {record.description ? (
                      <small>{record.description}</small>
                    ) : null}
                  </span>
                  <ChevronRightIcon size={16} />
                </a>
              ) : (
                <span className="a-entity-pulse__row-copy">
                  <strong>{record.label}</strong>
                  {record.description ? (
                    <small>{record.description}</small>
                  ) : null}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : !error ? (
        <div className="a-entity-pulse__empty">
          <span>
            <StarIcon size={26} />
          </span>
          <strong>Keep your go-to records close</strong>
          <p>Star a record in Manage to find it here.</p>
          {browseHref ? (
            <a className="a-entity-pulse__text-link" href={browseHref}>
              Browse records
              <ChevronRightIcon size={15} />
            </a>
          ) : null}
        </div>
      ) : null}
      {expanded && records.length >= 200 ? (
        <p className="a-entity-pulse__footnote">
          Showing up to 200 recent favourites in this scope.
        </p>
      ) : null}
      {removedLabel ? (
        <div className="a-entity-pulse__undo" role="status">
          <span>{removedLabel} removed from favourites.</span>
          {onUndo ? (
            <Button
              variant="ghost"
              size="small"
              disabled={busy}
              onClick={onUndo}
            >
              Undo
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function EntityFavouritesRuntime({
  client,
  entityCode,
  scopeCoordinate,
  detailRouteTemplate,
  browseHref,
  refreshKey,
}: {
  readonly client: HttpClient;
  readonly entityCode: string;
  readonly scopeCoordinate?: EntityListScopeCoordinateV1;
  readonly detailRouteTemplate?: string;
  readonly browseHref: string;
  readonly refreshKey: number;
}) {
  const [items, setItems] = useState<readonly RecordBookmarkItemV1[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false),
    [removed, setRemoved] = useState<RecordBookmarkItemV1>();
  const [attempt, setAttempt] = useState(0);
  const active = useRef(true),
    mutation = useRef(false);
  const loadVersion = useRef(0);
  // The parent keys this component by authority; cleanup prevents stale mutations crossing scopes.
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController(),
      version = ++loadVersion.current;
    setLoading(true);
    setError(undefined);
    client
      .request(recordBookmarksOperation, {
        query: { entityCode, ...entityListScopeQuery(scopeCoordinate) },
        signal: controller.signal,
      })
      .then((rows) => {
        if (!controller.signal.aborted && version === loadVersion.current)
          setItems(rows.filter((row) => row.entityCode === entityCode));
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Favourites couldn’t be loaded. Please try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    client,
    entityCode,
    JSON.stringify(scopeCoordinate ?? {}),
    attempt,
    refreshKey,
  ]);
  useEffect(() => {
    const changed = (event: Event) => {
      if (
        (event as CustomEvent).detail?.entityCode === entityCode &&
        !mutation.current
      )
        setAttempt((value) => value + 1);
    };
    window.addEventListener("athyper:record-bookmarks-changed", changed);
    return () =>
      window.removeEventListener("athyper:record-bookmarks-changed", changed);
  }, [entityCode]);
  const mutate = async (
    item: RecordBookmarkItemV1,
    operation: "add" | "remove",
  ) => {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setError(undefined);
    ++loadVersion.current;
    try {
      await client.request(
        operation === "add"
          ? addRecordBookmarksOperation
          : removeRecordBookmarksOperation,
        {
          params: { entityCode },
          body: {
            records: [
              {
                id: item.recordId,
                ...(item.label ? { label: item.label } : {}),
              },
            ],
            ...entityListScopeQuery(scopeCoordinate),
          },
          idempotencyKey: `record-bookmark:${operation}:${crypto.randomUUID()}`,
        },
      );
      if (!active.current) return;
      if (operation === "remove") {
        setItems((current) =>
          current.filter((row) => row.recordId !== item.recordId),
        );
        setRemoved(item);
      } else {
        setRemoved(undefined);
        setAttempt((value) => value + 1);
      }
      window.dispatchEvent(
        new CustomEvent("athyper:record-bookmarks-changed", {
          detail: { entityCode, operation, recordIds: [item.recordId] },
        }),
      );
    } catch {
      if (active.current)
        setError(
          operation === "remove"
            ? "This favourite couldn’t be removed. Try again."
            : "This favourite couldn’t be restored. Try Undo again.",
        );
    } finally {
      mutation.current = false;
      if (active.current) setBusy(false);
    }
  };
  return (
    <EntityFavourites
      records={items.map((item) => ({
        id: item.recordId,
        label: item.label ?? item.recordId,
        description: item.description,
        href: detailRouteTemplate?.replace(
          ":recordId",
          encodeURIComponent(item.recordId),
        ),
      }))}
      browseHref={browseHref}
      loading={loading}
      error={error}
      busy={busy}
      removedLabel={removed?.label ?? removed?.recordId}
      onRemove={(id) => {
        const item = items.find((row) => row.recordId === id);
        if (item) void mutate(item, "remove");
      }}
      onUndo={removed ? () => void mutate(removed, "add") : undefined}
      onRetry={() => setAttempt((value) => value + 1)}
    />
  );
}
