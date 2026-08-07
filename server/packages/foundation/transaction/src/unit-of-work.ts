import type { TransactionRunner } from "./transaction-runner.port.js";
import type { TransactionActor } from "./transaction-context.js";

/**
 * Combines a transaction runner with the actor context for a single mutation scope.
 * Services receive a UnitOfWork instead of taking a raw db handle.
 */
export interface UnitOfWork<Trx = unknown> {
  readonly runner: TransactionRunner<Trx>;
  readonly actor?: TransactionActor;
}
