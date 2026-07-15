import { describe, expect, it } from "vitest";
import { resolveP2pOperationWorkspaceScope } from "../p2p-operation-workspace";

describe("resolveP2pOperationWorkspaceScope", () => {
  it("maps each P2P conversion to its authoritative source workspace", () => {
    expect(resolveP2pOperationWorkspaceScope("purchase_order", "commitment_from_requisition", {
      requisitionId: "requisition-1",
    })).toMatchObject({ sourceEntityCode: "purchase_requisition", sourceIds: ["requisition-1"], profile: "edit" });
    expect(resolveP2pOperationWorkspaceScope("receipt", "receipt_from_commitment", {
      commitmentId: "commitment-1",
    })).toMatchObject({ sourceEntityCode: "commitment", sourceIds: ["commitment-1"], profile: "edit" });
    expect(resolveP2pOperationWorkspaceScope("service_sheet", "service_sheet_from_commitment", {
      commitmentId: "commitment-1",
    })).toMatchObject({ sourceEntityCode: "commitment", sourceIds: ["commitment-1"], profile: "edit" });
    expect(resolveP2pOperationWorkspaceScope("purchase_invoice", "invoice_from_receipt", {
      receiptId: "receipt-1",
    })).toMatchObject({ sourceEntityCode: "receipt", sourceIds: ["receipt-1"], profile: "edit" });
    expect(resolveP2pOperationWorkspaceScope("purchase_invoice", "invoice_from_service_sheet", {
      serviceSheetId: "service-sheet-1",
    })).toMatchObject({ sourceEntityCode: "service_sheet", sourceIds: ["service-sheet-1"], profile: "edit" });
  });

  it("collects all invoice sources and requires an approval workspace for payments", () => {
    const scope = resolveP2pOperationWorkspaceScope("payment-entry", "payment_from_invoice", {
      allocations: [{ invoiceId: "invoice-1" }, { invoiceId: "invoice-1" }, { invoiceId: "invoice-2" }],
    });
    expect(scope).toMatchObject({
      sourceEntityCode: "purchase_invoice",
      sourceIds: ["invoice-1", "invoice-2"],
      profile: "approve",
    });
  });

  it("rejects unknown conversions and missing source IDs before minting a capability", () => {
    expect(resolveP2pOperationWorkspaceScope("receipt", "unknown", { commitmentId: "commitment-1" })).toBeNull();
    expect(resolveP2pOperationWorkspaceScope("receipt", "receipt_from_commitment", {})).toBeNull();
    expect(resolveP2pOperationWorkspaceScope("payment_entry", "payment_from_invoice", { allocations: [{}] })).toBeNull();
  });
});
