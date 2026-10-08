import { LIST_GANTT_ZOOMS } from "@athyper/contract-platform-entity-list";
import type {
  EntityFieldDescriptor,
  EntityListGanttDescriptor,
  EntityListViewMode,
} from "@athyper/server-contract-metadata";
import {
  fail,
  only,
  parsePublishedDateRanges,
  record,
  text,
  validatePublishedDateRanges,
} from "./list-date-range-descriptor.js";

/** Parses the published Gantt projection (structure only). A default zoom
 * outside the renderable set is rejected here, never downgraded. Field
 * references are checked by {@link validatePublishedListGantt}. */
export function parsePublishedListGantt(
  raw: unknown,
): EntityListGanttDescriptor {
  const root = "listPresentation.gantt";
  const value = record(raw, root);
  only(
    value,
    ["defaultZoom", "dateFields", "group", "progress"],
    root,
    "Gantt",
  );
  if (
    typeof value.defaultZoom !== "string" ||
    !(LIST_GANTT_ZOOMS as readonly string[]).includes(value.defaultZoom)
  )
    fail(`${root}.defaultZoom`, "must be a renderable zoom");
  const dateFields = parsePublishedDateRanges(value.dateFields, root, "Gantt");
  const reference = (key: "group" | "progress") => {
    if (value[key] === undefined) return undefined;
    const item = record(value[key], `${root}.${key}`);
    only(item, ["field"], `${root}.${key}`, "Gantt");
    return Object.freeze({ field: text(item.field, `${root}.${key}.field`) });
  };
  const group = reference("group"),
    progress = reference("progress");
  return Object.freeze({
    defaultZoom: value.defaultZoom as EntityListGanttDescriptor["defaultZoom"],
    dateFields,
    ...(group ? { group } : {}),
    ...(progress ? { progress } : {}),
  });
}

/** Checks Gantt references against the entity: date ranges as Calendar's, a
 * group field is an enum, a progress field is an integer or decimal, and
 * Gantt is declared exactly when a Gantt projection is published. */
export function validatePublishedListGantt(
  presentation: {
    readonly gantt?: EntityListGanttDescriptor;
    readonly supportedModes?: readonly EntityListViewMode[];
  },
  byKey: ReadonlyMap<string, EntityFieldDescriptor>,
): void {
  if (
    (presentation.supportedModes?.includes("gantt") === true) !==
    Boolean(presentation.gantt)
  )
    throw new Error(
      "listPresentation.gantt is required exactly when Gantt is a supported mode",
    );
  const gantt = presentation.gantt;
  if (!gantt) return;
  validatePublishedDateRanges(
    gantt.dateFields,
    byKey,
    "listPresentation.gantt",
  );
  if (gantt.group && byKey.get(gantt.group.field)?.type !== "enum")
    throw new Error(
      `listPresentation.gantt group field must be an enum: ${gantt.group.field}`,
    );
  const progressType = gantt.progress
    ? byKey.get(gantt.progress.field)?.type
    : undefined;
  if (
    gantt.progress &&
    progressType !== "integer" &&
    progressType !== "decimal"
  )
    throw new Error(
      `listPresentation.gantt progress field must be an integer or decimal: ${gantt.progress.field}`,
    );
}
