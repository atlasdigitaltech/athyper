import type { TransactionActor } from "./transaction-context.js";

/** Persistence-neutral transaction boundary. */
export interface TransactionRunner<Transaction = unknown> {
  run<T>(
    work: (transaction: Transaction, signal?: AbortSignal) => Promise<T>,
    actor?: TransactionActor,
    signal?: AbortSignal,
  ): Promise<T>;
}
