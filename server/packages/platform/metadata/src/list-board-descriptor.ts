import {
  LIST_BOARD_MAX_LANE_FIELDS,
  LIST_BOARD_MAX_LANES,
  LIST_LAYOUT_TONES,
  parseEntityLocalizedText,
  type ListBoardTone,
} from "@athyper/contract-platform-entity-list";
import type {
  EntityFieldDescriptor,
  EntityListBoardDescriptor,
  EntityListCardContentDescriptor,
  EntityListViewMode,
} from "@athyper/server-contract-metadata";
import { fail, flag, list, only as layoutOnly, record, text } from "./list-date-range-descriptor.js";

/** Published choices per lane field. Matches the Studio choice bound. */
export const LIST_BOARD_MAX_CHOICES = 50;

const LANE_KEY = /^[a-z][a-z0-9_]{0,62}$/;
const RENDERER_KEY = /^[a-z][a-z0-9_.-]{0,126}$/;

function only(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  layoutOnly(value, keys, path, "board");
}
function tone(value: unknown, path: string): ListBoardTone {
  if (typeof value !== "string" || !(LIST_LAYOUT_TONES as readonly string[]).includes(value)) fail(path, "must be a published tone");
  return value as ListBoardTone;
}
function localized(value: unknown, path: string) {
  if (value === undefined) return {};
  try {
    return { localizedLabel: parseEntityLocalizedText(value) };
  } catch (error) {
    return fail(path, `must be localized text (${(error as Error).message})`);
  }
}

/** Parses the published Board projection. Structure only: every choice is
 * in exactly one lane and every lane value is a published choice. Field
 * references are checked by {@link validatePublishedListBoard}; per-viewer
 * eligibility is decided by the list service. */
export function parsePublishedListBoard(raw: unknown): EntityListBoardDescriptor {
  const root = "listPresentation.board";
  const value = record(raw, root);
  only(value, ["laneFields"], root);
  const laneFields = list(value.laneFields, `${root}.laneFields`);
  if (!laneFields.length || laneFields.length > LIST_BOARD_MAX_LANE_FIELDS)
    fail(`${root}.laneFields`, `must declare 1 to ${LIST_BOARD_MAX_LANE_FIELDS} lane fields`);
  const fields = new Set<string>();
  return Object.freeze({
    laneFields: Object.freeze(
      laneFields.map((item, index) => {
        const path = `${root}.laneFields[${index}]`;
        const entry = record(item, path);
        only(entry, ["field", "choices", "lanes"], path);
        const field = text(entry.field, `${path}.field`);
        if (fields.has(field)) fail(`${path}.field`, "must be declared once");
        fields.add(field);
        const choices = parseChoices(entry.choices, `${path}.choices`);
        const lanes = parseLanes(entry.lanes, `${path}.lanes`, new Set(choices.map((choice) => choice.value)));
        return Object.freeze({ field, choices, lanes });
      }),
    ),
  });
}

function parseChoices(raw: unknown, path: string): EntityListBoardDescriptor["laneFields"][number]["choices"] {
  const items = list(raw, path);
  if (!items.length || items.length > LIST_BOARD_MAX_CHOICES)
    fail(path, `must publish 1 to ${LIST_BOARD_MAX_CHOICES} choices`);
  const values = new Set<string>(), positions = new Set<number>();
  return Object.freeze(
    items.map((item, index) => {
      const at = `${path}[${index}]`;
      const choice = record(item, at);
      only(choice, ["value", "label", "localizedLabel", "tone", "position"], at);
      const value = text(choice.value, `${at}.value`);
      const position = choice.position;
      if (values.has(value)) fail(`${at}.value`, "must be unique");
      if (!Number.isSafeInteger(position) || (position as number) < 1 || positions.has(position as number))
        fail(`${at}.position`, "must be a unique positive integer");
      values.add(value);
      positions.add(position as number);
      return Object.freeze({
        value,
        label: text(choice.label, `${at}.label`),
        ...localized(choice.localizedLabel, `${at}.localizedLabel`),
        tone: tone(choice.tone, `${at}.tone`),
        position: position as number,
      });
    }),
  );
}

