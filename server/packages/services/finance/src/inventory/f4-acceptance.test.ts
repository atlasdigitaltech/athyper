import { describe, expect, it } from "vitest";
import type { FinanceActor, FinanceCommand, InventoryBalance, InventoryCoordinate, InventoryMovement, InventoryRepository, InventoryValuationLayer } from "@athyper/server-contract-finance";
import { canonicalFinanceHash } from "../shared/canonical.js";
import { InMemoryFinanceCommandRepository } from "../shared/in-memory-command-repository.js";
import { decimalString, decimalUnits } from "../shared/decimal.js";
import { InventoryBalanceService, InventoryMovementService } from "./inventory-service.js";

const actor: FinanceActor = { tenantId: "tenant", principalId: "principal", planeKey: "neon", correlationId: "correlation" };
const permissions = { isAllowed: async () => true }; const audit = { record: async () => undefined }; const outbox = { append: async () => undefined };
const source: InventoryCoordinate = { companyCodeId: "company", itemId: "sku", warehouseId: "source", uomCode: "EA", currencyCode: "USD" };
const postingCoordinates = { companyCodeId: "company", ledgerBookId: "book", fiscalPeriodId: "period", currencyCode: "USD" };
const guard = { assertPeriodOpen: async () => ({} as never) };

describe("F4 FIFO inventory acceptance", () => {
  it("serializes same-SKU issues, rejects insufficient stock without side effects, and replays idempotently", async () => {
    const memory = new MemoryInventory(), service = inventoryService(memory);
    await service.receipt(receipt("receipt", source, "10.000000", "20.0000"));
    const results = await Promise.allSettled([service.issue(issue("issue-a", source, "7.000000")), service.issue(issue("issue-b", source, "7.000000"))]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1); expect(results.filter(x => x.status === "rejected")).toHaveLength(1);
    expect(results.find(x => x.status === "rejected")).toMatchObject({ reason: { code: "FINANCE_INSUFFICIENT_STOCK" } });
    expect(memory.balance(source)).toMatchObject({ quantityOnHand: "3.000000", inventoryValue: "6.0000", lastAppliedSequence: 2 });
    const count = memory.state.movements.length, replay = await service.receipt(receipt("receipt", source, "10.000000", "20.0000"));
    expect(replay.kind).toBe("replayed"); expect(memory.state.movements).toHaveLength(count);
  });

  it("commits transfer legs atomically and rolls both back if the inbound leg fails", async () => {
    const memory = new MemoryInventory(), service = inventoryService(memory), destination = { ...source, warehouseId: "destination" };
    await service.receipt(receipt("receipt", source, "8.000000", "24.0000")); await service.transfer(transfer("transfer", "3.000000"));
    expect(memory.balance(source)).toMatchObject({ quantityOnHand: "5.000000", inventoryValue: "15.0000" }); expect(memory.balance(destination)).toMatchObject({ quantityOnHand: "3.000000", inventoryValue: "9.0000" });
    const before = JSON.stringify(memory.state); memory.failInboundOnce = true;
    await expect(service.transfer(transfer("failed-transfer", "2.000000"))).rejects.toThrow("injected inbound failure"); expect(JSON.stringify(memory.state)).toBe(before);
  });

  it("reverses an issue after partial layer consumption and fully rebuilds balance/layers", async () => {
    const memory = new MemoryInventory(), service = inventoryService(memory);
    await service.receipt(receipt("receipt", source, "10.000000", "40.0000")); const issued = await service.issue(issue("issue", source, "3.000000"));
    if (!("output" in issued)) throw new Error("issue did not apply"); const issueId = issued.output.movements[0]!.id;
    await service.reverse(reverse("reverse", issueId));
    expect(memory.balance(source)).toMatchObject({ quantityOnHand: "10.000000", inventoryValue: "40.0000", lastAppliedSequence: 3 });
    const tx = memory.snapshot(); const rebuilt = await new InventoryBalanceService(memory).compareRebuild(actor, source, tx);
    expect(rebuilt.layers.map(x => [x.remainingQuantity, x.remainingValue])).toEqual([["7.000000", "28.0000"], ["3.000000", "12.0000"]]);
  });
});

