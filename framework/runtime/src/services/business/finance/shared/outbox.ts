// framework/runtime/src/services/business/finance/shared/outbox.ts
//
// Outbox pattern for finance post-commit side effects.
//
// Problem: PurchaseInvoiceService.post() executes engine operations
// (inventory, asset, commission, federation) outside any DB transaction.
// If one fails, the invoice is POSTED but side effects are incomplete.
//
// Solution: Write an event to the evt.event table within the same TX
// as the JE posting. A background consumer picks up events and dispatches
// to idempotent handlers, each keyed to prevent duplicate processing.

import type { Container } from "../../../../kernel/container.js";

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

/**
 * Post-action event emitted when a finance document is posted.
 * Written to evt.event within the same TX as the JE posting.
 */
export interface PostActionEvent {
  type: "finance.document.posted";
  docId: string;
  docType: "PURCHASE_INVOICE" | "PAYMENT_ENTRY";
  tenantId: string;
  entityCode: string;
  jeId: string;
  supplierId: string;
  lines: PostActionEventLine[];
}

export interface PostActionEventLine {
  lineId: string;
  /** "CAPEX" triggers asset WIP creation */
  intentDomain: string | null;
  /** Non-null triggers inventory receipt */
  itemId: string | null;
  warehouseId: string | null;
  /** Accounting fields for commission/commitment */
  accountId: string | null;
  amount: string;
}

// ---------------------------------------------------------------------------
// Handler Interface
// ---------------------------------------------------------------------------

/**
 * Interface for idempotent post-action handlers.
 * Each handler processes a specific aspect of a posted document.
 *
 * Idempotency: handlers use `{engine}:{docId}:{lineId}:{operation}` as key.
 * If already processed, skip silently.
 */
export interface PostActionHandler {
  /** Handler name for logging/registration */
  readonly name: string;

  /**
   * Process the event. Must be idempotent.
   * @returns true if processing occurred, false if skipped (already processed)
   */
  handle(event: PostActionEvent, tx?: unknown): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Outbox Emitter
// ---------------------------------------------------------------------------

/**
 * OutboxEmitter — writes post-action events to the evt.event table
 * within the caller's transaction boundary.
 *
 * Usage in PurchaseInvoiceService.post():
 * ```
 * // Inside the atomic TX (after postingService.createAndPost):
 * await outboxEmitter.emit(event, tx);
 * ```
 */
export class OutboxEmitter {
  constructor(private readonly container: Container) {}

  /**
   * Write a post-action event to the outbox table within the given transaction.
   * The event will be picked up by the background consumer for processing.
   */
  async emit(event: PostActionEvent, tx?: unknown): Promise<string> {
    const db = tx ?? (await this.container.resolve<any>("db"));

    const eventId = crypto.randomUUID();
    const idempotencyKey = `outbox:${event.docType}:${event.docId}:posted`;

    await db.query(
      `INSERT INTO evt.event (id, tenant_id, event_type, aggregate_id, aggregate_type, payload, idempotency_key, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', now())
             ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        eventId,
        event.tenantId,
        event.type,
        event.docId,
        event.docType,
        JSON.stringify(event),
        idempotencyKey,
      ],
    );

    return eventId;
  }
}

// ---------------------------------------------------------------------------
// Outbox Consumer
// ---------------------------------------------------------------------------

/**
 * OutboxConsumer — polls the evt.event table for pending events
 * and dispatches to registered handlers.
 *
 * Each handler is called in sequence. Failed handlers are retried
 * on the next poll cycle. After max retries, events move to DEAD_LETTER.
 */
export class OutboxConsumer {
  private handlers: PostActionHandler[] = [];
  private readonly maxRetries: number;

  constructor(
    private readonly container: Container,
    options?: { maxRetries?: number },
  ) {
    this.maxRetries = options?.maxRetries ?? 5;
  }

  /** Register a post-action handler */
  registerHandler(handler: PostActionHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Process pending outbox events.
   * Called by a background job/scheduler.
   */
  async processPending(batchSize = 10): Promise<number> {
    const db = await this.container.resolve<any>("db");

    // Claim a batch of pending events (advisory lock prevents double-processing)
    const events = await db.query(
      `UPDATE evt.event
             SET status = 'PROCESSING', updated_at = now()
             WHERE id IN (
                 SELECT id FROM evt.event
                 WHERE event_type = 'finance.document.posted'
                   AND status = 'PENDING'
                   AND retry_count < $1
                 ORDER BY created_at ASC
                 LIMIT $2
                 FOR UPDATE SKIP LOCKED
             )
             RETURNING *`,
      [this.maxRetries, batchSize],
    );

    let processed = 0;
    for (const row of events.rows ?? events) {
      const event: PostActionEvent =
        typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;

      try {
        for (const handler of this.handlers) {
          await handler.handle(event);
        }

        // Mark as completed
        await db.query(
          `UPDATE evt.event SET status = 'COMPLETED', updated_at = now() WHERE id = $1`,
          [row.id],
        );
        processed++;
      } catch (err) {
        // Increment retry count, revert to PENDING for next cycle
        await db.query(
          `UPDATE evt.event
                     SET status = CASE WHEN retry_count + 1 >= $2 THEN 'DEAD_LETTER' ELSE 'PENDING' END,
                         retry_count = retry_count + 1,
                         last_error = $3,
                         updated_at = now()
                     WHERE id = $1`,
          [row.id, this.maxRetries, (err as Error).message],
        );
      }
    }

    return processed;
  }
}
