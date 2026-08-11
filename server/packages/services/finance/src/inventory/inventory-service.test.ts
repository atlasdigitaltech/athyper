import { describe, expect, it } from "vitest";
import { FinanceContractError, type InventoryMovement } from "@athyper/server-contract-finance";
import { rebuildFifo } from "./inventory-service.js";

const base = {
  companyCodeId: "company", itemId: "sku", warehouseId: "warehouse", valuationMethod: "fifo" as const,
  uomCode: "EA", currencyCode: "USD", source: { sourceType: "document.test", sourceId: "source" },
  performedAt: "2026-08-11T00:00:00.000Z", performedBy: "actor", metadata: {},
};

function movement(sequence: number, quantity: string, value: string, type: InventoryMovement["movementType"], reversesMovementId?: string): InventoryMovement {
  return { ...base, id: `m${sequence}`, movementSequence: sequence, movementType: type, quantity, unitCost: "0.000000", inventoryValue: value, idempotencyKey: `key-${sequence}`, ...(reversesMovementId ? { reversesMovementId } : {}) };
}

describe("FIFO inventory replay", () => {
  it("consumes oldest layers, preserves rounding residual, and compares the complete projection", () => {
    const rebuilt = rebuildFifo([
      movement(1, "10.000000", "33.3300", "receipt"),
      movement(2, "4.000000", "20.0000", "receipt"),
      movement(3, "-7.000000", "-23.3300", "sales_issue"),
      movement(4, "-4.000000", "-15.0000", "sales_issue"),
    ]);
    expect(rebuilt.balance).toEqual({ quantityOnHand: "3.000000", inventoryValue: "15.0000", lastAppliedSequence: 4 });
    expect(rebuilt.layers).toEqual([
      { receiptMovementId: "m1", originalQuantity: "10.000000", remainingQuantity: "0.000000", originalValue: "33.3300", remainingValue: "0.0000" },
      { receiptMovementId: "m2", originalQuantity: "4.000000", remainingQuantity: "3.000000", originalValue: "20.0000", remainingValue: "15.0000" },
    ]);
  });

  it("rebuilds an issue reversal after partial layer consumption as a new FIFO layer", () => {
    const rebuilt = rebuildFifo([
      movement(1, "10.000000", "40.0000", "receipt"),
      movement(2, "-3.000000", "-12.0000", "sales_issue"),
      movement(3, "3.000000", "12.0000", "reversal_in", "m2"),
    ]);
    expect(rebuilt.balance).toEqual({ quantityOnHand: "10.000000", inventoryValue: "40.0000", lastAppliedSequence: 3 });
    expect(rebuilt.layers.map(x => [x.receiptMovementId, x.remainingQuantity, x.remainingValue])).toEqual([["m1", "7.000000", "28.0000"], ["m3", "3.000000", "12.0000"]]);
  });

  it("rejects an issue log that would make FIFO stock negative", () => {
    expect(() => rebuildFifo([movement(1, "2.000000", "5.0000", "receipt"), movement(2, "-3.000000", "-7.5000", "sales_issue")])).toThrowError(expect.objectContaining<Partial<FinanceContractError>>({ code: "FINANCE_INSUFFICIENT_STOCK" }));
  });

  it("is deterministic for any caller ordering once movement sequences are fixed", () => {
    const log = [movement(1, "2.000000", "2.0000", "receipt"), movement(2, "2.000000", "6.0000", "receipt"), movement(3, "-3.000000", "-5.0000", "sales_issue")];
    expect(rebuildFifo([log[2]!, log[0]!, log[1]!])).toEqual(rebuildFifo(log));
  });
});
