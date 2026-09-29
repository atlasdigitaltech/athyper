import { RecordServiceError } from "../errors.js";

/** A selected export must never degrade into an unrestricted query. */
export function assertSelectedExportScope(filter: Readonly<Record<string, unknown>>): void {
  const transfer = filter["_transfer"];
  if (!transfer || typeof transfer !== "object" || Array.isArray(transfer) ||
      (transfer as Record<string, unknown>)["scope"] !== "selected") return;
  const recordIds = filter["recordIds"];
  if (!Array.isArray(recordIds) || recordIds.length === 0 ||
      recordIds.some(id => typeof id !== "string" || !id))
    throw new RecordServiceError(400, "EXPORT_SELECTED_IDS_REQUIRED",
      "Selected export requires explicit record IDs");
}
