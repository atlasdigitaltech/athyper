/**
 * Domain model base types (DDD building blocks)
 */

export type EntityId = string | number;

/**
 * Base entity with identity
 */
export abstract class Entity<ID extends EntityId = string> {
  constructor(public readonly id: ID) {}

  equals(other: Entity<ID>): boolean {
    if (!other) return false;
    if (!(other instanceof Entity)) return false;
    return this.id === other.id;
  }
}

/**
 * Value object (immutable, no identity)
 */
export abstract class ValueObject<T> {
  constructor(protected readonly value: T) {}

  equals(other: ValueObject<T>): boolean {
    if (!other) return false;
    if (!(other instanceof ValueObject)) return false;
    return JSON.stringify(this.value) === JSON.stringify(other.value);
  }

  getValue(): T {
    return this.value;
  }
}

/**
 * Aggregate root marker
 * Aggregates are consistency boundaries
 */
export interface AggregateRoot<ID extends EntityId = string> {
  readonly id: ID;
  readonly version?: number;
}

/**
 * Domain event published by aggregates
 */
export type DomainEventPayload<T = unknown> = {
  eventType: string;
  aggregateId: EntityId;
  payload: T;
  occurredAt: Date;
};