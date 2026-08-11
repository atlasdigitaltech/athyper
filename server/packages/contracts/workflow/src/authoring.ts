export type ApproverSelector =
  | { readonly kind: "direct"; readonly principalId: string }
  | { readonly kind: "role"; readonly roleCode: string }
  | { readonly kind: "group"; readonly groupCode: string }
  | { readonly kind: "hierarchy"; readonly relation: "manager" | "manager_chain"; readonly levels?: number };

export interface WorkflowRuleDraft { readonly code: string; readonly condition: Readonly<Record<string, unknown>>; }
export interface WorkflowStageDraft {
  readonly code: string; readonly name: string; readonly mode: "serial" | "parallel";
  readonly approvers: readonly ApproverSelector[];
  readonly fallback?: readonly ApproverSelector[];
  readonly escalation?: readonly ApproverSelector[];
  readonly quorum: { readonly kind: "all" | "any" | "count" | "percentage"; readonly value?: number };
  readonly slaPolicyCode?: string;
  readonly rules?: readonly WorkflowRuleDraft[];
}
export interface WorkflowDefinitionDraft {
  readonly code: string; readonly name: string; readonly entityType: string;
  readonly stages: readonly WorkflowStageDraft[];
  readonly commands?: Readonly<Record<string, string>>;
}
export interface CompiledWorkflowDefinition extends WorkflowDefinitionDraft {
  readonly version: number; readonly artifactHash: string; readonly compiledAt: string;
}

export interface WorkflowDefinitionStore {
  nextVersion(tenantId: string, code: string): Promise<number>;
  saveImmutable(tenantId: string, definition: CompiledWorkflowDefinition): Promise<void>;
  getActive(tenantId: string, code: string): Promise<CompiledWorkflowDefinition | null>;
}

export interface ApprovalRequest {
  readonly id: string; readonly tenantId: string; readonly entityType: string; readonly entityId: string;
  readonly revision: { readonly definitionCode: string; readonly version: number; readonly artifactHash: string };
  readonly status: "pending" | "approved" | "rejected" | "cancelled";
  readonly stages: readonly ApprovalStage[];
}
export interface ApprovalStage {
  readonly id: string; readonly code: string; readonly status: "pending" | "active" | "completed" | "cancelled";
  readonly quorum: WorkflowStageDraft["quorum"];
  readonly eligibilityEvidence: import("./work-items.js").ApproverResolutionEvidence;
  readonly votes: readonly { readonly principalId: string; readonly decision: "approved" | "rejected"; readonly decidedAt: string }[];
}
