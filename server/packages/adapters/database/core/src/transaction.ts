import type {
  TransactionActor,
  TransactionRunner,
} from "@athyper/server-foundation/transaction";
import { sql, type Kysely, type RawBuilder, type Transaction } from "kysely";

export type TransactionActorStamper<Database> = (
  transaction: Transaction<Database>,
  actor: TransactionActor,
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
): Promise<void> {
  await createTransactionActorStampQuery(actor).execute(transaction);
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
    work: (transaction: Transaction<Database>) => Promise<Result>,
    actor?: TransactionActor,
  ): Promise<Result> {
    return this.database.transaction().execute(async (transaction) => {
      if (actor) await this.stampActor(transaction, actor);
      return work(transaction);
    });
  }
}
