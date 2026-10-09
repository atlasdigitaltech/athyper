import { parseEntityLocalizedText, type EntityLocalizedTextV1 } from "./experience";
import { allowKeys, fail, list, record, text } from "./layout-parse";
import type { ListValueKind } from "./types";

// Entity list Compare (blueprint docs/blueprints/entity-list-compare,
// sections 5.1, 5.3 and 5.4): the per-viewer comparison projection and its
// URL state. Compare is a selection action, not a Layout.

/** Fewest records a comparison holds. */
export const COMPARE_MIN_RECORDS = 2;
/** Most records a comparison holds: a presentation bound; the server accepts up to 100 recordIds. */
export const COMPARE_MAX_RECORDS = 4;
/** Columns shown at once at the narrow breakpoint. */
export const COMPARE_NARROW_COLUMNS = 2;
/** Declared comparison fields per surface: the budget inside the 100-field projection limit. */
export const COMPARE_MAX_FIELDS = 60;
/** Sections per comparison declaration. */
export const COMPARE_MAX_SECTIONS = 12;

export interface ListCompareFieldV1 {
  readonly key: string;
  readonly label: string;
  readonly valueKind: Exclude<ListValueKind, "uuid">;
  /** Choice labels for enum fields. */
  readonly options?: readonly Readonly<{ value: string | number | boolean; label: string }>[];
  /** This viewer receives a masked value: shown, never compared. */
  readonly masked?: true;
  /** Money: the readable currency field, when declared and readable. */
  readonly currencyField?: string;
  /** Money: the currency field is masked for this viewer, so amounts are not compared. */
  readonly currencyMasked?: true;
}

export interface ListCompareSectionV1 {
  readonly key: string;
  readonly label: string;
  readonly localizedLabel?: EntityLocalizedTextV1;
  /** The section starts collapsed (revision 3, decision 12). */
  readonly collapsed?: true;
  readonly fields: readonly ListCompareFieldV1[];
}

/** `surface.compare`: present only when the surface declares a comparison and
 * at least one declared field is readable for this viewer (section 5.3). */
export interface ListCompareV1 {
  readonly sections: readonly ListCompareSectionV1[];
  /** Some declared fields are not shown to this viewer. No names, no count. */
  readonly fieldsRestricted?: true;
  /** The descriptor's declared status field, only when readable and compared (section 9.2). */
  readonly statusField?: string;
  readonly maxRecords: typeof COMPARE_MAX_RECORDS;
}

const KEY = /^[a-z][a-z0-9_]{0,62}$/;
const KINDS: readonly ListCompareFieldV1["valueKind"][] = ["string", "text", "integer", "decimal", "money", "boolean", "date", "datetime", "enum", "reference", "json"];

/** Parses the browser comparison projection against the list's listed fields. */
export function parseListCompare(
  raw: unknown,
  listed: ReadonlyMap<string, { readonly valueKind: string }>,
): ListCompareV1 {
  const root = "surface.compare";
  const value = record(raw, root);
  allowKeys(value, ["sections", "fieldsRestricted", "statusField", "maxRecords"], root, "Compare");
  if (value.maxRecords !== COMPARE_MAX_RECORDS) fail(`${root}.maxRecords`, `must be ${COMPARE_MAX_RECORDS}`);
  if (value.fieldsRestricted !== undefined && value.fieldsRestricted !== true) fail(`${root}.fieldsRestricted`, "must be true when present");
  const sectionItems = list(value.sections, `${root}.sections`);
  if (!sectionItems.length || sectionItems.length > COMPARE_MAX_SECTIONS) fail(`${root}.sections`, `must hold 1 to ${COMPARE_MAX_SECTIONS} sections`);
  const sectionKeys = new Set<string>(), fieldKeys = new Set<string>();
  const sections = sectionItems.map((item, index) => {
    const at = `${root}.sections[${index}]`;
    const section = record(item, at);
    allowKeys(section, ["key", "label", "localizedLabel", "collapsed", "fields"], at, "Compare section");
    const key = text(section.key, `${at}.key`);
    if (!KEY.test(key) || sectionKeys.has(key)) fail(`${at}.key`, "must be a unique section key");
    sectionKeys.add(key);
    if (section.collapsed !== undefined && section.collapsed !== true) fail(`${at}.collapsed`, "must be true when present");
    const fieldItems = list(section.fields, `${at}.fields`);
    if (!fieldItems.length) fail(`${at}.fields`, "must hold at least one field");
    const fields = fieldItems.map((entry, position) => parseField(entry, `${at}.fields[${position}]`, listed, fieldKeys));
    return Object.freeze({
      key,
      label: text(section.label, `${at}.label`),
      ...(section.localizedLabel === undefined ? {} : { localizedLabel: parseEntityLocalizedText(section.localizedLabel) }),
      ...(section.collapsed ? { collapsed: true as const } : {}),
      fields: Object.freeze(fields),
    });
  });
  if (fieldKeys.size > COMPARE_MAX_FIELDS) fail(`${root}.sections`, `must hold at most ${COMPARE_MAX_FIELDS} fields`);
  const statusField = value.statusField === undefined ? undefined : text(value.statusField, `${root}.statusField`);
  if (statusField !== undefined && !fieldKeys.has(statusField)) fail(`${root}.statusField`, "must be a compared field");
  return Object.freeze({
    sections: Object.freeze(sections),
    ...(value.fieldsRestricted ? { fieldsRestricted: true as const } : {}),
    ...(statusField ? { statusField } : {}),
    maxRecords: COMPARE_MAX_RECORDS,
  });
}