function parseLanes(
  raw: unknown,
  path: string,
  choices: ReadonlySet<string>,
): EntityListBoardDescriptor["laneFields"][number]["lanes"] {
  const items = list(raw, path);
  if (!items.length || items.length > LIST_BOARD_MAX_LANES)
    fail(path, `must declare 1 to ${LIST_BOARD_MAX_LANES} lanes`);
  const keys = new Set<string>(), assigned = new Set<string>();
  const lanes = items.map((item, index) => {
    const at = `${path}[${index}]`;
    const lane = record(item, at);
    only(lane, ["key", "label", "localizedLabel", "values", "tone", "collapsed", "terminal"], at);
    const key = lane.key;
    if (typeof key !== "string" || !LANE_KEY.test(key) || keys.has(key)) fail(`${at}.key`, "must be a unique lane key");
    keys.add(key);
    const values = list(lane.values, `${at}.values`).map((value, valueIndex) => {
      const choice = text(value, `${at}.values[${valueIndex}]`);
      if (!choices.has(choice)) fail(`${at}.values[${valueIndex}]`, "must be a published choice");
      if (assigned.has(choice)) fail(`${at}.values[${valueIndex}]`, "must appear in exactly one lane");
      assigned.add(choice);
      return choice;
    });
    if (!values.length) fail(`${at}.values`, "must name at least one published choice");
    return Object.freeze({
      key,
      label: text(lane.label, `${at}.label`),
      ...localized(lane.localizedLabel, `${at}.localizedLabel`),
      values: Object.freeze(values),
      tone: tone(lane.tone, `${at}.tone`),
      collapsed: flag(lane.collapsed, `${at}.collapsed`),
      terminal: flag(lane.terminal, `${at}.terminal`),
    });
  });
  for (const choice of choices) if (!assigned.has(choice)) fail(path, `must assign published choice ${choice} to a lane`);
  return Object.freeze(lanes);
}

/** Parses the published card-content projection (summary placements). */
export function parsePublishedCardContent(raw: unknown): EntityListCardContentDescriptor {
  const root = "listPresentation.cardContent";
  const value = record(raw, root);
  only(value, ["fields"], root);
  const seen = new Set<string>();
  const fields = list(value.fields, `${root}.fields`).map((item, index) => {
    const at = `${root}.fields[${index}]`;
    const entry = record(item, at);
    only(entry, ["field", "rendererKey"], at);
    const field = text(entry.field, `${at}.field`);
    if (seen.has(field)) fail(`${at}.field`, "must be placed once");
    seen.add(field);
    const rendererKey = entry.rendererKey;
    if (rendererKey !== undefined && (typeof rendererKey !== "string" || !RENDERER_KEY.test(rendererKey)))
      fail(`${at}.rendererKey`, "must be a registered renderer key");
    return Object.freeze({ field, ...(rendererKey === undefined ? {} : { rendererKey: rendererKey as string }) });
  });
  if (!fields.length) fail(`${root}.fields`, "must place at least one field");
  return Object.freeze({ fields: Object.freeze(fields) });
}

/** Checks Board and card-content references against the entity's fields.
 * A lane field must be an enum other than the list identity; Board must be a
 * supported mode exactly when lanes are published. */
export function validatePublishedListBoard(
  presentation: {
    readonly board?: EntityListBoardDescriptor;
    readonly cardContent?: EntityListCardContentDescriptor;
    readonly supportedModes?: readonly EntityListViewMode[];
    readonly identityField?: string;
  },
  byKey: ReadonlyMap<string, EntityFieldDescriptor>,
): void {
  const declaresBoard = presentation.supportedModes?.includes("board") === true;
  if (declaresBoard !== Boolean(presentation.board))
    throw new Error("listPresentation.board is required exactly when Board is a supported mode");
  for (const laneField of presentation.board?.laneFields ?? []) {
    const field = byKey.get(laneField.field);
    if (!field) throw new Error(`listPresentation.board references unknown field: ${laneField.field}`);
    if (field.type !== "enum")
      throw new Error(`listPresentation.board lane field must be an enum: ${laneField.field}`);
    if (laneField.field === presentation.identityField)
      throw new Error(`listPresentation.board lane field must not be the list identity: ${laneField.field}`);
  }
  for (const placement of presentation.cardContent?.fields ?? [])
    if (!byKey.has(placement.field))
      throw new Error(`listPresentation.cardContent references unknown field: ${placement.field}`);
}