type State = { movements: InventoryMovement[]; layers: InventoryValuationLayer[]; balances: InventoryBalance[] }; type Tx = State;
class MemoryInventory implements InventoryRepository<Tx> {
  state: State = { movements: [], layers: [], balances: [] }; failInboundOnce = false; private queue = Promise.resolve();
  readonly transactions = { run: async <T>(_actor: FinanceActor, work: (tx: Tx) => Promise<T>) => { let release!: () => void; const previous = this.queue; this.queue = new Promise<void>(r => release = r); await previous; const tx = this.snapshot(); try { const result = await work(tx); this.state = tx; return result; } finally { release(); } } };
  snapshot(): State { return structuredClone(this.state); } balance(c: InventoryCoordinate) { return this.state.balances.find(x => key(x) === key(c)); }
  async lockCoordinates() {} async nextSequence(_a: FinanceActor, c: InventoryCoordinate, tx: Tx) { return Math.max(0, ...tx.movements.filter(x => key(x) === key(c)).map(x => x.movementSequence)) + 1; }
  async append(a: FinanceActor, m: Omit<InventoryMovement, "id" | "movementSequence"> & { movementSequence: number; id?: string }, tx: Tx) { if (this.failInboundOnce && m.movementType === "transfer_in") { this.failInboundOnce = false; throw new Error("injected inbound failure"); } const row = { ...m, id: m.id ?? `movement-${tx.movements.length + 1}` } as InventoryMovement; tx.movements.push(row); return row; }
  async getMovement(_a: FinanceActor, id: string, tx: Tx) { return tx.movements.find(x => x.id === id); } async findReversal(_a: FinanceActor, id: string, tx: Tx) { return tx.movements.find(x => x.reversesMovementId === id); }
  async createLayer(_a: FinanceActor, m: InventoryMovement, tx: Tx) { const row: InventoryValuationLayer = { id: `layer-${tx.layers.length + 1}`, companyCodeId: m.companyCodeId, itemId: m.itemId, warehouseId: m.warehouseId, valuationMethod: "fifo", receiptMovementId: m.id, layerDate: m.performedAt.slice(0, 10), originalQuantity: m.quantity, remainingQuantity: m.quantity, originalValue: m.inventoryValue, remainingValue: m.inventoryValue, currencyCode: m.currencyCode, ...(m.lotNumber ? { lotNumber: m.lotNumber } : {}), ...(m.serialNumber ? { serialNumber: m.serialNumber } : {}), versionNumber: 1 }; tx.layers.push(row); return row; }
  async lockEligibleFifoLayers(_a: FinanceActor, c: InventoryCoordinate, tx: Tx) { return tx.layers.filter(x => key(x) === key(c) && decimalUnits(x.remainingQuantity, 6) > 0n).sort((a, b) => a.layerDate.localeCompare(b.layerDate) || a.receiptMovementId.localeCompare(b.receiptMovementId)); }
  async consumeLayer(_a: FinanceActor, layer: InventoryValuationLayer, q: string, v: string, movementId: string, at: string, tx: Tx) { const index = tx.layers.findIndex(x => x.id === layer.id && x.versionNumber === layer.versionNumber); if (index < 0) return undefined; const current = tx.layers[index]!; const updated: InventoryValuationLayer = { ...current, remainingQuantity: decimalString(decimalUnits(current.remainingQuantity, 6) - decimalUnits(q, 6), 6), remainingValue: decimalString(decimalUnits(current.remainingValue, 4) - decimalUnits(v, 4), 4), lastConsumptionMovementId: movementId, lastConsumedAt: at, versionNumber: current.versionNumber + 1 }; tx.layers[index] = updated; return updated; }
  async getBalanceForUpdate(_a: FinanceActor, c: InventoryCoordinate, tx: Tx) { return tx.balances.find(x => key(x) === key(c)); }
  async applyBalance(_a: FinanceActor, c: InventoryCoordinate, m: InventoryMovement, expected: number | undefined, tx: Tx) { const index = tx.balances.findIndex(x => key(x) === key(c)); const old = tx.balances[index]; if (old && old.versionNumber !== expected) return undefined; const q = (old ? decimalUnits(old.quantityOnHand, 6) : 0n) + decimalUnits(m.quantity, 6), v = (old ? decimalUnits(old.inventoryValue, 4) : 0n) + decimalUnits(m.inventoryValue, 4); const row: InventoryBalance = { id: old?.id ?? `balance-${tx.balances.length + 1}`, companyCodeId: c.companyCodeId, itemId: c.itemId, warehouseId: c.warehouseId, ...(c.lotNumber ? { lotNumber: c.lotNumber } : {}), ...(c.serialNumber ? { serialNumber: c.serialNumber } : {}), quantityOnHand: decimalString(q, 6), inventoryValue: decimalString(v, 4), averageUnitCost: q ? decimalString((v * 100000000n) / q, 6) : "0.000000", currencyCode: c.currencyCode, lastMovementId: m.id, lastMovementAt: old && old.lastMovementAt > m.performedAt ? old.lastMovementAt : m.performedAt, lastAppliedSequence: m.movementSequence, lastIdempotencyKey: m.idempotencyKey, versionNumber: (old?.versionNumber ?? 0) + 1 }; if (index < 0) tx.balances.push(row); else tx.balances[index] = row; return row; }
  async listMovements(_a: FinanceActor, c: InventoryCoordinate, tx: Tx) { return tx.movements.filter(x => key(x) === key(c)); } async listLayers(_a: FinanceActor, c: InventoryCoordinate, tx: Tx) { return tx.layers.filter(x => key(x) === key(c)); }
}

