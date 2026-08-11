import type { TransactionActor } from "./transaction-context.js";

/** Persistence-neutral transaction boundary. */
export interface TransactionRunner<Transaction = unknown> {
  run<T>(
    work: (transaction: Transaction) => Promise<T>,
    actor?: TransactionActor,
  ): Promise<T>;
}
