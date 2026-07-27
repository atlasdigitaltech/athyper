import {
  isEntityFieldWritable,
  type EntityWriteFieldRule,
  type FieldNonWritableReason,
} from "./routes/entity-mutation-guard.js";

export type DocumentWorkspaceLockedReason =
  | "status_locked"
  | "permission_locked"
  | "pii_masked"
  | "readonly"
  | "computed"
  | "system";

/** Shared records-service projection used by mutation responses. */
export function buildDocumentWorkspaceDraftMasks(
  writeRules: Map<string, EntityWriteFieldRule>,
  recordStatus: string | null,
): {
  fieldMask: Record<string, { editable: boolean; reason?: DocumentWorkspaceLockedReason; message?: string }>;
  sectionMask: Record<string, { hasEditableFields: boolean; editableFieldCount: number }>;
} {
  const fieldMask: Record<string, { editable: boolean; reason?: DocumentWorkspaceLockedReason }> = {};
  let editableCount = 0;
  for (const [fieldName, rule] of writeRules) {
    const writability = isEntityFieldWritable(rule, "update", recordStatus);
    if (writability.writable) {
      fieldMask[fieldName] = { editable: true };
      editableCount += 1;
      continue;
    }
    const reason = mapNonWritableReason(writability.reason);
    if (reason) fieldMask[fieldName] = { editable: false, reason };
  }
  return {
    fieldMask,
    sectionMask: { __overview: { hasEditableFields: editableCount > 0, editableFieldCount: editableCount } },
  };
}

function mapNonWritableReason(reason: FieldNonWritableReason): DocumentWorkspaceLockedReason | null {
  switch (reason) {
    case "FIELD_NOT_REGISTERED": return null;
    case "FIELD_COMPUTED": return "computed";
    case "FIELD_SYSTEM_MANAGED":
    case "FIELD_SYSTEM_ORIGIN": return "system";
    case "FIELD_LOCKED_BY_STATUS": return "status_locked";
    default: return "readonly";
  }
}
