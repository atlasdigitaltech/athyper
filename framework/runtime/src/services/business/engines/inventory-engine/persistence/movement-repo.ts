// =============================================================================
// Inventory Subledger Engine — Movement Repository
// Athyper v2.1 Business Operating Platform
// =============================================================================

import type {
  InventoryMovement,
  RecordMovementInput,
  MovementFilter,
} from "../domain/types.js";

// ---------------------------------------------------------------------------
// Repository Interface
// ---------------------------------------------------------------------------

export interface MovementRepository {
  /**
   * Find a movement by its unique ID.
   */
  findById(tenantId: string, id: string): Promise<InventoryMovement | null>;

  /**
   * List movements matching the given filter criteria.
   */
  list(filter: MovementFilter): Promise<readonly InventoryMovement[]>;

  /**
   * List movements for a specific reference document.
   */
  listByReference(
    tenantId: string,
    entityCode: string,
    referenceDocType: string,
    referenceDocId: string,
  ): Promise<readonly InventoryMovement[]>;

  /**
   * Get the most recent movement for a given item/warehouse combination.
   */
  findLatest(
    tenantId: string,
    entityCode: string,
    itemId: string,
    warehouseId: string,
  ): Promise<InventoryMovement | null>;

  /**
   * Create a new inventory movement record.
   */
  create(input: RecordMovementInput): Promise<InventoryMovement>;

  /**
   * Link a movement to a journal entry after the JE is created.
   */
  linkJournalEntry(
    tenantId: string,
    movementId: string,
    journalEntryId: string,
  ): Promise<boolean>;

  /**
   * Count movements for a given item (used to guard item master deletion).
   */
  countByItem(
    tenantId: string,
    entityCode: string,
    itemId: string,
  ): Promise<number>;
}
