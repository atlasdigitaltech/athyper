/**
 * Base domain event type.
 * All domain events should extend this.
 */
export type DomainEvent<T = unknown> = {
  eventId: string;
  eventType: string;
  occurredAt: Date;
  aggregateId: string;
  aggregateType: string;
  payload: T;
  metadata?: Record<string, unknown>;
};

/**
 * Event handler function type
 */
export type EventHandler<T = unknown> = (event: DomainEvent<T>) => void | Promise<void>;
