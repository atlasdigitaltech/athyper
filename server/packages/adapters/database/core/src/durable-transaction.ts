import { sql, type Kysely, type Transaction } from "kysely";

export interface DurableMutationActor {
  tenantId: string;
  principalId: string;
}

/**
 * Explicit transaction boundary for a business mutation and all required
 * durable effects (audit, idempotency key, outbox). Any callback failure
 * is intentionally propagated so Kysely rolls back all writes together.
 *
 * When actor is provided, stamps app.current_tenant_id and
 * app.current_principal_id as PostgreSQL session GUC variables for the
 * duration of the transaction so triggers can read them.
 *
 * Concrete implementation of the TransactionRunner port defined in
 * @athyper/server-foundation/transaction. The Kysely dependency keeps this in
 * adapters/database, not in foundation.
 */
export async function executeDurableMutationTransaction<DB, Result>(
  db: Kysely<DB>,
  work: (trx: Transaction<DB>) => Promise<Result>,
  actor?: DurableMutationActor,
): Promise<Result> {
  return db.transaction().execute(async (trx) => {
    if (actor) {
      await sql`
        select set_config('app.current_tenant_id', ${actor.tenantId}, true),
               set_config('app.current_principal_id', ${actor.principalId}, true)
      `.execute(trx);
    }
    return work(trx);
  });
}
