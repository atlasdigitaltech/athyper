import { COMPARE_MAX_FIELDS, COMPARE_MAX_SECTIONS } from "@athyper/contract-platform-entity-list";
import { technicalFieldKeys, type EntityFieldDescriptor, type EntityListCompareDescriptor } from "@athyper/server-contract-metadata";
import { fail, list, only as layoutOnly, record, text } from "./list-date-range-descriptor.js";
import { parseEntityLocalizedText } from "@athyper/contract-platform-entity-list";

// The published comparison declaration of a list surface (Entity list Compare
// blueprint sections 5.2 and 6). Structure is parsed here; field references
// are checked by validatePublishedListCompare; per-viewer readability is
// decided by the list service.

/** The server's projection limit (`MAX_LIST_FIELDS`): a Compare request names
 * the declared fields, the identity, the title and each money field's
 * currency field, and must stay within it (section 5.1). */
export const COMPARE_REQUEST_FIELD_LIMIT = 100;

const SECTION_KEY = /^[a-z][a-z0-9_]{0,62}$/;

function only(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  layoutOnly(value, keys, path, "comparison");
}

export function parsePublishedListCompare(raw: unknown): EntityListCompareDescriptor {
  const root = "listPresentation.compare";
  const value = record(raw, root);
  only(value, ["sections", "collections"], root);
  const items = list(value.sections, `${root}.sections`);
  if (!items.length) fail(`${root}.sections`, "COMPARE_SECTION_EMPTY: must declare at least one section");
  if (items.length > COMPARE_MAX_SECTIONS) fail(`${root}.sections`, `must declare at most ${COMPARE_MAX_SECTIONS} sections`);
  const keys = new Set<string>(), fields = new Set<string>();
  const sections = items.map((item, index) => {
    const at = `${root}.sections[${index}]`;
    const section = record(item, at);
    only(section, ["key", "label", "localizedLabel", "fields", "collapsed"], at);
    const key = text(section.key, `${at}.key`);
    if (!SECTION_KEY.test(key) || keys.has(key)) fail(`${at}.key`, "must be a unique section key");
    keys.add(key);
    const declared = list(section.fields, `${at}.fields`);
    if (!declared.length) fail(`${at}.fields`, "COMPARE_SECTION_EMPTY: must list at least one field");
    const sectionFields = declared.map((entry, position) => {
      const field = text(entry, `${at}.fields[${position}]`);
      if (fields.has(field)) fail(`${at}.fields[${position}]`, `COMPARE_FIELD_DUPLICATE: ${field} is compared once`);
      fields.add(field);
      return field;
    });
    if (section.collapsed !== undefined && section.collapsed !== true) fail(`${at}.collapsed`, "must be true when present");
    let localizedLabel;
    if (section.localizedLabel !== undefined) {
      try {
        localizedLabel = parseEntityLocalizedText(section.localizedLabel);
      } catch (error) {
        fail(`${at}.localizedLabel`, `must be localized text (${(error as Error).message})`);
      }
    }
    return Object.freeze({
      key,
      label: text(section.label, `${at}.label`),
      ...(localizedLabel ? { localizedLabel } : {}),
      fields: Object.freeze(sectionFields),
      ...(section.collapsed ? { collapsed: true as const } : {}),
    });
  });
  if (fields.size > COMPARE_MAX_FIELDS)
    fail(`${root}.sections`, `COMPARE_FIELDS_ABOVE_CAP: must compare at most ${COMPARE_MAX_FIELDS} fields`);
  const collections = value.collections === undefined ? undefined : parseCollections(value.collections, `${root}.collections`, keys);
  return Object.freeze({ sections: Object.freeze(sections), ...(collections ? { collections } : {}) });
}

/** C4 collections (section 5.8): 0–2, each 1–2 match-key fields and 1–12 compared fields. */
export const COMPARE_MAX_COLLECTIONS = 2;
export const COMPARE_MAX_COLLECTION_FIELDS = 12;

function parseCollections(raw: unknown, root: string, sectionKeys: Set<string>): EntityListCompareDescriptor["collections"] {
  const items = list(raw, root);
  if (items.length > COMPARE_MAX_COLLECTIONS) fail(root, `COMPARE_FIELDS_ABOVE_CAP: at most ${COMPARE_MAX_COLLECTIONS} collections`);
  const keys = new Set(sectionKeys);
  return Object.freeze(
    items.map((item, index) => {
      const at = `${root}[${index}]`;
      const entry = record(item, at);
      only(entry, ["key", "label", "localizedLabel", "relationship", "matchKey", "fields", "master", "absentLabel"], at);
      const key = text(entry.key, `${at}.key`);
      if (!SECTION_KEY.test(key) || keys.has(key)) fail(`${at}.key`, "must be a unique key across sections and collections");
      keys.add(key);
      const matchKey = list(entry.matchKey, `${at}.matchKey`).map((field, position) => text(field, `${at}.matchKey[${position}]`));
      if (matchKey.length < 1 || matchKey.length > 2 || new Set(matchKey).size !== matchKey.length) fail(`${at}.matchKey`, "must name 1 or 2 distinct line fields");
      const fields = list(entry.fields, `${at}.fields`).map((field, position) => text(field, `${at}.fields[${position}]`));
      if (!fields.length) fail(`${at}.fields`, "COMPARE_SECTION_EMPTY: must list at least one line field");
      if (fields.length > COMPARE_MAX_COLLECTION_FIELDS) fail(`${at}.fields`, `COMPARE_FIELDS_ABOVE_CAP: at most ${COMPARE_MAX_COLLECTION_FIELDS} line fields`);
      for (const field of fields)
        if (matchKey.includes(field) || fields.indexOf(field) !== fields.lastIndexOf(field)) fail(`${at}.fields`, `COMPARE_FIELD_DUPLICATE: ${field} appears twice`);
      let master: NonNullable<EntityListCompareDescriptor["collections"]>[number]["master"];
      if (entry.master !== undefined) {
        const value = record(entry.master, `${at}.master`);
        only(value, ["entity", "parentField", "recordParentField"], `${at}.master`);
        master = Object.freeze({ entity: text(value.entity, `${at}.master.entity`), parentField: text(value.parentField, `${at}.master.parentField`), recordParentField: text(value.recordParentField, `${at}.master.recordParentField`) });
      }
      let localizedLabel;
      if (entry.localizedLabel !== undefined) {
        try {
          localizedLabel = parseEntityLocalizedText(entry.localizedLabel);
        } catch (error) {
          fail(`${at}.localizedLabel`, `must be localized text (${(error as Error).message})`);
        }
      }
      return Object.freeze({
        key,
        label: text(entry.label, `${at}.label`),
        ...(localizedLabel ? { localizedLabel } : {}),
        relationship: text(entry.relationship, `${at}.relationship`),
        matchKey: Object.freeze(matchKey),
        fields: Object.freeze(fields),
        ...(master ? { master } : {}),
        ...(entry.absentLabel === undefined ? {} : { absentLabel: text(entry.absentLabel, `${at}.absentLabel`) }),
      });
    }),
  );
}

