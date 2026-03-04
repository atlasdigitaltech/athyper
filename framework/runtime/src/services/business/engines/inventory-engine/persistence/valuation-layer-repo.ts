// =============================================================================
// Inventory Subledger Engine — Valuation Layer Repository
// Athyper v2.1 Business Operating Platform
// =============================================================================

import type {
  ValuationLayer,
  CreateValuationLayerInput,
  ValuationLayerFilter,
  LayerConsumption,
} from "../domain/types.js";

// ---------------------------------------------------------------------------
// Repository Interface
// ---------------------------------------------------------------------------

export interface ValuationLayerRepository {
  /**
   * Find a valuation layer by its unique ID.
   */
  findById(tenantId: string, id: string): Promise<ValuationLayer | null>;

  /**
   * List layers matching the given filter criteria.
   */
  list(filter: ValuationLayerFilter): Promise<readonly ValuationLayer[]>;

  /**
   * List all unconsumed layers for an item/warehouse, ordered by date ascending.
   * This is the primary query used by FIFO/LIFO/SPECIFIC valuation calculators.
   */
  listUnconsumed(
    tenantId: string,
    entityCode: string,
    itemId: string,
    warehouseId: string,
  ): Promise<readonly ValuationLayer[]>;

  /**
   * Create a new valuation layer (typically on receipt).
   */
  create(input: CreateValuationLayerInput): Promise<ValuationLayer>;

  /**
   * Apply layer consumptions produced by the valuation calculator.
   * Decrements remaining_qty and sets is_consumed = true when remaining reaches zero.
   */
  applyConsumptions(
    tenantId: string,
    consumptions: readonly LayerConsumption[],
  ): Promise<void>;

  /**
   * Get total remaining quantity across all unconsumed layers for an item/warehouse.
   */
  getTotalRemaining(
    tenantId: string,
    entityCode: string,
    itemId: string,
    warehouseId: string,
  ): Promise<number>;

  /**
   * Delete all layers for a given receipt movement (used if a receipt is reversed).
   */
  deleteByReceiptMovement(
    tenantId: string,
    receiptMovementId: string,
  ): Promise<number>;
}
