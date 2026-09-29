import { type PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { sql, type Transaction } from "kysely";
import { stampTransactionActor } from "@athyper/server-adapter-db-core";
import type { Container } from "../create-container.js";

type RecordTransaction = Transaction<Record<string, never>>;

export function createPlaneTransactionCoordinator(
  container: Container,
): PlaneTransactionCoordinator<RecordTransaction> {
  return {
    run(planeKey, actor, work, _signal, options) {
      if (!actor || !actor.tenantId?.trim() || !actor.principalId?.trim())
        throw new Error("TRANSACTION_ACTOR_REQUIRED");
      if (planeKey === "neon" && container.adapters.neonDatabase) {
        return container.adapters.neonDatabase.withSystemTransaction(
          async (transaction) => {
            if (options?.isolationLevel === "repeatable read")
              await sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`.execute(
                transaction,
              );
            await stampTransactionActor(
              transaction as unknown as Transaction<Record<string, never>>,
              actor,
            );
            return work(transaction as unknown as RecordTransaction);
          },
        );
      }
      if (planeKey === "mesh" && container.adapters.meshDatabase) {
        return container.adapters.meshDatabase.withSystemTransaction(
          async (transaction) => {
            if (options?.isolationLevel === "repeatable read")
              await sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`.execute(
                transaction,
              );
            await stampTransactionActor(
              transaction as unknown as Transaction<Record<string, never>>,
              actor,
            );
            return work(transaction as unknown as RecordTransaction);
          },
        );
      }
      if (planeKey === "studio" && container.adapters.athyperDatabase) {
        return container.adapters.athyperDatabase.withSystemTransaction(
          async (transaction) => {
            if (options?.isolationLevel === "repeatable read")
              await sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`.execute(
                transaction,
              );
            await stampTransactionActor(
              transaction as unknown as Transaction<Record<string, never>>,
              actor,
            );
            return work(transaction as unknown as RecordTransaction);
          },
        );
      }
      throw new Error(
        `Tenant runtime database is not configured for ${planeKey}`,
      );
    },
  };
}
