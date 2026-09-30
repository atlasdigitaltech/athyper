import { parseInstant } from "@athyper/platform-temporal";
import {
  FinanceContractError, financePermissions,
  type FinanceActor, type FinanceCommandRepository, type FinancePeriodAdmissionGuard, type FinancePermissionChecker, type InventoryBalance, type InventoryCoordinate,
  type InventoryIssueCommand, type InventoryLayerConsumption, type InventoryMovement, type InventoryMovementOutput, type InventoryMovementServiceContract,
  type InventoryReceiptCommand, type InventoryRebuild, type InventoryRepository, type InventoryReversalCommand, type InventoryTransferCommand,
  type InventoryValuationLayer,
} from "@athyper/server-contract-finance";
import type { FinanceAuditRecorder, FinanceOutboxWriter } from "../shared/evidence.js";
import { decimalString, decimalUnits } from "../shared/decimal.js";

interface TransactionRunner<Transaction> { run<T>(actor: FinanceActor, work: (transaction: Transaction) => Promise<T>): Promise<T>; }

export class ValuationLayerService<Transaction> {
  constructor(private readonly repository: InventoryRepository<Transaction>) {}

  async planFifo(actor: FinanceActor, coordinate: InventoryCoordinate, quantity: string, transaction: Transaction): Promise<readonly InventoryLayerConsumption[]> {
    const needed = decimalUnits(quantity, 6, "quantity");
    if (needed <= 0n) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "FIFO consumption quantity must be positive");
    const layers = await this.repository.lockEligibleFifoLayers(actor, coordinate, transaction);
    if (layers.reduce((sum, layer) => sum + decimalUnits(layer.remainingQuantity, 6), 0n) < needed) {
      throw new FinanceContractError("FINANCE_INSUFFICIENT_STOCK", "Insufficient FIFO stock", { requestedQuantity: decimalString(needed, 6) });
    }
    let remaining = needed;
    const plan: InventoryLayerConsumption[] = [];
    for (const layer of layers) {
      if (remaining === 0n) break;
      const layerQuantity = decimalUnits(layer.remainingQuantity, 6);
      const take = remaining < layerQuantity ? remaining : layerQuantity;
      const layerValue = decimalUnits(layer.remainingValue, 4);
      // Full depletion takes the residual value. Partial depletion rounds half-up to currency scale.
      const value = take === layerQuantity ? layerValue : (layerValue * take + layerQuantity / 2n) / layerQuantity;
      plan.push({ layer, quantity: decimalString(take, 6), value: decimalString(value, 4) });
      remaining -= take;
    }
    return plan;
  }

  async consume(actor: FinanceActor, plan: readonly InventoryLayerConsumption[], movement: InventoryMovement, transaction: Transaction): Promise<void> {
    for (const item of plan) {
      const updated = await this.repository.consumeLayer(actor, item.layer, item.quantity, item.value, movement.id, movement.performedAt, transaction);
      if (!updated) throw new FinanceContractError("FINANCE_EXPECTED_VERSION_CONFLICT", "A valuation layer changed concurrently");
    }
  }

  create(actor: FinanceActor, movement: InventoryMovement, transaction: Transaction): Promise<InventoryValuationLayer> {
    if (decimalUnits(movement.quantity, 6) <= 0n) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Only inbound movements create FIFO layers");
    return this.repository.createLayer(actor, movement, transaction);
  }
}

export class InventoryBalanceService<Transaction> {
  constructor(private readonly repository: InventoryRepository<Transaction>,private readonly permissions?:FinancePermissionChecker) {}

