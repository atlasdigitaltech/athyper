import { parseEntityRuntimeLocalizedText, type EntityRuntimeLocalizedTextV1 } from "./runtime-resource";

/** Additive references beside legacy fallback strings; never localized record data. */
export interface EntityPresentationLocalizationV1 {
  readonly entity?: EntityRuntimeLocalizedTextV1;
  readonly title?: EntityRuntimeLocalizedTextV1;
  readonly options?: Readonly<Record<string, Readonly<Record<string, EntityRuntimeLocalizedTextV1>>>>;
  readonly fields: Readonly<Record<string, EntityRuntimeLocalizedTextV1>>;
}

export function parsePresentationLocalization(value: unknown): EntityPresentationLocalizationV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid presentation localization");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !["entity", "title", "fields", "options"].includes(key))) throw new TypeError("Unknown presentation localization property");
  const fields = row.fields ?? {};
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw new TypeError("Invalid localized fields");
  const options = row.options;
  if (options !== undefined && (!options || typeof options !== "object" || Array.isArray(options))) throw new TypeError("Invalid localized options");
  const localizedOptions = options === undefined ? undefined : Object.fromEntries(Object.entries(options).map(([field, entries]) => {
    if (!/^[a-z][a-z0-9_.-]{0,126}$/.test(field) || !entries || typeof entries !== "object" || Array.isArray(entries)) throw new TypeError("Invalid localized options");
    return [field, Object.freeze(Object.fromEntries(Object.entries(entries).map(([value, label]) => [value, parseEntityRuntimeLocalizedText(label)])))];
  }));
  return Object.freeze({
    ...(localizedOptions ? { options: Object.freeze(localizedOptions) } : {}),
    ...(row.entity === undefined ? {} : { entity: parseEntityRuntimeLocalizedText(row.entity) }),
    ...(row.title === undefined ? {} : { title: parseEntityRuntimeLocalizedText(row.title) }),
    fields: Object.freeze(Object.fromEntries(Object.entries(fields).map(([key, label]) => {
      if (!/^[a-z][a-z0-9_.-]{0,126}$/.test(key)) throw new TypeError("Invalid localized field key");
      return [key, parseEntityRuntimeLocalizedText(label)];
    }))),
  });
}

export function readablePresentationLocalization(value: EntityPresentationLocalizationV1 | undefined, fields: readonly string[]): EntityPresentationLocalizationV1 | undefined {
  return value ? { ...value, ...(value.options ? { options: Object.fromEntries(Object.entries(value.options).filter(([key]) => fields.includes(key))) } : {}), fields: Object.fromEntries(Object.entries(value.fields).filter(([key]) => fields.includes(key))) } : undefined;
}
