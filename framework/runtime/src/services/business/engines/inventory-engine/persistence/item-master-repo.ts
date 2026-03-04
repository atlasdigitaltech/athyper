// =============================================================================
// Inventory Subledger Engine — Item Master Repository
// Athyper v2.1 Business Operating Platform
// =============================================================================

import type {
  ItemMaster,
  CreateItemMasterInput,
  UpdateItemMasterInput,
} from "../domain/types.js";

// ---------------------------------------------------------------------------
// Repository Interface
// ---------------------------------------------------------------------------

export interface ItemMasterRepository {
  /**
   * Find an item master record by its unique ID.
   */
  findById(tenantId: string, id: string): Promise<ItemMaster | null>;

  /**
   * Find an item master record by product ID within a tenant and entity.
   */
  findByProductId(
    tenantId: string,
    entityCode: string,
    productId: string,
  ): Promise<ItemMaster | null>;

  /**
   * List all item master records for a given tenant and entity.
   */
  listByEntity(
    tenantId: string,
    entityCode: string,
  ): Promise<readonly ItemMaster[]>;

  /**
   * List items that have fallen below their reorder point.
   */
  listBelowReorderPoint(
    tenantId: string,
    entityCode: string,
  ): Promise<readonly ItemMaster[]>;

  /**
   * Create a new item master record.
   */
  create(input: CreateItemMasterInput): Promise<ItemMaster>;

  /**
   * Update an existing item master record.
   */
  update(
    tenantId: string,
    id: string,
    input: UpdateItemMasterInput,
  ): Promise<ItemMaster | null>;

  /**
   * Delete an item master record. Only allowed if no balances or movements exist.
   */
  delete(tenantId: string, id: string): Promise<boolean>;
}