  async apply(actor: FinanceActor, coordinate: InventoryCoordinate, movement: InventoryMovement, transaction: Transaction): Promise<InventoryBalance> {
    const current = await this.repository.getBalanceForUpdate(actor, coordinate, transaction);
    if (current?.lastIdempotencyKey === movement.idempotencyKey) return current;
    if (current && movement.movementSequence <= current.lastAppliedSequence) throw new FinanceContractError("FINANCE_EXPECTED_VERSION_CONFLICT", "Movement sequence was already passed by the balance");
    const balance = await this.repository.applyBalance(actor, coordinate, movement, current?.versionNumber, transaction);
    if (!balance) throw new FinanceContractError("FINANCE_EXPECTED_VERSION_CONFLICT", "Inventory balance changed concurrently");
    if (decimalUnits(balance.quantityOnHand, 6) < 0n || decimalUnits(balance.inventoryValue, 4) < 0n) throw new FinanceContractError("FINANCE_INSUFFICIENT_STOCK", "Inventory position cannot become negative");
    return balance;
  }

  async compareRebuild(actor: FinanceActor, coordinate: InventoryCoordinate, transaction: Transaction): Promise<InventoryRebuild> {
    if(this.permissions&&!await this.permissions.isAllowed(actor,financePermissions.inventoryRebuild))throw new FinanceContractError("FINANCE_PERMISSION_DENIED");
    const [movements, storedBalance, storedLayers] = await Promise.all([
      this.repository.listMovements(actor, coordinate, transaction), this.repository.getBalanceForUpdate(actor, coordinate, transaction), this.repository.listLayers(actor, coordinate, transaction),
    ]);
    const rebuilt = rebuildFifo(movements);
    if (!storedBalance || !sameBalance(rebuilt, storedBalance) || !sameLayers(rebuilt.layers, storedLayers)) throw new FinanceContractError("FINANCE_INVENTORY_REBUILD_MISMATCH", "Stored inventory balance/layers differ from FIFO movement replay", { rebuilt });
    return rebuilt;
  }
}

export class InventoryQueryService<Transaction>{private readonly balances:InventoryBalanceService<Transaction>;constructor(private readonly options:{readonly transactions:TransactionRunner<Transaction>;readonly repository:InventoryRepository<Transaction>;readonly permissions:FinancePermissionChecker}){this.balances=new InventoryBalanceService(options.repository,options.permissions);}async balance(actor:FinanceActor,coordinate:InventoryCoordinate):Promise<InventoryBalance|undefined>{if(actor.planeKey!=="neon"||!await this.options.permissions.isAllowed(actor,financePermissions.inventoryRead))throw new FinanceContractError("FINANCE_PERMISSION_DENIED");const get=this.options.repository.getBalance;if(!get)throw new FinanceContractError("FINANCE_NOT_FOUND","Inventory balance query adapter is unavailable");return this.options.transactions.run(actor,tx=>get.call(this.options.repository,actor,coordinate,tx));}async rebuild(actor:FinanceActor,coordinate:InventoryCoordinate):Promise<InventoryRebuild>{return this.options.transactions.run(actor,tx=>this.balances.compareRebuild(actor,coordinate,tx));}}

export class InventoryMovementService<Transaction> implements InventoryMovementServiceContract {
  private readonly valuation: ValuationLayerService<Transaction>;
  private readonly balances: InventoryBalanceService<Transaction>;
  constructor(private readonly options: { readonly transactions: TransactionRunner<Transaction>; readonly commands: FinanceCommandRepository<Transaction>; readonly repository: InventoryRepository<Transaction>; readonly guard: FinancePeriodAdmissionGuard; readonly permissions: FinancePermissionChecker; readonly audit: FinanceAuditRecorder<Transaction>; readonly outbox: FinanceOutboxWriter<Transaction> }) {
    this.valuation = new ValuationLayerService(options.repository); this.balances = new InventoryBalanceService(options.repository);
  }