function inventoryService(memory: MemoryInventory) { return new InventoryMovementService({ transactions: memory.transactions, commands: new InMemoryFinanceCommandRepository<Tx>(), repository: memory, guard, permissions, audit, outbox }); }
function receipt(id: string, coordinate: InventoryCoordinate, quantity: string, inventoryValue: string) { return command(id, "finance.inventory.receipt", { postingCoordinates, coordinate, quantity, unitCost: decimalString((decimalUnits(inventoryValue, 4) * 100000000n) / decimalUnits(quantity, 6), 6), inventoryValue, source: { sourceType: "document.receipt", sourceId: `source-${id}` }, performedAt: "2026-08-11T00:00:00.000Z" }); }
function issue(id: string, coordinate: InventoryCoordinate, quantity: string) { return command(id, "finance.inventory.issue", { postingCoordinates, coordinate, quantity, source: { sourceType: "document.issue", sourceId: `source-${id}` }, performedAt: "2026-08-11T01:00:00.000Z" }); }
function transfer(id: string, quantity: string) { return command(id, "finance.inventory.transfer", { postingCoordinates, companyCodeId: "company", itemId: "sku", sourceWarehouseId: "source", destinationWarehouseId: "destination", uomCode: "EA", currencyCode: "USD", quantity, source: { sourceType: "document.transfer", sourceId: `source-${id}` }, performedAt: "2026-08-11T02:00:00.000Z" }); }
function reverse(id: string, reversesMovementId: string) { return command(id, "finance.inventory.reverse", { postingCoordinates, reversesMovementId, source: { sourceType: "document.reversal", sourceId: `source-${id}` }, performedAt: "2026-08-11T03:00:00.000Z" }); }
function command<P extends Readonly<Record<string, unknown>>>(id: string, commandCode: string, payload: P): FinanceCommand<P> { return { commandId: id, commandCode, idempotencyKey: id, actor, payload, requestFingerprint: canonicalFinanceHash({ commandCode, tenantId: actor.tenantId, principalId: actor.principalId, payload, expectedVersion: undefined }) }; }
function key(c: { companyCodeId: string; itemId: string; warehouseId: string; lotNumber?: string; serialNumber?: string }) { return [c.companyCodeId, c.itemId, c.warehouseId, c.lotNumber ?? "", c.serialNumber ?? ""].join("|"); }
