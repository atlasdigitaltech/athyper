// framework/adapters/db/src/kysely/tx.ts
import type { DB } from "../generated/kysely/types.js";
import type { Kysely, Transaction } from "kysely";

/**
 * Execute a function within a database transaction.
 *
 * The transaction is automatically committed if the function succeeds,
 * or rolled back if it throws an error.
 *
 * Example:
 * ```typescript
 * const result = await withTx(db.kysely, async (trx) => {
 *   await trx.insertInto('tenant').values({ ... }).execute();
 *   await trx.insertInto('user').values({ ... }).execute();
 *   return { success: true };
 * });
 * ```
 *
 * @param db - Kysely database instance
 * @param fn - Async function that receives transaction object
 * @returns Result from the function
 */
export async function withTx<T>(
  db: Kysely<DB>,
  fn: (trx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(fn);
}

/**
 * Execute a function within a database transaction with isolation level.
 *
 * @param db - Kysely database instance
 * @param isolationLevel - Transaction isolation level
 * @param fn - Async function that receives transaction object
 * @returns Result from the function
 */
export async function withTxIsolation<T>(
  db: Kysely<DB>,
  isolationLevel:
    | "read uncommitted"
    | "read committed"
    | "repeatable read"
    | "serializable",
  fn: (trx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  return db.transaction().setIsolationLevel(isolationLevel).execute(fn);
}
