// =============================================================================
// Inventory Subledger Engine — Inventory Balance Repository
// Athyper v2.1 Business Operating Platform
// =============================================================================

import type {
  InventoryBalance,
  InventoryBalanceFilter,
} from "../domain/types.js";

// ---------------------------------------------------------------------------
// Repository Interface
// ---------------------------------------------------------------------------

export interface InventoryBalanceRepository {
  /**
   * Find a balance by its unique ID.
   */
  findById(tenantId: string, id: string): Promise<InventoryBalance | null>;

  /**
   * Find the balance for a specific item in a specific warehouse,
   * optionally narrowed by lot/serial number.
   */
  findByItemWarehouse(
    tenantId: string,
    entityCode: string,
    itemId: string,
    warehouseId: string,
    lotNumber?: string | null,
    serialNumber?: string | null,
  ): Promise<InventoryBalance | null>;

  /**
   * List balances matching the given filter criteria.
   */
  list(filter: InventoryBalanceFilter): Promise<readonly InventoryBalance[]>;

  /**
   * Get aggregate quantity on hand for an item across all warehouses.
   */
  getTotalOnHand(
    tenantId: string,
    entityCode: string,
    itemId: string,
  ): Promise<number>;

  /**
   * Create or upsert an inventory balance record.
   * If a balance already exists for the composite key, it is updated.
   */
  upsert(
    tenantId: string,
    entityCode: string,
    itemId: string,
    warehouseId: string,
    currencyCode: string,
    quantityDelta: number,
    newUnitCost: number,
    lotNumber?: string | null,
    serialNumber?: string | null,
  ): Promise<InventoryBalance>;

  /**
   * Set the balance quantity and cost directly (used during stocktake adjustment).
   */
  setBalance(
    tenantId: string,
    id: string,
    quantityOnHand: number,
    unitCost: number,
  ): Promise<InventoryBalance | null>;

  /**
   * Delete a zero-quantity balance record (cleanup).
   */
  deleteIfZero(tenantId: string, id: string): Promise<boolean>;
}
