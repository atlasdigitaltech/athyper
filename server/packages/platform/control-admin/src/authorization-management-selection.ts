import { parseInstant } from "@athyper/platform-temporal";
import type { PlaneKey } from "@athyper/server-foundation/context";
import type { AuthorizationManagementRepository, AuthorizationManagementRepositoryProvider, AuthorizationManagementRolloutPolicySource, AuthorizationManagementRolloutSelector } from "@athyper/server-contract-auth";

/** Creates an exact-key map. No repository is mirrored or reused as a fallback. */
export function createExactPlaneAuthorizationRepositoryProvider(repositories: Readonly<Partial<Record<PlaneKey, AuthorizationManagementRepository>>>): AuthorizationManagementRepositoryProvider {
  return { forExactPlane(planeKey) { const repository = repositories[planeKey]; return repository?.planeKey === planeKey ? repository : undefined; } };
}

/** Missing, mismatched, expired, unapproved, or cohort-ineligible policy resolves to legacy. */
export function createSafeAuthorizationManagementRolloutSelector(source: AuthorizationManagementRolloutPolicySource, now: () => Date = () => new Date()): AuthorizationManagementRolloutSelector {
  return { async select(input) {
    let policy;
    try {
      policy = await source.loadExactPlane(input.planeKey);
    } catch {
      return { mode: "legacy", revision: "policy-unavailable" };
    }

    const selectedAt = now().getTime();
    const approvedAt = policy?.approvedAt ? parseInstant(policy.approvedAt) : Number.NaN;
    const expiresAt = policy?.expiresAt ? parseInstant(policy.expiresAt) : undefined;
    const validMode = policy?.mode === "legacy" || policy?.mode === "shadow" || policy?.mode === "enforce";
    const validRevision = typeof policy?.revision === "string" && policy.revision.trim().length > 0;
    const validApproval = Number.isFinite(approvedAt) && approvedAt <= selectedAt;
    const validExpiry = expiresAt === undefined || (Number.isFinite(expiresAt) && expiresAt > selectedAt);
    const inCohort = !policy?.cohortPrincipalIds || policy.cohortPrincipalIds.includes(input.principalId);

    if (!policy || policy.planeKey !== input.planeKey || !validMode || !validRevision || !policy.approved || !validApproval || !validExpiry || !inCohort) {
      return { mode: "legacy", revision: validRevision ? policy!.revision : "missing-policy" };
    }
    return { mode: policy.mode, revision: policy.revision };
  } };
}
