import { describe, expect, it } from "vitest";
import {
  buildEntityOpRequestIdentity,
  getEntityOp,
  resolveEntityOpSourceIds,
  validateEntityOpWorkspaceScope,
  type RegisteredEntityOp,
} from "../routes/entity-op.registry.js";

function operation(overrides: Partial<RegisteredEntityOp["workspaceScope"]> = {}): RegisteredEntityOp {
  return {
    entityCode: "purchase_order",
    opCode: "commitment_from_requisition",
    handler: async () => ({ status: 201, body: {} }),
    workspaceScope: {
      sourceDocument: {
        entityCode: "purchase_requisition",
        acceptedIdPaths: ["requisitionId"],
        required: true,
        cardinality: "single",
      },
      workspaceProfile: "edit",
      createsDocument: true,
      targetEntityCode: "commitment",
      runtimeEventPolicy: {
        eventType: "p2p.commitment.created_from_requisition",
        invalidationSource: "operation",
        invalidationOperationKey: "*",
        itemsMutated: true,
        sourceBehavior: "advance",
        targetBehavior: "initialize",
      },
      idempotencyPolicy: {
        operationKey: "p2p.commitment.created_from_requisition",
        requestIdentityPaths: ["requisitionId"],
        replayResponsePolicy: "stored_response",
      },
      ...overrides,
    },
  };
}

describe("entity operation workspace scope", () => {
  it("enrolls every P2P conversion with its actual source, target, and workspace profile", () => {
    const expected = [
      ["purchase_order", "commitment_from_requisition", "purchase_requisition", "commitment", "edit"],
      ["receipt", "receipt_from_commitment", "commitment", "receipt", "edit"],
      ["service_sheet", "service_sheet_from_commitment", "commitment", "service_sheet", "edit"],
      ["purchase_invoice", "invoice_from_receipt", "receipt", "purchase_invoice", "edit"],
      ["purchase_invoice", "invoice_from_service_sheet", "service_sheet", "purchase_invoice", "edit"],
      ["payment_entry", "payment_from_invoice", "purchase_invoice", "payment_entry", "approve"],
    ] as const;
    for (const [entityCode, opCode, sourceEntityCode, targetEntityCode, workspaceProfile] of expected) {
      const operation = getEntityOp(entityCode, opCode);
      expect(operation?.workspaceScope.sourceDocument.entityCode).toBe(sourceEntityCode);
      expect(operation?.workspaceScope.targetEntityCode).toBe(targetEntityCode);
      expect(operation?.workspaceScope.workspaceProfile).toBe(workspaceProfile);
      expect(operation?.workspaceScope.runtimeEventPolicy.sourceBehavior).toBe("advance");
      expect(operation?.workspaceScope.runtimeEventPolicy.targetBehavior).toBe("initialize");
    }
  });

  it("rejects an operation without source scope metadata", () => {
    const op = operation();
    (op as { workspaceScope?: unknown }).workspaceScope = undefined;
    expect(() => validateEntityOpWorkspaceScope(op)).toThrow("must declare a source workspace scope");
  });

  it("rejects an operation without a mandatory, unambiguous source scope", () => {
    const op = operation({
      sourceDocument: {
        entityCode: "purchase_requisition",
        acceptedIdPaths: ["requisitionId", "requisitionId"],
        required: true,
        cardinality: "single",
      },
    });
    expect(() => validateEntityOpWorkspaceScope(op)).toThrow("ambiguous duplicate source id paths");
  });

  it("collects all source ids so the dispatcher can reject an ambiguous single-source request", () => {
    const scope = operation({
      sourceDocument: {
        entityCode: "purchase_requisition",
        acceptedIdPaths: ["requisitionId", "fallbackRequisitionId"],
        required: true,
        cardinality: "single",
      },
    }).workspaceScope;
    const ids = resolveEntityOpSourceIds(scope, {
      requisitionId: "source-a",
      fallbackRequisitionId: "source-b",
    });
    expect(ids).toEqual(["source-a", "source-b"]);
  });

  it("extracts every allocation source for a declared multi-source operation", () => {
    const scope = operation({
      sourceDocument: {
        entityCode: "purchase_invoice",
        acceptedIdPaths: ["allocations[].invoiceId"],
        required: true,
        cardinality: "multiple",
      },
    }).workspaceScope;
    expect(resolveEntityOpSourceIds(scope, {
      allocations: [{ invoiceId: "invoice-b" }, { invoiceId: "invoice-a" }, { invoiceId: "invoice-a" }],
    })).toEqual(["invoice-a", "invoice-b"]);
  });

  it("projects only declared idempotency identity fields", () => {
    const scope = operation({
      idempotencyPolicy: {
        operationKey: "p2p.commitment.created_from_requisition",
        requestIdentityPaths: ["requisitionId", "lineSelections[].quantity"],
        replayResponsePolicy: "stored_response",
      },
    }).workspaceScope;
    expect(buildEntityOpRequestIdentity(scope, {
      requisitionId: "pr-1",
      supplierId: "supplier-a",
      notes: "non-identity value",
      lineSelections: [{ quantity: 2, localUiFlag: true }, { quantity: 4 }],
    })).toEqual({
      "lineSelections[].quantity": [2, 4],
      requisitionId: ["pr-1"],
    });
  });
});
