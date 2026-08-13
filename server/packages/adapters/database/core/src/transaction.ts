import type {
  TransactionActor,
  TransactionRunner,
} from "@athyper/server-foundation/transaction";
import { sql, type Kysely, type RawBuilder, type Transaction } from "kysely";

export type TransactionActorStamper<Database> = (
  transaction: Transaction<Database>,
  actor: TransactionActor,
  signal?: AbortSignal,
) => Promise<void>;

/** Uses bound parameters and transaction-local PostgreSQL settings. */
export function createTransactionActorStampQuery(
  actor: TransactionActor,
): RawBuilder<unknown> {
  return sql`
    select set_config('app.current_tenant_id', ${actor.tenantId}, true),
           set_config('app.current_principal_id', ${actor.principalId}, true)
  `;
}

export async function stampTransactionActor<Database>(
  transaction: Transaction<Database>,
  actor: TransactionActor,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  await createTransactionActorStampQuery(actor).execute(transaction);
  signal?.throwIfAborted();
}

/** PostgreSQL/Kysely implementation of Foundation's persistence-neutral port. */
export class KyselyTransactionRunner<Database>
  implements TransactionRunner<Transaction<Database>>
{
  constructor(
    private readonly database: Kysely<Database>,
    private readonly stampActor: TransactionActorStamper<Database> =
      stampTransactionActor,
  ) {}

  async run<Result>(
    work: (transaction: Transaction<Database>, signal?: AbortSignal) => Promise<Result>,
    actor?: TransactionActor,
    signal?: AbortSignal,
  ): Promise<Result> {
    signal?.throwIfAborted();
    return this.database.transaction().execute(async (transaction) => {
      signal?.throwIfAborted();
      if (actor) await this.stampActor(transaction, actor, signal);
      signal?.throwIfAborted();
      const result = await work(transaction, signal);
      signal?.throwIfAborted();
      return result;
    });
  }
}
