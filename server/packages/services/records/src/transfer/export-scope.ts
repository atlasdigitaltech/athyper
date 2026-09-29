import { RecordServiceError } from "../errors.js";

/** A record-bounded export must never degrade into an unrestricted query. */
export function assertBoundedExportScope(filter: Readonly<Record<string, unknown>>): void {
  const transfer = filter["_transfer"];
  if (!transfer || typeof transfer !== "object" || Array.isArray(transfer) ||
      !["selected", "page"].includes(String((transfer as Record<string, unknown>)["scope"]))) return;
  const recordIds = filter["recordIds"];
  if (!Array.isArray(recordIds) || recordIds.length === 0 ||
      recordIds.some(id => typeof id !== "string" || !id))
    throw new RecordServiceError(400, "EXPORT_SELECTED_IDS_REQUIRED",
      "Selected and current-page exports require explicit record IDs");
}
