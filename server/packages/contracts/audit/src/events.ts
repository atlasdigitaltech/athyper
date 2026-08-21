export type AuditOutcome = "success" | "failure" | "denied" | "error";
export type AuditSeverity = "info" | "warning" | "error" | "critical";

export interface AuditActor {
  readonly kind: "user" | "service" | "system";
  readonly principalId?: string;
}

export interface AuditRecordInput {
  readonly eventCode: string;
  readonly action: string;
  readonly outcome: AuditOutcome;
  readonly severity?: AuditSeverity;
  readonly actor: AuditActor;
  readonly tenantId?: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AuditEvent extends AuditRecordInput {
  readonly id: string;
  readonly occurredAt: string;
  readonly severity: AuditSeverity;
}
