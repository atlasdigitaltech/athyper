"use client";
import React, { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { HttpClient } from "@athyper/platform-api-client";
import type {
  EntityListDescriptorV1,
  EntityListResultV1,
  EntityListRowV1,
  EntityListScopeCoordinateV1,
  ListBoardStateV1,
  ListFieldDescriptorV1,
  ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { useOptionalI18n } from "@athyper/platform-i18n/react";
import { Button, SegmentedControl } from "@athyper/platform-ui";
import { resolveCardLayout } from "../card-content";
import type { ListWidthTier } from "../presentation-tier";
import { labelledText } from "../composite-text";
import { BoardLaneColumn } from "./board-lane";
import { boardCounts, boardDistribution, boardLanes, laneFilterFits } from "./board-model";

/** The Board layout of the shared entity list: lanes from the viewer's
 * published Board, exact counts from the list's summary query, and one paged
 * request per expanded lane. */
export function EntityBoard({
  client,
  descriptor,
  state,
  summary,
  summaryCurrent,
  scope,
  widthTier,
  fields,
  refreshKey,
  recordHref,
  onOpenRecord,
  renderActions,
  onBoardChange,
  onShowTable,
}: {
  readonly client: HttpClient;
  readonly descriptor: EntityListDescriptorV1;
  readonly state: ListLocationStateV1;
  /** The summary query result: the list query grouped by the lane field. */
  readonly summary?: EntityListResultV1;
  /** False while the summary still describes a previous query or lane field. */
  readonly summaryCurrent: boolean;
  readonly scope?: EntityListScopeCoordinateV1;
  readonly widthTier: ListWidthTier | undefined;
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly refreshKey: string;
  readonly recordHref: (row: EntityListRowV1) => string | undefined;
  readonly onOpenRecord?: (row: EntityListRowV1) => void;
  readonly renderActions: (row: EntityListRowV1) => ReactNode;
  readonly onBoardChange: (board: ListBoardStateV1) => void;
  readonly onShowTable: () => void;
}) {
  const intl = useEntityI18n();
  const locale = useOptionalI18n()?.localization.uiLocale;
  const board = descriptor.surface.board!;
  const boardState = state.board ?? { laneField: board.laneFields[0]!.field, collapsed: [] };
  const laneField = board.laneFields.find((item) => item.field === boardState.laneField) ?? board.laneFields[0]!;
  const lanes = useMemo(() => boardLanes(laneField, intl.message("list.board.noValue"), locale), [laneField, intl, locale]);
  const counts = summaryCurrent && summary ? boardCounts(lanes, summary.groups) : undefined;
  const collapsed = new Set(boardState.collapsed);
  const layout = resolveCardLayout(descriptor, fields, laneField.field);
  const narrow = widthTier === "narrow";
  const [activeLane, setActiveLane] = useState<string>();
  const shownLane = lanes.find((lane) => lane.key === activeLane) ?? lanes[0]!;
  const visibleLanes = narrow ? [shownLane] : lanes;
  const [announcement, setAnnouncement] = useState("");
  // Announce once per loaded summary, not on every render.
  useEffect(() => {
    if (summaryCurrent && summary) setAnnouncement(intl.message("list.board.loaded", { field: laneField.label }));
  }, [summary, summaryCurrent, laneField.label, intl]);

  const toggle = (key: string) =>
    onBoardChange({
      laneField: laneField.field,
      collapsed: collapsed.has(key) ? boardState.collapsed.filter((item) => item !== key) : [...boardState.collapsed, key],
    });
  const navigate = (event: KeyboardEvent) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>("[data-board-card]");
    if (!card) return;
    // Enter on a focused card opens it through the card's own record link.
    if (event.key === "Enter" && event.target === card) {
      event.preventDefault();
      card.querySelector<HTMLAnchorElement>("a[href]")?.click();
      return;
    }
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const lane = card.closest("section");
    const cards = [...(lane?.querySelectorAll<HTMLElement>("[data-board-card]") ?? [])];
    const index = cards.indexOf(card);
    let target: HTMLElement | undefined;
    if (event.key === "ArrowDown") target = cards[index + 1];
    else if (event.key === "ArrowUp") target = cards[index - 1];
    else {
      const rtl = card.ownerDocument.defaultView?.getComputedStyle(card).direction === "rtl";
      const forward = (event.key === "ArrowRight") !== rtl;
      let next = forward ? lane?.nextElementSibling : lane?.previousElementSibling;
      while (next && !next.querySelector("[data-board-card]")) next = forward ? next.nextElementSibling : next.previousElementSibling;
      const nextCards = next ? [...next.querySelectorAll<HTMLElement>("[data-board-card]")] : [];
      target = nextCards[Math.min(index, nextCards.length - 1)];
    }
    if (target) {
      event.preventDefault();
      target.focus();
    }
  };

  // Composite keyboard navigation for the cards (arrows across lanes, Enter to
  // open) is delegated to the lanes container rather than every card.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const [lanesElement, setLanesElement] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!lanesElement) return;
    const listener = (event: KeyboardEvent) => navigateRef.current(event);
    lanesElement.addEventListener("keydown", listener);
    return () => lanesElement.removeEventListener("keydown", listener);
  }, [lanesElement]);

  if (!laneFilterFits(state))
    return <p className="a-entity-board__notice" role="status">{intl.message("list.board.tooManyFilters")}</p>;
  return (
    <div className="a-entity-board">
      <div className="a-entity-board__summary">
        {board.laneFields.length > 1 ? (
          <SegmentedControl
            label={intl.message("list.board.laneField")}
            value={laneField.field}
            options={board.laneFields.map((item) => ({ value: item.field, label: item.label }))}
            onValueChange={(next) => onBoardChange({ laneField: next, collapsed: board.laneFields.find((item) => item.field === next)!.lanes.filter((lane) => lane.collapsed).map((lane) => lane.key) })}
          />
        ) : null}
        {counts ? <BoardDistribution lanes={boardDistribution(lanes, counts)} total={counts.total} field={laneField.label} intl={intl} /> : null}
      </div>
      {counts?.unmapped ? (
        <div className="a-entity-board__notice" role="status">
          <span>{intl.message("list.board.unmapped", { count: counts.unmapped, field: laneField.label })}</span>
          <Button variant="secondary" size="small" onClick={onShowTable}>{intl.message("list.board.viewInTable")}</Button>
        </div>
      ) : null}
      {narrow ? (
        <div className="a-entity-board__chips" role="group" aria-label={intl.message("list.board.lanes")}>
          {lanes.map((lane) => (
            <button key={lane.key} type="button" data-tone={lane.tone} aria-pressed={lane.key === shownLane.key} onClick={() => setActiveLane(lane.key)}>
              {lane.label} <span>{counts ? intl.number(counts.lanes.get(lane.key) ?? 0) : "–"}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div ref={setLanesElement} className="a-entity-board__lanes" role="group" aria-label={intl.message("list.board.lanes")}>
        {visibleLanes.map((lane) => (
          <BoardLaneColumn
            key={`${laneField.field}:${lane.key}`}
            client={client}
            descriptor={descriptor}
            state={state}
            field={laneField.field}
            lane={lane}
            count={counts?.lanes.get(lane.key)}
            collapsed={!narrow && collapsed.has(lane.key)}
            scope={scope}
            refreshKey={refreshKey}
            layout={layout}
            query={state.query}
            intl={intl}
            recordHref={recordHref}
            onOpenRecord={onOpenRecord}
            renderActions={renderActions}
            onToggle={() => toggle(lane.key)}
            collapsible={!narrow}
          />
        ))}
      </div>
      <span className="a-visually-hidden" role="status" aria-live="polite">{announcement}</span>
    </div>
  );
}

/** Proportional summary of the lane counts already fetched. The bar is
 * decorative; the legend carries the same numbers as text. */
function BoardDistribution({
  lanes,
  total,
  field,
  intl,
}: {
  readonly lanes: ReturnType<typeof boardDistribution>;
  readonly total: number;
  readonly field: string;
  readonly intl: ReturnType<typeof useEntityI18n>;
}) {
  if (!total) return null;
  return (
    <div className="a-entity-board__distribution">
      <div className="a-entity-board__bar" aria-hidden="true">
        {lanes.map(({ lane, count }) => (
          <i key={lane.key} data-tone={lane.tone} style={{ flexGrow: count }} title={labelledText(intl, lane.label, intl.number(count))} />
        ))}
      </div>
      <ul className="a-entity-board__legend" aria-label={intl.message("list.board.distribution", { field })}>
        {lanes.map(({ lane, count }) => (
          <li key={lane.key} data-tone={lane.tone}>
            <span className="a-entity-board__dot" aria-hidden="true" />
            {lane.label} <b>{intl.number(count)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
