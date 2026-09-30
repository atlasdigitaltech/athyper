import {
  parseAtlasInsightResult,
  type AtlasDisclosureCandidate,
  type AtlasInsightDisclosurePolicy,
  type AtlasInsightOwnerProjection,
  type AtlasInsightResult,
} from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { assertAtlasContext } from "./context.js";
import { AtlasServiceError } from "./errors.js";

/** The only owner-to-Atlas adapter for insight payloads. Never serialize owner envelopes. */
export async function projectAtlasInsight(
  context: VerifiedRequestContext,
  owner: AtlasInsightOwnerProjection,
  policy: AtlasInsightDisclosurePolicy,
): Promise<AtlasInsightResult> {
  assertAtlasContext(context);
  if (owner.evaluationMode !== "user_scoped")
    throw new AtlasServiceError(
      "PERMISSION_DENIED",
      "Atlas insight is unavailable.",
    );
  const allowed = async <T>(
    candidate: AtlasDisclosureCandidate<T>,
  ): Promise<boolean> => {
    if (candidate.state === "restricted" || !candidate.claims.length)
      return false;
    for (const claim of candidate.claims)
      if (!(await policy.authorize({ context, claim }))) return false;
    return true;
  };
  if (!(await allowed(owner.scope)))
    throw new AtlasServiceError(
      "PERMISSION_DENIED",
      "Atlas insight is unavailable.",
    );
  const evidence = [];
  for (const candidate of owner.evidence)
    if (await allowed(candidate)) evidence.push(candidate.value);
  const evidenceIds = new Set(evidence.map((e) => e.id));
  const actions = [];
  for (const candidate of owner.actions)
    if (
      (await allowed(candidate)) &&
      policy.actionRegistered(candidate.value.actionId) &&
      candidate.value.evidenceIds.every((id) => evidenceIds.has(id))
    )
      actions.push(candidate.value);
  const actionIds = new Set(actions.map((a) => a.id));
  const findings = [];
  for (const candidate of owner.findings) {
    // Withhold the whole derived finding when any input or action dependency is denied.
    if (
      (await allowed(candidate)) &&
      candidate.value.evidenceIds.every((id) => evidenceIds.has(id)) &&
      candidate.value.actionIds.every((id) => actionIds.has(id))
    )
      findings.push(candidate.value);
  }
  const coverage = (await allowed(owner.coverage))
    ? {...owner.coverage.value, ...(findings.length !== owner.findings.length ? {state: owner.coverage.value.state === "complete" ? "partial" as const : owner.coverage.value.state, evaluatedCount: undefined} : {})}
    : { target: owner.coverage.value.target, state: "unavailable" as const };
  return parseAtlasInsightResult({
    schemaVersion: 1,
    scope: owner.scope.value,
    coverage,
    evaluatedAt: owner.evaluatedAt,
    freshness: owner.freshness,
    evidence,
    actions,
    findings,
  });
}
