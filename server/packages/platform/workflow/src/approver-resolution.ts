import type { ApproverCandidate, ApproverResolutionEvidence, ApproverSelector } from "@athyper/server-contract-workflow";
import { WorkflowError } from "./errors.js";

export interface PrincipalDirectory {
  byRole(tenantId: string, roleCode: string): Promise<readonly string[]>;
  byGroup(tenantId: string, groupCode: string): Promise<readonly string[]>;
  hierarchy(tenantId: string, subjectPrincipalId: string, relation: "manager" | "manager_chain", levels?: number): Promise<readonly string[]>;
}
export interface ResolveApproversInput { readonly tenantId: string; readonly subjectPrincipalId: string; readonly selectors: readonly ApproverSelector[]; readonly fallback?: readonly ApproverSelector[]; readonly escalation?: readonly ApproverSelector[]; }

export function createApproverResolver(directory: PrincipalDirectory, resolverVersion: string, now: () => Date = () => new Date()) {
  return {
    async resolve(input: ResolveApproversInput): Promise<ApproverResolutionEvidence> {
      const primary = await candidates(directory, input, input.selectors);
      let resolved = primary; let strategy: ApproverResolutionEvidence["strategy"] | undefined = input.selectors[0]?.kind; const fallbackPath: string[] = [];
      if (!resolved.length && input.fallback?.length) { fallbackPath.push("fallback"); resolved = await candidates(directory, input, input.fallback); strategy = "fallback"; }
      if (!resolved.length && input.escalation?.length) { fallbackPath.push("escalation"); resolved = await candidates(directory, input, input.escalation); strategy = "escalation"; }
      if (!resolved.length || !strategy) throw new WorkflowError(409, "APPROVER_RESOLUTION_EMPTY", "No eligible approver was resolved; configure an explicit fallback or escalation");
      const unique = [...new Map(resolved.map((candidate) => [candidate.principalId, candidate])).values()].sort((a, b) => a.principalId.localeCompare(b.principalId));
      return Object.freeze({ resolverVersion, resolvedAt: now().toISOString(), strategy, candidates: Object.freeze(unique), fallbackPath: Object.freeze(fallbackPath) });
    },
  };
}

async function candidates(directory: PrincipalDirectory, input: ResolveApproversInput, selectors: readonly ApproverSelector[]): Promise<ApproverCandidate[]> {
  const result: ApproverCandidate[] = [];
  for (const selector of selectors) {
    const ids = selector.kind === "direct" ? [selector.principalId]
      : selector.kind === "role" ? await directory.byRole(input.tenantId, selector.roleCode)
      : selector.kind === "group" ? await directory.byGroup(input.tenantId, selector.groupCode)
      : await directory.hierarchy(input.tenantId, input.subjectPrincipalId, selector.relation, selector.levels);
    for (const principalId of ids) result.push({ principalId, source: selector.kind === "direct" ? `direct:${principalId}` : selector.kind === "role" ? `role:${selector.roleCode}` : selector.kind === "group" ? `group:${selector.groupCode}` : `hierarchy:${selector.relation}` });
  }
  return result;
}
