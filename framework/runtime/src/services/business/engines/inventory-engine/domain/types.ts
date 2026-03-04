// =============================================================================
// Inventory Subledger Engine — Domain Types
// Athyper v2.1 Business Operating Platform
// =============================================================================

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum ValuationMethod {
  FIFO = "FIFO",
  LIFO = "LIFO",
  WEIGHTED_AVG = "WEIGHTED_AVG",
  STANDARD = "STANDARD",
  SPECIFIC = "SPECIFIC",
}

export enum MovementType {
  RECEIPT = "RECEIPT",
  ISSUE_SALES = "ISSUE_SALES",
  ISSUE_PRODUCTION = "ISSUE_PRODUCTION",
  TRANSFER_OUT = "TRANSFER_OUT",
  TRANSFER_IN = "TRANSFER_IN",
  ADJUSTMENT = "ADJUSTMENT",
  SCRAP = "SCRAP",
  RETURN = "RETURN",
}

export enum StocktakeStatus {
  PLANNED = "PLANNED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

// ---------------------------------------------------------------------------
// Core Entities
// ---------------------------------------------------------------------------

export interface Warehouse {
  readonly id: string;
  readonly tenantId: string;
  readonly entityCode: string;
  readonly code: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ItemMaster {
  readonly id: string;
  readonly tenantId: string;
  readonly entityCode: string;
  readonly productId: string;
  readonly valuationMethod: ValuationMethod;
  readonly standardCost: number | null;
  readonly currencyCode: string;
  readonly reorderPoint: number | null;
  readonly reorderQty: number | null;
  readonly safetyStock: number | null;
  readonly lotTracking: boolean;
  readonly serialTracking: boolean;
  readonly uomCode: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface InventoryBalance {
  readonly id: string;
  readonly tenantId: string;
  readonly entityCode: string;
  readonly itemId: string;
  readonly warehouseId: string;
  readonly lotNumber: string | null;
  readonly serialNumber: string | null;
  readonly quantityOnHand: number;
  readonly unitCost: number;
  readonly totalValue: number; // generated column
  readonly currencyCode: string;
  readonly lastMovementAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface InventoryMovement {
  readonly id: string;
  readonly tenantId: string;
  readonly entityCode: string;
  readonly itemId: string;
  readonly warehouseId: string;
  readonly movementType: MovementType;
  readonly quantity: number;
  readonly unitCost: number;
  readonly totalValue: number;
  readonly currencyCode: string;
  readonly lotNumber: string | null;
  readonly serialNumber: string | null;
  readonly referenceDocType: string | null;
  readonly referenceDocId: string | null;
  readonly sourceWarehouseId: string | null;
  readonly destWarehouseId: string | null;
  readonly referenceJeId: string | null;
  readonly performedBy: string;
  readonly performedAt: Date;
  readonly notes: string | null;
  readonly createdAt: Date;
}

export interface ValuationLayer {
  readonly id: string;
  readonly tenantId: string;
  readonly entityCode: string;
  readonly itemId: string;
  readonly warehouseId: string;
  readonly layerDate: Date;
  readonly receiptMovementId: string;
  readonly originalQty: number;
  readonly remainingQty: number;
  readonly unitCost: number;
  readonly currencyCode: string;
  readonly isConsumed: boolean;
  readonly createdAt: Date;
}

export interface Stocktake {
  readonly id: string;
  readonly tenantId: string;
  readonly entityCode: string;
  readonly warehouseId: string;
  readonly stocktakeDate: Date;
  readonly status: StocktakeStatus;
  readonly countedBy: string | null;
  readonly approvedBy: string | null;
  readonly varianceJeId: string | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
}

export interface StocktakeLine {
  readonly id: string;
  readonly tenantId: string;
  readonly stocktakeId: string;
  readonly itemId: string;
  readonly lotNumber: string | null;
  readonly serialNumber: string | null;
  readonly systemQty: number;
  readonly countedQty: number;
  readonly varianceQty: number; // generated column
  readonly unitCost: number;
  readonly varianceValue: number | null;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Input Types
// ---------------------------------------------------------------------------

export interface CreateWarehouseInput {
  readonly tenantId: string;
  readonly entityCode: string;
  readonly code: string;
  readonly name: string;
  readonly isActive?: boolean;
}

export interface UpdateWarehouseInput {
  readonly name?: string;
  readonly isActive?: boolean;
}

export interface CreateItemMasterInput {
  readonly tenantId: string;
  readonly entityCode: string;
  readonly productId: string;
  readonly valuationMethod: ValuationMethod;
  readonly standardCost?: number | null;
  readonly currencyCode: string;
  readonly reorderPoint?: number | null;
  readonly reorderQty?: number | null;
  readonly safetyStock?: number | null;
  readonly lotTracking?: boolean;
  readonly serialTracking?: boolean;
  readonly uomCode: string;
}

export interface UpdateItemMasterInput {
  readonly valuationMethod?: ValuationMethod;
  readonly standardCost?: number | null;
  readonly reorderPoint?: number | null;
  readonly reorderQty?: number | null;
  readonly safetyStock?: number | null;
  readonly lotTracking?: boolean;
  readonly serialTracking?: boolean;
}

export interface ReceiveStockInput {
  readonly tenantId: string;
  readonly entityCode: string;
  readonly itemId: string;
  readonly warehouseId: string;
  readonly quantity: number;
  readonly unitCost: number;
  readonly currencyCode: string;
  readonly lotNumber?: string | null;
  readonly serialNumber?: string | null;
  readonly referenceDocType?: string | null;
  readonly referenceDocId?: string | null;
  readonly performedBy: string;
  readonly notes?: string | null;
}

export interface IssueStockInput {
  readonly tenantId: string;
  readonly entityCode: string;
  readonly itemId: string;
  readonly warehouseId: string;
  readonly quantity: number;
  readonly movementType: MovementType.ISSUE_SALES | MovementType.ISSUE_PRODUCTION | MovementType.SCRAP;
  readonly currencyCode: string;
  readonly lotNumber?: string | null;
  readonly serialNumber?: string | null;
  readonly referenceDocType?: string | null;
  readonly referenceDocId?: string | null;
  readonly performedBy: string;
  readonly notes?: string | null;
}

export interface TransferStockInput {
  readonly tenantId: string;
  readonly entityCode: string;
  readonly itemId: string;
  readonly sourceWarehouseId: string;
  readonly destWarehouseId: string;
  readonly quantity: number;
  readonly currencyCode: string;
  readonly lotNumber?: string | null;
  readonly serialNumber?: string | null;
  readonly referenceDocType?: string | null;
  readonly referenceDocId?: string | null;
  readonly performedBy: string;
  readonly notes?: string | null;
}

export interface AdjustStockInput {
  readonly tenantId: string;
  readonly entityCode: string;
  readonly itemId: string;
  readonly warehouseId: string;
  readonly adjustmentQty: number; // positive = increase, negative = decrease
  readonly unitCost: number;
  readonly currencyCode: string;
  readonly lotNumber?: string | null;
  readonly serialNumber?: string | null;
  readonly referenceDocType?: string | null;
  readonly referenceDocId?: string | null;
  readonly performedBy: string;
  readonly notes?: string | null;
}

export interface RecordMovementInput {
  readonly tenantId: string;
  readonly entityCode: string;
  readonly itemId: string;
  readonly warehouseId: string;
  readonly movementType: MovementType;
  readonly quantity: number;
  readonly unitCost: number;
  readonly totalValue: number;
  readonly currencyCode: string;
  readonly lotNumber?: string | null;
  readonly serialNumber?: string | null;
  readonly referenceDocType?: string | null;
  readonly referenceDocId?: string | null;
  readonly sourceWarehouseId?: string | null;
  readonly destWarehouseId?: string | null;
  readonly referenceJeId?: string | null;
  readonly performedBy: string;
  readonly notes?: string | null;
}

export interface CreateStocktakeInput {
  readonly tenantId: string;
  readonly entityCode: string;
  readonly warehouseId: string;
  readonly stocktakeDate: Date;
  readonly countedBy?: string | null;
}

export interface StocktakeLineInput {
  readonly itemId: string;
  readonly lotNumber?: string | null;
  readonly serialNumber?: string | null;
  readonly systemQty: number;
  readonly countedQty: number;
  readonly unitCost: number;
}

export interface CreateValuationLayerInput {
  readonly tenantId: string;
  readonly entityCode: string;
  readonly itemId: string;
  readonly warehouseId: string;
  readonly layerDate: Date;
  readonly receiptMovementId: string;
  readonly originalQty: number;
  readonly remainingQty: number;
  readonly unitCost: number;
  readonly currencyCode: string;
}

// ---------------------------------------------------------------------------
// Valuation Result
// ---------------------------------------------------------------------------

export interface LayerConsumption {
  readonly layerId: string;
  readonly quantityConsumed: number;
  readonly unitCost: number;
}

export interface ValuationResult {
  /** The weighted unit cost for the issued quantity */
  readonly unitCost: number;
  /** Total cost of the issued quantity */
  readonly totalCost: number;
  /** Layers to consume (decrement remaining_qty) for FIFO/LIFO/SPECIFIC */
  readonly layerConsumptions: readonly LayerConsumption[];
}

// ---------------------------------------------------------------------------
// Query / Filter Types
// ---------------------------------------------------------------------------

export interface InventoryBalanceFilter {
  readonly tenantId: string;
  readonly entityCode: string;
  readonly itemId?: string;
  readonly warehouseId?: string;
  readonly lotNumber?: string;
  readonly serialNumber?: string;
}

export interface MovementFilter {
  readonly tenantId: string;
  readonly entityCode: string;
  readonly itemId?: string;
  readonly warehouseId?: string;
  readonly movementType?: MovementType;
  readonly fromDate?: Date;
  readonly toDate?: Date;
  readonly referenceDocType?: string;
  readonly referenceDocId?: string;
}

export interface ValuationLayerFilter {
  readonly tenantId: string;
  readonly entityCode: string;
  readonly itemId: string;
  readonly warehouseId: string;
  readonly unconsumedOnly?: boolean;
}
