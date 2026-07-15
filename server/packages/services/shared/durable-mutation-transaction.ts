import { sql, type Kysely, type Transaction } from "kysely";

export interface DurableMutationActor {
  tenantId: string;
  principalId: string;
}

/**
 * Explicit transaction boundary for a business mutation and all required
 * durable effects. Any callback failure is intentionally propagated so Kysely
 * rolls back the record, audit, idempotency, and outbox writes together.
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
