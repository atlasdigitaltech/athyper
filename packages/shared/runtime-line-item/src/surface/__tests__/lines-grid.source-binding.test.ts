import { describe, expect, it } from "vitest";
import { createManualInvoiceLineAdapter } from "../../adapters/manual-invoice-line";

// ─────────────────────────────────────────────────────────────────────────────
// LinesGrid sourceBinding contract — verifies that the same toDraftShape path
// LinesGrid uses in handleDraftComposerSubmit produces a draft with the
// expected sourceBinding shape. Kept as a pure-logic test against the adapter
// (no LinesGrid render needed) so the assertion stays cheap and surfaces
// regressions on either side.
// ─────────────────────────────────────────────────────────────────────────────

describe("LinesGrid → manual_invoice_line — sourceBinding shape", () => {
  const PARENT_CTX = {
    parentEntityCode: "purchase_invoice",
    parentRecordId: "inv-0042",
    lineEntityCode: "purchase_invoice_line",
    currencyCode: "USD",
  };

  it("attaches sourceBinding.sourceType = manual_invoice_line on every draft", () => {
    const adapter = createManualInvoiceLineAdapter();
    const draft = adapter.toDraftShape(
      {
        draftId: "draft-1",
        payload: { description: "Pen", quantity: 2, unitPrice: 5 },
      },
      PARENT_CTX,
    );
    expect(draft.sourceBinding.sourceType).toBe("manual_invoice_line");
  });

  it("propagates parent entityCode + recordId into sourceBinding", () => {
    const adapter = createManualInvoiceLineAdapter();
    const draft = adapter.toDraftShape(
      { draftId: "draft-1", payload: { description: "x" } },
      PARENT_CTX,
    );
    expect(draft.sourceBinding.sourceDocType).toBe("purchase_invoice");
    expect(draft.sourceBinding.sourceDocId).toBe("inv-0042");
  });

  it("preserves composer payload fields at the top level of the draft", () => {
    const adapter = createManualInvoiceLineAdapter();
    const payload = {
      description: "Software license",
      quantity: 1,
      unitPrice: 199,
      lineAmount: 199,
    };
    const draft = adapter.toDraftShape(
      { draftId: "draft-1", payload },
      PARENT_CTX,
    );
    expect(draft.description).toBe("Software license");
    expect(draft.quantity).toBe(1);
    expect(draft.unitPrice).toBe(199);
    expect(draft.lineAmount).toBe(199);
  });

  it("does not set sourceLineId for manual lines (no upstream source)", () => {
    const adapter = createManualInvoiceLineAdapter();
    const draft = adapter.toDraftShape(
      { draftId: "draft-1", payload: { description: "x" } },
      PARENT_CTX,
    );
    expect(draft.sourceBinding.sourceLineId).toBeUndefined();
  });
});
