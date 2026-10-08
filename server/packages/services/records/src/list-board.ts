import type {
  ListBoardV1,
  ListCardContentV1,
  ListFieldDescriptorV1,
} from "@athyper/contract-platform-entity-list";
import type {
  EntityFieldDescriptor,
  EntityListBoardDescriptor,
  EntityListCardContentDescriptor,
} from "@athyper/server-contract-metadata";

export const LIST_BOARD_LANE_FIELD_UNAVAILABLE = "LIST_BOARD_LANE_FIELD_UNAVAILABLE";
export const LIST_BOARD_COUNTS_UNAVAILABLE = "LIST_BOARD_COUNTS_UNAVAILABLE";

export type ListBoardResolution =
  | { readonly board: ListBoardV1 }
  | { readonly unavailable: typeof LIST_BOARD_LANE_FIELD_UNAVAILABLE | typeof LIST_BOARD_COUNTS_UNAVAILABLE };

/** Resolves the published Board for one viewer. A lane field is usable only
 * when it is in the viewer's authorized list fields, unmasked, groupable and
 * filterable with `eq` and `in` (and `is_null` when nullable), so every lane
 * query the browser makes is admissible. Lane counts are exact full-set
 * aggregates, so Board also requires an exact count mode. */
export function resolveListBoard(input: {
  readonly board: EntityListBoardDescriptor;
  readonly countMode: string;
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly entityFields: readonly EntityFieldDescriptor[];
  readonly masked: (key: string) => boolean;
}): ListBoardResolution {
  if (input.countMode !== "exact") return { unavailable: LIST_BOARD_COUNTS_UNAVAILABLE };
  const listed = new Map(input.fields.map((field) => [field.key, field]));
  const declared = new Map(input.entityFields.map((field) => [field.key, field]));
  const laneFields = input.board.laneFields.flatMap((laneField) => {
    const field = listed.get(laneField.field);
    const nullable = declared.get(laneField.field)?.required === false;
    const operators = new Set(field?.filterOperators ?? []);
    const usable =
      field !== undefined &&
      !input.masked(laneField.field) &&
      field.groupable &&
      operators.has("eq") &&
      operators.has("in") &&
      (!nullable || operators.has("is_null"));
    if (!usable) return [];
    return [
      Object.freeze({
        field: laneField.field,
        label: field.label,
        noValueLane: nullable,
        lanes: Object.freeze(
          laneField.lanes.map((lane) =>
            Object.freeze({
              key: lane.key,
              label: lane.label,
              ...(lane.localizedLabel ? { localizedLabel: lane.localizedLabel } : {}),
              values: lane.values,
              tone: lane.tone,
              collapsed: lane.collapsed,
              terminal: lane.terminal,
            }),
          ),
        ),
      }),
    ];
  });
  return laneFields.length
    ? { board: Object.freeze({ laneFields: Object.freeze(laneFields) }) }
    : { unavailable: LIST_BOARD_LANE_FIELD_UNAVAILABLE };
}

/** Keeps only card-content placements the viewer can read unmasked. It
 * orders the authorized projection and never widens it. */
export function resolveCardContent(input: {
  readonly cardContent: EntityListCardContentDescriptor;
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly masked: (key: string) => boolean;
}): ListCardContentV1 | undefined {
  const listed = new Set(input.fields.map((field) => field.key));
  const fields = input.cardContent.fields.filter((placement) => listed.has(placement.field) && !input.masked(placement.field));
  return fields.length ? Object.freeze({ fields: Object.freeze(fields.map((placement) => Object.freeze({ ...placement }))) }) : undefined;
}
