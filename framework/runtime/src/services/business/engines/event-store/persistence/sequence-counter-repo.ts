// framework/runtime/src/services/business/engines/event-store/persistence/sequence-counter-repo.ts

/**
 * Sequence Counter Repository — atomic monotonic sequence generation per partition.
 * Uses PostgreSQL SELECT FOR UPDATE + increment for strict ordering.
 */
export interface SequenceCounterRepo {
  /**
   * Get the next sequence number for a partition (atomic increment).
   * Creates the counter if it doesn't exist.
   */
  nextSequence(
    tenantId: string,
    partitionDomain: string,
    partitionKey: string,
  ): Promise<bigint>;

  /**
   * Get the current sequence number without incrementing.
   */
  currentSequence(
    tenantId: string,
    partitionDomain: string,
    partitionKey: string,
  ): Promise<bigint>;
}
