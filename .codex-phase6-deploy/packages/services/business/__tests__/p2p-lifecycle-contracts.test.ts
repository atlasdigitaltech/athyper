import { describe, expect, it } from "vitest";
import { P2P_DISPATCH } from "../p2p/entity-dispatch.js";
import { PURCHASE_REQUISITION_TRANSITIONS } from "../p2p/purchase-requisition-lifecycle.contract.js";
import { PURCHASE_ORDER_CONFIRMATION_TRANSITIONS } from "../p2p/purchase-order-confirmation-lifecycle.contract.js";
import { DELIVERY_NOTE_TRANSITIONS } from "../p2p/delivery-note-lifecycle.contract.js";
import { RECEIPT_TRANSITIONS } from "../p2p/receipt-lifecycle.contract.js";
import { SERVICE_SHEET_TRANSITIONS } from "../p2p/service-sheet-lifecycle.contract.js";
import { PURCHASE_INVOICE_TRANSITIONS } from "../p2p/purchase-invoice-lifecycle.contract.js";
import { PAYMENT_ENTRY_TRANSITIONS } from "../p2p/payment-entry-lifecycle.contract.js";

const contracts = {
  purchase_requisition: PURCHASE_REQUISITION_TRANSITIONS,
  purchase_order_confirmation: PURCHASE_ORDER_CONFIRMATION_TRANSITIONS,
  delivery_note: DELIVERY_NOTE_TRANSITIONS,
  receipt: RECEIPT_TRANSITIONS,
  service_sheet: SERVICE_SHEET_TRANSITIONS,
  purchase_invoice: PURCHASE_INVOICE_TRANSITIONS,
  payment_entry: PAYMENT_ENTRY_TRANSITIONS,
} as const;

describe("P2P lifecycle contracts", () => {
  it("has unique keys and unique lifecycle edges", () => {
    for (const transitions of Object.values(contracts)) {
      expect(new Set(transitions.map((row) => row.key)).size).toBe(transitions.length);
      expect(new Set(transitions.map((row) => `${row.from}:${row.to}`)).size).toBe(transitions.length);
    }
  });

  it("declares evidence for every transition", () => {
    for (const [entity, transitions] of Object.entries(contracts)) {
      for (const row of transitions) {
        expect(row.entity).toBe(entity);
        expect(row.permission).not.toBe("");
        expect(row.activityEvent).toMatch(new RegExp(`^${entity}\\.`));
        expect(row.outboxEvent).toMatch(new RegExp(`^${entity}\\.`));
        if (row.snapshot === "required") expect(row.snapshotKind).toBeDefined();
        if (row.financialEvent) expect(["ORDER_CREATION", "FULFILLMENT", "INVOICE_MATCHED", "SETTLEMENT", "REVERSAL"]).toContain(row.financialEvent);
      }
    }
  });

  it("covers payment posting, clearing, reversal, and void", () => {
    expect(PAYMENT_ENTRY_TRANSITIONS).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: "approved", to: "posted", financialEvent: "SETTLEMENT", snapshotKind: "financial_post" }),
      expect.objectContaining({ from: "transmitted", to: "cleared", snapshotKind: "financial_post" }),
      expect.objectContaining({ from: "posted", to: "reversed", financialEvent: "REVERSAL", snapshotKind: "reversal" }),
      expect.objectContaining({ from: "posted", to: "voided", financialEvent: "REVERSAL", snapshotKind: "reversal" }),
    ]));
  });

  it("dispatches every lifecycle entity and payment allocations", () => {
    for (const entity of Object.keys(contracts)) expect(P2P_DISPATCH).toHaveProperty(entity);
    expect(P2P_DISPATCH.payment_entry).toMatchObject({
      headerTable: "payment_entry",
      linesTable: "payment_entry_allocation",
      parentFkColumn: "payment_entry_id",
      documentCodeField: "payment_number",
    });
  });

  it("allows every seeded snapshot kind in entity dispatch", () => {
    for (const [entity, transitions] of Object.entries(contracts)) {
      const supported = new Set(P2P_DISPATCH[entity as keyof typeof P2P_DISPATCH].supportedGateEvents);
      for (const row of transitions) {
        if (row.snapshotKind) expect(supported.has(row.snapshotKind), `${entity}:${row.key}:${row.snapshotKind}`).toBe(true);
      }
    }
  });
});