/** Field types a best value may rank (section 5.6). */
export const COMPARE_BETTER_TYPES = ["integer", "decimal", "money", "date", "datetime"] as const;

/** Parses a field's C3 comparison property (`field.compare`). */
export function parseFieldCompare(raw: unknown, type: string, key: string): NonNullable<EntityFieldDescriptor["compare"]> {
  const path = `field.compare (${key})`;
  const value = record(raw, path);
  only(value, ["better", "summaryLabel", "unitField", "evaluation"], path);
  if (value.better === undefined) {
    if (value.summaryLabel !== undefined) fail(path, "COMPARE_SUMMARY_WITHOUT_BETTER: a summary label needs a best-value direction");
    fail(path, "must declare better");
  }
  if (value.better !== "lower" && value.better !== "higher") fail(`${path}.better`, "must be lower or higher");
  if (!(COMPARE_BETTER_TYPES as readonly string[]).includes(type))
    fail(path, `COMPARE_BETTER_INELIGIBLE: a ${type} field cannot rank a best value`);
  if (value.evaluation !== undefined && value.evaluation !== true) fail(`${path}.evaluation`, "must be true when present");
  return Object.freeze({
    better: value.better,
    ...(value.summaryLabel === undefined ? {} : { summaryLabel: text(value.summaryLabel, `${path}.summaryLabel`) }),
    ...(value.unitField === undefined ? {} : { unitField: text(value.unitField, `${path}.unitField`) }),
    ...(value.evaluation ? { evaluation: true as const } : {}),
  });
}

/** Section 6 publication checks against the Entity's fields. */
export function validatePublishedListCompare(
  compare: EntityListCompareDescriptor | undefined,
  input: {
    readonly byKey: ReadonlyMap<string, EntityFieldDescriptor>;
    readonly identityField?: string;
    readonly titleField?: string;
    readonly storage: { readonly idField?: unknown; readonly versionField?: unknown };
    readonly relationships?: readonly { readonly key: string; readonly cardinality: string }[];
  },
): void {
  if (!compare) return;
  const root = "listPresentation.compare";
  if (!input.identityField || !input.byKey.has(input.identityField))
    fail(root, "COMPARE_IDENTITY_REQUIRED: the list needs a published readable identity to head the columns");
  const technical = technicalFieldKeys({ storage: input.storage, fields: [...input.byKey.values()] });
  const requested = new Set<string>([input.identityField, ...(input.titleField && input.byKey.has(input.titleField) ? [input.titleField] : [])]);
  for (const section of compare.sections)
    for (const key of section.fields) {
      const field = input.byKey.get(key);
      if (!field) fail(root, `COMPARE_FIELD_UNKNOWN: ${key} is not a field of the Entity`);
      if (technical.has(key))
        fail(root, `COMPARE_FIELD_TECHNICAL: ${key} is a technical identity and is never displayed`);
      requested.add(key);
      if (field.type === "money" && field.list?.currencyField) requested.add(field.list.currencyField);
    }
  if (requested.size > COMPARE_REQUEST_FIELD_LIMIT)
    fail(root, `COMPARE_FIELDS_ABOVE_CAP: a comparison request would name ${requested.size} fields; the limit is ${COMPARE_REQUEST_FIELD_LIMIT}`);
  // C4: the relationship must be published on this Entity with cardinality
  // "many"; the master's parent reference must exist on the compared Entity.
  // The line Entity's own fields are checked where both Entities are known
  // (the authoring compiler) and, per viewer, at runtime (section 5.8).
  for (const collection of compare.collections ?? []) {
    const relationship = input.relationships?.find((item) => item.key === collection.relationship);
    if (!relationship || relationship.cardinality !== "many")
      fail(root, `COMPARE_COLLECTION_RELATIONSHIP_INVALID: ${collection.relationship} is not a published "many" relationship of this Entity`);
    if (collection.master) {
      const parentReference = input.byKey.get(collection.master.recordParentField);
      if (!parentReference || parentReference.type !== "reference")
        fail(root, `COMPARE_MASTER_SCOPE_UNBOUND: ${collection.master.recordParentField} is not a reference field of the compared Entity`);
    }
  }
}