  async receipt(command: InventoryReceiptCommand) {
    await this.authorize(command.actor); validatePostingScope(command.payload.postingCoordinates, command.payload.coordinate.companyCodeId, command.payload.coordinate.currencyCode); validateCoordinate(command.payload.coordinate); validatePositive(command.payload.quantity, 6, "quantity"); validatePositive(command.payload.inventoryValue, 4, "inventoryValue"); validateNonnegative(command.payload.unitCost, 6, "unitCost"); validateReceiptCost(command.payload.quantity, command.payload.unitCost, command.payload.inventoryValue); validateCommon(command.payload.source.sourceType, command.payload.performedAt); await this.options.guard.assertPeriodOpen(command.actor, command.payload.postingCoordinates);
    return this.options.transactions.run(command.actor, tx => this.options.commands.execute(command, tx, async current => {
      const c = command.payload.coordinate; await this.options.repository.lockCoordinates(command.actor, [c], current);
      const movement = await this.append(command.actor, c, { movementType: command.payload.receiptType ?? "receipt", quantity: normalized(command.payload.quantity, 6), unitCost: normalized(command.payload.unitCost, 6), inventoryValue: normalized(command.payload.inventoryValue, 4), source: command.payload.source, performedAt: command.payload.performedAt, idempotencyKey: movementKey(command.commandCode, command.idempotencyKey), metadata: { ...command.payload.metadata, postingCoordinates: command.payload.postingCoordinates } }, current);
      await this.valuation.create(command.actor, movement, current); const balance = await this.balances.apply(command.actor, c, movement, current);
      await this.evidence(command.actor, "finance.inventory.received", movement, current); return outcome([movement], [balance]);
    }));
  }

  async issue(command: InventoryIssueCommand) {
    await this.authorize(command.actor); validatePostingScope(command.payload.postingCoordinates, command.payload.coordinate.companyCodeId, command.payload.coordinate.currencyCode); validateCoordinate(command.payload.coordinate); validatePositive(command.payload.quantity, 6, "quantity"); validateCommon(command.payload.source.sourceType, command.payload.performedAt); await this.options.guard.assertPeriodOpen(command.actor, command.payload.postingCoordinates);
    return this.options.transactions.run(command.actor, tx => this.options.commands.execute(command, tx, async current => {
      const c = command.payload.coordinate; await this.options.repository.lockCoordinates(command.actor, [c], current);
      const plan = await this.valuation.planFifo(command.actor, c, command.payload.quantity, current); const value = plan.reduce((sum, item) => sum + decimalUnits(item.value, 4), 0n); const quantity = decimalUnits(command.payload.quantity, 6);
      const movement = await this.append(command.actor, c, { movementType: command.payload.issueType ?? "sales_issue", quantity: decimalString(-quantity, 6), unitCost: unitCost(value, quantity), inventoryValue: decimalString(-value, 4), source: command.payload.source, performedAt: command.payload.performedAt, idempotencyKey: movementKey(command.commandCode, command.idempotencyKey), metadata: { ...command.payload.metadata, postingCoordinates: command.payload.postingCoordinates, fifoLayers: plan.map(x => ({ layerId: x.layer.id, quantity: x.quantity, value: x.value })) } }, current);
      await this.valuation.consume(command.actor, plan, movement, current); const balance = await this.balances.apply(command.actor, c, movement, current);
      await this.evidence(command.actor, "finance.inventory.issued", movement, current); return outcome([movement], [balance]);
    }));
  }

