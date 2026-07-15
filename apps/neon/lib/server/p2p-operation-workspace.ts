import "server-only";

import type { DocumentEditWorkspaceProfile } from "@/lib/server/document-edit-workspace-validation";

export interface P2pOperationWorkspaceScope {
  sourceEntityCode: string;
  sourceIds: string[];
  profile: DocumentEditWorkspaceProfile;
}

type P2pOperationDefinition = {
  entityCode: string;
  operationCode: string;
  sourceEntityCode: string;
  profile: DocumentEditWorkspaceProfile;
  readSourceIds(body: Record<string, unknown>): string[];
};

const P2P_OPERATION_DEFINITIONS: readonly P2pOperationDefinition[] = [
  definition("purchase_order", "commitment_from_requisition", "purchase_requisition", "edit", (body) => [body["requisitionId"]]),
  definition("receipt", "receipt_from_commitment", "commitment", "edit", (body) => [body["commitmentId"]]),
  definition("service_sheet", "service_sheet_from_commitment", "commitment", "edit", (body) => [body["commitmentId"]]),
  definition("purchase_invoice", "invoice_from_receipt", "receipt", "edit", (body) => [body["receiptId"]]),
  definition("purchase_invoice", "invoice_from_service_sheet", "service_sheet", "edit", (body) => [body["serviceSheetId"]]),
  definition("payment_entry", "payment_from_invoice", "purchase_invoice", "approve", (body) => {
    const allocations = Array.isArray(body["allocations"]) ? body["allocations"] : [];
    return allocations.map((allocation) => (
      allocation && typeof allocation === "object" && !Array.isArray(allocation)
        ? (allocation as Record<string, unknown>)["invoiceId"]
        : null
    ));
  }),
];

export function resolveP2pOperationWorkspaceScope(
  entityCode: string,
  operationCode: string,
  body: Record<string, unknown>,
): P2pOperationWorkspaceScope | null {
  const normalizedEntity = entityCode.trim().replace(/-/g, "_");
  const normalizedOperation = operationCode.trim().toLowerCase();
  const definition = P2P_OPERATION_DEFINITIONS.find((candidate) => (
    candidate.entityCode === normalizedEntity && candidate.operationCode === normalizedOperation
  ));
  if (!definition) return null;

  const sourceIds = [...new Set(definition.readSourceIds(body)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim()))];
  if (sourceIds.length === 0) return null;

  return {
    sourceEntityCode: definition.sourceEntityCode,
    sourceIds,
    profile: definition.profile,
  };
}

function definition(
  entityCode: string,
  operationCode: string,
  sourceEntityCode: string,
  profile: DocumentEditWorkspaceProfile,
  readSourceIds: (body: Record<string, unknown>) => unknown[],
): P2pOperationDefinition {
  return { entityCode, operationCode, sourceEntityCode, profile, readSourceIds: (body) => readSourceIds(body).filter((value): value is string => typeof value === "string") };
}
