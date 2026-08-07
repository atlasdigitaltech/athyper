import type { TransactionActor } from "./transaction-context.js";

/**
 * Persistence-neutral transaction boundary.
 * The concrete implementation lives in adapters/db using Kysely + PostgreSQL set_config.
 * Foundation only defines the port; no ORM types leak through here.
 */
export interface TransactionRunner<Trx = unknown> {
  run<T>(work: (trx: Trx) => Promise<T>, actor?: TransactionActor): Promise<T>;
}