  async transfer(command: InventoryTransferCommand) {
    await this.authorize(command.actor); if (command.payload.sourceWarehouseId === command.payload.destinationWarehouseId) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Transfer warehouses must differ"); validatePositive(command.payload.quantity, 6, "quantity"); validateCommon(command.payload.source.sourceType, command.payload.performedAt);
    const source = transferCoordinate(command, command.payload.sourceWarehouseId), destination = transferCoordinate(command, command.payload.destinationWarehouseId); validatePostingScope(command.payload.postingCoordinates, command.payload.companyCodeId, command.payload.currencyCode); validateCoordinate(source); validateCoordinate(destination); await this.options.guard.assertPeriodOpen(command.actor, command.payload.postingCoordinates);
    return this.options.transactions.run(command.actor, tx => this.options.commands.execute(command, tx, async current => {
      await this.options.repository.lockCoordinates(command.actor, [source, destination], current); const plan = await this.valuation.planFifo(command.actor, source, command.payload.quantity, current);
      const value = plan.reduce((sum, item) => sum + decimalUnits(item.value, 4), 0n), quantity = decimalUnits(command.payload.quantity, 6), cost = unitCost(value, quantity);
      const links = { sourceWarehouseId: source.warehouseId, destinationWarehouseId: destination.warehouseId };
      const outgoing = await this.append(command.actor, source, { ...links, movementType: "transfer_out", quantity: decimalString(-quantity, 6), unitCost: cost, inventoryValue: decimalString(-value, 4), source: command.payload.source, performedAt: command.payload.performedAt, idempotencyKey: movementKey(command.commandCode, command.idempotencyKey, "out"), metadata: { ...command.payload.metadata, postingCoordinates: command.payload.postingCoordinates } }, current);
      await this.valuation.consume(command.actor, plan, outgoing, current); const sourceBalance = await this.balances.apply(command.actor, source, outgoing, current);
      const incoming = await this.append(command.actor, destination, { ...links, movementType: "transfer_in", quantity: decimalString(quantity, 6), unitCost: cost, inventoryValue: decimalString(value, 4), source: command.payload.source, performedAt: command.payload.performedAt, idempotencyKey: movementKey(command.commandCode, command.idempotencyKey, "in"), metadata: { ...command.payload.metadata, postingCoordinates: command.payload.postingCoordinates, transferOutMovementId: outgoing.id } }, current);
      await this.valuation.create(command.actor, incoming, current); const destinationBalance = await this.balances.apply(command.actor, destination, incoming, current);
      await this.evidence(command.actor, "finance.inventory.transferred", outgoing, current, { transferInMovementId: incoming.id }); return outcome([outgoing, incoming], [sourceBalance, destinationBalance]);
    }));
  }

  async reverse(command: InventoryReversalCommand) {
    await this.authorize(command.actor,financePermissions.inventoryReverse); validateCommon(command.payload.source.sourceType, command.payload.performedAt); await this.options.guard.assertPeriodOpen(command.actor, command.payload.postingCoordinates);
    return this.options.transactions.run(command.actor, tx => this.options.commands.execute(command, tx, async current => {
      const original = await this.options.repository.getMovement(command.actor, command.payload.reversesMovementId, current);
      if (!original || original.reversesMovementId) throw new FinanceContractError("FINANCE_NOT_FOUND", "Reversal target must be an original inventory movement");
      validatePostingScope(command.payload.postingCoordinates, original.companyCodeId, original.currencyCode);
      if (await this.options.repository.findReversal(command.actor, original.id, current)) throw new FinanceContractError("FINANCE_INVALID_STATE_TRANSITION", "Inventory movement is already reversed");
      const c: InventoryCoordinate = { companyCodeId: original.companyCodeId, itemId: original.itemId, warehouseId: original.warehouseId, lotNumber: original.lotNumber, serialNumber: original.serialNumber, uomCode: original.uomCode, currencyCode: original.currencyCode };
      await this.options.repository.lockCoordinates(command.actor, [c], current); const originalQuantity = decimalUnits(original.quantity, 6), originalValue = decimalUnits(original.inventoryValue, 4);
      let plan: readonly InventoryLayerConsumption[] = []; if (originalQuantity > 0n) plan = await this.valuation.planFifo(command.actor, c, decimalString(originalQuantity, 6), current);
      const movement = await this.append(command.actor, c, { movementType: originalQuantity < 0n ? "reversal_in" : "reversal_out", quantity: decimalString(-originalQuantity, 6), unitCost: original.unitCost, inventoryValue: decimalString(-originalValue, 4), source: command.payload.source, performedAt: command.payload.performedAt, idempotencyKey: movementKey(command.commandCode, command.idempotencyKey), reversesMovementId: original.id, metadata: { ...command.payload.metadata, postingCoordinates: command.payload.postingCoordinates } }, current);
      if (originalQuantity < 0n) await this.valuation.create(command.actor, movement, current); else await this.valuation.consume(command.actor, plan, movement, current);
      const balance = await this.balances.apply(command.actor, c, movement, current); await this.evidence(command.actor, "finance.inventory.reversed", movement, current); return outcome([movement], [balance]);
    }));
  }

