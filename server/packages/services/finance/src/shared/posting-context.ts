import type { FinanceActor } from "@athyper/server-contract-finance";

/** Immutable context carried by every Neon finance posting boundary. */
export interface PostingContext extends FinanceActor {
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly occurredAt: string;
}
