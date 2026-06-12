"use client";

// Lifted to @athyper/me-ui — typed against MeIdentity from @athyper/api-contracts/me,
// with the self-service delegation flow (grant/revoke + MFA step-up) lifted into
// @athyper/me-ui/delegations and typed against @athyper/api-contracts/iam.
//
// Re-exported under the legacy name so the existing settings page imports keep
// working. The Delegations tab opts into the full mutation flow on neon via
// enableDelegationMutations.

import { IdentitySection as MeUIIdentitySection } from "@athyper/me-ui";

export function IdentitySection({ active }: { active: boolean }) {
  return <MeUIIdentitySection active={active} enableDelegationMutations />;
}
