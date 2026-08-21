export interface EventMetadata {
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly idempotencyKey?: string;
  readonly actorId?: string;
}

export interface DomainEvent<Payload extends object = Readonly<Record<string, unknown>>> {
  readonly id: string;
  readonly type: string;
  readonly topic: string;
  readonly occurredAt: string;
  readonly tenantId: string;
  readonly aggregateType?: string;
  readonly aggregateId?: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly payload: Payload;
  readonly metadata?: EventMetadata;
}

export interface OutboxEventInput<Payload extends object = Readonly<Record<string, unknown>>> {
  readonly tenantId: string;
  readonly topic: string;
  readonly eventType: string;
  readonly eventKey?: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly aggregateType?: string;
  readonly aggregateId?: string;
  readonly actorId: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly payload?: Payload;
}

export interface StoredOutboxEvent<Payload extends object = Readonly<Record<string, unknown>>>
  extends OutboxEventInput<Payload> {
  readonly id: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly createdAt: string;
}
