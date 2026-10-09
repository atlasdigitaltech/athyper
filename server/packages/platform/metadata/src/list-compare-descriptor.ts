import { COMPARE_MAX_FIELDS, COMPARE_MAX_SECTIONS } from "@athyper/contract-platform-entity-list";
import type { EntityFieldDescriptor, EntityListCompareDescriptor } from "@athyper/server-contract-metadata";
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
  only(value, ["sections"], root);
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
  return Object.freeze({ sections: Object.freeze(sections) });
}

/** Section 6 publication checks against the Entity's fields. */
export function validatePublishedListCompare(
  compare: EntityListCompareDescriptor | undefined,
  input: {
    readonly byKey: ReadonlyMap<string, EntityFieldDescriptor>;
    readonly identityField?: string;
    readonly titleField?: string;
    readonly storage: { readonly idField?: unknown; readonly versionField?: unknown };
  },
): void {
  if (!compare) return;
  const root = "listPresentation.compare";
  if (!input.identityField || !input.byKey.has(input.identityField))
    fail(root, "COMPARE_IDENTITY_REQUIRED: the list needs a published readable identity to head the columns");
  const technical = new Set([input.storage.idField, input.storage.versionField].filter((value): value is string => typeof value === "string"));
  const requested = new Set<string>([input.identityField, ...(input.titleField && input.byKey.has(input.titleField) ? [input.titleField] : [])]);
  for (const section of compare.sections)
    for (const key of section.fields) {
      const field = input.byKey.get(key);
      if (!field) fail(root, `COMPARE_FIELD_UNKNOWN: ${key} is not a field of the Entity`);
      if (field.type === "uuid" || technical.has(key) || technical.has(field.storagePath))
        fail(root, `COMPARE_FIELD_TECHNICAL: ${key} is a technical identity and is never displayed`);
      requested.add(key);
      if (field.type === "money" && field.list?.currencyField) requested.add(field.list.currencyField);
    }
  if (requested.size > COMPARE_REQUEST_FIELD_LIMIT)
    fail(root, `COMPARE_FIELDS_ABOVE_CAP: a comparison request would name ${requested.size} fields; the limit is ${COMPARE_REQUEST_FIELD_LIMIT}`);
}
