// =============================================================================
// Inventory Subledger Engine — Warehouse Repository
// Athyper v2.1 Business Operating Platform
// =============================================================================

import type {
  Warehouse,
  CreateWarehouseInput,
  UpdateWarehouseInput,
} from "../domain/types.js";

// ---------------------------------------------------------------------------
// Repository Interface
// ---------------------------------------------------------------------------

export interface WarehouseRepository {
  /**
   * Find a warehouse by its unique ID.
   */
  findById(tenantId: string, id: string): Promise<Warehouse | null>;

  /**
   * Find a warehouse by its code within a tenant and entity.
   */
  findByCode(
    tenantId: string,
    entityCode: string,
    code: string,
  ): Promise<Warehouse | null>;

  /**
   * List all warehouses for a given tenant and entity.
   */
  listByEntity(
    tenantId: string,
    entityCode: string,
    activeOnly?: boolean,
  ): Promise<readonly Warehouse[]>;

  /**
   * Create a new warehouse.
   */
  create(input: CreateWarehouseInput): Promise<Warehouse>;

  /**
   * Update an existing warehouse.
   */
  update(
    tenantId: string,
    id: string,
    input: UpdateWarehouseInput,
  ): Promise<Warehouse | null>;

  /**
   * Soft-deactivate a warehouse (sets is_active = false).
   */
  deactivate(tenantId: string, id: string): Promise<boolean>;
}
