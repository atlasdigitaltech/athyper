// server/packages/adapters/database/core/src/kysely-transaction-runner.ts
//
// Concrete implementation of foundation/transaction's TransactionRunner port
// using Kysely + PostgreSQL SET CONFIG for actor stamping.
//
// Usage:
//   import { KyselyTransactionRunner } from "@athyper/adapter-db-core";
//   const runner = new KyselyTransactionRunner(db.kysely);
//   await runner.run(async (trx) => { ... }, { tenantId, principalId });

import { sql, type Kysely, type Transaction } from "kysely";
import type { TransactionRunner, TransactionActor } from "@athyper/server-foundation/transaction";

/**
 * Kysely/PostgreSQL implementation of TransactionRunner<Transaction<TDB>>.
 *
 * When an actor is provided, stamps `app.current_tenant_id` and
 * `app.current_principal_id` as PostgreSQL session GUC variables for the
 * duration of the transaction so triggers and audit functions can read them.
 *
 * The Kysely dependency keeps this class in adapters/database — the TransactionRunner
 * port itself remains in @athyper/server-foundation/transaction with no ORM imports.
 */
export class KyselyTransactionRunner<TDB>
  implements TransactionRunner<Transaction<TDB>>
{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly db: Kysely<TDB>) {}

  async run<T>(
    work: (trx: Transaction<TDB>) => Promise<T>,
    actor?: TransactionActor,
  ): Promise<T> {
    return this.db.transaction().execute(async (trx) => {
      if (actor) {
        await sql`
          select set_config('app.current_tenant_id', ${actor.tenantId}, true),
                 set_config('app.current_principal_id', ${actor.principalId}, true)
        `.execute(trx);
      }
      return work(trx);
    });
  }
}
