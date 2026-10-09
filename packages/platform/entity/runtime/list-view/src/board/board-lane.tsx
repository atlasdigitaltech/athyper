"use client";
import React, { type ReactNode } from "react";
import type { HttpClient } from "@athyper/platform-api-client";
import type {
  EntityListDescriptorV1,
  EntityListRowV1,
  EntityListScopeCoordinateV1,
  ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import { ChevronDownIcon } from "@athyper/platform-icons";
import type { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { Button, Skeleton } from "@athyper/platform-ui";
import { EntityRecordCard } from "../record-card";
import { StreamFailure } from "../stream-failure";
import type { RecordCardLayout } from "../record-card-layout";
import { useBoardLanePage, useInView } from "./board-data";
import type { BoardLane } from "./board-model";

/** One Board lane: a labelled region with its exact count, collapse control
 * and a paged column of shared record cards. */
export function BoardLaneColumn({
  client,
  descriptor,
  state,
  field,
  lane,
  count,
  collapsed,
  scope,
  refreshKey,
  layout,
  query,
  intl,
  recordHref,
  onOpenRecord,
  renderActions,
  onToggle,
  collapsible = true,
}: {
  readonly client: HttpClient;
  readonly descriptor: EntityListDescriptorV1;
  readonly state: ListLocationStateV1;
  readonly field: string;
  readonly lane: BoardLane;
  readonly count: number | undefined;
  readonly collapsed: boolean;
  readonly scope?: EntityListScopeCoordinateV1;
  readonly refreshKey: string;
  readonly layout: RecordCardLayout;
  readonly query?: string;
  readonly intl: ReturnType<typeof useEntityI18n>;
  readonly recordHref: (row: EntityListRowV1) => string | undefined;
  readonly onOpenRecord?: (row: EntityListRowV1) => void;
  readonly renderActions: (row: EntityListRowV1) => ReactNode;
  readonly onToggle: () => void;
  /** False when a single lane is shown (narrow widths), where collapsing has no meaning. */
  readonly collapsible?: boolean;
}) {
  const [viewRef, inView] = useInView<HTMLElement>();
  const page = useBoardLanePage({ client, descriptor, state, field, lane, scope, enabled: !collapsed && inView, refreshKey });
  const countLabel = count === undefined ? "–" : intl.number(count);
  const remaining = count === undefined ? undefined : Math.max(0, count - page.rows.length);
  return (
    <section
      ref={viewRef}
      className="a-entity-board__lane"
      data-tone={lane.tone}
      data-collapsed={collapsed || undefined}
      data-terminal={lane.terminal || undefined}
      aria-label={intl.message("list.board.laneRegion", { lane: lane.label, count: count ?? 0 })}
    >
      <header className="a-entity-board__lane-header">
        <span className="a-entity-board__dot" aria-hidden="true" />
        <h2>{lane.label}</h2>
        {lane.terminal && !collapsed ? <span className="a-entity-board__tag">{intl.message("list.board.terminal")}</span> : null}
        <span className="a-entity-board__count">{countLabel}</span>
        {collapsible ? (
        <Button
          variant="ghost"
          size="icon"
          className="a-entity-board__toggle"
          aria-expanded={!collapsed}
          aria-label={intl.message(collapsed ? "list.board.expandLane" : "list.board.collapseLane", { lane: lane.label })}
          onClick={onToggle}
        >
          <ChevronDownIcon aria-hidden="true" />
        </Button>
        ) : null}
      </header>
      {collapsed ? null : (
        <div className="a-entity-board__lane-body" aria-busy={page.loading || undefined}>
          {page.rows.map((row) => (
            <div key={row.id} className="a-entity-board__card" data-board-card tabIndex={-1}>
              <EntityRecordCard
                descriptor={descriptor}
                layout={layout}
                row={row}
                query={query}
                href={recordHref(row)}
                actions={renderActions(row)}
                context={{ terminal: lane.terminal }}
                onOpenRecord={onOpenRecord}
                headingLevel={3}
                intl={intl}
              />
            </div>
          ))}
          {page.loading && !page.rows.length ? <Skeleton className="a-entity-board__placeholder" /> : null}
          {!page.loading && !page.failed && !page.rows.length ? (
            <p className="a-entity-board__empty">{intl.message("list.board.emptyLane")}</p>
          ) : null}
          {page.failed ? (
            <StreamFailure
              className="a-entity-board__failure"
              message={intl.message("list.board.laneFailed")}
              error={page.error}
              onRetry={page.retry}
              intl={intl}
            />
          ) : page.hasNext ? (
            <Button variant="secondary" size="small" className="a-entity-board__more" loading={page.loading} onClick={page.loadMore}>
              {remaining ? intl.message("list.board.loadMoreCount", { count: remaining }) : intl.message("list.board.loadMore")}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
