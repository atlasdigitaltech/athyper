import type { AtlasToolProposal, AtlasToolProposalStore, AtlasToolStoreResult, AtlasToolTerminalFailureInput } from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export class MemoryToolStore implements AtlasToolProposalStore {
  readonly rows = new Map<string, AtlasToolProposal>();
  propose({ proposal }: { context: VerifiedRequestContext; proposal: AtlasToolProposal }): Promise<AtlasToolStoreResult> {
    const duplicate = [...this.rows.values()].find((row) => row.tenantId === proposal.tenantId && row.runId === proposal.runId && row.callId === proposal.callId);
    if (duplicate) return Promise.resolve(sameInvocation(duplicate, proposal) ? { kind: "replayed", proposal: duplicate } : { kind: "conflict", proposal: duplicate });
    this.rows.set(proposal.proposalId, proposal); return Promise.resolve({ kind: "created", proposal });
  }
  get({ context, proposalId }: { context: VerifiedRequestContext; proposalId: string }): Promise<AtlasToolProposal | null> { const row = this.rows.get(proposalId); return Promise.resolve(row?.tenantId === context.tenantId && row.planeKey === context.planeKey ? row : null); }
  list({ context, limit }: { context: VerifiedRequestContext; limit: number }): Promise<readonly AtlasToolProposal[]> { return Promise.resolve([...this.rows.values()].filter((row) => row.tenantId === context.tenantId && row.planeKey === context.planeKey && row.principalId === context.principalId).sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, limit)); }
  confirm(input: { context: VerifiedRequestContext; proposalId: string; tokenHash: string; confirmedAt: string }): Promise<AtlasToolStoreResult> { return Promise.resolve(this.cas(input.proposalId, ["proposed"], "confirmed", { confirmationTokenHash: input.tokenHash, confirmationAt: input.confirmedAt })); }
  beginExecution(input: { context: VerifiedRequestContext; proposalId: string; expectedStatus: "proposed" | "confirmed"; executionGuard: Readonly<Record<string, unknown>>; authorizationEpoch: number; policyRevision: string; downstreamIdempotencyKey?: string; executingAt: string }): Promise<AtlasToolStoreResult> { return Promise.resolve(this.cas(input.proposalId, [input.expectedStatus], "executing", { executionAuthEpoch: input.authorizationEpoch, executionPolicyRevision: input.policyRevision, executingAt: input.executingAt, ...(input.downstreamIdempotencyKey ? { downstreamIdempotencyKey: input.downstreamIdempotencyKey } : {}) })); }
  complete(input: { context: VerifiedRequestContext; proposalId: string; resultHash: string; evidenceRefs?: readonly Readonly<Record<string, unknown>>[]; businessTransactionId?: string; businessTransactionType?: string; terminalAt: string; durationMs: number }): Promise<AtlasToolStoreResult> { return Promise.resolve(this.cas(input.proposalId, ["executing"], "completed", { resultHash: input.resultHash, evidenceRefs: input.evidenceRefs ?? [], terminalAt: input.terminalAt, durationMs: input.durationMs, ...(input.businessTransactionId ? { businessTransactionId: input.businessTransactionId } : {}), ...(input.businessTransactionType ? { businessTransactionType: input.businessTransactionType } : {}) })); }
  fail(input: AtlasToolTerminalFailureInput): Promise<AtlasToolStoreResult> { return Promise.resolve(this.terminal("failed", input)); }
  deny(input: AtlasToolTerminalFailureInput): Promise<AtlasToolStoreResult> { return Promise.resolve(this.terminal("denied", input)); }
  expire(input: AtlasToolTerminalFailureInput): Promise<AtlasToolStoreResult> { return Promise.resolve(this.terminal("expired", input)); }
  cancel(input: AtlasToolTerminalFailureInput): Promise<AtlasToolStoreResult> { return Promise.resolve(this.terminal("cancelled", input)); }
  health(): Promise<{ healthy: boolean }> { return Promise.resolve({ healthy: true }); }
  private terminal(status: "failed" | "denied" | "expired" | "cancelled", input: AtlasToolTerminalFailureInput): AtlasToolStoreResult { return this.cas(input.proposalId, input.expectedStatuses, status, { terminalErrorClass: input.errorClass, terminalAt: input.terminalAt, durationMs: input.durationMs }); }
  private cas(id: string, expected: readonly string[], status: AtlasToolProposal["status"], extra: Partial<AtlasToolProposal>): AtlasToolStoreResult { const row = this.rows.get(id) ?? null; if (!row) return { kind: "conflict", proposal: null }; if (row.status === status) return { kind: "replayed", proposal: row }; if (!expected.includes(row.status)) return { kind: "conflict", proposal: row }; const next = Object.freeze({ ...row, ...extra, status }); this.rows.set(id, next); return { kind: "transitioned", proposal: next }; }
}

function sameInvocation(a: AtlasToolProposal, b: AtlasToolProposal): boolean {
  const comparable = (value: AtlasToolProposal) => ({
    tenantId: value.tenantId, planeKey: value.planeKey, principalId: value.principalId, threadId: value.threadId,
    runId: value.runId, callId: value.callId, toolCode: value.toolCode, toolVersion: value.toolVersion,
    actionCode: value.actionCode, argumentHash: value.argumentHash, summary: value.summary, access: value.access,
    operationClass: value.operationClass, risk: value.risk, autonomyDecision: value.autonomyDecision,
    affectedEntityType: value.affectedEntityType ?? null, affectedEntityId: value.affectedEntityId ?? null,
    expectedRowVersion: value.expectedRowVersion ?? null, policyRevision: value.policyRevision,
    profileRevision: value.profileRevision, authorizationProfileHash: value.authorizationProfileHash,
    authorizationEpoch: value.authorizationEpoch, permissionSnapshot: value.permissionSnapshot,
    policySnapshot: value.policySnapshot, profileSnapshot: value.profileSnapshot,
    confirmationRequired: value.confirmationRequired,
  });
  return canonical(comparable(a)) === canonical(comparable(b));
}
function canonical(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`; }
