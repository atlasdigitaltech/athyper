import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { JsonValue } from "./control-services.js";

export type RuntimeCommandRisk = "low" | "medium" | "high" | "critical";
export type RuntimeApprovalDecision = "approved" | "rejected";
export type RuntimeCommandOutcome = "approval_required" | "pending" | "applied" | "failed" | "replayed";

export interface RuntimeControlCommand {
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly kind: string;
  readonly reason: string;
  readonly payload: Readonly<Record<string, JsonValue>>;
  readonly expectedVersion?: number;
  readonly approvalId?: string;
}

export interface RuntimeCommandDiffEntry {
  readonly operation: "add" | "remove" | "replace";
  readonly path: string;
  readonly before?: JsonValue;
  readonly after?: JsonValue;
}

export interface RuntimeCommandPreview {
  readonly commandId: string;
  readonly fingerprint: string;
  readonly risk: RuntimeCommandRisk;
  readonly approvalRequired: boolean;
  readonly current: JsonValue;
  readonly proposed: JsonValue;
  readonly diff: readonly RuntimeCommandDiffEntry[];
  readonly warnings: readonly string[];
}

export interface RuntimeCommandApproval {
  readonly approvalId: string;
  readonly commandId: string;
  readonly commandFingerprint: string;
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly status: "pending" | RuntimeApprovalDecision;
  readonly decidedBy?: string;
  readonly decidedAt?: string;
  readonly decisionReason?: string;
}

export interface RuntimeCommandSubmission {
  readonly outcome: RuntimeCommandOutcome;
  readonly commandId: string;
  readonly fingerprint: string;
  readonly approval?: RuntimeCommandApproval;
  readonly value?: JsonValue;
}

export interface RuntimeCommandHistoryEntry {
  readonly historyId: string;
  readonly commandId: string;
  readonly kind: string;
  readonly event: "submitted" | "approval_requested" | "approved" | "rejected" | "applied";
  readonly planeKey: VerifiedRequestContext["planeKey"];
  readonly tenantId: string;
  readonly actorId: string;
  readonly reason: string;
  readonly fingerprint: string;
  readonly detail: Readonly<Record<string, JsonValue>>;
  readonly occurredAt: string;
  readonly previousHash?: string;
  readonly entryHash: string;
}
