// framework/runtime/src/services/business/engines/posting-engine/services/domain-event-outbox-consumer.ts
//
// Phase 6.2b — Domain Event Outbox Consumer
//
// Drains fin.domain_event_outbox: picks PENDING rows via FOR UPDATE SKIP LOCKED,
// publishes each to the runtime EventBus as a DomainEvent, and marks COMPLETED.
// Failed events retry up to maxRetries, then move to DEAD_LETTER.
//
// Follows the same pattern as:
//   - OutboxConsumer (finance/shared/outbox.ts)
//   - drainAuditOutbox.worker.ts (audit-governance)
//
// Registered as BullMQ job: fin.drain-domain-event-outbox
// Scheduled via JobRegistry: every 15 seconds

import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { DomainEvent } from "@athyper/core";

import { buildRiskSignalDomainEvent } from "./risk-signal-event-publisher";
import type { RiskSignalEventPayload } from "../domain/types";

// ---------------------------------------------------------------------------
// Outbox row shape
// ---------------------------------------------------------------------------

export interface OutboxRow {
  id: string;
  tenantId: string;
  eventType: string;
  entityCode: string | null;
  aggregateId: string | null;
  aggregateType: string | null;
  actorId: string | null;
  actorType: string;
  source: string;
  correlationId: string | null;
  payload: unknown;
  status: string;
  retryCount: number;
  lastError: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Consumer result
// ---------------------------------------------------------------------------

export interface OutboxDrainResult {
  picked: number;
  published: number;
  failed: number;
  deadLettered: number;
}

// ---------------------------------------------------------------------------
// Repo interface — abstracts SQL access for testability
// ---------------------------------------------------------------------------

export interface DomainEventOutboxRepo {
  /** Claim a batch of PENDING rows. Sets status to PROCESSING. */
  claimBatch(maxRetries: number, batchSize: number): Promise<OutboxRow[]>;
  /** Mark a row as COMPLETED. */
  markCompleted(id: string): Promise<void>;
  /** Mark a row as PENDING (retry) or DEAD_LETTER, with error info. */
  markFailed(id: string, nextRetry: number, isExhausted: boolean, error: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Event publisher interface — what the consumer calls to deliver events
// ---------------------------------------------------------------------------

export interface OutboxEventPublisher {
  publish<T>(event: DomainEvent<T>): Promise<void>;
}

// ---------------------------------------------------------------------------
// Consumer implementation
// ---------------------------------------------------------------------------

export class DomainEventOutboxConsumer {
  private readonly maxRetries: number;

  constructor(
    private readonly repo: DomainEventOutboxRepo,
    private readonly publisher: OutboxEventPublisher,
    options?: { maxRetries?: number },
  ) {
    this.maxRetries = options?.maxRetries ?? 5;
  }

  async drain(batchSize = 20): Promise<OutboxDrainResult> {
    const result: OutboxDrainResult = {
      picked: 0,
      published: 0,
      failed: 0,
      deadLettered: 0,
    };

    const rows = await this.repo.claimBatch(this.maxRetries, batchSize);
    result.picked = rows.length;
    if (rows.length === 0) return result;

    for (const row of rows) {
      try {
        const event = this.buildDomainEvent(row);
        await this.publisher.publish(event);
        await this.repo.markCompleted(row.id);
        result.published++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const nextRetry = row.retryCount + 1;
        const isExhausted = nextRetry >= this.maxRetries;
        await this.repo.markFailed(row.id, nextRetry, isExhausted, errorMsg);
        result.failed++;
        if (isExhausted) result.deadLettered++;
      }
    }

    return result;
  }

  private buildDomainEvent(row: OutboxRow): DomainEvent<unknown> {
    const payload = typeof row.payload === "string"
      ? JSON.parse(row.payload)
      : row.payload;

    if (row.eventType.startsWith("fin.risk_signal.")) {
      return buildRiskSignalDomainEvent(
        row.eventType,
        payload as RiskSignalEventPayload,
        { correlationId: row.correlationId ?? undefined },
      );
    }

    return {
      eventId: row.id,
      eventType: row.eventType,
      occurredAt: new Date(row.createdAt),
      aggregateId: row.aggregateId ?? "",
      aggregateType: row.aggregateType ?? "Unknown",
      payload,
      metadata: {
        entityCode: row.entityCode,
        actorId: row.actorId,
        actorType: row.actorType,
        source: row.source,
        correlationId: row.correlationId,
        outboxId: row.id,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// SQL-backed repo implementation
// ---------------------------------------------------------------------------

function mapRow(r: any): OutboxRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    eventType: r.event_type,
    entityCode: r.entity_code ?? null,
    aggregateId: r.aggregate_id ?? null,
    aggregateType: r.aggregate_type ?? null,
    actorId: r.actor_id ?? null,
    actorType: r.actor_type,
    source: r.source,
    correlationId: r.correlation_id ?? null,
    payload: r.payload,
    status: r.status,
    retryCount: r.retry_count ?? 0,
    lastError: r.last_error ?? null,
    createdAt: new Date(r.created_at),
  };
}

export function createOutboxRepo(db: Kysely<any>): DomainEventOutboxRepo {
  return {
    async claimBatch(maxRetries, batchSize) {
      const result = await sql`
        UPDATE fin.domain_event_outbox
        SET status = 'PROCESSING'
        WHERE id IN (
          SELECT id FROM fin.domain_event_outbox
          WHERE status = 'PENDING'
            AND retry_count < ${maxRetries}
          ORDER BY created_at ASC
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `.execute(db);
      return (result.rows as any[]).map(mapRow);
    },

    async markCompleted(id) {
      await sql`
        UPDATE fin.domain_event_outbox
        SET status = 'COMPLETED', processed_at = now()
        WHERE id = ${id}
      `.execute(db);
    },

    async markFailed(id, nextRetry, isExhausted, error) {
      await sql`
        UPDATE fin.domain_event_outbox
        SET status = ${isExhausted ? "DEAD_LETTER" : "PENDING"},
            retry_count = ${nextRetry},
            last_error = ${error}
        WHERE id = ${id}
      `.execute(db);
    },
  };
}

// ---------------------------------------------------------------------------
// Job handler factory — creates a BullMQ-compatible handler
// ---------------------------------------------------------------------------

export interface DrainDomainOutboxPayload {
  batchSize?: number;
}

export function createDrainDomainOutboxHandler(
  db: Kysely<any>,
  publisher: OutboxEventPublisher,
  logger?: { info(...args: any[]): void; warn(...args: any[]): void; error(...args: any[]): void },
  options?: { maxRetries?: number },
): (job: { data: { payload: DrainDomainOutboxPayload } }) => Promise<void> {
  const repo = createOutboxRepo(db);
  const consumer = new DomainEventOutboxConsumer(repo, publisher, options);

  return async (job) => {
    const batchSize = job.data?.payload?.batchSize ?? 20;
    const result = await consumer.drain(batchSize);

    if (result.picked > 0) {
      logger?.info(
        `[fin:outbox:drain] Processed ${result.published}/${result.picked} events` +
        (result.deadLettered > 0 ? ` (${result.deadLettered} dead-lettered)` : ""),
      );
    }

    if (result.deadLettered > 0) {
      logger?.warn(
        `[fin:outbox:drain] ${result.deadLettered} events moved to DEAD_LETTER — check fin.domain_event_outbox`,
      );
    }

    if (result.picked > 0 && result.published === 0) {
      throw new Error(
        `All ${result.failed} outbox events failed to publish`,
      );
    }
  };
}
