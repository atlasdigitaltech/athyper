import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const recordsRoute = readFileSync(resolve(process.cwd(), "packages/services/records/routes/records.route.ts"), "utf8");
const recordsIndex = readFileSync(resolve(process.cwd(), "packages/services/records/routes/index.ts"), "utf8");
const lineSourceRoute = readFileSync(resolve(process.cwd(), "packages/services/records/routes/line-source.route.ts"), "utf8");
const attachmentRoute = readFileSync(resolve(process.cwd(), "packages/services/documents/routes/attachments.route.ts"), "utf8");
const p2pWorkspace = readFileSync(resolve(process.cwd(), "../apps/neon/lib/server/p2p-operation-workspace.ts"), "utf8");
const p2pForms = [
  ["commitment-from-requisition/CommitmentFromRequisitionForm.tsx", "/api/runtime/v1/entities/purchase_order/op/commitment_from_requisition"],
  ["receipt-from-commitment/ReceiptFromCommitmentForm.tsx", "/api/runtime/v1/entities/receipt/op/receipt_from_commitment"],
  ["service-sheet-from-commitment/ServiceSheetFromCommitmentForm.tsx", "/api/runtime/v1/entities/service_sheet/op/service_sheet_from_commitment"],
  ["invoice-from-receipt/InvoiceFromReceiptForm.tsx", "/api/runtime/v1/entities/purchase_invoice/op/invoice_from_receipt"],
  ["payment-from-invoice/PaymentFromInvoiceForm.tsx", "/api/runtime/v1/entities/payment_entry/op/payment_from_invoice"],
] as const;

describe("P2P authoritative operation boundary", () => {
  it("gates records, lifecycle, picker, and attachment requests through the shared verified context", () => {
    expect(recordsIndex).toContain("resolveVerifiedRequestContext");
    expect(recordsIndex).toContain("router.use(verifiedRequestContext)");
    expect(recordsRoute).toContain("requireVerifiedContext(");
    expect(lineSourceRoute).toContain("resolveVerifiedRequestContext(");
    expect(attachmentRoute).toContain("resolveVerifiedRequestContext(");
  });

  it("has no mounted legacy P2P conversion writes", () => {
    for (const legacyPath of [
      "/p2p/commitments/from-requisition",
      "/p2p/receipts/from-commitment",
      "/p2p/service-sheets/from-commitment",
      "/p2p/invoices/from-receipt",
      "/p2p/invoices/from-service-sheet",
      "/p2p/payments/from-invoice",
    ]) {
      expect(lineSourceRoute).not.toContain(`router.post("${legacyPath}"`);
    }
    expect(recordsRoute).toContain('router.post("/runtime/v1/entities/:entity/op/:op", entityOpHandler)');
    expect(recordsRoute).toContain("legacy_entity_operation_alias_used");
  });

  it("sends every P2P conversion form through the canonical runtime operation facade", () => {
    for (const [file, endpoint] of p2pForms) {
      const source = readFileSync(resolve(process.cwd(), `../apps/neon/app/(shell)/p2p/${file}`), "utf8");
      expect(source).toContain(endpoint);
      expect(source).toContain("csrfFetch(");
      expect(source).not.toContain("/api/relay/p2p/");
    }
  });

  it("requires a source workspace for each canonical P2P operation", () => {
    for (const operation of [
      "commitment_from_requisition",
      "receipt_from_commitment",
      "service_sheet_from_commitment",
      "invoice_from_receipt",
      "invoice_from_service_sheet",
      "payment_from_invoice",
    ]) {
      expect(p2pWorkspace).toContain(`"${operation}"`);
    }
    expect(recordsRoute).toContain('"INVALID_WORKSPACE"');
    expect(recordsRoute).toContain('action: "update", recordId: sourceId');
    expect(recordsRoute).toContain('action: "create", logger');
  });

  it("cannot disable document workspace capabilities in production", () => {
    const guardStart = recordsRoute.indexOf("function documentWorkspaceTokenBypassEnabled()");
    const guard = recordsRoute.slice(guardStart, recordsRoute.indexOf("function inspectDocumentWorkspaceCapability", guardStart));
    expect(guardStart).toBeGreaterThan(0);
    expect(guard).toContain('process.env.NODE_ENV !== "production"');
    expect(guard).toContain('DOCUMENT_EDIT_REQUIRE_WORKSPACE_TOKEN === "0"');
  });
});
