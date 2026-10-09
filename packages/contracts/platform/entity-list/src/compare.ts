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
  /** C3: the best value is the lower or the higher one (section 5.6). */
  readonly better?: "lower" | "higher";
  /** C3: the summary chip's label, only with `better`. */
  readonly summaryLabel?: string;
  /** C4: the field holding this measure's unit; a different unit hides the best mark. */
  readonly unitField?: string;
  /** C4: an evaluation amount (one currency, normalized), so units only gate the mark. */
  readonly evaluation?: true;
}

/** Why a C4 collection cannot be compared for this viewer (Compare 5.8 point 10a). */
export type ListCompareCollectionUnavailable =
  | "RELATIONSHIP_UNAVAILABLE"
  | "MATCH_KEY_UNAVAILABLE"
  | "MATCH_KEY_NOT_SHARED"
  | "MASTER_UNAVAILABLE"
  | "NO_READABLE_FIELDS";

/** A C4 line-item collection, resolved per viewer on the server (Compare 5.8). */
export interface ListCompareCollectionV1 {
  readonly key: string;
  readonly label: string;
  readonly localizedLabel?: EntityLocalizedTextV1;
  readonly targetEntity: string;
  readonly relationshipKey: string;
  /** The parent's compiled hash, checked by the parent-scope resolver. */
  readonly parentDescriptorHash: string;
  readonly matchKey: readonly { readonly key: string; readonly label: string; readonly valueKind: string }[];
  readonly fields: readonly ListCompareFieldV1[];
  /** Master-list mode. */
  readonly master?: {
    readonly entity: string;
    readonly parentField: string;
    readonly recordParentField: string;
    readonly identityField: string;
    readonly titleField?: string;
    readonly searchable: boolean;
    /** Up to three bounded choice filters of the master list (for example category). */
    readonly filters: readonly { readonly key: string; readonly label: string; readonly options: readonly { readonly value: string | number | boolean; readonly label: string }[] }[];
    /** The master list publishes exact counts (coverage needs both). */
    readonly exactCounts?: true;
  };
  /** The line Entity publishes exact counts. */
  readonly exactCounts?: true;
  readonly absentLabel?: string;
  /** Line access does not follow the parent's: absence is never claimed. */
  readonly accessIndependent?: true;
  readonly unavailable?: ListCompareCollectionUnavailable;
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
  /** C4 line-item collections (0–2). */
  readonly collections?: readonly ListCompareCollectionV1[];
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
  allowKeys(value, ["sections", "collections", "fieldsRestricted", "statusField", "maxRecords"], root, "Compare");
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
  const collections = value.collections === undefined ? undefined : list(value.collections, `${root}.collections`).map((item, index) => parseCollection(item, `${root}.collections[${index}]`));
  if (collections && collections.length > 2) fail(`${root}.collections`, "must hold at most 2 collections");
  return Object.freeze({
    sections: Object.freeze(sections),
    ...(collections ? { collections: Object.freeze(collections) } : {}),
    ...(value.fieldsRestricted ? { fieldsRestricted: true as const } : {}),
    ...(statusField ? { statusField } : {}),
    maxRecords: COMPARE_MAX_RECORDS,
  });
}

const UNAVAILABLE: readonly ListCompareCollectionUnavailable[] = ["RELATIONSHIP_UNAVAILABLE", "MATCH_KEY_UNAVAILABLE", "MATCH_KEY_NOT_SHARED", "MASTER_UNAVAILABLE", "NO_READABLE_FIELDS"];
const HASH = /^[a-f0-9]{64}$/;

