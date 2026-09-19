import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export type WorkItemStatus = "open" | "claimed" | "in_progress" | "blocked" | "completed" | "cancelled";
export type WorkItemPriority = "low" | "normal" | "high" | "urgent";

export interface WorkItem {
  readonly id: string;
  readonly tenantId: string;
  readonly workTypeCode: string;
  readonly title: string;
  readonly description?: string;
  readonly sourceEntityCode: string;
  readonly sourceEntityId: string;
  readonly sourceActionCode?: string;
  readonly assigneePrincipalId?: string;
  readonly assigneeTeamId?: string;
  readonly claimantPrincipalId?: string;
  readonly claimedAt?: string;
  readonly availableAt: string;
  readonly dueAt?: string;
  readonly completedAt?: string;
  readonly priority: WorkItemPriority;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly outcome?: Readonly<Record<string, unknown>>;
  readonly status: WorkItemStatus;
  readonly rowVersion: number;
  readonly workflowRevision?: WorkflowRevisionCoordinate;
  readonly eligibilityEvidence?: ApproverResolutionEvidence;
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface CreateWorkItemCommand {
  readonly context: VerifiedRequestContext;
  readonly workTypeCode: string;
  readonly title: string;
  readonly description?: string;
  readonly sourceEntityCode: string;
  readonly sourceEntityId: string;
  readonly sourceActionCode?: string;
  readonly assigneePrincipalId?: string;
  readonly assigneeTeamId?: string;
  readonly availableAt?: string;
  readonly dueAt?: string;
  readonly priority?: WorkItemPriority;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly idempotencyKey?: string;
}

export interface ListInboxQuery {
  readonly context: VerifiedRequestContext;
  readonly statuses?: readonly WorkItemStatus[];
  readonly limit?: number;
  readonly cursor?: string;
}

export interface WorkItemActionCommand {
  readonly context: VerifiedRequestContext;
  readonly workItemId: string;
  readonly action?: string;
  readonly expectedRowVersion?: number;
  readonly outcome?: Readonly<Record<string, unknown>>;
  readonly idempotencyKey?: string;
}

export interface WorkflowRevisionCoordinate {
  readonly definitionCode: string;
  readonly version: number;
  readonly artifactHash: string;
}

export interface ApproverCandidate { readonly principalId: string; readonly source: string; }
export interface ApproverResolutionEvidence {
  readonly filterEvidence?: import("./task-governance.js").TaskCandidateFilterEvidence;
  readonly resolverVersion: string;
  readonly resolvedAt: string;
  readonly strategy: "direct" | "role" | "group" | "hierarchy" | "fallback" | "escalation";
  readonly candidates: readonly ApproverCandidate[];
  readonly selectedPrincipalId?: string;
  readonly fallbackPath: readonly string[];
}

export type WorkItemActionResult =
  | { readonly kind: "Committed"; readonly workItem: WorkItem }
  | { readonly kind: "NotFound"; readonly workItemId: string }
  | { readonly kind: "Forbidden"; readonly permissionCode: string }
  | { readonly kind: "PolicyDenied"; readonly policyIds: readonly string[]; readonly reason?: string }
  | { readonly kind: "Conflict"; readonly reason: string };

export interface WorkItemListResult {
  readonly data: readonly WorkItem[];
  readonly totalCount: number;
  readonly nextCursor?: string;
}
