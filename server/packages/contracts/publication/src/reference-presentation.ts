import { PublicationContractError } from "./errors.js";

/** Explicit authored unavailability is distinct from a failed lookup. It never
 * grants reference access and must not be combined with a resolver or renderer. */
export function validateReferencePresentation(fields: unknown): void {
  if (!Array.isArray(fields)) return;
  for (const field of fields) {
    if (!field || typeof field !== "object") continue;
    const display = field.display;
    if (!display || typeof display !== "object") continue;
    if (display.unavailableReference !== undefined) {
      const label = display.unavailableReference;
      if (
        field.dataType !== "uuid" ||
        !label ||
        typeof label !== "object" ||
        typeof label.labelKey !== "string" ||
        !label.labelKey.trim() ||
        typeof label.defaultText !== "string" ||
        !label.defaultText.trim() ||
        Object.keys(label).some(
          (key) => !["labelKey", "defaultText"].includes(key),
        ) ||
        Object.keys(display).some((key) => key !== "unavailableReference")
      )
        throw new PublicationContractError(
          "ENTITY_REFERENCE_PRESENTATION_INVALID",
          `Invalid unavailable reference display: ${String(field.key)}`,
        );
    }
    validateReferencePresentation(display.itemFields);
  }
}
