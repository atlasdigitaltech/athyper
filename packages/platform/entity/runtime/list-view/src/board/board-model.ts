import type { EntityListQueryState } from "@athyper/platform-api-client";
import {
  ENTITY_LIST_MAX_FILTERS,
  resolveEntityText,
  type EntityListDescriptorV1,
  type EntityListResultV1,
  type ListBoardLaneFieldV1,
  type ListBoardTone,
  type ListFilterV1,
  type ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";

/** A rendered lane: a published lane, or the framework "No value" lane. */
export interface BoardLane {
  readonly key: string;
  readonly label: string;
  readonly values: readonly string[];
  readonly tone: ListBoardTone;
  readonly terminal: boolean;
  readonly noValue: boolean;
}

/** Key reserved for the framework lane that holds records without a value.
 * Published lane keys start with a letter, so it cannot collide. */
export const NO_VALUE_LANE_KEY = "__none";

/** Lanes in published order, followed by "No value" for a nullable field. */
export function boardLanes(
  laneField: ListBoardLaneFieldV1,
  noValueLabel: string,
  locale?: string,
): readonly BoardLane[] {
  const lanes: BoardLane[] = laneField.lanes.map((lane) => ({
    key: lane.key,
    label: lane.localizedLabel ? resolveEntityText(lane.localizedLabel, locale) : lane.label,
    values: lane.values,
    tone: lane.tone,
    terminal: lane.terminal,
    noValue: false,
  }));
  if (laneField.noValueLane)
    lanes.push({ key: NO_VALUE_LANE_KEY, label: noValueLabel, values: [], tone: "neutral", terminal: false, noValue: true });
  return lanes;
}

export interface BoardCounts {
  /** Exact count per lane key; lanes without a bucket count 0. */
  readonly lanes: ReadonlyMap<string, number>;
  /** Records whose value is not a published choice. Never shown as a lane. */
  readonly unmapped: number;
  readonly total: number;
}

/** Folds the server's exact group buckets into lane counts. Buckets are keyed
 * by raw value, exactly as grouped tables and cards key them. */
export function boardCounts(
  lanes: readonly BoardLane[],
  groups: EntityListResultV1["groups"],
): BoardCounts {
  const laneByValue = new Map<string, string>();
  for (const lane of lanes) for (const value of lane.values) laneByValue.set(value, lane.key);
  const counts = new Map(lanes.map((lane) => [lane.key, 0]));
  const noValue = lanes.find((lane) => lane.noValue);
  let unmapped = 0, total = 0;
  for (const bucket of groups ?? []) {
    const count = bucket.count ?? 0;
    total += count;
    const key =
      bucket.value === null
        ? noValue?.key
        : typeof bucket.value === "string"
          ? laneByValue.get(bucket.value)
          : undefined;
    if (key) counts.set(key, (counts.get(key) ?? 0) + count);
    else unmapped += count;
  }
  return { lanes: counts, unmapped, total };
}

/** The filter that selects one lane's records, ANDed with the list query. */
export function laneFilter(field: string, lane: BoardLane): ListFilterV1 {
  return lane.noValue
    ? { field, operator: "is_null" }
    : { field, operator: "in", value: [...lane.values] };
}

/** True when the lane filter fits beside the viewer's own filters. */
export function laneFilterFits(state: Pick<ListLocationStateV1, "filters">): boolean {
  return state.filters.length < ENTITY_LIST_MAX_FILTERS;
}

/** The single summary query for Board: the current list query grouped by the
 * lane field. Its exact buckets give every lane count and the total. Rows are
 * not displayed, so it asks for the smallest allowed page. */
export function boardSummaryState(
  state: ListLocationStateV1,
  descriptor: EntityListDescriptorV1,
): ListLocationStateV1 & EntityListQueryState {
  if (state.mode !== "board" || !state.board) return state;
  return {
    ...state,
    group: state.board.laneField,
    cursor: undefined,
    pageIndex: undefined,
    pageSize: Math.min(...descriptor.limits.allowedPageSizes),
  };
}

/** Share of each lane in the distribution summary, from counts already
 * fetched. Lanes with no records keep a sliver so their colour stays visible. */
export function boardDistribution(
  lanes: readonly BoardLane[],
  counts: BoardCounts,
): readonly { readonly lane: BoardLane; readonly count: number }[] {
  return lanes.filter((lane) => !lane.noValue || (counts.lanes.get(lane.key) ?? 0) > 0)
    .map((lane) => ({ lane, count: counts.lanes.get(lane.key) ?? 0 }));
}
