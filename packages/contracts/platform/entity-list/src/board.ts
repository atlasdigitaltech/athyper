import type { EntityLocalizedTextV1 } from "./experience";
import { parseEntityLocalizedText } from "./experience";

/** Tone vocabulary shared with record badges and list status cells. */
export type ListBoardTone = "neutral" | "success" | "warning" | "danger";

export const LIST_BOARD_MAX_LANE_FIELDS = 3;
export const LIST_BOARD_MAX_LANES = 12;

/** One lane: a set of published choice values shown together. */
export interface ListBoardLaneV1 {
  readonly key: string;
  readonly label: string;
  readonly localizedLabel?: EntityLocalizedTextV1;
  readonly values: readonly string[];
  readonly tone: ListBoardTone;
  readonly collapsed: boolean;
  readonly terminal: boolean;
}

/** A declared lane field this viewer can use, with its lanes in order. */
export interface ListBoardLaneFieldV1 {
  readonly field: string;
  readonly label: string;
  /** True when the field is nullable, so records without a value get a lane. */
  readonly noValueLane: boolean;
  readonly lanes: readonly ListBoardLaneV1[];
}

export interface ListBoardV1 {
  readonly laneFields: readonly ListBoardLaneFieldV1[];
}

/** Compiled projection of the surface's summary placements, in order. */
export interface ListCardContentV1 {
  readonly fields: readonly { readonly field: string; readonly rendererKey?: string }[];
}

/** Viewer state for the Board layout, saved with views and shared links. */
export interface ListBoardStateV1 {
  readonly laneField: string;
  readonly collapsed: readonly string[];
}

const TONES = ["neutral", "success", "warning", "danger"] as const;
const LANE_KEY = /^[a-z][a-z0-9_]{0,62}$/;
const RENDERER_KEY = /^[a-z][a-z0-9_.-]{0,126}$/;

