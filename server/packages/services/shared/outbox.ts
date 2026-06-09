/**
 * Outbox emission helper — app-layer `INSERT INTO event.outbox`.
 *
 * Every write path that needs to fan out to async consumers (search
 * indexing, finance posting, workflow notifications, …) calls this helper
 * inside its own transaction. That keeps the outbox row atomic with the
 * business write — if the transaction rolls back, no event is emitted.
 *
 * Design decisions (see Track B2 Slice B emission design call):
 *   - No DB triggers. Emission is always explicit at the call site.
 *   - Bulk paths (meilisearch-backfill, import workers) suppress emission
 *     by simply not calling this helper.
 *   - Payload is serialised to JSON here so callers don't repeat the
 *     JSON.stringify dance.
 *
 * Usage (inside a transaction):
 *   await db.transaction().execute(async (trx) => {
 *     const row = await trx.insertInto("document.purchase_invoice")...
 *     await emitOutboxEvent(trx, {
 *       tenantId:   ctx.tenantId,
 *       topic:      "search",
 *       eventType:  "invoice.created",
 *       entityType: "invoice",
 *       entityId:   row.id,
 *       actorId:    ctx.principalId,
 *       payload:    { invoice_number: row.invoice_number },
 *     });
 *   });
 */

import type { Kysely } from "kysely";

export interface EmitOutboxEventInput {
  tenantId:     string;
  topic:        string;
  eventType:    string;
  entityType?:  string;
  entityId?:    string;
  /** Stable dedup key (optional). Use for idempotent emissions. */
  eventKey?:    string;
  /** Parent aggregate reference (optional). */
  aggregateId?:   string;
  aggregateType?: string;
  /** Arbitrary JSON payload. Serialised to string before the INSERT. */
  payload?:     Record<string, unknown>;
  /** Principal that caused the emission. Stored as outbox.created_by. */
  actorId:      string;
}

/**
 * Insert a row into event.outbox. Works on either a Kysely instance or a
 * transaction handle — same signature as the rest of the runtime's DB
 * helpers. Call this inside the same transaction as the business write.
 */
export async function emitOutboxEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  input: EmitOutboxEventInput,
): Promise<void> {
  await db
    .insertInto("event.outbox" as never)
    .values({
      tenant_id:      input.tenantId,
      topic:          input.topic,
      event_type:     input.eventType,
      event_key:      input.eventKey,
      entity_type:    input.entityType,
      entity_id:      input.entityId,
      aggregate_id:   input.aggregateId,
      aggregate_type: input.aggregateType,
      payload:        JSON.stringify(input.payload ?? {}),
      created_by:     input.actorId,
    } as never)
    .execute();
}