function parseCollection(raw: unknown, at: string): ListCompareCollectionV1 {
  const value = record(raw, at);
  allowKeys(value, ["key", "label", "localizedLabel", "targetEntity", "relationshipKey", "parentDescriptorHash", "matchKey", "fields", "master", "exactCounts", "absentLabel", "accessIndependent", "unavailable"], at, "Compare collection");
  const key = text(value.key, `${at}.key`);
  if (!KEY.test(key)) fail(`${at}.key`, "must be a collection key");
  const unavailable = value.unavailable === undefined ? undefined : (value.unavailable as ListCompareCollectionUnavailable);
  if (unavailable !== undefined && !UNAVAILABLE.includes(unavailable)) fail(`${at}.unavailable`, "must be a published reason");
  const parentDescriptorHash = text(value.parentDescriptorHash, `${at}.parentDescriptorHash`);
  if (!HASH.test(parentDescriptorHash)) fail(`${at}.parentDescriptorHash`, "must be a 64-hex digest");
  for (const flag of ["exactCounts", "accessIndependent"] as const)
    if (value[flag] !== undefined && value[flag] !== true) fail(`${at}.${flag}`, "must be true when present");
  const matchKey = list(value.matchKey, `${at}.matchKey`).map((entry, index) => {
    const item = record(entry, `${at}.matchKey[${index}]`);
    allowKeys(item, ["key", "label", "valueKind"], `${at}.matchKey[${index}]`, "match key");
    return Object.freeze({ key: text(item.key, `${at}.matchKey[${index}].key`), label: text(item.label, `${at}.matchKey[${index}].label`), valueKind: text(item.valueKind, `${at}.matchKey[${index}].valueKind`) });
  });
  if (!unavailable && (matchKey.length < 1 || matchKey.length > 2)) fail(`${at}.matchKey`, "must hold 1 or 2 fields");
  const seen = new Set<string>();
  const lineFields = new Map<string, { valueKind: string }>(list(value.fields, `${at}.fields`).map((entry) => {
    const item = record(entry, `${at}.fields`);
    return [String(item.key), { valueKind: String(item.valueKind) }];
  }));
  for (const item of matchKey) lineFields.set(item.key, { valueKind: item.valueKind });
  // Currency and unit fields are read from the line Entity alongside the compared fields.
  for (const entry of list(value.fields, `${at}.fields`)) {
    const item = entry as Record<string, unknown>;
    for (const companion of [item.currencyField, item.unitField]) if (typeof companion === "string" && !lineFields.has(companion)) lineFields.set(companion, { valueKind: "string" });
  }
  const fields = list(value.fields, `${at}.fields`).map((entry, index) => parseField(entry, `${at}.fields[${index}]`, lineFields, seen));
  if (!unavailable && !fields.length) fail(`${at}.fields`, "must hold at least one field");
  let master: ListCompareCollectionV1["master"];
  if (value.master !== undefined) {
    const item = record(value.master, `${at}.master`);
    allowKeys(item, ["entity", "parentField", "recordParentField", "identityField", "titleField", "searchable", "filters", "exactCounts"], `${at}.master`, "master list");
    if (typeof item.searchable !== "boolean") fail(`${at}.master.searchable`, "must be a boolean");
    const filters = list(item.filters, `${at}.master.filters`).map((entry, index) => {
      const filter = record(entry, `${at}.master.filters[${index}]`);
      allowKeys(filter, ["key", "label", "options"], `${at}.master.filters[${index}]`, "master filter");
      return Object.freeze({
        key: text(filter.key, `${at}.master.filters[${index}].key`),
        label: text(filter.label, `${at}.master.filters[${index}].label`),
        options: Object.freeze(list(filter.options, `${at}.master.filters[${index}].options`).map((option) => {
          const choice = record(option, `${at}.master.filters[${index}].options`);
          return Object.freeze({ value: choice.value as string | number | boolean, label: text(choice.label, `${at}.master.filters[${index}].options.label`) });
        })),
      });
    });
    if (filters.length > 3) fail(`${at}.master.filters`, "must hold at most 3 filters");
    if (item.exactCounts !== undefined && item.exactCounts !== true) fail(`${at}.master.exactCounts`, "must be true when present");
    master = Object.freeze({
      entity: text(item.entity, `${at}.master.entity`),
      parentField: text(item.parentField, `${at}.master.parentField`),
      recordParentField: text(item.recordParentField, `${at}.master.recordParentField`),
      identityField: text(item.identityField, `${at}.master.identityField`),
      ...(item.titleField === undefined ? {} : { titleField: text(item.titleField, `${at}.master.titleField`) }),
      searchable: item.searchable,
      filters: Object.freeze(filters),
      ...(item.exactCounts ? { exactCounts: true as const } : {}),
    });
  }
  return Object.freeze({
    key,
    label: text(value.label, `${at}.label`),
    ...(value.localizedLabel === undefined ? {} : { localizedLabel: parseEntityLocalizedText(value.localizedLabel) }),
    targetEntity: text(value.targetEntity, `${at}.targetEntity`),
    relationshipKey: text(value.relationshipKey, `${at}.relationshipKey`),
    parentDescriptorHash,
    matchKey: Object.freeze(matchKey),
    fields: Object.freeze(fields),
    ...(master ? { master } : {}),
    ...(value.exactCounts ? { exactCounts: true as const } : {}),
    ...(value.absentLabel === undefined ? {} : { absentLabel: text(value.absentLabel, `${at}.absentLabel`) }),
    ...(value.accessIndependent ? { accessIndependent: true as const } : {}),
    ...(unavailable ? { unavailable } : {}),
  });
}