function parseField(
  raw: unknown,
  at: string,
  listed: ReadonlyMap<string, { readonly valueKind: string }>,
  seen: Set<string>,
): ListCompareFieldV1 {
  const field = record(raw, at);
  allowKeys(field, ["key", "label", "valueKind", "options", "masked", "currencyField", "currencyMasked"], at, "Compare field");
  const key = text(field.key, `${at}.key`);
  if (seen.has(key)) fail(`${at}.key`, "must be compared once");
  seen.add(key);
  const valueKind = field.valueKind as ListCompareFieldV1["valueKind"];
  if (!KINDS.includes(valueKind) || listed.get(key)?.valueKind !== valueKind) fail(`${at}.valueKind`, "must match a listed, non-identifier field");
  for (const flagKey of ["masked", "currencyMasked"] as const)
    if (field[flagKey] !== undefined && field[flagKey] !== true) fail(`${at}.${flagKey}`, "must be true when present");
  const currencyField = field.currencyField === undefined ? undefined : text(field.currencyField, `${at}.currencyField`);
  if (currencyField !== undefined && (valueKind !== "money" || !listed.has(currencyField))) fail(`${at}.currencyField`, "must be a listed field of a money field");
  if (field.currencyMasked !== undefined && currencyField === undefined) fail(`${at}.currencyMasked`, "needs a currency field");
  const options = field.options === undefined ? undefined : list(field.options, `${at}.options`).map((option, index) => {
    const item = record(option, `${at}.options[${index}]`);
    allowKeys(item, ["value", "label"], `${at}.options[${index}]`, "choice");
    if (!["string", "number", "boolean"].includes(typeof item.value)) fail(`${at}.options[${index}].value`, "must be a scalar");
    return Object.freeze({ value: item.value as string | number | boolean, label: text(item.label, `${at}.options[${index}].label`) });
  });
  return Object.freeze({
    key,
    label: text(field.label, `${at}.label`),
    valueKind,
    ...(options ? { options: Object.freeze(options) } : {}),
    ...(field.masked ? { masked: true as const } : {}),
    ...(currencyField ? { currencyField } : {}),
    ...(field.currencyMasked ? { currencyMasked: true as const } : {}),
  });
}

/** The comparison's URL state (section 5.4). Never part of saved state. */
export interface ListCompareLocationV1 {
  /** Record routing identities in column order; never displayed. */
  readonly records: readonly string[];
  readonly baseline?: string;
  /** Show every row instead of differences only. */
  readonly all?: true;
}

const ROUTING_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const COMPARE_URL_KEYS = ["compare", "compareBaseline", "compareAll"] as const;

/** Reads the comparison from the URL; undefined when absent or invalid (the
 * caller removes invalid keys and shows the "could not be opened" notice). */
export function readCompareLocation(params: URLSearchParams): ListCompareLocationV1 | "invalid" | undefined {
  const raw = params.get("compare");
  if (raw === null) return params.has("compareBaseline") || params.has("compareAll") ? "invalid" : undefined;
  const records = [...new Set(raw.split(","))];
  if (records.length < COMPARE_MIN_RECORDS || records.length > COMPARE_MAX_RECORDS || !records.every((id) => ROUTING_ID.test(id))) return "invalid";
  const baseline = params.get("compareBaseline");
  const all = params.get("compareAll");
  if ((baseline !== null && !records.includes(baseline)) || (all !== null && all !== "true")) return "invalid";
  return Object.freeze({ records: Object.freeze(records), ...(baseline ? { baseline } : {}), ...(all ? { all: true as const } : {}) });
}

/** Writes (or, with undefined, removes) the comparison keys. */
export function writeCompareLocation(params: URLSearchParams, state: ListCompareLocationV1 | undefined): void {
  for (const key of COMPARE_URL_KEYS) params.delete(key);
  if (!state) return;
  params.set("compare", state.records.join(","));
  if (state.baseline) params.set("compareBaseline", state.baseline);
  if (state.all) params.set("compareAll", "true");
}
