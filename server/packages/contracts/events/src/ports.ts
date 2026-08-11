import type { DomainEvent, OutboxEventInput, StoredOutboxEvent } from "./events.js";

export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

export interface EventHandler<Event extends DomainEvent = DomainEvent> {
  handle(event: Event): Promise<void>;
}

/** Persistence-neutral port; adapters provide atomic transaction binding. */
export interface OutboxWriter<Transaction = unknown> {
  append(event: OutboxEventInput, transaction?: Transaction): Promise<void>;
}

export interface OutboxHandler<Event extends StoredOutboxEvent = StoredOutboxEvent> {
  handle(event: Event): Promise<void>;
}

export interface CommandExecutionInput {
  readonly tenantId: string;
  readonly commandCode: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly actorPrincipalId: string;
  readonly sourceService: string;
  readonly correlationId?: string;
}

export type CommandExecutionBeginResult<Result extends object> =
  | { readonly kind: "started"; readonly executionId: string }
  | { readonly kind: "replay"; readonly result: Result }
  | { readonly kind: "conflict" }
  | { readonly kind: "in_progress" };

/** Durable command receipt. Begin and complete must use the mutation transaction. */
export interface CommandExecutionStore<Transaction = unknown, Result extends object = Readonly<Record<string, unknown>>> {
  begin(input: CommandExecutionInput, transaction: Transaction): Promise<CommandExecutionBeginResult<Result>>;
  complete(executionId: string, result: Result, actorPrincipalId: string, transaction: Transaction): Promise<void>;
}
