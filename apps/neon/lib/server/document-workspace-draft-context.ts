import "server-only";

import { DocumentWorkspaceDraftContextSchema } from "@athyper/api-contracts/document-edit-draft";
import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";

/** Build the draft adapter state from the authoritative descriptor and OPEN record. */
export function buildDocumentWorkspaceDraftContext(input: {
  descriptor: MetaEntityRuntimeDescriptor;
  record: RuntimeRecordRow;
  recordId: string;
}) {
  const data = recordData(input.record);
  const status = stringValue(data["status"]) ?? stringValue(input.record["status"]) ?? "unknown";
  const etag = String(data["row_version"] ?? input.record["row_version"] ?? 0);
  const stateMask = input.descriptor.lifecycleStateMasks.find((mask) => mask.recordStatus === status);
  const canUpdate = input.descriptor.capabilities.canEdit
    && !input.descriptor.capabilities.isReadOnly
    && stateMask?.canEdit !== false;
  const lockedReason = stateMask?.canEdit === false ? "status_locked" as const : "permission_locked" as const;
  const fieldMask = Object.fromEntries(input.descriptor.fields.map((field) => {
    if (!canUpdate) return [field.name, { editable: false, reason: lockedReason }];
    if (field.isComputed) return [field.name, { editable: false, reason: "computed" as const }];
    if (field.isReadOnly) return [field.name, { editable: false, reason: "readonly" as const }];
    return [field.name, { editable: true }];
  }));
  const editableFieldCount = Object.values(fieldMask).filter((entry) => entry.editable).length;

  return DocumentWorkspaceDraftContextSchema.parse({
    recordId: typeof input.record.id === "string" ? input.record.id : input.recordId,
    entityCode: input.descriptor.entityCode,
    status,
    etag,
    canUpdate,
    ...(canUpdate ? {} : { disabledReason: stateMask?.disabledReason ?? "Editing is not allowed for this record." }),
    fieldMask,
    sectionMask: { __overview: { hasEditableFields: editableFieldCount > 0, editableFieldCount } },
  });
}

function recordData(record: RuntimeRecordRow): Record<string, unknown> {
  const data = record["data"];
  return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : record;
}
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
