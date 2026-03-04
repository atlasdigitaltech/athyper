// =============================================================================
// Inventory Subledger Engine — Inventory Service
// Athyper v2.1 Business Operating Platform
// =============================================================================


import { ok, fail } from "../../shared/engine-base.js";
import { MovementType, ValuationMethod } from "../domain/types.js";
import { getValuationCalculator } from "../domain/valuation.js";

import type { ServiceResult, OperationContext } from "../../shared/engine-base.js";
import type {
  InventoryMovement,
  InventoryBalance,
  ReceiveStockInput,
  IssueStockInput,
  TransferStockInput,
  AdjustStockInput,
  RecordMovementInput,
  ItemMaster,
} from "../domain/types.js";
import type { InventoryBalanceRepository } from "../persistence/inventory-balance-repo.js";
import type { ItemMasterRepository } from "../persistence/item-master-repo.js";
import type { MovementRepository } from "../persistence/movement-repo.js";
import type { ValuationLayerRepository } from "../persistence/valuation-layer-repo.js";
import type { WarehouseRepository } from "../persistence/warehouse-repo.js";

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface InventoryService {
  /**
   * Receive stock into a warehouse. Creates a RECEIPT movement, a new
   * valuation layer, and updates (or creates) the inventory balance.
   */
  receiveStock(
    ctx: OperationContext,
    input: ReceiveStockInput,
  ): Promise<ServiceResult<InventoryMovement>>;

  /**
   * Issue stock from a warehouse (sales, production, scrap). Calculates
   * the issuance cost via the item's valuation method, creates the movement,
   * consumes valuation layers (for FIFO/LIFO/SPECIFIC), and decrements the balance.
   */
  issueStock(
    ctx: OperationContext,
    input: IssueStockInput,
  ): Promise<ServiceResult<InventoryMovement>>;

  /**
   * Transfer stock between two warehouses. Creates a paired TRANSFER_OUT
   * and TRANSFER_IN movement, updating balances in both warehouses.
   */
  transferStock(
    ctx: OperationContext,
    input: TransferStockInput,
  ): Promise<ServiceResult<{ out: InventoryMovement; in: InventoryMovement }>>;

  /**
   * Adjust stock quantity (positive = increase, negative = decrease).
   * Typically used for stocktake variance or manual corrections.
   */
  adjustStock(
    ctx: OperationContext,
    input: AdjustStockInput,
  ): Promise<ServiceResult<InventoryMovement>>;

  /**
   * Record a raw inventory movement. Lower-level API — callers are
   * responsible for ensuring balance and layer consistency.
   */
  recordMovement(
    ctx: OperationContext,
    input: RecordMovementInput,
  ): Promise<ServiceResult<InventoryMovement>>;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

export class DefaultInventoryService implements InventoryService {
  private readonly warehouseRepo: WarehouseRepository;
  private readonly itemMasterRepo: ItemMasterRepository;
  private readonly balanceRepo: InventoryBalanceRepository;
  private readonly movementRepo: MovementRepository;
  private readonly layerRepo: ValuationLayerRepository;

  constructor(
    warehouseRepo: WarehouseRepository,
    itemMasterRepo: ItemMasterRepository,
    balanceRepo: InventoryBalanceRepository,
    movementRepo: MovementRepository,
    layerRepo: ValuationLayerRepository,
  ) {
    this.warehouseRepo = warehouseRepo;
    this.itemMasterRepo = itemMasterRepo;
    this.balanceRepo = balanceRepo;
    this.movementRepo = movementRepo;
    this.layerRepo = layerRepo;
  }

  // -------------------------------------------------------------------------
  // receiveStock
  // -------------------------------------------------------------------------

  async receiveStock(
    ctx: OperationContext,
    input: ReceiveStockInput,
  ): Promise<ServiceResult<InventoryMovement>> {
    // Validate warehouse exists and is active
    const warehouse = await this.warehouseRepo.findById(
      input.tenantId,
      input.warehouseId,
    );
    if (!warehouse || !warehouse.isActive) {
      return fail("WAREHOUSE_NOT_FOUND", "Warehouse not found or inactive");
    }

    // Validate item master exists
    const item = await this.itemMasterRepo.findById(
      input.tenantId,
      input.itemId,
    );
    if (!item) {
      return fail("ITEM_NOT_FOUND", "Item master not found");
    }

    // Validate lot/serial tracking requirements
    const trackingError = this.validateTracking(item, input.lotNumber, input.serialNumber);
    if (trackingError) {
      return trackingError;
    }

    if (input.quantity <= 0) {
      return fail("INVALID_QUANTITY", "Receipt quantity must be positive");
    }

    const totalValue = roundTo4(input.quantity * input.unitCost);

    // Record the movement
    const movement = await this.movementRepo.create({
      tenantId: input.tenantId,
      entityCode: input.entityCode,
      itemId: input.itemId,
      warehouseId: input.warehouseId,
      movementType: MovementType.RECEIPT,
      quantity: input.quantity,
      unitCost: input.unitCost,
      totalValue,
      currencyCode: input.currencyCode,
      lotNumber: input.lotNumber,
      serialNumber: input.serialNumber,
      referenceDocType: input.referenceDocType,
      referenceDocId: input.referenceDocId,
      performedBy: input.performedBy,
      notes: input.notes,
    });

    // Create a valuation layer for layer-based methods
    if (this.usesLayers(item.valuationMethod)) {
      await this.layerRepo.create({
        tenantId: input.tenantId,
        entityCode: input.entityCode,
        itemId: input.itemId,
        warehouseId: input.warehouseId,
        layerDate: movement.performedAt,
        receiptMovementId: movement.id,
        originalQty: input.quantity,
        remainingQty: input.quantity,
        unitCost: input.unitCost,
        currencyCode: input.currencyCode,
      });
    }

    // Update inventory balance
    const currentBalance = await this.balanceRepo.findByItemWarehouse(
      input.tenantId,
      input.entityCode,
      input.itemId,
      input.warehouseId,
      input.lotNumber,
      input.serialNumber,
    );

    const newUnitCost = this.computeNewUnitCostOnReceipt(
      item,
      currentBalance,
      input.quantity,
      input.unitCost,
    );

    await this.balanceRepo.upsert(
      input.tenantId,
      input.entityCode,
      input.itemId,
      input.warehouseId,
      input.currencyCode,
      input.quantity,
      newUnitCost,
      input.lotNumber,
      input.serialNumber,
    );

    return ok(movement);
  }

  // -------------------------------------------------------------------------
  // issueStock
  // -------------------------------------------------------------------------

  async issueStock(
    ctx: OperationContext,
    input: IssueStockInput,
  ): Promise<ServiceResult<InventoryMovement>> {
    // Validate warehouse
    const warehouse = await this.warehouseRepo.findById(
      input.tenantId,
      input.warehouseId,
    );
    if (!warehouse || !warehouse.isActive) {
      return fail("WAREHOUSE_NOT_FOUND", "Warehouse not found or inactive");
    }

    // Validate item master
    const item = await this.itemMasterRepo.findById(
      input.tenantId,
      input.itemId,
    );
    if (!item) {
      return fail("ITEM_NOT_FOUND", "Item master not found");
    }

    // Validate tracking
    const trackingError = this.validateTracking(item, input.lotNumber, input.serialNumber);
    if (trackingError) {
      return trackingError;
    }

    if (input.quantity <= 0) {
      return fail("INVALID_QUANTITY", "Issue quantity must be positive");
    }

    // Check sufficient balance
    const balance = await this.balanceRepo.findByItemWarehouse(
      input.tenantId,
      item.entityCode,
      input.itemId,
      input.warehouseId,
      input.lotNumber,
      input.serialNumber,
    );

    if (!balance || balance.quantityOnHand < input.quantity) {
      return fail(
        "INSUFFICIENT_STOCK",
        `Insufficient stock. Available: ${balance?.quantityOnHand ?? 0}, requested: ${input.quantity}`,
      );
    }

    // Calculate issuance cost via valuation method
    const layers = this.usesLayers(item.valuationMethod)
      ? await this.layerRepo.listUnconsumed(
          input.tenantId,
          item.entityCode,
          input.itemId,
          input.warehouseId,
        )
      : [];

    const calculator = getValuationCalculator(item.valuationMethod);
    const valuation = calculator.calculate(
      layers,
      balance,
      input.quantity,
      item.standardCost,
    );

    // Record the movement
    const movement = await this.movementRepo.create({
      tenantId: input.tenantId,
      entityCode: input.entityCode,
      itemId: input.itemId,
      warehouseId: input.warehouseId,
      movementType: input.movementType,
      quantity: input.quantity,
      unitCost: valuation.unitCost,
      totalValue: valuation.totalCost,
      currencyCode: input.currencyCode,
      lotNumber: input.lotNumber,
      serialNumber: input.serialNumber,
      referenceDocType: input.referenceDocType,
      referenceDocId: input.referenceDocId,
      performedBy: input.performedBy,
      notes: input.notes,
    });

    // Consume valuation layers if applicable
    if (valuation.layerConsumptions.length > 0) {
      await this.layerRepo.applyConsumptions(
        input.tenantId,
        valuation.layerConsumptions,
      );
    }

    // Decrement inventory balance
    await this.balanceRepo.upsert(
      input.tenantId,
      input.entityCode,
      input.itemId,
      input.warehouseId,
      input.currencyCode,
      -input.quantity,
      valuation.unitCost,
      input.lotNumber,
      input.serialNumber,
    );

    return ok(movement);
  }

  // -------------------------------------------------------------------------
  // transferStock
  // -------------------------------------------------------------------------

  async transferStock(
    ctx: OperationContext,
    input: TransferStockInput,
  ): Promise<ServiceResult<{ out: InventoryMovement; in: InventoryMovement }>> {
    // Validate both warehouses
    const [sourceWh, destWh] = await Promise.all([
      this.warehouseRepo.findById(input.tenantId, input.sourceWarehouseId),
      this.warehouseRepo.findById(input.tenantId, input.destWarehouseId),
    ]);

    if (!sourceWh || !sourceWh.isActive) {
      return fail("SOURCE_WAREHOUSE_NOT_FOUND", "Source warehouse not found or inactive");
    }
    if (!destWh || !destWh.isActive) {
      return fail("DEST_WAREHOUSE_NOT_FOUND", "Destination warehouse not found or inactive");
    }
    if (input.sourceWarehouseId === input.destWarehouseId) {
      return fail("SAME_WAREHOUSE", "Source and destination warehouse must differ");
    }

    // Validate item master
    const item = await this.itemMasterRepo.findById(
      input.tenantId,
      input.itemId,
    );
    if (!item) {
      return fail("ITEM_NOT_FOUND", "Item master not found");
    }

    if (input.quantity <= 0) {
      return fail("INVALID_QUANTITY", "Transfer quantity must be positive");
    }

    // Check sufficient balance at source
    const sourceBalance = await this.balanceRepo.findByItemWarehouse(
      input.tenantId,
      item.entityCode,
      input.itemId,
      input.sourceWarehouseId,
      input.lotNumber,
      input.serialNumber,
    );

    if (!sourceBalance || sourceBalance.quantityOnHand < input.quantity) {
      return fail(
        "INSUFFICIENT_STOCK",
        `Insufficient stock at source warehouse. Available: ${sourceBalance?.quantityOnHand ?? 0}, requested: ${input.quantity}`,
      );
    }

    // Calculate transfer cost using source balance unit cost
    const unitCost = sourceBalance.unitCost;
    const totalValue = roundTo4(input.quantity * unitCost);

    // Record TRANSFER_OUT movement
    const outMovement = await this.movementRepo.create({
      tenantId: input.tenantId,
      entityCode: input.entityCode,
      itemId: input.itemId,
      warehouseId: input.sourceWarehouseId,
      movementType: MovementType.TRANSFER_OUT,
      quantity: input.quantity,
      unitCost,
      totalValue,
      currencyCode: input.currencyCode,
      lotNumber: input.lotNumber,
      serialNumber: input.serialNumber,
      referenceDocType: input.referenceDocType,
      referenceDocId: input.referenceDocId,
      sourceWarehouseId: input.sourceWarehouseId,
      destWarehouseId: input.destWarehouseId,
      performedBy: input.performedBy,
      notes: input.notes,
    });

    // Record TRANSFER_IN movement
    const inMovement = await this.movementRepo.create({
      tenantId: input.tenantId,
      entityCode: input.entityCode,
      itemId: input.itemId,
      warehouseId: input.destWarehouseId,
      movementType: MovementType.TRANSFER_IN,
      quantity: input.quantity,
      unitCost,
      totalValue,
      currencyCode: input.currencyCode,
      lotNumber: input.lotNumber,
      serialNumber: input.serialNumber,
      referenceDocType: input.referenceDocType,
      referenceDocId: input.referenceDocId,
      sourceWarehouseId: input.sourceWarehouseId,
      destWarehouseId: input.destWarehouseId,
      performedBy: input.performedBy,
      notes: input.notes,
    });

    // Decrement source balance
    await this.balanceRepo.upsert(
      input.tenantId,
      input.entityCode,
      input.itemId,
      input.sourceWarehouseId,
      input.currencyCode,
      -input.quantity,
      unitCost,
      input.lotNumber,
      input.serialNumber,
    );

    // Increment destination balance
    await this.balanceRepo.upsert(
      input.tenantId,
      input.entityCode,
      input.itemId,
      input.destWarehouseId,
      input.currencyCode,
      input.quantity,
      unitCost,
      input.lotNumber,
      input.serialNumber,
    );

    // For layer-based methods, create a new layer at destination from source layers
    if (this.usesLayers(item.valuationMethod)) {
      await this.layerRepo.create({
        tenantId: input.tenantId,
        entityCode: input.entityCode,
        itemId: input.itemId,
        warehouseId: input.destWarehouseId,
        layerDate: inMovement.performedAt,
        receiptMovementId: inMovement.id,
        originalQty: input.quantity,
        remainingQty: input.quantity,
        unitCost,
        currencyCode: input.currencyCode,
      });
    }

    return ok({ out: outMovement, in: inMovement });
  }

  // -------------------------------------------------------------------------
  // adjustStock
  // -------------------------------------------------------------------------

  async adjustStock(
    ctx: OperationContext,
    input: AdjustStockInput,
  ): Promise<ServiceResult<InventoryMovement>> {
    // Validate warehouse
    const warehouse = await this.warehouseRepo.findById(
      input.tenantId,
      input.warehouseId,
    );
    if (!warehouse || !warehouse.isActive) {
      return fail("WAREHOUSE_NOT_FOUND", "Warehouse not found or inactive");
    }

    // Validate item master
    const item = await this.itemMasterRepo.findById(
      input.tenantId,
      input.itemId,
    );
    if (!item) {
      return fail("ITEM_NOT_FOUND", "Item master not found");
    }

    if (input.adjustmentQty === 0) {
      return fail("INVALID_QUANTITY", "Adjustment quantity must be non-zero");
    }

    // For negative adjustments, verify sufficient balance
    if (input.adjustmentQty < 0) {
      const balance = await this.balanceRepo.findByItemWarehouse(
        input.tenantId,
        item.entityCode,
        input.itemId,
        input.warehouseId,
        input.lotNumber,
        input.serialNumber,
      );

      if (!balance || balance.quantityOnHand < Math.abs(input.adjustmentQty)) {
        return fail(
          "INSUFFICIENT_STOCK",
          `Insufficient stock for negative adjustment. Available: ${balance?.quantityOnHand ?? 0}, adjustment: ${input.adjustmentQty}`,
        );
      }
    }

    const absQty = Math.abs(input.adjustmentQty);
    const totalValue = roundTo4(absQty * input.unitCost);

    // Record adjustment movement
    const movement = await this.movementRepo.create({
      tenantId: input.tenantId,
      entityCode: input.entityCode,
      itemId: input.itemId,
      warehouseId: input.warehouseId,
      movementType: MovementType.ADJUSTMENT,
      quantity: input.adjustmentQty,
      unitCost: input.unitCost,
      totalValue,
      currencyCode: input.currencyCode,
      lotNumber: input.lotNumber,
      serialNumber: input.serialNumber,
      referenceDocType: input.referenceDocType,
      referenceDocId: input.referenceDocId,
      performedBy: input.performedBy,
      notes: input.notes,
    });

    // For positive adjustments with layer-based methods, create a new layer
    if (input.adjustmentQty > 0 && this.usesLayers(item.valuationMethod)) {
      await this.layerRepo.create({
        tenantId: input.tenantId,
        entityCode: input.entityCode,
        itemId: input.itemId,
        warehouseId: input.warehouseId,
        layerDate: movement.performedAt,
        receiptMovementId: movement.id,
        originalQty: input.adjustmentQty,
        remainingQty: input.adjustmentQty,
        unitCost: input.unitCost,
        currencyCode: input.currencyCode,
      });
    }

    // Update inventory balance
    await this.balanceRepo.upsert(
      input.tenantId,
      input.entityCode,
      input.itemId,
      input.warehouseId,
      input.currencyCode,
      input.adjustmentQty,
      input.unitCost,
      input.lotNumber,
      input.serialNumber,
    );

    return ok(movement);
  }

  // -------------------------------------------------------------------------
  // recordMovement (low-level)
  // -------------------------------------------------------------------------

  async recordMovement(
    ctx: OperationContext,
    input: RecordMovementInput,
  ): Promise<ServiceResult<InventoryMovement>> {
    // Validate warehouse
    const warehouse = await this.warehouseRepo.findById(
      input.tenantId,
      input.warehouseId,
    );
    if (!warehouse) {
      return fail("WAREHOUSE_NOT_FOUND", "Warehouse not found");
    }

    // Validate item master
    const item = await this.itemMasterRepo.findById(
      input.tenantId,
      input.itemId,
    );
    if (!item) {
      return fail("ITEM_NOT_FOUND", "Item master not found");
    }

    const movement = await this.movementRepo.create(input);
    return ok(movement);
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Determine whether a valuation method uses layer-based tracking.
   */
  private usesLayers(method: ValuationMethod): boolean {
    return (
      method === ValuationMethod.FIFO ||
      method === ValuationMethod.LIFO ||
      method === ValuationMethod.SPECIFIC
    );
  }

  /**
   * Validate lot/serial tracking constraints against item master config.
   */
  private validateTracking(
    item: ItemMaster,
    lotNumber?: string | null,
    serialNumber?: string | null,
  ): ServiceResult<never> | null {
    if (item.lotTracking && !lotNumber) {
      return fail("LOT_REQUIRED", "Item requires lot tracking but no lot number provided");
    }
    if (item.serialTracking && !serialNumber) {
      return fail("SERIAL_REQUIRED", "Item requires serial tracking but no serial number provided");
    }
    return null;
  }

  /**
   * Compute the new weighted unit cost after a receipt.
   * For WEIGHTED_AVG: recalculate the average.
   * For STANDARD: use the standard cost.
   * For FIFO/LIFO/SPECIFIC: use the receipt unit cost for the balance.
   */
  private computeNewUnitCostOnReceipt(
    item: ItemMaster,
    currentBalance: InventoryBalance | null,
    receiptQty: number,
    receiptUnitCost: number,
  ): number {
    if (item.valuationMethod === ValuationMethod.STANDARD) {
      return item.standardCost ?? receiptUnitCost;
    }

    if (item.valuationMethod === ValuationMethod.WEIGHTED_AVG && currentBalance) {
      const existingValue = currentBalance.quantityOnHand * currentBalance.unitCost;
      const incomingValue = receiptQty * receiptUnitCost;
      const totalQty = currentBalance.quantityOnHand + receiptQty;
      if (totalQty === 0) return 0;
      return roundTo4((existingValue + incomingValue) / totalQty);
    }

    return receiptUnitCost;
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function roundTo4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
