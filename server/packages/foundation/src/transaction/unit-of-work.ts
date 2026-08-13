import type { TransactionActor } from "./transaction-context.js";
import type { TransactionRunner } from "./transaction-runner.js";
import type { PlaneKey } from "../context/execution-context.js";

export interface UnitOfWork<Transaction = unknown> {
  readonly runner: TransactionRunner<Transaction>;
  readonly actor?: TransactionActor;
}

/** Selects a plane-local transaction without depending on a concrete database adapter. */
export interface PlaneTransactionCoordinator<Transaction = unknown> {
  run<Result>(
    planeKey: PlaneKey,
    actor: TransactionActor,
    work: (transaction: Transaction, signal?: AbortSignal) => Promise<Result>,
    signal?: AbortSignal,
  ): Promise<Result>;
}
