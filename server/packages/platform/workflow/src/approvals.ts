export interface Quorum { readonly kind: "all" | "any" | "count" | "percentage"; readonly value?: number; }
export interface ApprovalVote { readonly principalId: string; readonly decision: "approved" | "rejected"; }
export function evaluateQuorum(quorum: Quorum, eligibleCount: number, votes: readonly ApprovalVote[]): "pending" | "approved" | "rejected" {
  if (votes.some((vote) => vote.decision === "rejected")) return "rejected";
  const approvals = new Set(votes.filter((vote) => vote.decision === "approved").map((vote) => vote.principalId)).size;
  const required = quorum.kind === "all" ? eligibleCount : quorum.kind === "any" ? 1 : quorum.kind === "count" ? quorum.value ?? 1 : Math.ceil(eligibleCount * (quorum.value ?? 100) / 100);
  return approvals >= required ? "approved" : "pending";
}

export interface ApprovalPersistence<Transaction> {
  get(tenantId: string, requestId: string, transaction: Transaction): Promise<import("@athyper/server-contract-workflow").ApprovalRequest | null>;
  create(request: import("@athyper/server-contract-workflow").ApprovalRequest, transaction: Transaction): Promise<void>;
  save(request: import("@athyper/server-contract-workflow").ApprovalRequest, transaction: Transaction): Promise<void>;
}
export function createNeonApprovalService<Transaction>(persistence: ApprovalPersistence<Transaction>, now: () => Date = () => new Date()) {
  return {
    async create(request: import("@athyper/server-contract-workflow").ApprovalRequest, transaction: Transaction) { if (!request.stages.length) throw new Error("Approval request requires stages"); await persistence.create(structuredClone(request), transaction); return request; },
    async decide(tenantId: string, requestId: string, stageId: string, principalId: string, decision: "approved" | "rejected", transaction: Transaction) {
      const request = await persistence.get(tenantId, requestId, transaction); if (!request || request.status !== "pending") return null;
      const index = request.stages.findIndex((stage) => stage.id === stageId); const stage = request.stages[index]; if (!stage || stage.status !== "active") return null;
      if (!stage.eligibilityEvidence.candidates.some((candidate) => candidate.principalId === principalId) || stage.votes.some((vote) => vote.principalId === principalId)) return null;
      const votes = [...stage.votes, { principalId, decision, decidedAt: now().toISOString() }];
      const outcome = evaluateQuorum(stage.quorum, stage.eligibilityEvidence.candidates.length, votes);
      const stages = [...request.stages]; stages[index] = { ...stage, votes, status: outcome === "pending" ? "active" : "completed" };
      if (outcome === "approved" && stages[index + 1]) stages[index + 1] = { ...stages[index + 1]!, status: "active" };
      const status = outcome === "rejected" ? "rejected" : outcome === "approved" && index === stages.length - 1 ? "approved" : "pending";
      const updated = { ...request, stages, status } as import("@athyper/server-contract-workflow").ApprovalRequest; await persistence.save(updated, transaction); return updated;
    },
  };
}