function fail(path: string, reason: string): never {
  throw new TypeError(`${path} ${reason}`);
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  return value as Record<string, unknown>;
}
function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  return value;
}
function allowKeys(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}`, "is not a board property");
}
function label(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) fail(path, "must be readable text");
  return value;
}
function flag(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "must be a boolean");
  return value;
}

/** Parses the browser board projection. Lanes reference only fields this
 * descriptor carries, and every value appears in exactly one lane. */
export function parseListBoard(raw: unknown, fieldKeys: ReadonlySet<string>): ListBoardV1 {
  const value = record(raw, "surface.board");
  allowKeys(value, ["laneFields"], "surface.board");
  const laneFields = list(value.laneFields, "surface.board.laneFields");
  if (!laneFields.length || laneFields.length > LIST_BOARD_MAX_LANE_FIELDS)
    fail("surface.board.laneFields", `must declare 1 to ${LIST_BOARD_MAX_LANE_FIELDS} lane fields`);
  const seenFields = new Set<string>();
  return Object.freeze({
    laneFields: Object.freeze(
      laneFields.map((item, index) => {
        const path = `surface.board.laneFields[${index}]`;
        const entry = record(item, path);
        allowKeys(entry, ["field", "label", "noValueLane", "lanes"], path);
        const field = label(entry.field, `${path}.field`);
        if (!fieldKeys.has(field) || seenFields.has(field)) fail(`${path}.field`, "must be a listed field, declared once");
        seenFields.add(field);
        const lanes = list(entry.lanes, `${path}.lanes`);
        if (!lanes.length || lanes.length > LIST_BOARD_MAX_LANES)
          fail(`${path}.lanes`, `must declare 1 to ${LIST_BOARD_MAX_LANES} lanes`);
        const keys = new Set<string>(), values = new Set<string>();
        return Object.freeze({
          field,
          label: label(entry.label, `${path}.label`),
          noValueLane: flag(entry.noValueLane, `${path}.noValueLane`),
          lanes: Object.freeze(lanes.map((laneItem, laneIndex) => parseLane(laneItem, `${path}.lanes[${laneIndex}]`, keys, values))),
        });
      }),
    ),
  });
}

function parseLane(raw: unknown, path: string, keys: Set<string>, values: Set<string>): ListBoardLaneV1 {
  const lane = record(raw, path);
  allowKeys(lane, ["key", "label", "localizedLabel", "values", "tone", "collapsed", "terminal"], path);
  const key = lane.key;
  if (typeof key !== "string" || !LANE_KEY.test(key) || keys.has(key)) fail(`${path}.key`, "must be a unique lane key");
  keys.add(key);
  const laneValues = list(lane.values, `${path}.values`).map((item, index) => {
    const choice = label(item, `${path}.values[${index}]`);
    if (values.has(choice)) fail(`${path}.values[${index}]`, "must appear in exactly one lane");
    values.add(choice);
    return choice;
  });
  if (!laneValues.length) fail(`${path}.values`, "must name at least one published choice");
  const tone = lane.tone;
  if (typeof tone !== "string" || !(TONES as readonly string[]).includes(tone)) fail(`${path}.tone`, "must be a published tone");
  return Object.freeze({
    key,
    label: label(lane.label, `${path}.label`),
    ...(lane.localizedLabel === undefined ? {} : { localizedLabel: parseEntityLocalizedText(lane.localizedLabel) }),
    values: Object.freeze(laneValues),
    tone: tone as ListBoardTone,
    collapsed: flag(lane.collapsed, `${path}.collapsed`),
    terminal: flag(lane.terminal, `${path}.terminal`),
  });
}

/** Parses the card-content projection. It only orders fields the viewer can
 * already read; it never widens the authorized projection. */
export function parseListCardContent(raw: unknown, fieldKeys: ReadonlySet<string>): ListCardContentV1 {
  const value = record(raw, "surface.cardContent");
  allowKeys(value, ["fields"], "surface.cardContent");
  const seen = new Set<string>();
  const fields = list(value.fields, "surface.cardContent.fields").map((item, index) => {
    const path = `surface.cardContent.fields[${index}]`;
    const entry = record(item, path);
    allowKeys(entry, ["field", "rendererKey"], path);
    const field = label(entry.field, `${path}.field`);
    if (!fieldKeys.has(field) || seen.has(field)) fail(`${path}.field`, "must be a listed field, placed once");
    seen.add(field);
    const rendererKey = entry.rendererKey;
    if (rendererKey !== undefined && (typeof rendererKey !== "string" || !RENDERER_KEY.test(rendererKey)))
      fail(`${path}.rendererKey`, "must be a registered renderer key");
    return Object.freeze({ field, ...(rendererKey === undefined ? {} : { rendererKey: rendererKey as string }) });
  });
  if (!fields.length) fail("surface.cardContent.fields", "must place at least one field");
  return Object.freeze({ fields: Object.freeze(fields) });
}

/** Normalizes saved or shared board state against this viewer's board. An
 * unusable lane field falls back to the first usable one in declared order;
 * collapsed keys that no longer exist are ignored. */
export function parseListBoardState(raw: unknown, board: ListBoardV1): ListBoardStateV1 {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const declared = board.laneFields.find((item) => item.field === value.laneField) ?? board.laneFields[0]!;
  const laneKeys = new Set(declared.lanes.map((lane) => lane.key));
  const collapsed = Array.isArray(value.collapsed)
    ? [...new Set(value.collapsed.filter((key): key is string => typeof key === "string" && laneKeys.has(key)))]
    : declared.lanes.filter((lane) => lane.collapsed).map((lane) => lane.key);
  return Object.freeze({ laneField: declared.field, collapsed: Object.freeze(collapsed) });
}

/** True when saved state named a lane field this viewer can no longer use. */
export function boardLaneFieldFellBack(raw: unknown, board: ListBoardV1): boolean {
  const laneField = raw && typeof raw === "object" ? (raw as Record<string, unknown>).laneField : undefined;
  return typeof laneField === "string" && !board.laneFields.some((item) => item.field === laneField);
}