  private async authorize(actor: FinanceActor,permission:string=financePermissions.inventoryPost) { if (actor.planeKey !== "neon") throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Finance executes only in Neon"); if (!await this.options.permissions.isAllowed(actor, permission)) throw new FinanceContractError("FINANCE_PERMISSION_DENIED"); }
  private async append(actor: FinanceActor, coordinate: InventoryCoordinate, input: Omit<InventoryMovement, keyof InventoryCoordinate | "id" | "movementSequence" | "valuationMethod" | "performedBy">, tx: Transaction) { const movementSequence = await this.options.repository.nextSequence(actor, coordinate, tx); return this.options.repository.append(actor, { ...coordinate, ...input, movementSequence, valuationMethod: "fifo", performedBy: actor.principalId }, tx); }
  private async evidence(actor: FinanceActor, eventType: string, movement: InventoryMovement, tx: Transaction, extra: Readonly<Record<string, unknown>> = {}) { const payload = { movementId: movement.id, movementSequence: movement.movementSequence, quantity: movement.quantity, inventoryValue: movement.inventoryValue, ...extra }; await this.options.outbox.append({ tenantId: actor.tenantId, topic: "finance", eventType, eventKey: movement.id, aggregateType: "ledger.inventory_movement", aggregateId: movement.id, actorId: actor.principalId, correlationId: actor.correlationId, payload }, tx); await this.options.audit.record({ eventCode: eventType, action: eventType.split(".").at(-1) ?? eventType, outcome: "success", actor: { kind: "user", principalId: actor.principalId }, tenantId: actor.tenantId, entityType: "ledger.inventory_movement", entityId: movement.id, correlationId: actor.correlationId, metadata: payload }, tx); }
}

export function rebuildFifo(movements: readonly InventoryMovement[]): InventoryRebuild {
  const ordered = [...movements].sort((a, b) => a.movementSequence - b.movementSequence || a.id.localeCompare(b.id)); const layers: { receiptMovementId: string; originalQuantity: string; remainingQuantity: string; originalValue: string; remainingValue: string }[] = [];
  let quantity = 0n, value = 0n, last = 0;
  for (const movement of ordered) { const q = decimalUnits(movement.quantity, 6), v = decimalUnits(movement.inventoryValue, 4); quantity += q; value += v; last = movement.movementSequence;
    if (q > 0n) layers.push({ receiptMovementId: movement.id, originalQuantity: decimalString(q, 6), remainingQuantity: decimalString(q, 6), originalValue: decimalString(v, 4), remainingValue: decimalString(v, 4) });
    else { let needed = -q; for (const layer of layers) { if (!needed) break; const available = decimalUnits(layer.remainingQuantity, 6); if (!available) continue; const take = needed < available ? needed : available; const layerValue = decimalUnits(layer.remainingValue, 4); const consumed = take === available ? layerValue : (layerValue * take + available / 2n) / available; layer.remainingQuantity = decimalString(available - take, 6); layer.remainingValue = decimalString(layerValue - consumed, 4); needed -= take; } if (needed) throw new FinanceContractError("FINANCE_INSUFFICIENT_STOCK", "Movement log produces negative FIFO stock"); }
  }
  return { balance: { quantityOnHand: decimalString(quantity, 6), inventoryValue: decimalString(value, 4), lastAppliedSequence: last }, layers };
}

function outcome(movements: readonly InventoryMovement[], balances: readonly InventoryBalance[]) { return { resourceId: movements[0]!.id, version: Math.max(...balances.map(x => x.versionNumber)), output: { movements, balances } satisfies InventoryMovementOutput }; }
function unitCost(value: bigint, quantity: bigint) { return decimalString((value * 100000000n + quantity / 2n) / quantity, 6); }
function movementKey(commandCode: string, idempotencyKey: string, leg?: "out" | "in") { return `inventory:${commandCode}:${idempotencyKey}${leg ? `:${leg}` : ""}`; }
function normalized(value: string, scale: number) { return decimalString(decimalUnits(value, scale), scale); }
function validatePositive(value: string, scale: number, field: string) { if (decimalUnits(value, scale, field) <= 0n) throw new FinanceContractError("FINANCE_INVALID_COMMAND", `${field} must be positive`); }
function validateNonnegative(value: string, scale: number, field: string) { if (decimalUnits(value, scale, field) < 0n) throw new FinanceContractError("FINANCE_INVALID_COMMAND", `${field} must be nonnegative`); }
function validateReceiptCost(quantity: string, cost: string, value: string) { const extended = (decimalUnits(quantity, 6) * decimalUnits(cost, 6) + 50000000n) / 100000000n; if (extended !== decimalUnits(value, 4)) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Receipt inventoryValue must equal rounded quantity × unitCost"); }
function validateCommon(sourceType: string, performedAt: string) { if (!/^[a-z][a-z0-9_.-]{1,126}$/.test(sourceType) || !Number.isFinite(parseInstant(performedAt))) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Inventory source or performedAt is invalid"); }
function validateCoordinate(c: InventoryCoordinate) { if (!c.companyCodeId || !c.itemId || !c.warehouseId || !c.uomCode.trim() || c.currencyCode.length !== 3 || c.lotNumber === "" || c.serialNumber === "") throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Inventory coordinate is incomplete"); }
function validatePostingScope(c: InventoryReceiptCommand["payload"]["postingCoordinates"], companyCodeId: string, currencyCode: string) { if (!c.companyCodeId || !c.ledgerBookId || !c.fiscalPeriodId || c.companyCodeId !== companyCodeId || c.currencyCode !== currencyCode) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Inventory posting coordinates are incomplete or inconsistent"); }
function transferCoordinate(c: InventoryTransferCommand, warehouseId: string): InventoryCoordinate { const p = c.payload; return { companyCodeId: p.companyCodeId, itemId: p.itemId, warehouseId, uomCode: p.uomCode, currencyCode: p.currencyCode, ...(p.lotNumber === undefined ? {} : { lotNumber: p.lotNumber }), ...(p.serialNumber === undefined ? {} : { serialNumber: p.serialNumber }) }; }
function sameBalance(r: InventoryRebuild, b: InventoryBalance) { return decimalUnits(r.balance.quantityOnHand, 6) === decimalUnits(b.quantityOnHand, 6) && decimalUnits(r.balance.inventoryValue, 4) === decimalUnits(b.inventoryValue, 4) && r.balance.lastAppliedSequence === b.lastAppliedSequence; }
function sameLayers(rebuilt: InventoryRebuild["layers"], stored: readonly InventoryValuationLayer[]) { const a = [...rebuilt].sort((x, y) => x.receiptMovementId.localeCompare(y.receiptMovementId)), b = [...stored].sort((x, y) => x.receiptMovementId.localeCompare(y.receiptMovementId)); return a.length === b.length && a.every((x, i) => { const y = b[i]!; return x.receiptMovementId === y.receiptMovementId && decimalUnits(x.originalQuantity, 6) === decimalUnits(y.originalQuantity, 6) && decimalUnits(x.remainingQuantity, 6) === decimalUnits(y.remainingQuantity, 6) && decimalUnits(x.originalValue, 4) === decimalUnits(y.originalValue, 4) && decimalUnits(x.remainingValue, 4) === decimalUnits(y.remainingValue, 4); }); }
