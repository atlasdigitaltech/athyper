/**
 * Audit DLQ Entry — Domain Model
 *
 * Follows the NotificationDlqEntry pattern from the notification module.
 */

export interface AuditDlqEntry {
  id: string;
  tenantId: string;
  outboxId: string;
  eventType: string;
  payload: Record<string, unknown>;
  lastError: string | null;
  errorCategory: string | null;
  attemptCount: number;
  deadAt: Date;
  replayedAt: Date | null;
  replayedBy: string | null;
  replayCount: number;
  correlationId: string | null;
  createdAt: Date;
}

export interface CreateAuditDlqInput {
  tenantId: string;
  outboxId: string;
  eventType: string;
  payload: Record<string, unknown>;
  lastError?: string;
  errorCategory?: string;
  attemptCount: number;
  correlationId?: string;
}
