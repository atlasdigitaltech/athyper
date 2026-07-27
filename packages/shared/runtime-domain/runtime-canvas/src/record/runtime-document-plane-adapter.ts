import type { PlaneKey } from "@athyper/session-plane";
import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import type { DocumentEditFetch } from "../document-runtime";

export type RuntimeDocumentMutationMode = "full" | "read-only" | "delegated-submit";
export type RuntimeObjectPageRenderer = "document" | "record";

export interface RuntimeDocumentDeepLink {
  entityCode: string;
  recordId: string;
  destination: "detail" | "edit" | "list";
}

/**
 * Plane-owned controls consumed by the shared document object page.
 * Authorization remains server-owned; this adapter only narrows an already
 * authorized descriptor and supplies plane transport/navigation behavior.
 */
export interface RuntimeDocumentPlaneAdapter {
  plane: PlaneKey;
  transport: DocumentEditFetch;
  mutationMode: RuntimeDocumentMutationMode;
  permittedOperationKeys?: readonly string[];
  partnerSafeFieldNames?: readonly string[];
  workflowActions: boolean;
  attachments: boolean;
  comments: boolean;
  print: boolean;
  export: boolean;
  refresh: () => Promise<void> | void;
  replace: (href: string) => void;
  resolveDeepLink: (link: RuntimeDocumentDeepLink) => string;
}

export interface RuntimeDocumentPlanePolicyResult {
  descriptor: MetaEntityRuntimeDescriptor;
  record: RuntimeRecordRow;
}

export function resolveRuntimeObjectPageRenderer(
  descriptor: Pick<MetaEntityRuntimeDescriptor, "renderer">,
): RuntimeObjectPageRenderer {
  return descriptor.renderer === "document" ? "document" : "record";
}

export function applyRuntimeDocumentPlanePolicy(
  descriptor: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow,
  adapter: RuntimeDocumentPlaneAdapter,
): RuntimeDocumentPlanePolicyResult {
  const permittedOperations = adapter.permittedOperationKeys
    ? new Set(adapter.permittedOperationKeys)
    : null;
  const partnerSafeFields = adapter.partnerSafeFieldNames
    ? new Set(adapter.partnerSafeFieldNames)
    : null;
  const isFullMutation = adapter.mutationMode === "full";

  const fields = partnerSafeFields
    ? descriptor.fields.filter((field) =>
        partnerSafeFields.has(field.name) || partnerSafeFields.has(field.key))
    : descriptor.fields;
  const safeFieldKeys = new Set(fields.flatMap((field) => [field.name, field.key]));

  const operations = descriptor.operations.filter((operation) => {
    if (!operation.enabled) return false;
    if (permittedOperations && !permittedOperations.has(operation.key)) return false;
    if (!adapter.workflowActions && operation.actionGroup === "workflow_task") return false;
    if (!adapter.print && operation.key.toLowerCase().includes("print")) return false;
    if (!adapter.export && operation.key.toLowerCase().includes("export")) return false;
    if (!isFullMutation && isGenericMutation(operation.key)) return false;
    return true;
  });

  const projectedRecord = partnerSafeFields
    ? projectPartnerSafeRecord(record, safeFieldKeys)
    : record;

  return {
    descriptor: {
      ...descriptor,
      fields,
      operations,
      capabilities: {
        ...descriptor.capabilities,
        canCreate: isFullMutation && descriptor.capabilities.canCreate,
        canEdit: isFullMutation && descriptor.capabilities.canEdit,
        canDelete: isFullMutation && descriptor.capabilities.canDelete,
        canCreateReason: isFullMutation ? descriptor.capabilities.canCreateReason : "entity_readonly",
        canEditReason: isFullMutation ? descriptor.capabilities.canEditReason : "entity_readonly",
        canDeleteReason: isFullMutation ? descriptor.capabilities.canDeleteReason : "entity_readonly",
        hasAttachments: adapter.attachments && descriptor.capabilities.hasAttachments,
        hasComments: adapter.comments && descriptor.capabilities.hasComments,
        hasWorkflow: adapter.workflowActions && descriptor.capabilities.hasWorkflow,
        isReadOnly: !isFullMutation || descriptor.capabilities.isReadOnly,
      },
    },
    record: projectedRecord,
  };
}

function projectPartnerSafeRecord(
  record: RuntimeRecordRow,
  safeFieldKeys: ReadonlySet<string>,
): RuntimeRecordRow {
  const projected: RuntimeRecordRow = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === "id") projected.id = typeof value === "string" ? value : record.id;
    else if (key !== "data" && safeFieldKeys.has(key)) projected[key] = value;
  }
  if (record.data) {
    projected.data = Object.fromEntries(
      Object.entries(record.data).filter(([key]) => safeFieldKeys.has(key)),
    );
  }
  return projected;
}

function isGenericMutation(operationKey: string): boolean {
  return /(^|_)(create|edit|update|delete|discard|revert|save)($|_)/i.test(operationKey);
}
