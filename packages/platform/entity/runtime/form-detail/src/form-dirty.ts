import type {
  EntitySurfaceFieldV1,
} from "@athyper/contract-platform-entity-runtime";

type FormValues = Readonly<Record<string, unknown>>;

/** Compares current form values with the last saved (or initial) values,
 * treating a missing value and an empty string as the same empty state. */
export function isFormDirty(
  fields: readonly Pick<EntitySurfaceFieldV1, "key">[],
  values: FormValues,
  saved: FormValues,
): boolean {
  return fields.some(
    (field) =>
      JSON.stringify(values[field.key] ?? "") !==
      JSON.stringify(saved[field.key] ?? ""),
  );
}
