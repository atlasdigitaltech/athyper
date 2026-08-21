import type { FinanceActor, FinanceCommand } from "./commands.js";
import type { FinanceCoordinates, FinanceDecimal } from "./foundation.js";
import type { FinanceCommandResult } from "./results.js";

export interface InventoryCoordinate {
  readonly companyCodeId: string;
  readonly itemId: string;
  readonly warehouseId: string;
  readonly lotNumber?: string;
  readonly serialNumber?: string;
  readonly uomCode: string;
  readonly currencyCode: string;
}

export type InventoryMovementType = "receipt" | "sales_issue" | "production_issue" | "transfer_out" | "transfer_in" | "adjustment" | "scrap" | "return" | "opening_balance" | "reversal_in" | "reversal_out";

/** F4 intentionally exposes FIFO only. Other methods require approved accounting examples and properties. */
export type InventoryValuationMethod = "fifo";

export interface InventorySource { readonly sourceType: string; readonly sourceId: string; readonly sourceLineId?: string; }
export interface InventoryMovement extends InventoryCoordinate {
  readonly id: string; readonly movementSequence: number; readonly movementType: InventoryMovementType; readonly valuationMethod: InventoryValuationMethod;
  readonly quantity: FinanceDecimal; readonly unitCost: FinanceDecimal; readonly inventoryValue: FinanceDecimal;
  readonly source: InventorySource; readonly sourceWarehouseId?: string; readonly destinationWarehouseId?: string;
  readonly reversesMovementId?: string; readonly idempotencyKey: string; readonly performedAt: string; readonly performedBy: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface InventoryBalance extends Omit<InventoryCoordinate, "uomCode"> {
  readonly id: string; readonly quantityOnHand: FinanceDecimal; readonly inventoryValue: FinanceDecimal; readonly averageUnitCost: FinanceDecimal;
  readonly lastMovementId: string; readonly lastMovementAt: string; readonly lastAppliedSequence: number; readonly lastIdempotencyKey: string; readonly versionNumber: number;
}

export interface InventoryValuationLayer extends Omit<InventoryCoordinate, "uomCode"> {
  readonly id: string; readonly valuationMethod: "fifo"; readonly receiptMovementId: string; readonly layerDate: string;
  readonly originalQuantity: FinanceDecimal; readonly remainingQuantity: FinanceDecimal; readonly originalValue: FinanceDecimal; readonly remainingValue: FinanceDecimal;
  readonly lastConsumptionMovementId?: string; readonly lastConsumedAt?: string; readonly versionNumber: number;
}

interface InventoryBasePayload extends Readonly<Record<string, unknown>> { readonly postingCoordinates: FinanceCoordinates; readonly coordinate: InventoryCoordinate; readonly source: InventorySource; readonly performedAt: string; readonly metadata?: Readonly<Record<string, unknown>>; }
export interface InventoryReceiptPayload extends InventoryBasePayload { readonly quantity: FinanceDecimal; readonly unitCost: FinanceDecimal; readonly inventoryValue: FinanceDecimal; readonly receiptType?: "receipt" | "return" | "opening_balance"; }
export interface InventoryIssuePayload extends InventoryBasePayload { readonly quantity: FinanceDecimal; readonly issueType?: "sales_issue" | "production_issue" | "scrap"; }
export interface InventoryTransferPayload extends Readonly<Record<string, unknown>> { readonly postingCoordinates: FinanceCoordinates; readonly companyCodeId: string; readonly itemId: string; readonly sourceWarehouseId: string; readonly destinationWarehouseId: string; readonly lotNumber?: string; readonly serialNumber?: string; readonly uomCode: string; readonly currencyCode: string; readonly quantity: FinanceDecimal; readonly source: InventorySource; readonly performedAt: string; readonly metadata?: Readonly<Record<string, unknown>>; }
export interface InventoryReversalPayload extends Readonly<Record<string, unknown>> { readonly postingCoordinates: FinanceCoordinates; readonly reversesMovementId: string; readonly source: InventorySource; readonly performedAt: string; readonly metadata?: Readonly<Record<string, unknown>>; }

export type InventoryReceiptCommand = FinanceCommand<InventoryReceiptPayload>;
export type InventoryIssueCommand = FinanceCommand<InventoryIssuePayload>;
export type InventoryTransferCommand = FinanceCommand<InventoryTransferPayload>;
export type InventoryReversalCommand = FinanceCommand<InventoryReversalPayload>;
export type InventoryMovementOutput = Readonly<Record<string, unknown>> & { readonly movements: readonly InventoryMovement[]; readonly balances: readonly InventoryBalance[] };

export interface InventoryLayerConsumption { readonly layer: InventoryValuationLayer; readonly quantity: FinanceDecimal; readonly value: FinanceDecimal; }
export interface InventoryRebuild { readonly balance: Pick<InventoryBalance, "quantityOnHand" | "inventoryValue" | "lastAppliedSequence">; readonly layers: readonly Pick<InventoryValuationLayer, "receiptMovementId" | "originalQuantity" | "remainingQuantity" | "originalValue" | "remainingValue">[]; }

export interface InventoryRepository<Transaction = unknown> {
  lockCoordinates(actor: FinanceActor, coordinates: readonly InventoryCoordinate[], transaction: Transaction): Promise<void>;
  nextSequence(actor: FinanceActor, coordinate: InventoryCoordinate, transaction: Transaction): Promise<number>;
  append(actor: FinanceActor, input: Omit<InventoryMovement, "id" | "movementSequence"> & { readonly movementSequence: number; readonly id?: string }, transaction: Transaction): Promise<InventoryMovement>;
  getMovement(actor: FinanceActor, movementId: string, transaction: Transaction): Promise<InventoryMovement | undefined>;
  findReversal(actor: FinanceActor, movementId: string, transaction: Transaction): Promise<InventoryMovement | undefined>;
  createLayer(actor: FinanceActor, movement: InventoryMovement, transaction: Transaction): Promise<InventoryValuationLayer>;
  lockEligibleFifoLayers(actor: FinanceActor, coordinate: InventoryCoordinate, transaction: Transaction): Promise<readonly InventoryValuationLayer[]>;
  consumeLayer(actor: FinanceActor, layer: InventoryValuationLayer, quantity: FinanceDecimal, value: FinanceDecimal, movementId: string, consumedAt: string, transaction: Transaction): Promise<InventoryValuationLayer | undefined>;
  getBalanceForUpdate(actor: FinanceActor, coordinate: InventoryCoordinate, transaction: Transaction): Promise<InventoryBalance | undefined>;
  getBalance?(actor: FinanceActor, coordinate: InventoryCoordinate, transaction: Transaction): Promise<InventoryBalance | undefined>;
  applyBalance(actor: FinanceActor, coordinate: InventoryCoordinate, movement: InventoryMovement, expectedVersion: number | undefined, transaction: Transaction): Promise<InventoryBalance | undefined>;
  listMovements(actor: FinanceActor, coordinate: InventoryCoordinate, transaction: Transaction): Promise<readonly InventoryMovement[]>;
  listLayers(actor: FinanceActor, coordinate: InventoryCoordinate, transaction: Transaction): Promise<readonly InventoryValuationLayer[]>;
}

export interface InventoryMovementServiceContract {
  receipt(command: InventoryReceiptCommand): Promise<FinanceCommandResult<InventoryMovementOutput>>;
  issue(command: InventoryIssueCommand): Promise<FinanceCommandResult<InventoryMovementOutput>>;
  transfer(command: InventoryTransferCommand): Promise<FinanceCommandResult<InventoryMovementOutput>>;
  reverse(command: InventoryReversalCommand): Promise<FinanceCommandResult<InventoryMovementOutput>>;
}