function parseField(
  raw: unknown,
  at: string,
  listed: ReadonlyMap<string, { readonly valueKind: string }>,
  seen: Set<string>,
): ListCompareFieldV1 {
  const field = record(raw, at);
  allowKeys(field, ["key", "label", "valueKind", "options", "masked", "currencyField", "currencyMasked", "better", "summaryLabel", "unitField", "evaluation"], at, "Compare field");
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
  const better = field.better;
  if (better !== undefined && (better !== "lower" && better !== "higher" || !["integer", "decimal", "money", "date", "datetime"].includes(valueKind)))
    fail(`${at}.better`, "must be lower or higher on a number or date field");
  const summaryLabel = field.summaryLabel === undefined ? undefined : text(field.summaryLabel, `${at}.summaryLabel`);
  if (summaryLabel !== undefined && better === undefined) fail(`${at}.summaryLabel`, "needs better");
  const unitField = field.unitField === undefined ? undefined : text(field.unitField, `${at}.unitField`);
  if (field.evaluation !== undefined && field.evaluation !== true) fail(`${at}.evaluation`, "must be true when present");
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
    ...(better ? { better: better as "lower" | "higher" } : {}),
    ...(summaryLabel ? { summaryLabel } : {}),
    ...(unitField ? { unitField } : {}),
    ...(field.evaluation ? { evaluation: true as const } : {}),
  });
}

/** The comparison's URL state (section 5.4). Never part of saved state. */
export interface ListCompareLocationV1 {
  /** Record routing identities in column order; never displayed. */
  readonly records: readonly string[];
  readonly baseline?: string;
  /** Show every row instead of differences only. */
  readonly all?: true;
  /** C4: pinned master rows (routing identities, never displayed), at most 100. */
  readonly items?: readonly string[];
}

const ROUTING_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const COMPARE_URL_KEYS = ["compare", "compareBaseline", "compareAll", "compareItems"] as const;
/** Pinned master rows a comparison URL may carry (the in-filter limit). */
export const COMPARE_MAX_PINNED_ITEMS = 100;

/** A well-formed comparison location (used when location state is parsed). */
export function isListCompareLocation(value: unknown): value is ListCompareLocationV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some((key) => !["records", "baseline", "all", "items"].includes(key))) return false;
  const items = item.items;
  if (items !== undefined && (!Array.isArray(items) || items.length < 1 || items.length > COMPARE_MAX_PINNED_ITEMS || new Set(items).size !== items.length || !items.every((id) => typeof id === "string" && ROUTING_ID.test(id)))) return false;
  const records = item.records;
  return (
    Array.isArray(records) &&
    records.length >= COMPARE_MIN_RECORDS &&
    records.length <= COMPARE_MAX_RECORDS &&
    new Set(records).size === records.length &&
    records.every((id) => typeof id === "string" && ROUTING_ID.test(id)) &&
    (item.baseline === undefined || records.includes(item.baseline)) &&
    (item.all === undefined || item.all === true)
  );
}

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
  const rawItems = params.get("compareItems");
  const items = rawItems === null ? undefined : [...new Set(rawItems.split(","))];
  if (items && (items.length > COMPARE_MAX_PINNED_ITEMS || !items.every((id) => ROUTING_ID.test(id)))) return "invalid";
  return Object.freeze({ records: Object.freeze(records), ...(baseline ? { baseline } : {}), ...(all ? { all: true as const } : {}), ...(items?.length ? { items: Object.freeze(items) } : {}) });
}

/** Writes (or, with undefined, removes) the comparison keys. */
export function writeCompareLocation(params: URLSearchParams, state: ListCompareLocationV1 | undefined): void {
  for (const key of COMPARE_URL_KEYS) params.delete(key);
  if (!state) return;
  params.set("compare", state.records.join(","));
  if (state.baseline) params.set("compareBaseline", state.baseline);
  if (state.all) params.set("compareAll", "true");
  if (state.items?.length) params.set("compareItems", state.items.join(","));
}
