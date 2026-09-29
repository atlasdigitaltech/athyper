import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { RecordServiceError } from "../errors.js";

const EXPORTABLE_CLASSIFICATIONS = new Set(["public", "internal"]);

/**
 * Export is a disclosure boundary, not merely a list projection. Every field
 * in the effective projection must have a published classification and only
 * classifications with the ordinary-disclosure disposition may cross it.
 */
export function assertExportFieldAdmission(
  descriptor: EntityRuntimeDescriptor,
  fields: readonly string[],
): void {
  for (const key of fields) {
    const field = descriptor.fields.find((candidate) => candidate.key === key);
    if (!field)
      throw new RecordServiceError(
        403,
        "EXPORT_FIELD_UNREGISTERED",
        "Export field is unavailable",
      );
    if (!field.classification)
      throw new RecordServiceError(
        403,
        "EXPORT_FIELD_CLASSIFICATION_REQUIRED",
        "Export field has no published data classification",
      );
    if (!EXPORTABLE_CLASSIFICATIONS.has(field.classification))
      throw new RecordServiceError(
        403,
        "EXPORT_FIELD_CLASSIFICATION_FORBIDDEN",
        "Export field is not permitted by its data classification",
      );
  }
}
