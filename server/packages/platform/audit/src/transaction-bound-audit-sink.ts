import type { AuditEvent, AuditEventSink } from "@athyper/server-contract-audit";

export interface TransactionalAuditWriter {
  append(event: AuditEvent, transaction: unknown): Promise<void>;
}

/** Routes mutation evidence through the caller's transaction and other events to a fallback sink. */
export function createTransactionBoundAuditSink(
  fallback: AuditEventSink,
  transactional: TransactionalAuditWriter,
): AuditEventSink {
  return {
    async append(event, transaction) {
      if (!transaction) { await fallback.append(event); return; }
      await transactional.append(event, transaction);
    },
  };
}
